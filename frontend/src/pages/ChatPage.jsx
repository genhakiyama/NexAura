import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
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
import MessageList from '../components/MessageList';
import Composer from '../components/Composer';

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

  const activeIdRef = useRef(null);
  activeIdRef.current = activeId;

  // Sends whose socket echo has not been matched to the real DB id yet.
  const pendingSendsRef = useRef([]);

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
        emit('leave_room', activeIdRef.current);
      }
      // Echoes for other chats are ignored while inactive; let their next
      // history load supply the real ids instead of matching them later.
      pendingSendsRef.current = pendingSendsRef.current.filter(
        (p) => p.conversationId === id
      );
      // A fresh conversation starts with a clean tombstone set, otherwise an
      // id reused by another chat would be filtered out on load.
      tombstonesRef.current = new Set();
      setActiveId(id);
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

    on('send_message', handleNewMessage);
    on('new_notification', handleNotification);
    on('message_deleted', handleDeleted);
    on('new_join_request', handleJoinRequest);
    on('join_approved', handleJoinApproved);
    on('join_rejected', handleJoinRejected);
    return () => {
      off('send_message', handleNewMessage);
      off('new_notification', handleNotification);
      off('message_deleted', handleDeleted);
      off('new_join_request', handleJoinRequest);
      off('join_approved', handleJoinApproved);
      off('join_rejected', handleJoinRejected);
    };
  }, [on, off, loadChats, openChat, user]);

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
    <div className="app-shell">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={openChat}
        onNewChat={() => setModal('create')}
        onJoinChat={() => setModal('join')}
        onLogout={logout}
        username={user?.username}
      />

      <main className="chat-area">
        <div className="chat-header">
          <span>
            {activeId
              ? conversations.find((c) => c.id === activeId)?.name || `Chat #${activeId}`
              : 'Nexora'}
          </span>
          <span className="header-right">
            <button
              className="icon-btn"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'}
              aria-label="Đổi giao diện sáng/tối"
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
            {activeId && (
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
              className={online ? 'dot on' : 'dot off'}
              title={
                authFailed
                  ? 'Phiên đăng nhập đã hết hạn, đang chuyển về trang đăng nhập'
                  : connected
                    ? 'Đang nhận tin nhắn qua Socket.IO'
                    : syncOk
                      ? 'Đang đồng bộ tin nhắn mỗi 3 giây'
                      : 'Không kết nối được backend'
              }
            >
              {online
                ? 'trực tuyến'
                : authFailed
                  ? 'hết phiên'
                  : 'đang kết nối...'}
            </span>
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
          <div className="chat-main">
            {activeConversation?.status === 'pending' && (
              <div
                className="alert warning banner"
                style={{
                  marginBottom: 12,
                  backgroundColor: '#fffbeb',
                  color: '#b45309',
                  border: '1px solid #fde68a',
                  padding: '10px 14px',
                  borderRadius: 8,
                }}
              >
                ⏳ <strong>Chờ duyệt:</strong> Yêu cầu tham gia đoạn chat này của bạn đang chờ Quản trị viên phê duyệt. Bạn chưa thể xem hoặc gửi tin nhắn.
              </div>
            )}
            <MessageList
              messages={messagesWithDelete}
              currentUserId={user?.userId}
              currentUsername={user?.username}
            />
            <Composer
              disabled={!activeId || activeConversation?.status === 'pending'}
              onSend={handleSend}
              onImageUpload={handleImageUpload}
            />
          </div>

          {showInfo && activeId && (
            <>
              <div className="drawer-scrim" onClick={() => setShowInfo(false)} />
              <ChatInfoDrawer
                conversation={activeConversation}
                senders={historySenders}
                currentUsername={user?.username}
                onClose={() => setShowInfo(false)}
                onMemberUpdated={loadChats}
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

function ChatInfoDrawer({ conversation, senders, currentUsername, onClose, onMemberUpdated }) {
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [actionMsg, setActionMsg] = useState('');

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

  useEffect(() => {
    loadPending();
  }, [loadPending]);

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

  if (!conversation) return null;
  return (
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
          {isAdmin && <span className="chip" style={{ background: '#3b82f6', color: '#fff' }}>Admin</span>}
          {conversation.status === 'pending' && <span className="chip warning" style={{ background: '#f59e0b', color: '#fff' }}>Chờ duyệt</span>}
        </div>

        {actionMsg && (
          <div style={{ padding: '8px 12px', background: '#ecfdf5', color: '#065f46', borderRadius: 6, fontSize: '0.85rem', marginTop: 10 }}>
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
      </div>
    </aside>
  );
}
