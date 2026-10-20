import { useEffect, useRef } from 'react';

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function MessageList({ messages, currentUserId, currentUsername }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="messages">
        <div className="empty-state">Chọn một đoạn chat để bắt đầu</div>
      </div>
    );
  }

  return (
    <div className="messages">
      {messages.map((m) => {
        if (m.system) {
          return (
            <div key={m.id} className="msg-system">
              {m.content}
            </div>
          );
        }
        const mine =
          (m.senderId != null && m.senderId === currentUserId) ||
          // Live socket messages only carry a username, so fall back to it.
          (!m.senderId && !!m.senderName && m.senderName === currentUsername);
        return (
          <div key={m.id} className={mine ? 'msg mine' : 'msg'}>
            {!mine && <div className="msg-sender">{m.senderName}</div>}
            <div className="msg-bubble">{m.content}</div>
            <div className="msg-foot">
              <span className="msg-time">{formatTime(m.createdAt)}</span>
              {mine && (
                <button
                  className="msg-delete"
                  title="Xoá tin nhắn"
                  onClick={() => m.onDelete?.(m.id)}
                >
                  Xoá
                </button>
              )}
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
