import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

function formatSize(bytes) {
  if (!bytes || Number.isNaN(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Composer({
  disabled,
  onSend,
  onImageUpload,
  onFileUpload,
  onTypingStart,
  onTypingStop,
}) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null); // { file, url, isImage, name, size, ext }
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const isTypingRef = useRef(false);
  const typingTimerRef = useRef(null);

  const stopTyping = useCallback(() => {
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    if (isTypingRef.current) {
      isTypingRef.current = false;
      onTypingStop?.();
    }
  }, [onTypingStop]);

  // Clean up typing state on unmount or when disabled
  useEffect(() => {
    return () => {
      stopTyping();
    };
  }, [stopTyping]);

  // Stop typing if tab goes hidden
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stopTyping();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [stopTyping]);

  const handleTextChange = (e) => {
    const val = e.target.value;
    setText(val);

    if (disabled) return;

    if (!val.trim()) {
      stopTyping();
      return;
    }

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      onTypingStart?.();
    }

    // Reset debounce timer on every keystroke
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      stopTyping();
    }, 2500);
  };

  const cancelPreview = () => {
    if (preview?.url && preview.isImage) {
      URL.revokeObjectURL(preview.url);
    }
    setPreview(null);
  };

  const processFile = (file) => {
    if (!file) return;

    const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
    const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_FILE_SIZE;

    if (file.size > maxSize) {
      alert(`Tệp quá lớn. Giới hạn dung lượng là ${isImage ? '10 MB' : '25 MB'}.`);
      return;
    }

    const dangerousExts = ['.exe', '.bat', '.cmd', '.sh', '.msi', '.vbs', '.scr', '.pif'];
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (dangerousExts.includes(ext)) {
      alert('Vì lý do an toàn, không được gửi các tệp thực thi (.exe, .bat, .sh...).');
      return;
    }

    let url = '';
    if (isImage) {
      url = URL.createObjectURL(file);
    }

    setPreview({
      file,
      url,
      isImage,
      name: file.name,
      size: file.size,
      ext: (ext.replace('.', '') || 'FILE').toUpperCase(),
    });
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) processFile(file);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) processFile(file);
  };

  const handleSendAttachment = async () => {
    if (!preview || uploading) return;
    setUploading(true);
    try {
      if (preview.isImage && onImageUpload) {
        await onImageUpload(preview.file);
      } else if (onFileUpload) {
        await onFileUpload(preview.file);
      }
      cancelPreview();
    } catch {
      // error is handled by parent (ChatPage)
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (disabled || uploading) return;

    // If there is an attachment selected, send it first
    if (preview) {
      await handleSendAttachment();
    }

    const value = text.trim();
    if (value) {
      stopTyping();
      setText('');
      await onSend(value);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !uploading) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (disabled || uploading) return;

    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  return (
    <div
      className={`composer-wrapper ${isDragOver ? 'dragover' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* File/Image preview strip */}
      {preview && (
        <div className="composer-preview-strip">
          {preview.isImage ? (
            <div className="preview-item-wrap">
              <img src={preview.url} alt="Xem trước" className="composer-preview-thumb" />
              <div className="preview-file-details">
                <span className="preview-file-name" title={preview.name}>{preview.name}</span>
                <span className="preview-file-size">{formatSize(preview.size)}</span>
              </div>
            </div>
          ) : (
            <div className="preview-item-wrap">
              <div className="preview-file-badge">
                <span className="preview-file-icon">📄</span>
                <span className="preview-file-ext">{preview.ext}</span>
              </div>
              <div className="preview-file-details">
                <span className="preview-file-name" title={preview.name}>{preview.name}</span>
                <span className="preview-file-size">{formatSize(preview.size)}</span>
              </div>
            </div>
          )}
          <div className="composer-preview-actions">
            <button
              className="ghost sm"
              onClick={cancelPreview}
              disabled={uploading}
              type="button"
            >
              Huỷ
            </button>
            <button
              className="primary sm"
              onClick={handleSendAttachment}
              disabled={uploading}
              type="button"
            >
              {uploading ? 'Đang tải…' : preview.isImage ? 'Gửi ảnh' : 'Gửi tệp'}
            </button>
          </div>
        </div>
      )}

      {isDragOver && (
        <div className="composer-drop-overlay">
          <span>📥 Thả ảnh hoặc tệp vào đây để gửi</span>
        </div>
      )}

      <form className="composer" onSubmit={submit}>
        {/* Hidden image input */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          style={{ display: 'none' }}
          onChange={handleImageChange}
        />

        {/* Hidden general file input */}
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {/* Attach Image button */}
        <button
          type="button"
          className="composer-attach"
          onClick={() => {
            if (disabled || uploading) return;
            imageInputRef.current?.click();
          }}
          disabled={disabled || uploading}
          title="Gửi ảnh (JPG, PNG, GIF, WebP)"
          aria-label="Đính kèm ảnh"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
        </button>

        {/* Attach File button */}
        <button
          type="button"
          className="composer-attach"
          onClick={() => {
            if (disabled || uploading) return;
            fileInputRef.current?.click();
          }}
          disabled={disabled || uploading}
          title="Đính kèm tệp tin (PDF, Word, Excel, ZIP, v.v.)"
          aria-label="Đính kèm tệp tin"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>

        <input
          type="text"
          value={text}
          placeholder={disabled ? 'Chọn đoạn chat để nhắn tin' : 'Nhập tin nhắn hoặc thả tệp vào đây...'}
          disabled={disabled || uploading}
          maxLength={2000}
          onChange={handleTextChange}
        />
        <button
          type="submit"
          className="primary"
          disabled={disabled || uploading || (!text.trim() && !preview)}
        >
          Gửi
        </button>
      </form>
    </div>
  );
}
