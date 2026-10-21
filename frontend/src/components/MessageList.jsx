import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { resolveMediaUrl } from '../api';

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatFileSize(bytes) {
  if (!bytes || Number.isNaN(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileDetails(fileName = '', mime = '') {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (['pdf'].includes(ext) || mime?.includes('pdf')) {
    return { icon: '📄', label: 'PDF', color: '#ff5c5c' };
  }
  if (['doc', 'docx'].includes(ext) || mime?.includes('word')) {
    return { icon: '📝', label: 'DOC', color: '#4a90e2' };
  }
  if (['xls', 'xlsx', 'csv'].includes(ext) || mime?.includes('excel') || mime?.includes('spreadsheet')) {
    return { icon: '📊', label: 'XLS', color: '#27ae60' };
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext) || mime?.includes('zip') || mime?.includes('compressed')) {
    return { icon: '🗜️', label: ext.toUpperCase() || 'ZIP', color: '#e67e22' };
  }
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext) || mime?.includes('audio')) {
    return { icon: '🎵', label: 'AUDIO', color: '#9b59b6' };
  }
  if (['mp4', 'mov', 'webm', 'mkv'].includes(ext) || mime?.includes('video')) {
    return { icon: '🎬', label: 'VIDEO', color: '#e74c3c' };
  }
  if (['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'py', 'java', 'c', 'cpp'].includes(ext)) {
    return { icon: '💻', label: ext.toUpperCase() || 'CODE', color: '#3498db' };
  }
  return { icon: '📎', label: ext.toUpperCase() || 'FILE', color: 'var(--accent)' };
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

export default function MessageList({
  messages,
  currentUserId,
  currentUsername,
  typingUsers = [],
}) {
  const bottomRef = useRef(null);
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers]);

  const openLightbox = useCallback((src) => setLightbox(src), []);
  const closeLightbox = useCallback(() => setLightbox(null), []);

  return (
    <div className="messages">
      {messages.length === 0 ? (
        <div className="empty-state">
          Chưa có tin nhắn nào trong cuộc trò chuyện này. Hãy gửi tin nhắn đầu tiên!
        </div>
      ) : (
        messages.map((m) => {
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
          const isFile = m.type === 'file';

          let fileInfo = null;
          if (isFile) {
            try {
              if (typeof m.content === 'string' && m.content.trim().startsWith('{')) {
                const parsed = JSON.parse(m.content);
                fileInfo = {
                  url: resolveMediaUrl(parsed.url),
                  name: parsed.name || 'Tệp đính kèm',
                  size: parsed.size,
                  mimetype: parsed.mimetype,
                };
              } else {
                const url = resolveMediaUrl(m.content);
                const name = url.split('/').pop() || 'Tệp đính kèm';
                fileInfo = { url, name, size: null };
              }
            } catch {
              fileInfo = { url: resolveMediaUrl(m.content), name: 'Tệp đính kèm', size: null };
            }
          }

          const fileDetails = isFile && fileInfo ? getFileDetails(fileInfo.name, fileInfo.mimetype) : null;

          return (
            <div key={m.id} className={mine ? 'msg mine' : 'msg'}>
              {!mine && <div className="msg-sender">{m.senderName}</div>}
              <div
                className={
                  isImage
                    ? 'msg-bubble msg-bubble-image'
                    : isFile
                    ? 'msg-bubble msg-bubble-file'
                    : 'msg-bubble'
                }
              >
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
                ) : isFile && fileInfo ? (
                  <a
                    href={fileInfo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={fileInfo.name}
                    className="msg-file-card"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div
                      className="msg-file-icon-badge"
                      style={{ borderColor: fileDetails?.color || 'var(--accent)' }}
                    >
                      <span className="msg-file-icon">{fileDetails?.icon || '📎'}</span>
                      <span
                        className="msg-file-ext"
                        style={{ color: fileDetails?.color || 'var(--accent)' }}
                      >
                        {fileDetails?.label || 'FILE'}
                      </span>
                    </div>
                    <div className="msg-file-meta-wrap">
                      <span className="msg-file-title" title={fileInfo.name}>
                        {fileInfo.name}
                      </span>
                      <span className="msg-file-sub">
                        {fileInfo.size ? formatFileSize(fileInfo.size) : 'Tệp tin'}
                        <span className="msg-file-action-label"> • Tải về ⬇</span>
                      </span>
                    </div>
                    <div className="msg-file-dl-btn" title="Tải xuống tệp">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    </div>
                  </a>
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
        })
      )}

      {/* Locket-style animated typing indicator */}
      {typingUsers && typingUsers.length > 0 && (
        <div className="msg typing-indicator-msg" aria-live="polite">
          <div className="msg-sender">
            {typingUsers.map((u) => u.username).join(', ')} đang soạn tin...
          </div>
          <div className="locket-typing-row">
            <div className="typing-mini-avatar" aria-hidden="true">
              {(typingUsers[0]?.username || '?').charAt(0).toUpperCase()}
            </div>
            <div
              className="msg-bubble locket-typing-bubble"
              title={`${typingUsers.map((u) => u.username).join(', ')} đang gõ...`}
            >
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />

      {lightbox && (
        <ImageLightbox src={lightbox} alt="Ảnh phóng to" onClose={closeLightbox} />
      )}
    </div>
  );
}
