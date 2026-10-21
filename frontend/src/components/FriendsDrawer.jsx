import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';

/**
 * FriendsDrawer — Quản lý bạn bè, lời mời kết bạn và tìm kiếm người dùng.
 * Tích hợp bảo mật:
 * - Mã hoá userId dạng u_...
 * - Realtime presence qua Socket.IO (online/offline)
 * - Tạo / mở đoạn chat 1-1 trực tiếp khi đã là bạn bè
 */
export default function FriendsDrawer({
  isOpen,
  onClose,
  onStartDirectChat,
  on,
  off,
  onRequestCountChange,
}) {
  const [tab, setTab] = useState('friends'); // 'friends' | 'requests' | 'search'
  const [friends, setFriends] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequests, setOutgoingRequests] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState({});
  const [feedback, setFeedback] = useState({ text: '', type: 'info' });

  const searchTimerRef = useRef(null);

  const showFeedback = (text, type = 'info') => {
    setFeedback({ text, type });
    setTimeout(() => setFeedback({ text: '', type: 'info' }), 4000);
  };

  // ---- 1. Tải danh sách bạn bè ----
  const loadFriends = useCallback(async () => {
    try {
      const data = await api.getFriends();
      setFriends(data?.friends || []);
    } catch (err) {
      console.error('Lỗi tải bạn bè:', err);
    }
  }, []);

  // ---- 2. Tải lời mời kết bạn (đến & đi) ----
  const loadRequests = useCallback(async () => {
    try {
      const [inc, out] = await Promise.all([
        api.getFriendRequests('incoming'),
        api.getFriendRequests('outgoing'),
      ]);
      const incomingList = inc?.requests || [];
      setIncomingRequests(incomingList);
      setOutgoingRequests(out?.requests || []);
      if (onRequestCountChange) {
        onRequestCountChange(incomingList.length);
      }
    } catch (err) {
      console.error('Lỗi tải lời mời:', err);
    }
  }, [onRequestCountChange]);

  // Initial load when opened
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    Promise.all([loadFriends(), loadRequests()]).finally(() => setLoading(false));
  }, [isOpen, loadFriends, loadRequests]);

  // ---- 3. Tìm kiếm người dùng (Debounced) ----
  useEffect(() => {
    if (tab !== 'search') return;
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await api.searchUsers(q);
        const usersList = Array.isArray(res) ? res : (res?.users || res?.data || []);
        setSearchResults(usersList);
      } catch (err) {
        console.error('Lỗi tìm kiếm:', err);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery, tab]);

  // ---- 4. Realtime Socket Listeners ----
  useEffect(() => {
    if (!on || !off) return;

    const handlePresence = ({ userId, status }) => {
      const isOnline = status === 'online';
      setFriends((prev) =>
        prev.map((f) => (f.id === userId ? { ...f, isOnline } : f))
      );
      setSearchResults((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, isOnline } : u))
      );
    };

    const handleNewRequest = () => {
      loadRequests();
      showFeedback('Bạn có một lời mời kết bạn mới!', 'success');
    };

    const handleAccepted = ({ friend, message }) => {
      loadFriends();
      loadRequests();
      showFeedback(message || `${friend?.username || 'Đối phương'} đã chấp nhận lời mời.`, 'success');
    };

    const handleRemoved = () => {
      loadFriends();
    };

    on('user_presence_change', handlePresence);
    on('new_friend_request', handleNewRequest);
    on('friend_request_accepted', handleAccepted);
    on('friend_removed', handleRemoved);

    return () => {
      off('user_presence_change', handlePresence);
      off('new_friend_request', handleNewRequest);
      off('friend_request_accepted', handleAccepted);
      off('friend_removed', handleRemoved);
    };
  }, [on, off, loadFriends, loadRequests]);

  // ---- Actions ----
  const handleSendRequest = async (targetUserId) => {
    setActionLoading((p) => ({ ...p, [targetUserId]: true }));
    try {
      const res = await api.sendFriendRequest(targetUserId);
      showFeedback('Đã gửi lời mời kết bạn!', 'success');
      loadRequests();
      // Update local state in searchResults with returned requestId
      setSearchResults((prev) =>
        prev.map((u) =>
          u.id === targetUserId
            ? { ...u, relationshipStatus: 'pending_sent', requestId: res?.requestId }
            : u
        )
      );
    } catch (err) {
      showFeedback(err.message || 'Lỗi gửi lời mời.', 'error');
    } finally {
      setActionLoading((p) => ({ ...p, [targetUserId]: false }));
    }
  };

  const handleRespond = async (requestId, action) => {
    setActionLoading((p) => ({ ...p, [requestId]: true }));
    try {
      await api.respondFriendRequest(requestId, action);
      showFeedback(
        action === 'accept' ? 'Đã chấp nhận kết bạn!' : 'Đã từ chối lời mời.',
        'success'
      );
      await Promise.all([loadFriends(), loadRequests()]);
      setSearchResults((prev) =>
        prev.map((u) =>
          u.requestId === requestId
            ? { ...u, relationshipStatus: action === 'accept' ? 'friends' : 'none', requestId: action === 'accept' ? requestId : null }
            : u
        )
      );
    } catch (err) {
      showFeedback(err.message || 'Lỗi xử lý lời mời.', 'error');
    } finally {
      setActionLoading((p) => ({ ...p, [requestId]: false }));
    }
  };

  const handleCancelRequest = async (requestId) => {
    setActionLoading((p) => ({ ...p, [requestId]: true }));
    try {
      await api.cancelFriendRequest(requestId);
      showFeedback('Đã huỷ lời mời kết bạn.', 'info');
      loadRequests();
      // Update search result if visible
      setSearchResults((prev) =>
        prev.map((u) =>
          u.requestId === requestId ? { ...u, relationshipStatus: 'none', requestId: null } : u
        )
      );
    } catch (err) {
      showFeedback(err.message || 'Lỗi huỷ lời mời.', 'error');
    } finally {
      setActionLoading((p) => ({ ...p, [requestId]: false }));
    }
  };

  const handleUnfriend = async (friend) => {
    if (!window.confirm(`Bạn có chắc chắn muốn huỷ kết bạn với ${friend.username}?`)) {
      return;
    }
    setActionLoading((p) => ({ ...p, [friend.id]: true }));
    try {
      await api.unfriend(friend.id);
      showFeedback(`Đã huỷ kết bạn với ${friend.username}.`, 'info');
      loadFriends();
    } catch (err) {
      showFeedback(err.message || 'Lỗi huỷ kết bạn.', 'error');
    } finally {
      setActionLoading((p) => ({ ...p, [friend.id]: false }));
    }
  };

  const handleBlock = async (friend) => {
    if (!window.confirm(`Bạn có chắc muốn chặn ${friend.username}? Người này sẽ không thể nhắn tin hoặc tương tác với bạn.`)) {
      return;
    }
    setActionLoading((p) => ({ ...p, [friend.id]: true }));
    try {
      await api.blockUser(friend.id);
      showFeedback(`Đã chặn ${friend.username}.`, 'info');
      loadFriends();
    } catch (err) {
      showFeedback(err.message || 'Lỗi chặn người dùng.', 'error');
    } finally {
      setActionLoading((p) => ({ ...p, [friend.id]: false }));
    }
  };

  const handleChatWith = async (friend) => {
    if (!onStartDirectChat) return;
    setActionLoading((p) => ({ ...p, [friend.id]: true }));
    try {
      await onStartDirectChat(friend.id);
      onClose();
    } catch (err) {
      showFeedback(err.message || 'Không thể tạo cuộc trò chuyện.', 'error');
    } finally {
      setActionLoading((p) => ({ ...p, [friend.id]: false }));
    }
  };

  if (!isOpen) return null;

  return (
    <aside className="info-drawer friends-drawer" aria-label="Quản lý bạn bè">
      <header className="info-drawer-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '1.1rem' }}>👥</span>
          <h3>Bạn bè & Kết nối</h3>
        </div>
        <button
          className="icon-btn"
          onClick={onClose}
          title="Đóng panel"
          aria-label="Đóng"
        >
          ✕
        </button>
      </header>

      {/* TABS */}
      <div className="friends-tabs">
        <button
          className={tab === 'friends' ? 'friends-tab active' : 'friends-tab'}
          onClick={() => setTab('friends')}
        >
          Bạn bè ({friends.length})
        </button>
        <button
          className={tab === 'requests' ? 'friends-tab active' : 'friends-tab'}
          onClick={() => setTab('requests')}
        >
          Lời mời
          {incomingRequests.length > 0 && (
            <span className="badge-count">{incomingRequests.length}</span>
          )}
        </button>
        <button
          className={tab === 'search' ? 'friends-tab active' : 'friends-tab'}
          onClick={() => setTab('search')}
        >
          Tìm kiếm
        </button>
      </div>

      {/* FEEDBACK TOAST */}
      {feedback.text && (
        <div className={`friends-toast ${feedback.type}`}>
          {feedback.text}
        </div>
      )}

      <div className="info-drawer-body friends-drawer-body">
        {/* ================= TAB 1: BẠN BÈ ================= */}
        {tab === 'friends' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span className="muted" style={{ fontSize: '0.8rem' }}>
                {friends.length} người bạn
              </span>
              <button className="link sm" onClick={loadFriends} title="Làm mới">
                Làm mới
              </button>
            </div>

            {loading && <p className="muted">Đang tải danh sách...</p>}

            {!loading && friends.length === 0 && (
              <div className="empty-state">
                <span style={{ fontSize: '2rem' }}>🤝</span>
                <p>Bạn chưa có người bạn nào.</p>
                <button className="primary sm" onClick={() => setTab('search')}>
                  Tìm bạn bè ngay
                </button>
              </div>
            )}

            {!loading && friends.length > 0 && (
              <ul className="social-user-list">
                {friends.map((f) => (
                  <li key={f.id} className="social-user-item">
                    <div className="social-user-avatar-wrap">
                      <div className="member-avatar">
                        {f.username.charAt(0).toUpperCase()}
                      </div>
                      <span
                        className={`presence-dot ${f.isOnline ? 'online' : 'offline'}`}
                        title={f.isOnline ? 'Đang trực tuyến' : 'Ngoại tuyến'}
                      />
                    </div>

                    <div className="social-user-info">
                      <div className="social-user-name">
                        {f.username}
                        {f.isOnline && <span className="online-label">online</span>}
                      </div>
                      <div className="social-user-email">{f.email}</div>
                    </div>

                    <div className="social-user-actions">
                      <button
                        className="primary sm"
                        onClick={() => handleChatWith(f)}
                        disabled={actionLoading[f.id]}
                        title="Nhắn tin 1-1"
                      >
                        💬 Nhắn
                      </button>
                      <button
                        className="ghost sm"
                        onClick={() => handleUnfriend(f)}
                        disabled={actionLoading[f.id]}
                        title="Huỷ kết bạn"
                      >
                        Huỷ
                      </button>
                      <button
                        className="ghost sm text-danger"
                        onClick={() => handleBlock(f)}
                        disabled={actionLoading[f.id]}
                        title="Chặn người dùng này"
                      >
                        Chặn
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ================= TAB 2: LỜI MỜI ================= */}
        {tab === 'requests' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span className="muted" style={{ fontSize: '0.8rem' }}>
                Yêu cầu kết bạn
              </span>
              <button className="link sm" onClick={loadRequests} title="Làm mới">
                Làm mới
              </button>
            </div>

            {/* LỜI MỜI ĐẾN */}
            <div className="requests-section">
              <h4 className="section-subtitle">
                Lời mời đã nhận ({incomingRequests.length})
              </h4>
              {incomingRequests.length === 0 ? (
                <p className="muted" style={{ fontSize: '0.85rem' }}>Không có lời mời nào đang chờ duyệt.</p>
              ) : (
                <ul className="social-user-list">
                  {incomingRequests.map((r) => (
                    <li key={r.id} className="social-user-item">
                      <div className="member-avatar">
                        {r.user.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="social-user-info">
                        <div className="social-user-name">{r.user.username}</div>
                        <div className="social-user-email">{r.user.email}</div>
                      </div>
                      <div className="social-user-actions">
                        <button
                          className="primary sm"
                          onClick={() => handleRespond(r.id, 'accept')}
                          disabled={actionLoading[r.id]}
                        >
                          ✓ Đồng ý
                        </button>
                        <button
                          className="ghost sm"
                          onClick={() => handleRespond(r.id, 'decline')}
                          disabled={actionLoading[r.id]}
                        >
                          ✕ Từ chối
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* LỜI MỜI ĐI */}
            <div className="requests-section" style={{ marginTop: 24 }}>
              <h4 className="section-subtitle">
                Lời mời đã gửi ({outgoingRequests.length})
              </h4>
              {outgoingRequests.length === 0 ? (
                <p className="muted" style={{ fontSize: '0.85rem' }}>Chưa gửi lời mời nào.</p>
              ) : (
                <ul className="social-user-list">
                  {outgoingRequests.map((r) => (
                    <li key={r.id} className="social-user-item">
                      <div className="member-avatar">
                        {r.user.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="social-user-info">
                        <div className="social-user-name">{r.user.username}</div>
                        <div className="social-user-email">{r.user.email}</div>
                      </div>
                      <div className="social-user-actions">
                        <button
                          className="ghost sm"
                          onClick={() => handleCancelRequest(r.id)}
                          disabled={actionLoading[r.id]}
                        >
                          Huỷ lời mời
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 3: TÌM KIẾM ================= */}
        {tab === 'search' && (
          <div>
            <div className="search-box-wrap">
              <input
                type="text"
                className="input search-input"
                placeholder="Nhập tên, username hoặc email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
              {searchQuery && (
                <button
                  className="search-clear-btn"
                  onClick={() => setSearchQuery('')}
                >
                  ✕
                </button>
              )}
            </div>

            {searchLoading && <p className="muted" style={{ marginTop: 12 }}>Đang tìm kiếm...</p>}

            {!searchLoading && searchQuery.trim() && searchResults.length === 0 && (
              <p className="muted" style={{ marginTop: 12, fontSize: '0.85rem' }}>
                Không tìm thấy người dùng phù hợp.
              </p>
            )}

            {!searchLoading && searchResults.length > 0 && (
              <ul className="social-user-list" style={{ marginTop: 12 }}>
                {searchResults.map((u) => {
                  const isFriend = u.relationshipStatus === 'friends';
                  const isSent = u.relationshipStatus === 'pending_sent';
                  const isReceived = u.relationshipStatus === 'pending_received';
                  const isBlocked = u.relationshipStatus?.startsWith('blocked');

                  return (
                    <li key={u.id} className="social-user-item">
                      <div className="social-user-avatar-wrap">
                        <div className="member-avatar">
                          {u.username.charAt(0).toUpperCase()}
                        </div>
                        <span
                          className={`presence-dot ${u.isOnline ? 'online' : 'offline'}`}
                        />
                      </div>

                      <div className="social-user-info">
                        <div className="social-user-name">{u.username}</div>
                        <div className="social-user-email">{u.email}</div>
                      </div>

                      <div className="social-user-actions">
                        {isFriend && (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <span className="chip">Bạn bè</span>
                            <button
                              className="primary sm"
                              onClick={() => handleChatWith(u)}
                              disabled={actionLoading[u.id]}
                              title="Nhắn tin 1-1"
                            >
                              💬 Nhắn
                            </button>
                          </div>
                        )}
                        {isSent && (
                          <button
                            className="ghost sm"
                            onClick={() => handleCancelRequest(u.requestId)}
                            disabled={actionLoading[u.requestId]}
                          >
                            Đã gửi (Huỷ)
                          </button>
                        )}
                        {isReceived && (
                          <button
                            className="primary sm"
                            onClick={() => handleRespond(u.requestId, 'accept')}
                            disabled={actionLoading[u.requestId]}
                          >
                            Đồng ý
                          </button>
                        )}
                        {isBlocked && (
                          <span className="chip sm warning">Đã chặn</span>
                        )}
                        {!isFriend && !isSent && !isReceived && !isBlocked && (
                          <button
                            className="primary sm"
                            onClick={() => handleSendRequest(u.id)}
                            disabled={actionLoading[u.id]}
                          >
                            + Kết bạn
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
