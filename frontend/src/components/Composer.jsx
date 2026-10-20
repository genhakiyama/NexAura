import { useState } from 'react';

export default function Composer({ disabled, onSend }) {
  const [text, setText] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    const value = text.trim();
    if (!value || disabled) return;
    setText('');
    await onSend(value);
  };

  return (
    <form className="composer" onSubmit={submit}>
      <input
        type="text"
        value={text}
        placeholder={disabled ? 'Chọn đoạn chat để nhắn tin' : 'Nhập tin nhắn...'}
        disabled={disabled}
        maxLength={255}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit" className="primary" disabled={disabled || !text.trim()}>
        Gửi
      </button>
    </form>
  );
}
