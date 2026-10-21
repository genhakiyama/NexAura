export default function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onJoinChat,
  onOpenFriends,
  onOpenFeed,
  activeView, // 'chat' | 'feed'
  pendingFriendRequestsCount = 0,
  onLogout,
  username,
}) {
  return (
    <aside className="sidebar">
      {/* HEADER: LOGO SQUARE [C] + MONOSPACE TITLE */}
      <div className="sidebar-head">
        <div className="sidebar-logo-group">
          <div className="logo-badge">C</div>
          <span className="sidebar-brand-name">NEXORA // OS</span>
        </div>
        <button className="link sm" onClick={onLogout} title="Đăng xuất khỏi hệ thống">
          [LOGOUT]
        </button>
      </div>

      {/* TOP USER BADGE */}
      <div className="sidebar-user">
        USER: <strong>@{username}</strong>
      </div>

      {/* NAVIGATION BUTTONS */}
      <div className="sidebar-nav">
        <button
          className={activeView === 'feed' ? 'sidebar-nav-btn active' : 'sidebar-nav-btn'}
          onClick={onOpenFeed}
          title="Bảng tin xã hội phong cách X"
        >
          <span>📰 BẢNG TIN (X-FEED)</span>
          <span style={{ fontSize: '11px' }}>→</span>
        </button>

        <button
          className="sidebar-nav-btn"
          onClick={onOpenFriends}
          title="Danh sách bạn bè & kết nối"
        >
          <span>👥 BẠN BÈ & KẾT NỐI</span>
          {pendingFriendRequestsCount > 0 ? (
            <span className="badge-count">{pendingFriendRequestsCount}</span>
          ) : (
            <span style={{ fontSize: '11px' }}>→</span>
          )}
        </button>
      </div>

      {/* CHAT ACTIONS */}
      <div className="sidebar-actions">
        <button className="primary sm" onClick={onNewChat}>
          + CHAT MỚI
        </button>
        <button className="ghost sm" onClick={onJoinChat}>
          VÀO THEO ID
        </button>
      </div>

      {/* CONVERSATION LIST */}
      <ul className="chat-list">
        {conversations.length === 0 && (
          <li className="muted" style={{ padding: '16px 8px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
            // Chưa có đoạn chat nào
          </li>
        )}
        {conversations.map((c) => (
          <li
            key={c.id}
            className={c.id === activeId ? 'chat-item active' : 'chat-item'}
            onClick={() => onSelect(c.id)}
          >
            <span className="chat-name">{c.name}</span>
            <span className="chat-meta">
              <span>#{c.type}</span> · <span>{c.numberMembers} thành viên</span>
              {c.status === 'pending' && (
                <span className="chip sm warning">Chờ duyệt</span>
              )}
              {c.userRole === 'admin' && (
                <span className="badge-count">ADMIN</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
