import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, resolveMediaUrl } from '../api';
import { deleteMessageAction } from '../features/messages/deleteMessage';
import {
  appendMessage,
  mergeHistory,
  nextTempId,
  removeMessage,
  upsertIncoming,
} from '../features/messages/messageStore';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import { useTheme } from '../hooks/useTheme';
import Sidebar from '../components/Sidebar';
import MessageList, { ImageLightbox } from '../components/MessageList';
import Composer from '../components/Composer';
import FriendsDrawer from '../components/FriendsDrawer';
import FeedDrawer from '../components/FeedDrawer';
import XFeedView from '../components/XFeedView';

const PENDING_SEND_TTL_MS = 30_000;
// Production realtime interval. Three seconds keeps a chat usable without
// hammering the server with one request per second.
const POLL_MS = 3000;

// Conversation/message ids travel as JSON numbers over HTTP but can arrive as
// strings from a URL param or a socket frame. Comparing with `===` across the
// two forms would silently drop a delete broadcast, so every id comparison in
// this file goes through these helpers.
const sameId = (a, b) => a != null && b != null && String(a) === String(b);
const idIn = (list, id) => list.some((x) => sameId(x, id));

export default function ChatPage() {
  const { user, logout, token } = useAuth();
  const { connected, authFailed, on, off, emit } = useSocket(token);
  const { theme, toggle: toggleTheme } = useTheme();

  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState('');
  // True while the last HTTP sync succeeded. On Vercel realtime is polling,
  // so this (not the socket flag) is what "trực tuyến" reflects there.
  const [syncOk, setSyncOk] = useState(false);
  const [modal, setModal] = useState(null); // 'create' | 'join' | null
  const [showInfo, setShowInfo] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  const [showFeed, setShowFeed] = useState(false);
  const [friendsList, setFriendsList] = useState([]);
  const [pendingFriendRequestsCount, setPendingFriendRequestsCount] = useState(0);
  const [activeView, setActiveView] = useState('chat'); // 'chat' | 'feed'
  const [topSearch, setTopSearch] = useState('');
  const [topSearchResults, setTopSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [typingUsers, setTypingUsers] = useState({});
  const searchWrapRef = useRef(null);

  // Close search dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(event.target)) {
        setIsSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadFriendsList = useCallback(async () => {
    try {
      const res = await api.getFriends();
      setFriendsList(res?.friends || []);
    } catch (err) {
      console.error('Lỗi tải danh sách bạn bè:', err);
    }
  }, []);

  const loadPendingFriendRequestsCount = useCallback(async () => {
    try {
      const res = await api.getFriendRequests('incoming');
      if (res?.requests) {
        setPendingFriendRequestsCount(res.requests.length);
      }
    } catch {
      // ignore
    }
  }, []);

  // Debounced search for usernames or emails from topbar
  useEffect(() => {
    const q = topSearch.trim();
    if (!q) {
      setTopSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await api.searchUsers(q);
        const usersList = Array.isArray(res) ? res : (res?.users || res?.data || []);
        setTopSearchResults(usersList);
      } catch {}
      setIsSearching(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [topSearch]);

  const activeIdRef = useRef(null);
  activeIdRef.current = activeId;

  // Sends whose socket echo has not been matched to the real DB id yet.
  const pendingSendsRef = useRef([]);

  // Fetch pending friend requests count & friends list on mount
  useEffect(() => {
    loadFriendsList();
    loadPendingFriendRequestsCount();
  }, [loadFriendsList, loadPendingFriendRequestsCount]);

  const handleStartDirectChat = async (targetUserId) => {
    try {
      const res = await api.createDirectChat(targetUserId);
      await loadChats();
      const targetConvId = res?.conversation?.id || res?.id;
      if (targetConvId) {
        openChat(targetConvId);
      }
    } catch (err) {
      setError(err.message || 'Không thể tạo cuộc trò chuyện.');
      throw err;
    }
  };

  // Ids we know are gone. A delete broadcast can land before the history
  // request resolves; without this the late history response would resurrect
  // the deleted row.
  const tombstonesRef = useRef(new Set());


  // ---- HTTP: load my conversations ----
  const loadChats = useCallback(async () => {
    try {
      const payload = await api.myChats();
      setConversations(payload?.conversations || []);
      setSyncOk(true);
    } catch (err) {
      setSyncOk(false);
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  // Conversations can change without a socket (someone creates/joins a chat,
  // or the list was stale on a cold start). Refresh them on a slow interval.
  useEffect(() => {
    const timer = setInterval(loadChats, 15_000);
    return () => clearInterval(timer);
  }, [loadChats]);

  // ---- Open a chat: subscribe via socket + fetch history via HTTP ----
  const openChat = useCallback(
    async (id) => {
      if (activeIdRef.current && activeIdRef.current !== id) {
        emit('typing_stop', { conversationId: activeIdRef.current });
        emit('leave_room', activeIdRef.current);
      }
      // Reset typing users on chat switch
      setTypingUsers((prev) => {
        Object.values(prev).forEach((u) => clearTimeout(u.timerId));
        return {};
      });
      // Echoes for other chats are ignored while inactive; let their next
      // history load supply the real ids instead of matching them later.
      pendingSendsRef.current = pendingSendsRef.current.filter(
        (p) => p.conversationId === id
      );
      // A fresh conversation starts with a clean tombstone set, otherwise an
      // id reused by another chat would be filtered out on load.
      tombstonesRef.current = new Set();
      setActiveId(id);
      setActiveView('chat');
      setMessages([]);
      setError('');
      emit('join_room', id); // Socket.IO -> server joins conversation:<id>
      try {
        const payload = await api.messages(id); // HTTP history
        const history = payload?.messages || [];
        // Ignore a response that arrived after the user switched away.
        if (activeIdRef.current !== id) return;
        setMessages((prev) => mergeHistory(prev, history, tombstonesRef.current));
      } catch (err) {
        if (activeIdRef.current === id) setError(err.message);
      }
    },
    [emit]
  );

  // Filter typing users for the currently active chat (excluding current user)
  const activeTypingList = useMemo(() => {
    if (!activeId) return [];
    return Object.values(typingUsers).filter(
      (u) => sameId(u.conversationId, activeId)
    );
  }, [activeId, typingUsers]);

  const handleTypingStart = useCallback(() => {
    if (activeIdRef.current) {
      emit('typing_start', { conversationId: activeIdRef.current });
    }
  }, [emit]);

  const handleTypingStop = useCallback(() => {
    if (activeIdRef.current) {
      emit('typing_stop', { conversationId: activeIdRef.current });
    }
  }, [emit]);

  // ---- Polling sync ----
  // Vercel Functions cannot keep one Socket.IO room across instances (and a
  // WebSocket is closed at the 300s Hobby limit), so the deployed app keeps
  // the open conversation fresh over HTTP. It is a no-op locally beyond a few
  // extra GETs; socket events still make updates instant there.
  useEffect(() => {
    if (!activeId) return undefined;

    let alive = true;
    let inFlight = false;
    let timer;

    const tick = async () => {
      if (!alive || inFlight) return;
      if (document.visibilityState === 'hidden') {
        timer = setTimeout(tick, POLL_MS);
        return;
      }

      inFlight = true;
      try {
        const payload = await api.messages(activeId);
        if (!alive || activeIdRef.current !== activeId) return;
        setMessages((prev) => {
          const next = mergeHistory(prev, payload?.messages || [], tombstonesRef.current);
          // Returning the same reference when nothing changed prevents the
          // message list from scrolling to the bottom every poll interval
          // while the user is reading older messages.
          const unchanged =
            next.length === prev.length &&
            next.every(
              (m, i) =>
                sameId(m.id, prev[i].id) &&
                m.content === prev[i].content &&
                m.senderName === prev[i].senderName
            );
          return unchanged ? prev : next;
        });
        setSyncOk(true);
      } catch {
        if (alive) setSyncOk(false);
      } finally {
        inFlight = false;
        if (alive) timer = setTimeout(tick, POLL_MS);
      }
    };

    timer = setTimeout(tick, 1200);

    // Returning to the tab should show new messages immediately instead of
    // waiting for the next tick.
    const refreshNow = () => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(timer);
      tick();
    };
    document.addEventListener('visibilitychange', refreshNow);
    window.addEventListener('focus', refreshNow);

    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', refreshNow);
      window.removeEventListener('focus', refreshNow);
    };
  }, [activeId]);

  // ---- Socket: live messages + join/create notifications ----
  useEffect(() => {
    const handleNewMessage = (data) => {
      if (!data || !sameId(data.chatId, activeIdRef.current)) return;

      // Clear typing indicator for this sender immediately upon receiving their message
      setTypingUsers((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          if (next[key].username === data.from) {
            clearTimeout(next[key].timerId);
            delete next[key];
            changed = true;
          }
        }
        return changed ? next : prev;
      });

      // The broadcast carries no message id, so match it against our pending
      // HTTP send to recover the real DB id. Without it the row keeps a
      // `tmp-...` id and could never be deleted.
      const isMine = data.from === user?.username;
      if (isMine) {
        const pending = pendingSendsRef.current.find(
          (p) => sameId(p.conversationId, data.chatId) && p.content === data.message
        );
        if (pending) {
          if (pending.messageId != null) {
            data = { ...data, id: pending.messageId };
            pendingSendsRef.current = pendingSendsRef.current.filter((p) => p !== pending);
          } else {
            pending.tempId = nextTempId();
            data = { ...data, tempId: pending.tempId };
          }
        }
      }

      setMessages((prev) => {
        const withTemp = data.tempId
          ? [
              ...prev,
              {
                id: data.tempId,
                type: 'text',
                content: data.message,
                senderName: data.from,
                senderId: user?.userId ?? null,
                createdAt: data.createdAt || new Date().toISOString(),
              },
            ]
          : prev;
        return upsertIncoming(withTemp, data, user?.username).list;
      });
    };

    const handleNotification = (data) => {
      if (!data || !sameId(data.chatId, activeIdRef.current)) return;
      setMessages((prev) =>
        appendMessage(prev, {
          id: nextTempId(),
          system: true,
          content: data.message,
          createdAt: data.createdAt || new Date().toISOString(),
        })
      );
      if (data.action === 'create new chat' || data.action === 'Join') loadChats();
    };

    // Requires a backend broadcast (see notes): the deleting client knows the
    // message is gone, everyone else in the room does not.
    const handleDeleted = (data) => {
      if (!data) return;
      const id = data.id ?? data.messageId;
      if (id == null) return;
      tombstonesRef.current.add(id);
      if (data.chatId != null && !sameId(data.chatId, activeIdRef.current)) return;
      setMessages((prev) => removeMessage(prev, id).list);
    };

    const handleJoinRequest = (data) => {
      loadChats();
      if (data?.username) {
        alert(`[Quản trị viên] ${data.username} vừa gửi yêu cầu tham gia đoạn chat "${data.conversationName || ''}".`);
      }
    };

    const handleJoinApproved = (data) => {
      loadChats();
      if (data?.chatId) openChat(data.chatId);
      alert(data.message || 'Yêu cầu tham gia đoạn chat của bạn đã được phê duyệt!');
    };

    const handleJoinRejected = (data) => {
      loadChats();
      alert(data.message || 'Yêu cầu tham gia đoạn chat của bạn đã bị từ chối.');
    };

    const handleChatDeleted = (data) => {
      loadChats();
      if (data?.chatId && sameId(data.chatId, activeIdRef.current)) {
        setActiveId(null);
        setMessages([]);
        alert(data.message || 'Đoạn chat này đã bị xoá.');
      }
    };

    const handleUserLeft = (data) => {
      loadChats();
      if (data?.chatId && sameId(data.chatId, activeIdRef.current)) {
        setMessages((prev) =>
          appendMessage(prev, {
            id: nextTempId(),
            system: true,
            content: data.message || 'Một thành viên đã rời khỏi đoạn chat.',
            createdAt: new Date().toISOString(),
          })
        );
      }
    };

    const handleFriendRequest = () => {
      loadPendingFriendRequestsCount();
    };

    const handleFriendAccepted = () => {
      loadFriendsList();
      loadPendingFriendRequestsCount();
    };

    const handleUserTyping = (data) => {
      if (!data || !sameId(data.conversationId, activeIdRef.current)) return;
      if (
        data.username === user?.username ||
        (data.rawUserId && data.rawUserId === user?.userId)
      ) {
        return;
      }

      const userKey = data.rawUserId || data.userId || data.username;
      if (!userKey) return;

      setTypingUsers((prev) => {
        const next = { ...prev };
        if (!data.isTyping) {
          if (next[userKey]) {
            clearTimeout(next[userKey].timerId);
            delete next[userKey];
          }
          return next;
        }

        if (next[userKey]?.timerId) {
          clearTimeout(next[userKey].timerId);
        }

        // Safety fallback: auto-clear typing after 4 seconds of inactivity
        const timerId = setTimeout(() => {
          setTypingUsers((curr) => {
            const cleaned = { ...curr };
            delete cleaned[userKey];
            return cleaned;
          });
        }, 4000);

        next[userKey] = {
          conversationId: data.conversationId,
          username: data.username,
          timerId,
        };
        return next;
      });
    };

    on('send_message', handleNewMessage);
    on('new_notification', handleNotification);
    on('message_deleted', handleDeleted);
    on('new_join_request', handleJoinRequest);
    on('join_approved', handleJoinApproved);
    on('join_rejected', handleJoinRejected);
    on('chat_deleted', handleChatDeleted);
    on('user_left', handleUserLeft);
    on('new_friend_request', handleFriendRequest);
    on('friend_request_accepted', handleFriendAccepted);
    on('user_typing', handleUserTyping);
    return () => {
      off('send_message', handleNewMessage);
      off('new_notification', handleNotification);
      off('message_deleted', handleDeleted);
      off('new_join_request', handleJoinRequest);
      off('join_approved', handleJoinApproved);
      off('join_rejected', handleJoinRejected);
      off('chat_deleted', handleChatDeleted);
      off('user_left', handleUserLeft);
      off('new_friend_request', handleFriendRequest);
      off('friend_request_accepted', handleFriendAccepted);
      off('user_typing', handleUserTyping);
    };
  }, [on, off, loadChats, openChat, user, loadFriendsList, loadPendingFriendRequestsCount]);

  // ---- Send message over HTTP; server broadcasts to the socket room ----
  const handleSend = async (content) => {
    if (!activeId) return;
    const pending = {
      conversationId: activeId,
      content,
      messageId: null,
      tempId: null,
      at: Date.now(),
    };
    pendingSendsRef.current = [
      ...pendingSendsRef.current.filter((p) => p.at >= Date.now() - PENDING_SEND_TTL_MS),
      pending,
    ];
    try {
      const payload = await api.sendMessage({ conversationId: activeId, type: 'text', content });
      const messageId = Number(payload?.sendMessage?.messageId);
      if (!Number.isInteger(messageId) || messageId <= 0) {
        pendingSendsRef.current = pendingSendsRef.current.filter((p) => p !== pending);
        return;
      }
      pending.messageId = messageId;

      // Render the persisted message immediately. On Vercel there is no
      // socket echo, and waiting 3s for the poll would make sending feel
      // broken. If the socket echo arrived first, upsertIncoming folds the
      // temporary row into this real id instead of duplicating it.
      setMessages((prev) =>
        upsertIncoming(
          prev,
          {
            id: messageId,
            from: user?.username,
            message: content,
            senderId: user?.userId,
            createdAt: new Date().toISOString(),
          },
          user?.username
        ).list
      );

      if (pending.tempId != null) {
        // Echo already rendered under a temp id and has now been folded into
        // the real id, so the pending entry is no longer needed.
        pendingSendsRef.current = pendingSendsRef.current.filter((p) => p !== pending);
      }
    } catch (err) {
      pendingSendsRef.current = pendingSendsRef.current.filter((p) => p !== pending);
      setError(err.message);
    }
  };

  // ---- Upload image over HTTP ----
  const handleImageUpload = async (file) => {
    if (!activeId) return;
    try {
      const payload = await api.uploadImage({ conversationId: activeId, file });
      const messageId = Number(payload?.messageId);
      const imageUrl = payload?.imageUrl;

      if (messageId && imageUrl) {
        setMessages((prev) =>
          upsertIncoming(
            prev,
            {
              id: messageId,
              from: user?.username,
              message: imageUrl,
              type: 'image',
              senderId: user?.userId,
              createdAt: new Date().toISOString(),
            },
            user?.username
          ).list
        );
      }
    } catch (err) {
      setError(err.message);
      throw err; // let Composer know so it keeps the preview
    }
  };

  // ---- Upload general file over HTTP ----
  const handleFileUpload = async (file) => {
    if (!activeId) return;
    try {
      const payload = await api.uploadFile({ conversationId: activeId, file });
      const messageId = Number(payload?.messageId);
      const fileUrl = payload?.fileUrl;

      if (messageId && fileUrl) {
        const fileContent = JSON.stringify({
          url: fileUrl,
          name: payload?.fileName || file.name,
          size: payload?.fileSize || file.size,
          mimetype: file.type,
        });

        setMessages((prev) =>
          upsertIncoming(
            prev,
            {
              id: messageId,
              from: user?.username,
              message: fileContent,
              type: 'file',
              senderId: user?.userId,
              createdAt: new Date().toISOString(),
            },
            user?.username
          ).list
        );
      }
    } catch (err) {
      setError(err.message);
      throw err; // let Composer know so it keeps the preview
    }
  };

  const handleDelete = async (messageId) => {
    if (!Number.isInteger(messageId)) {
      // Never send a temp id to the API: Postgres rejects `tmp-...` for the
      // INTEGER id column and the backend responds 500.
      setError('Tin nhắn này chưa có mã xoá thật. Hãy mở lại đoạn chat rồi xoá.');
      return;
    }
    if (!window.confirm('Xoá tin nhắn này?')) return;

    // Optimistic: remove immediately so the UI does not wait on the network.
    let snapshot = null;
    tombstonesRef.current.add(messageId);
    setMessages((prev) => {
      snapshot = prev;
      return removeMessage(prev, messageId).list;
    });

    try {
      await deleteMessageAction({
        conversationId: activeId,
        messageId,
        userId: user?.userId,
      });
      // The room broadcast (once the backend emits it) keeps every other
      // client in sync; this client already applied it locally.
    } catch (err) {
      // Restore exactly the pre-delete list we captured.
      tombstonesRef.current.delete(messageId);
      if (snapshot) setMessages(snapshot);
      setError(err.message);
    }
  };

  const messagesWithDelete = useMemo(
    () => messages.map((m) => ({ ...m, onDelete: handleDelete })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, activeId]
  );

  // ---- Chat info (all from data already loaded; no extra backend call) ----
  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) || null,
    [conversations, activeId]
  );

  const historySenders = useMemo(() => {
    const set = new Set();
    messages.forEach((m) => {
      if (!m.system && m.senderName) set.add(m.senderName);
    });
    return Array.from(set);
  }, [messages]);

  const createChat = async ({ name, type }) => {
    try {
      const payload = await api.createChat({ conversation_name: name, conversation_type: type });
      setModal(null);
      setError('');
      await loadChats();
      if (payload?.id) {
        openChat(payload.id);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const joinChat = async (id) => {
    try {
      const res = await api.joinChat(id);
      setModal(null);
      setError('');
      await loadChats();
      if (res?.status === 'approved') {
        openChat(res?.chatId || id);
      } else {
        alert(res?.message || 'Yêu cầu tham gia đã được gửi tới Quản trị viên để phê duyệt.');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  // A socket is optional on Vercel; a successful HTTP sync is enough to say
  // the chat is online.
  const online = connected || syncOk;

  return (
    <div className={`app-shell ${(activeId || activeView === 'feed') ? 'mobile-chat-active' : ''}`}>
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        activeView={activeView}
        onSelect={openChat}
        onNewChat={() => setModal('create')}
        onJoinChat={() => setModal('join')}
        onOpenFriends={() => {
          setShowFriends(true);
          setShowInfo(false);
        }}
        onOpenFeed={() => {
          setActiveView('feed');
          setShowFriends(false);
          setShowInfo(false);
          loadFriendsList();
        }}
        pendingFriendRequestsCount={pendingFriendRequestsCount}
        onLogout={logout}
        username={user?.username}
      />

      <main className="chat-area">
        {/* TOPBAR WITH BRAND/TITLE, INSTANT USERNAME SEARCH, AND CONTROLS */}
        <div className="chat-header">
          {/* MOBILE BACK BUTTON (Visible only on mobile screens) */}
          <button
            type="button"
            className="mobile-back-btn"
            onClick={() => {
              setActiveId(null);
              setActiveView('chat');
            }}
            title="Quay lại danh sách chat"
            aria-label="Quay lại"
          >
            ←
          </button>

          <div className="chat-header-title">
            {activeView === 'feed' ? (
              <span>📰 BẢNG TIN // X-FEED</span>
            ) : (
              <div className="chat-header-info">
                <span className="chat-title-text">
                  {activeId
                    ? conversations.find((c) => c.id === activeId)?.name || `Chat #${activeId}`
                    : 'NEXORA // MESSENGER'}
                </span>
                {activeTypingList.length > 0 && (
                  <span className="chat-header-typing-status" title="Đang soạn tin...">
                    <span className="chat-typing-dots">
                      <span className="mini-dot" />
                      <span className="mini-dot" />
                      <span className="mini-dot" />
                    </span>
                    <span className="chat-typing-names">
                      {activeTypingList.map((u) => u.username).join(', ')} đang gõ...
                    </span>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* INSTANT TOPBAR SEARCH BY USERNAME OR EMAIL */}
          <div className="topbar-search-wrap" ref={searchWrapRef}>
            <input
              type="text"
              className="topbar-search-input"
              placeholder="🔍 Tìm username (@...) hoặc email..."
              value={topSearch}
              onFocus={() => setIsSearchOpen(true)}
              onChange={(e) => {
                setTopSearch(e.target.value);
                setIsSearchOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setIsSearchOpen(false);
                  setTopSearch('');
                }
              }}
            />
            {topSearch && (
              <button
                className="search-clear-btn"
                onClick={() => {
                  setTopSearch('');
                  setIsSearchOpen(false);
                }}
                title="Xoá tìm kiếm"
              >
                ✕
              </button>
            )}

            {/* LIVE USERNAME & EMAIL SEARCH DROPDOWN */}
            {isSearchOpen && topSearch.trim() && (
              <ul className="topbar-search-results">
                {isSearching && (
                  <li className="muted" style={{ padding: '8px 12px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                    // ĐANG TÌM KIẾM...
                  </li>
                )}
                {!isSearching && topSearchResults.length === 0 && (
                  <li className="muted" style={{ padding: '8px 12px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                    // Không tìm thấy người dùng phù hợp
                  </li>
                )}
                {!isSearching &&
                  topSearchResults.map((u) => {
                    const isFriend = u.relationshipStatus === 'friends';
                    const isSent = u.relationshipStatus === 'pending_sent';
                    const isReceived = u.relationshipStatus === 'pending_received';

                    return (
                      <li key={u.id} className="topbar-search-item">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <span className={`presence-dot ${u.isOnline ? 'online' : 'offline'}`} />
                          <div style={{ minWidth: 0 }}>
                            <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
                              @{u.username}
                            </strong>
                            <div className="muted" style={{ fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          {isFriend && (
                            <button
                              className="primary sm"
                              onClick={() => {
                                handleStartDirectChat(u.id);
                                setTopSearch('');
                                setIsSearchOpen(false);
                                setActiveView('chat');
                              }}
                              title="Nhắn tin trực tiếp 1-1"
                            >
                              💬 Nhắn
                            </button>
                          )}
                          {isSent && (
                            <span className="chip">Đã gửi</span>
                          )}
                          {isReceived && (
                            <button
                              className="primary sm"
                              onClick={async () => {
                                try {
                                  await api.respondFriendRequest(u.requestId, 'accept');
                                  setTopSearchResults((prev) =>
                                    prev.map((item) =>
                                      item.id === u.id
                                        ? { ...item, relationshipStatus: 'friends' }
                                        : item
                                    )
                                  );
                                  loadChats();
                                  loadFriendsList();
                                  loadPendingFriendRequestsCount();
                                } catch (err) {
                                  alert(err.message || 'Lỗi đồng ý lời mời kết bạn.');
                                }
                              }}
                            >
                              Đồng ý
                            </button>
                          )}
                          {!isFriend && !isSent && !isReceived && (
                            <button
                              className="ghost sm"
                              onClick={async () => {
                                try {
                                  const res = await api.sendFriendRequest(u.id);
                                  setTopSearchResults((prev) =>
                                    prev.map((item) =>
                                      item.id === u.id
                                        ? { ...item, relationshipStatus: 'pending_sent', requestId: res?.requestId }
                                        : item
                                    )
                                  );
                                } catch (err) {
                                  alert(err.message || 'Lỗi gửi lời mời kết bạn.');
                                }
                              }}
                            >
                              + Kết bạn
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>

          <span className="header-right">
            <button
              className="icon-btn"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
              aria-label="Đổi giao diện"
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
            <button
              className={activeView === 'feed' ? 'icon-btn active' : 'icon-btn'}
              onClick={() => {
                setActiveView((v) => (v === 'feed' ? 'chat' : 'feed'));
                loadFriendsList();
              }}
              title="Chuyển chế độ Bảng tin X-Feed"
              aria-label="X-Feed"
            >
              📰
            </button>
            <button
              className={showFriends ? 'icon-btn active' : 'icon-btn'}
              onClick={() => {
                setShowFriends((v) => !v);
                setShowInfo(false);
              }}
              title="Bạn bè & Kết nối"
              aria-label="Bạn bè & Kết nối"
              style={{ position: 'relative' }}
            >
              👥
              {pendingFriendRequestsCount > 0 && (
                <span className="badge-count-dot" />
              )}
            </button>
            {activeId && activeView === 'chat' && (
              <button
                className={showInfo ? 'icon-btn active' : 'icon-btn'}
                onClick={() => setShowInfo((v) => !v)}
                title="Thông tin đoạn chat"
                aria-label="Thông tin đoạn chat"
                aria-expanded={showInfo}
              >
                ⓘ
              </button>
            )}
            <span
              className={online ? 'presence-dot online' : 'presence-dot offline'}
              title={online ? 'Trực tuyến' : 'Ngoại tuyến'}
            />
          </span>
        </div>

        {error && (
          <div className="alert error banner">
            {error}{' '}
            <button className="link" onClick={() => setError('')}>
              đóng
            </button>
          </div>
        )}

        <div className="chat-body">
          {activeView === 'feed' ? (
            <XFeedView
              currentUser={user}
              friends={friendsList}
              on={on}
              off={off}
              onOpenDirectChat={(friendId) => {
                handleStartDirectChat(friendId);
                setActiveView('chat');
              }}
            />
          ) : (
            <div className="chat-main">
              {activeConversation?.status === 'pending' && (
                <div
                  className="alert warning banner"
                  style={{ margin: '12px 20px 0' }}
                >
                  <span>
                    ⏳ <strong>Chờ duyệt:</strong> Yêu cầu tham gia đoạn chat này của bạn đang chờ Quản trị viên phê duyệt. Bạn chưa thể xem hoặc gửi tin nhắn.
                  </span>
                </div>
              )}
              <MessageList
                messages={messagesWithDelete}
                currentUserId={user?.userId}
                currentUsername={user?.username}
                typingUsers={activeTypingList}
              />
              <Composer
                disabled={!activeId || activeConversation?.status === 'pending'}
                onSend={handleSend}
                onImageUpload={handleImageUpload}
                onFileUpload={handleFileUpload}
                onTypingStart={handleTypingStart}
                onTypingStop={handleTypingStop}
              />
            </div>
          )}

          {showInfo && activeId && (
            <>
              <div className="drawer-scrim" onClick={() => setShowInfo(false)} />
              <ChatInfoDrawer
                conversation={activeConversation}
                senders={historySenders}
                currentUsername={user?.username}
                onClose={() => setShowInfo(false)}
                onMemberUpdated={loadChats}
                onLeaveChat={async () => {
                  setActiveId(null);
                  setMessages([]);
                  setShowInfo(false);
                  await loadChats();
                }}
                onDeleteChat={async () => {
                  setActiveId(null);
                  setMessages([]);
                  setShowInfo(false);
                  await loadChats();
                }}
              />
            </>
          )}

          {showFriends && (
            <>
              <div className="drawer-scrim" onClick={() => setShowFriends(false)} />
              <FriendsDrawer
                isOpen={showFriends}
                onClose={() => setShowFriends(false)}
                onStartDirectChat={handleStartDirectChat}
                on={on}
                off={off}
                onRequestCountChange={setPendingFriendRequestsCount}
              />
            </>
          )}

          {showFeed && (
            <>
              <div className="drawer-scrim" onClick={() => setShowFeed(false)} />
              <FeedDrawer
                isOpen={showFeed}
                onClose={() => setShowFeed(false)}
                currentUser={user}
                friends={friendsList}
                on={on}
                off={off}
              />
            </>
          )}
        </div>
      </main>

      {modal === 'create' && <CreateChatModal onClose={() => setModal(null)} onSubmit={createChat} />}
      {modal === 'join' && <JoinChatModal onClose={() => setModal(null)} onSubmit={joinChat} />}
    </div>
  );
}

function CreateChatModal({ onClose, onSubmit }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('group');

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Tạo đoạn chat mới</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) onSubmit({ name: name.trim(), type });
          }}
        >
          <label>
            Tên
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </label>
          <label>
            Loại
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="group">group</option>
              <option value="direct">direct</option>
            </select>
          </label>
          <div className="modal-actions">
            <button type="button" className="ghost" onClick={onClose}>
              Huỷ
            </button>
            <button type="submit" className="primary">
              Tạo
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function JoinChatModal({ onClose, onSubmit }) {
  const [id, setId] = useState('');

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Vào đoạn chat</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (id.trim()) onSubmit(id.trim());
          }}
        >
          <label>
            Mã đoạn chat (Chat ID mã hoá)
            <input
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="Dán mã đoạn chat vào đây (vd: c_...)"
              required
              autoFocus
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="ghost" onClick={onClose}>
              Huỷ
            </button>
            <button type="submit" className="primary">
              Gửi yêu cầu tham gia
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ChatInfoDrawer({
  conversation,
  senders,
  currentUsername,
  onClose,
  onMemberUpdated,
  onLeaveChat,
  onDeleteChat,
}) {
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [actionMsg, setActionMsg] = useState('');

  // Shared media state
  const [sharedMedia, setSharedMedia] = useState([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [lightboxImg, setLightboxImg] = useState(null);

  const isAdmin = conversation?.userRole === 'admin';

  const loadPending = useCallback(async () => {
    if (!isAdmin || !conversation?.id) return;
    setLoadingPending(true);
    try {
      const res = await api.getPendingRequests(conversation.id);
      setPendingRequests(res?.pendingRequests || []);
    } catch {
      // ignore
    } finally {
      setLoadingPending(false);
    }
  }, [isAdmin, conversation?.id]);

  const loadMedia = useCallback(async () => {
    if (!conversation?.id) return;
    setLoadingMedia(true);
    try {
      const res = await api.getSharedMedia(conversation.id);
      setSharedMedia(res?.media || []);
    } catch {
      // ignore
    } finally {
      setLoadingMedia(false);
    }
  }, [conversation?.id]);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  useEffect(() => {
    loadMedia();
  }, [loadMedia]);

  const handleApprove = async (userId) => {
    try {
      await api.approveMember(conversation.id, userId);
      setPendingRequests((prev) => prev.filter((r) => r.userId !== userId));
      setActionMsg('Đã duyệt thành viên!');
      setTimeout(() => setActionMsg(''), 3000);
      onMemberUpdated?.();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleReject = async (userId) => {
    try {
      await api.rejectMember(conversation.id, userId);
      setPendingRequests((prev) => prev.filter((r) => r.userId !== userId));
      setActionMsg('Đã từ chối yêu cầu.');
      setTimeout(() => setActionMsg(''), 3000);
      onMemberUpdated?.();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleLeave = async () => {
    if (!window.confirm(`Bạn có chắc chắn muốn rời khỏi đoạn chat "${conversation.name}"?`)) return;
    try {
      await api.leaveChat(conversation.id);
      alert('Bạn đã rời khỏi đoạn chat thành công.');
      onLeaveChat?.();
    } catch (err) {
      alert(err.message || 'Lỗi khi rời khỏi đoạn chat.');
    }
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        `⚠️ CẢNH BÁO QUẢN TRỊ VIÊN:\nBạn có chắc chắn muốn xoá vĩnh viễn đoạn chat "${conversation.name}"?\nToàn bộ tin nhắn và ảnh sẽ bị xoá vĩnh viễn.`
      )
    ) {
      return;
    }
    try {
      await api.deleteChat(conversation.id);
      alert('Đoạn chat đã được xoá thành công.');
      onDeleteChat?.();
    } catch (err) {
      alert(err.message || 'Lỗi khi xoá đoạn chat.');
    }
  };

  if (!conversation) return null;
  return (
    <>
      <aside className="info-drawer" aria-label="Thông tin đoạn chat">
        <header className="info-drawer-head">
          <div>
            <h3>Thông tin</h3>
            <p className="info-drawer-sub" style={{ wordBreak: 'break-all', fontSize: '0.75rem' }}>
              ID: {conversation.id}
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} title="Đóng" aria-label="Đóng">
            ✕
          </button>
        </header>

        <div className="info-drawer-body">
          <div className="info-cover">
            <span className="info-cover-mark">#</span>
            <span className="info-cover-id" style={{ wordBreak: 'break-all', fontSize: '0.75rem', padding: '0 8px' }}>
              {conversation.id}
            </span>
          </div>

          <div className="info-title">{conversation.name}</div>
          <div className="info-chips">
            <span className="chip">{conversation.type}</span>
            <span className="chip">{conversation.numberMembers} thành viên</span>
            {isAdmin && <span className="chip">Admin</span>}
            {conversation.status === 'pending' && <span className="chip warning">Chờ duyệt</span>}
          </div>

          {actionMsg && (
            <div className="alert success" style={{ fontSize: '0.85rem' }}>
              {actionMsg}
            </div>
          )}

          {/* ADMIN SECTION: PENDING REQUESTS */}
          {isAdmin && (
            <section className="info-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4>Yêu cầu chờ duyệt ({pendingRequests.length})</h4>
                <button className="link sm" onClick={loadPending} title="Làm mới">
                  Tải lại
                </button>
              </div>
              {loadingPending && <p className="muted">Đang kiểm tra...</p>}
              {!loadingPending && pendingRequests.length === 0 && (
                <p className="muted" style={{ fontSize: '0.85rem' }}>Không có yêu cầu nào đang chờ</p>
              )}
              {!loadingPending && pendingRequests.length > 0 && (
                <ul className="member-list" style={{ marginTop: 8 }}>
                  {pendingRequests.map((r) => (
                    <li key={r.userId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                      <div>
                        <span className="member-name" style={{ fontWeight: 600 }}>{r.username}</span>
                        <small className="muted" style={{ display: 'block', fontSize: '0.75rem' }}>{r.email}</small>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="primary sm"
                          onClick={() => handleApprove(r.userId)}
                          style={{ padding: '3px 8px', fontSize: '0.75rem' }}
                        >
                          ✓ Duyệt
                        </button>
                        <button
                          className="ghost sm"
                          onClick={() => handleReject(r.userId)}
                          style={{ padding: '3px 8px', fontSize: '0.75rem' }}
                        >
                          ✕
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* SHARED MEDIA SECTION */}
          <section className="info-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4>Ảnh & Tệp đã gửi ({sharedMedia.length})</h4>
              <button className="link sm" onClick={loadMedia} title="Làm mới ảnh & tệp">
                Tải lại
              </button>
            </div>

            {loadingMedia && <p className="muted" style={{ fontSize: '0.85rem' }}>Đang tải danh sách ảnh & tệp...</p>}

            {!loadingMedia && sharedMedia.length === 0 && (
              <p className="muted" style={{ fontSize: '0.85rem' }}>Chưa có ảnh hoặc tệp nào trong đoạn chat này.</p>
            )}

            {!loadingMedia && sharedMedia.length > 0 && (
              <div className="media-grid">
                {sharedMedia.map((m) => {
                  const fullUrl = resolveMediaUrl(m.url);
                  return (
                    <div
                      key={m.id}
                      className="media-grid-item"
                      onClick={() => setLightboxImg(fullUrl)}
                      title={m.name || 'Xem ảnh'}
                    >
                      <img src={fullUrl} alt={m.name || 'Ảnh đã gửi'} loading="lazy" />
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="info-section">
            <h4>Chi tiết</h4>
            <dl className="info-list">
              <div className="info-row">
                <dt>Chat ID (Mã hoá)</dt>
                <dd style={{ wordBreak: 'break-all', fontSize: '0.75rem' }}>
                  {conversation.id}{' '}
                  <button
                    className="link"
                    onClick={() => {
                      navigator.clipboard.writeText(conversation.id);
                      alert('Đã copy Chat ID vào clipboard!');
                    }}
                    style={{ fontSize: '0.7rem', marginLeft: 4 }}
                  >
                    Copy
                  </button>
                </dd>
              </div>
              <div className="info-row">
                <dt>Loại</dt>
                <dd>{conversation.type}</dd>
              </div>
              <div className="info-row">
                <dt>Số thành viên</dt>
                <dd>{conversation.numberMembers}</dd>
              </div>
              <div className="info-row">
                <dt>Vai trò của bạn</dt>
                <dd>{conversation.userRole}</dd>
              </div>
            </dl>
          </section>

          <section className="info-section">
            <h4>Người đã nhắn</h4>
            {senders.length === 0 ? (
              <p className="muted">Chưa có tin nhắn trong lịch sử đã tải</p>
            ) : (
              <ul className="member-list">
                {senders.map((s) => (
                  <li key={s}>
                    <span className="member-avatar">{s.charAt(0).toUpperCase()}</span>
                    <span className="member-name">{s}</span>
                    {s === currentUsername && <span className="chip sm">bạn</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* DANGER / LEAVE CHAT ACTIONS */}
          <div className="drawer-danger-actions">
            <button
              type="button"
              className="btn-danger-outline"
              onClick={handleLeave}
              title="Rời khỏi đoạn chat này"
            >
              ← Rời khỏi đoạn chat
            </button>

            {isAdmin && (
              <button
                type="button"
                className="btn-danger-solid"
                onClick={handleDelete}
                title="Xoá vĩnh viễn đoạn chat này"
              >
                🗑 Xoá đoạn chat
              </button>
            )}
          </div>
        </div>
      </aside>

      {lightboxImg && (
        <ImageLightbox
          src={lightboxImg}
          alt="Ảnh phóng to"
          onClose={() => setLightboxImg(null)}
        />
      )}
    </>
  );
}
