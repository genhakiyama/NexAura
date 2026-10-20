import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { resolveMediaUrl } from '../api';

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ImageLightbox({ src, alt, onClose }) {
  // Close on Escape
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!src) return null;

  return createPortal(
    <div
      className="lightbox-backdrop"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
        <img src={src} alt={alt || 'Ảnh'} />
        <div className="lightbox-toolbar">
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="lightbox-action-btn"
            title="Mở trong tab mới"
            onClick={(e) => e.stopPropagation()}
          >
            ↗ Tab mới
          </a>
          <button
            type="button"
            className="lightbox-close"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            title="Đóng (Esc)"
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function MessageList({ messages, currentUserId, currentUsername }) {
  const bottomRef = useRef(null);
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const openLightbox = useCallback((src) => setLightbox(src), []);
  const closeLightbox = useCallback(() => setLightbox(null), []);

  if (messages.length === 0) {
    return (
      <div className="messages">
        <div className="empty-state">Chưa có tin nhắn nào trong cuộc trò chuyện này. Hãy gửi tin nhắn đầu tiên!</div>
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

        const isImage = m.type === 'image';

        return (
          <div key={m.id} className={mine ? 'msg mine' : 'msg'}>
            {!mine && <div className="msg-sender">{m.senderName}</div>}
            <div className={isImage ? "msg-bubble msg-bubble-image" : "msg-bubble"}>
              {isImage ? (
                <img
                  className="msg-image"
                  src={resolveMediaUrl(m.content)}
                  alt="Ảnh"
                  loading="lazy"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openLightbox(resolveMediaUrl(m.content));
                  }}
                />
              ) : (
                m.content
              )}
            </div>
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

      {lightbox && (
        <ImageLightbox src={lightbox} alt="Ảnh phóng to" onClose={closeLightbox} />
      )}
    </div>
  );
}
