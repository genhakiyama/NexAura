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

// Conversation/message ids travel as JSON numbers over HTTP but can arrive as
// strings from a URL param or a socket frame. Comparing with `===` across the
// two forms would silently drop a delete broadcast, so every id comparison in
// this file goes through these helpers.
const sameId = (a, b) => a != null && b != null && String(a) === String(b);
const idIn = (list, id) => list.some((x) => sameId(x, id));

export default function ChatPage() {
  const { user, logout, token } = useAuth();
  const { connected, authFailed, configured, on, off, emit } = useSocket(token);
  const { theme, toggle: toggleTheme } = useTheme();

  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState('');
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
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    loadChats();
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

    on('send_message', handleNewMessage);
    on('new_notification', handleNotification);
    on('message_deleted', handleDeleted);
    return () => {
      off('send_message', handleNewMessage);
      off('new_notification', handleNotification);
      off('message_deleted', handleDeleted);
    };
  }, [on, off, loadChats, user]);

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
      // No optimistic append: the sender's own socket receives 'send_message' back.
      const messageId = Number(payload?.sendMessage?.messageId);
      if (!Number.isInteger(messageId) || messageId <= 0) {
        pendingSendsRef.current = pendingSendsRef.current.filter((p) => p !== pending);
        return;
      }
      pending.messageId = messageId;
      if (pending.tempId != null) {
        // Echo already rendered under a temp id: fold it into the real id so
        // the row can be deleted without a DB cast error.
        setMessages((prev) =>
          prev.map((m) => (m.id === pending.tempId ? { ...m, id: messageId } : m))
        );
        pendingSendsRef.current = pendingSendsRef.current.filter((p) => p !== pending);
      }
    } catch (err) {
      pendingSendsRef.current = pendingSendsRef.current.filter((p) => p !== pending);
      setError(err.message);
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
      await api.createChat({ conversation_name: name, conversation_type: type });
      setModal(null);
      setError('');
      await loadChats();
    } catch (err) {
      setError(err.message);
    }
  };

  const joinChat = async (id) => {
    try {
      await api.joinChat(id);
      setModal(null);
      setError('');
      await loadChats();
      openChat(Number(id));
    } catch (err) {
      setError(err.message);
    }
  };

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
              className={connected ? 'dot on' : 'dot off'}
              title={
                authFailed
                  ? 'Phiên đăng nhập đã hết hạn, đang chuyển về trang đăng nhập'
                  : !configured
                    ? 'Thiếu VITE_API_URL trong bản build production'
                    : undefined
              }
            >
              {connected
                ? 'trực tuyến'
                : authFailed
                  ? 'hết phiên'
                  : !configured
                    ? 'chưa cấu hình backend'
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
            <MessageList
              messages={messagesWithDelete}
              currentUserId={user?.userId}
              currentUsername={user?.username}
            />
            <Composer disabled={!activeId} onSend={handleSend} />
          </div>

          {showInfo && activeId && (
            <>
              <div className="drawer-scrim" onClick={() => setShowInfo(false)} />
              <ChatInfoDrawer
                conversation={activeConversation}
                senders={historySenders}
                currentUsername={user?.username}
                onClose={() => setShowInfo(false)}
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
            ID đoạn chat
            <input
              value={id}
              onChange={(e) => setId(e.target.value)}
              inputMode="numeric"
              placeholder="vd: 1"
              required
              autoFocus
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="ghost" onClick={onClose}>
              Huỷ
            </button>
            <button type="submit" className="primary">
              Tham gia
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ChatInfoDrawer({ conversation, senders, currentUsername, onClose }) {
  if (!conversation) return null;
  return (
    <aside className="info-drawer" aria-label="Thông tin đoạn chat">
      <header className="info-drawer-head">
        <div>
          <h3>Thông tin</h3>
          <p className="info-drawer-sub">#{conversation.id}</p>
        </div>
        <button className="icon-btn" onClick={onClose} title="Đóng" aria-label="Đóng">
          ✕
        </button>
      </header>

      <div className="info-drawer-body">
        <div className="info-cover">
          <span className="info-cover-mark">#</span>
          <span className="info-cover-id">{conversation.id}</span>
        </div>

        <div className="info-title">{conversation.name}</div>
        <div className="info-chips">
          <span className="chip">{conversation.type}</span>
          <span className="chip">{conversation.numberMembers} thành viên</span>
        </div>

        <section className="info-section">
          <h4>Chi tiết</h4>
          <dl className="info-list">
            <div className="info-row">
              <dt>Chat ID</dt>
              <dd>#{conversation.id}</dd>
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
