export default function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onJoinChat,
  onLogout,
  username,
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span className="who">{username}</span>
        <button className="link" onClick={onLogout}>
          Đăng xuất
        </button>
      </div>

      <div className="sidebar-actions">
        <button className="primary sm" onClick={onNewChat}>
          + Chat mới
        </button>
        <button className="ghost sm" onClick={onJoinChat}>
          Vào chat theo ID
        </button>
      </div>

      <ul className="chat-list">
        {conversations.length === 0 && <li className="empty">Chưa có đoạn chat nào</li>}
        {conversations.map((c) => (
          <li
            key={c.id}
            className={c.id === activeId ? 'chat-item active' : 'chat-item'}
            onClick={() => onSelect(c.id)}
          >
            <span className="chat-name">{c.name}</span>
            <span className="chat-meta">
              {c.type} · {c.numberMembers} thành viên
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
