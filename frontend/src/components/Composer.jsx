import { useRef, useState } from 'react';

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export default function Composer({ disabled, onSend, onImageUpload }) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null); // { file, url }
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const submit = async (e) => {
    e.preventDefault();
    const value = text.trim();
    if (!value || disabled) return;
    setText('');
    await onSend(value);
  };

  const pickFile = () => {
    if (disabled || uploading) return;
    fileRef.current?.click();
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset so the same file can be re-selected after cancel
    e.target.value = '';

    if (!ALLOWED_TYPES.includes(file.type)) {
      alert('Chỉ chấp nhận ảnh JPEG, PNG, GIF, hoặc WebP.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      alert('Ảnh tối đa 5 MB.');
      return;
    }

    const url = URL.createObjectURL(file);
    setPreview({ file, url });
  };

  const cancelPreview = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  const sendImage = async () => {
    if (!preview || uploading || !onImageUpload) return;
    setUploading(true);
    try {
      await onImageUpload(preview.file);
      cancelPreview();
    } catch {
      // error is handled by the parent (ChatPage)
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="composer-wrapper">
      {/* Image preview strip */}
      {preview && (
        <div className="image-preview">
          <img src={preview.url} alt="Preview" />
          <div className="image-preview-actions">
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
              onClick={sendImage}
              disabled={uploading}
              type="button"
            >
              {uploading ? 'Đang tải…' : 'Gửi ảnh'}
            </button>
          </div>
        </div>
      )}

      <form className="composer" onSubmit={submit}>
        {/* Hidden file input */}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          style={{ display: 'none' }}
          onChange={handleFile}
        />

        {/* Attach image button */}
        <button
          type="button"
          className="composer-attach"
          onClick={pickFile}
          disabled={disabled || uploading}
          title="Gửi ảnh"
          aria-label="Đính kèm ảnh"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
        </button>

        <input
          type="text"
          value={text}
          placeholder={disabled ? 'Chọn đoạn chat để nhắn tin' : 'Nhập tin nhắn...'}
          disabled={disabled || uploading}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="primary" disabled={disabled || uploading || !text.trim()}>
          Gửi
        </button>
      </form>
    </div>
  );
}
