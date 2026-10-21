import { useCallback, useEffect, useRef, useState } from 'react';
import { api, resolveMediaUrl } from '../api';
import { formatFileSize, getFileDetails, ImageLightbox } from './MessageList';

const REACTION_EMOJIS = {
  like: '👍',
  heart: '❤️',
  haha: '😆',
  wow: '😮',
  sad: '😢',
  angry: '😡'
};

/**
 * FeedDrawer — Bảng tin bạn bè, bình luận, cảm xúc và phân quyền biên tập.
 * ĐẶC BIỆT:
 * - Chỉnh sửa bài viết: Chỉ tác giả và người được uỷ quyền (PostEditor) mới được chỉnh sửa.
 * - Xoá bài viết: Chỉ DUY NHẤT tác giả mới có quyền xoá.
 * - Mã hoá định danh người dùng dạng u_...
 */
export default function FeedDrawer({
  isOpen,
  onClose,
  currentUser,
  friends = [],
  on,
  off
}) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [feedback, setFeedback] = useState({ text: '', type: 'info' });

  // Post composer state
  const [newContent, setNewContent] = useState('');
  const [newVisibility, setNewVisibility] = useState('friends');
  const [posting, setPosting] = useState(false);
  const [attachedMedia, setAttachedMedia] = useState([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState(null);

  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Edit post state
  const [editingPostId, setEditingPostId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [editVisibility, setEditVisibility] = useState('friends');

  // Editors delegation modal state
  const [delegatingPost, setDelegatingPost] = useState(null);
  const [postEditors, setPostEditors] = useState([]);
  const [selectedFriendId, setSelectedFriendId] = useState('');
  const [delegatingLoading, setDelegatingLoading] = useState(false);

  // Open comments map: { [postId]: true/false }
  const [expandedComments, setExpandedComments] = useState({});
  const [commentsData, setCommentsData] = useState({});
  const [commentInputs, setCommentInputs] = useState({});
  const [replyTarget, setReplyTarget] = useState({}); // { [postId]: commentId }

  // Notifications state
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);

  const showFeedback = (text, type = 'info') => {
    setFeedback({ text, type });
    setTimeout(() => setFeedback({ text: '', type: 'info' }), 4000);
  };

  // ---- 1. Tải Bảng tin ----
  const loadFeed = useCallback(async (isInitial = true) => {
    if (isInitial) setLoading(true);
    else setLoadingMore(true);

    try {
      const res = await api.getFeed({ limit: 10, cursor: isInitial ? null : nextCursor });
      const newPosts = res?.posts || [];
      setPosts((prev) => (isInitial ? newPosts : [...prev, ...newPosts]));
      setNextCursor(res?.nextCursor || null);
    } catch (err) {
      showFeedback(err.message || 'Lỗi tải bảng tin.', 'error');
    } finally {
      if (isInitial) setLoading(false);
      else setLoadingMore(false);
    }
  }, [nextCursor]);

  // ---- 2. Tải thông báo ----
  const loadNotifications = useCallback(async () => {
    try {
      const res = await api.getSocialNotifications({ limit: 20 });
      const list = res?.notifications || [];
      setNotifications(list);
      setUnreadNotifCount(list.filter((n) => !n.isRead).length);
    } catch (err) {
      console.error('Lỗi tải thông báo:', err);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadFeed(true);
      loadNotifications();
    }
  }, [isOpen]);

  // Realtime notification socket listener
  useEffect(() => {
    if (!on || !off) return;

    const handleSocialNotif = (notif) => {
      showFeedback(notif.message || 'Bạn có thông báo mới trên bảng tin.', 'info');
      loadNotifications();
    };

    on('new_social_notification', handleSocialNotif);
    return () => {
      off('new_social_notification', handleSocialNotif);
    };
  }, [on, off, loadNotifications]);

  // Upload attachments
  const handleUploadFiles = async (files) => {
    if (!files || files.length === 0) return;
    setUploadingAttachment(true);
    let successCount = 0;

    for (const file of files) {
      try {
        const res = await api.uploadFeedAttachment(file);
        if (res?.url) {
          setAttachedMedia((prev) => [
            ...prev,
            {
              url: res.url,
              type: res.type || (file.type.startsWith('image/') ? 'image' : 'file'),
              name: res.name || file.name,
              size: res.size || file.size
            }
          ]);
          successCount++;
        }
      } catch (err) {
        showFeedback(err.message || `Lỗi tải lên tệp: ${file.name}`, 'error');
      }
    }

    setUploadingAttachment(false);
    if (successCount > 0) {
      showFeedback(`Đã tải lên ${successCount} tệp/ảnh.`, 'success');
    }
  };

  const handleRemoveAttachment = (idx) => {
    setAttachedMedia((prev) => prev.filter((_, i) => i !== idx));
  };

  // ---- 3. Đăng bài mới ----
  const handleCreatePost = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!newContent.trim() && attachedMedia.length === 0) return;

    setPosting(true);
    try {
      const res = await api.createPost({
        content: newContent,
        mediaUrls: attachedMedia,
        visibility: newVisibility
      });
      if (res?.post) {
        setPosts((prev) => [res.post, ...prev]);
        setNewContent('');
        setAttachedMedia([]);
        showFeedback('Đã đăng bài viết thành công!', 'success');
      }
    } catch (err) {
      showFeedback(err.message || 'Lỗi đăng bài viết.', 'error');
    } finally {
      setPosting(false);
    }
  };

  // ---- 4. Chỉnh sửa bài đăng (Tác giả hoặc Editor) ----
  const startEditPost = (post) => {
    setEditingPostId(post.id);
    setEditContent(post.content);
    setEditVisibility(post.visibility);
  };

  const handleUpdatePost = async (postId) => {
    if (!editContent.trim()) return;
    try {
      const res = await api.updatePost(postId, {
        content: editContent,
        visibility: editVisibility
      });
      if (res?.post) {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? {
                  ...p,
                  content: res.post.content,
                  visibility: res.post.visibility,
                  updatedAt: res.post.updatedAt
                }
              : p
          )
        );
        setEditingPostId(null);
        showFeedback('Đã cập nhật bài viết.', 'success');
      }
    } catch (err) {
      showFeedback(err.message || 'Lỗi cập nhật bài viết.', 'error');
    }
  };

  // ---- 5. Xoá bài đăng (Chỉ DUY NHẤT Tác giả) ----
  const handleDeletePost = async (postId) => {
    if (!window.confirm('Bạn có chắc chắn muốn xoá bài viết này? Hành động này không thể hoàn tác.')) {
      return;
    }

    try {
      await api.deletePost(postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      showFeedback('Đã xoá bài viết thành công.', 'success');
    } catch (err) {
      showFeedback(err.message || 'Lỗi xoá bài viết.', 'error');
    }
  };

  // ---- 6. Quản lý Editors uỷ quyền ----
  const openDelegationModal = async (post) => {
    setDelegatingPost(post);
    setDelegatingLoading(true);
    try {
      const res = await api.getPostEditors(post.id);
      setPostEditors(res?.editors || []);
    } catch (err) {
      showFeedback(err.message || 'Lỗi lấy danh sách người biên tập.', 'error');
    } finally {
      setDelegatingLoading(false);
    }
  };

  const handleGrantEditor = async () => {
    if (!delegatingPost || !selectedFriendId) return;
    try {
      await api.grantPostEditor(delegatingPost.id, selectedFriendId);
      showFeedback('Đã cấp quyền chỉnh sửa cho bạn bè.', 'success');
      const res = await api.getPostEditors(delegatingPost.id);
      setPostEditors(res?.editors || []);
      setSelectedFriendId('');
    } catch (err) {
      showFeedback(err.message || 'Lỗi cấp quyền biên tập.', 'error');
    }
  };

  const handleRevokeEditor = async (editorUserId) => {
    if (!delegatingPost) return;
    try {
      await api.revokePostEditor(delegatingPost.id, editorUserId);
      showFeedback('Đã thu hồi quyền chỉnh sửa.', 'info');
      setPostEditors((prev) => prev.filter((e) => e.id !== editorUserId));
    } catch (err) {
      showFeedback(err.message || 'Lỗi thu hồi quyền biên tập.', 'error');
    }
  };

  // ---- 7. Reactions ----
  const handleToggleReaction = async (postId, type = 'like') => {
    try {
      const res = await api.toggleReaction({ targetType: 'post', targetId: postId, type });
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                reactionsCount: res.reactionsCount || {},
                userReaction: res.userReaction
              }
            : p
        )
      );
    } catch (err) {
      showFeedback(err.message || 'Lỗi cập nhật cảm xúc.', 'error');
    }
  };

  // ---- 8. Bình luận (Comments & Replies) ----
  const toggleComments = async (postId) => {
    const isExpanded = !expandedComments[postId];
    setExpandedComments((prev) => ({ ...prev, [postId]: isExpanded }));

    if (isExpanded && !commentsData[postId]) {
      try {
        const res = await api.getComments(postId);
        setCommentsData((prev) => ({ ...prev, [postId]: res?.comments || [] }));
      } catch (err) {
        showFeedback(err.message || 'Lỗi tải bình luận.', 'error');
      }
    }
  };

  const handleAddComment = async (postId) => {
    const text = commentInputs[postId]?.trim();
    if (!text) return;

    const parentId = replyTarget[postId] || null;

    try {
      const res = await api.addComment(postId, { content: text, parentId });
      if (res?.comment) {
        setCommentsData((prev) => {
          const list = prev[postId] ? [...prev[postId]] : [];
          if (!parentId) {
            list.push({ ...res.comment, replies: [] });
          } else {
            const parent = list.find((c) => c.id === parentId);
            if (parent) {
              parent.replies = [...(parent.replies || []), res.comment];
            } else {
              list.push({ ...res.comment, replies: [] });
            }
          }
          return { ...prev, [postId]: list };
        });

        // Update post comment count
        setPosts((prev) =>
          prev.map((p) => (p.id === postId ? { ...p, commentsCount: (p.commentsCount || 0) + 1 } : p))
        );

        setCommentInputs((prev) => ({ ...prev, [postId]: '' }));
        setReplyTarget((prev) => ({ ...prev, [postId]: null }));
      }
    } catch (err) {
      showFeedback(err.message || 'Lỗi gửi bình luận.', 'error');
    }
  };

  const handleDeleteComment = async (postId, commentId) => {
    if (!window.confirm('Xoá bình luận này?')) return;
    try {
      await api.deleteComment(commentId);
      setCommentsData((prev) => {
        const list = prev[postId] || [];
        // Filter out if top level or nested
        const filtered = list
          .filter((c) => c.id !== commentId)
          .map((c) => ({
            ...c,
            replies: (c.replies || []).filter((r) => r.id !== commentId)
          }));
        return { ...prev, [postId]: filtered };
      });
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, commentsCount: Math.max(0, (p.commentsCount || 1) - 1) } : p))
      );
    } catch (err) {
      showFeedback(err.message || 'Lỗi xoá bình luận.', 'error');
    }
  };

  const handleMarkNotification = async (id) => {
    try {
      await api.markSocialNotificationAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadNotifCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error(err);
    }
  };

  if (!isOpen) return null;

  return (
    <aside className="info-drawer feed-drawer" aria-label="Bảng tin bạn bè">
      <header className="info-drawer-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '1.2rem' }}>📰</span>
          <h3>Bảng tin bạn bè</h3>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* NOTIFICATION BUTTON */}
          <button
            className="icon-btn"
            onClick={() => setShowNotifications((v) => !v)}
            title="Thông báo tương tác"
            style={{ position: 'relative' }}
          >
            🔔
            {unreadNotifCount > 0 && (
              <span className="badge-count" style={{ position: 'absolute', top: -4, right: -4 }}>
                {unreadNotifCount}
              </span>
            )}
          </button>

          <button className="icon-btn" onClick={onClose} title="Đóng bảng tin" aria-label="Đóng">
            ✕
          </button>
        </div>
      </header>

      {/* FEEDBACK TOAST */}
      {feedback.text && (
        <div className={`friends-toast ${feedback.type}`}>
          {feedback.text}
        </div>
      )}

      {/* NOTIFICATIONS PANEL */}
      {showNotifications && (
        <div className="social-notif-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Thông báo mới</span>
            <button className="link sm" onClick={() => setShowNotifications(false)}>
              Đóng
            </button>
          </div>
          {notifications.length === 0 ? (
            <p className="muted" style={{ fontSize: '0.8rem' }}>Chưa có thông báo nào.</p>
          ) : (
            <ul className="notif-list">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={`notif-item ${n.isRead ? 'read' : 'unread'}`}
                  onClick={() => handleMarkNotification(n.id)}
                >
                  <span className="notif-actor">{n.actor?.username}</span>
                  <span className="notif-desc">
                    {n.type === 'post_reaction' && ' đã bày tỏ cảm xúc về bài viết của bạn.'}
                    {n.type === 'comment' && ' đã bình luận bài viết của bạn.'}
                    {n.type === 'comment_reply' && ' đã trả lời bình luận của bạn.'}
                    {n.type === 'post_editor_granted' && ' đã cấp quyền chỉnh sửa bài viết cho bạn.'}
                  </span>
                  <small className="muted notif-time">
                    {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="info-drawer-body feed-drawer-body">
        {/* ================= POST COMPOSER ================= */}
        <div className="post-composer-card">
          <form onSubmit={handleCreatePost}>
            <textarea
              className="composer-textarea"
              placeholder={`${currentUser?.username || 'Bạn'} ơi, hôm nay bạn đang nghĩ gì?`}
              rows={3}
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              maxLength={5000}
            />

            {/* ATTACHMENT PREVIEWS */}
            {(attachedMedia.length > 0 || uploadingAttachment) && (
              <div className="feed-prompt-previews" style={{ marginBottom: 10 }}>
                {attachedMedia.map((m, idx) => (
                  <div key={idx} className="feed-preview-chip">
                    {m.type === 'image' ? (
                      <img src={resolveMediaUrl(m.url)} alt={m.name} className="feed-preview-thumb" />
                    ) : m.type === 'video' ? (
                      <span style={{ fontSize: '18px' }}>🎬</span>
                    ) : (
                      <span style={{ fontSize: '18px' }}>{getFileDetails(m.name).icon}</span>
                    )}
                    <div className="feed-preview-info">
                      <span className="feed-preview-name">{m.name || 'Tệp'}</span>
                      <span className="feed-preview-size">{formatFileSize(m.size)}</span>
                    </div>
                    <button
                      type="button"
                      className="feed-preview-remove"
                      onClick={() => handleRemoveAttachment(idx)}
                      title="Xoá đính kèm"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {uploadingAttachment && (
                  <div className="feed-preview-uploading">
                    <span>⏳</span> Đang tải tệp/video...
                  </div>
                )}
              </div>
            )}

            <div className="composer-footer">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <select
                  className="visibility-select"
                  value={newVisibility}
                  onChange={(e) => setNewVisibility(e.target.value)}
                  title="Quyền riêng tư của bài viết"
                >
                  <option value="friends">Quyền riêng tư: Bạn bè</option>
                  <option value="public">Quyền riêng tư: Công khai</option>
                  <option value="private">Quyền riêng tư: Chỉ mình tôi</option>
                </select>

                <button
                  type="button"
                  className="ghost sm"
                  onClick={() => imageInputRef.current?.click()}
                  title="Upload image"
                >
                  🖼️ Upload image
                </button>
                <button
                  type="button"
                  className="ghost sm"
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload file hoặc video (tối đa 200MB)"
                >
                  📁 Upload file hoặc video
                </button>
              </div>

              <button
                type="submit"
                className="primary sm"
                disabled={posting || uploadingAttachment || (!newContent.trim() && attachedMedia.length === 0)}
              >
                {posting ? 'Đang đăng...' : 'Đăng bài'}
              </button>
            </div>
          </form>

          {/* Hidden inputs */}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files) handleUploadFiles(Array.from(e.target.files));
              e.target.value = '';
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files) handleUploadFiles(Array.from(e.target.files));
              e.target.value = '';
            }}
          />
        </div>

        {/* ================= POSTS STREAM ================= */}
        {loading && <p className="muted" style={{ textAlign: 'center', marginTop: 24 }}>Đang tải bảng tin...</p>}

        {!loading && posts.length === 0 && (
          <div className="empty-state">
            <span style={{ fontSize: '2.5rem' }}>📭</span>
            <p>Chưa có bài viết nào trên bảng tin.</p>
            <small className="muted">Hãy kết bạn hoặc chia sẻ bài viết đầu tiên của bạn!</small>
          </div>
        )}

        {!loading && posts.length > 0 && (
          <div className="posts-stream">
            {posts.map((post) => {
              const isEditing = editingPostId === post.id;
              const hasComments = expandedComments[post.id];
              const commentsList = commentsData[post.id] || [];
              const totalReactions = Object.values(post.reactionsCount || {}).reduce((a, b) => a + b, 0);

              return (
                <article key={post.id} className="post-card">
                  {/* POST HEADER */}
                  <div className="post-header">
                    <div className="post-author-wrap">
                      <div className="member-avatar">
                        {post.author.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="post-meta">
                        <span className="post-author-name">{post.author.username}</span>
                        <div className="post-time-wrap">
                          <span className="post-time">
                            {new Date(post.createdAt).toLocaleString([], {
                              month: 'numeric',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                          <span className="visibility-badge">
                            {post.visibility === 'public' && '🌐'}
                            {post.visibility === 'friends' && '👥'}
                            {post.visibility === 'private' && '🔒'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* ACTIONS: EDIT / DELETE / DELEGATE RBAC */}
                    <div className="post-header-actions">
                      {post.canDelete && (
                        <button
                          className="link sm"
                          onClick={() => openDelegationModal(post)}
                          title="Uỷ quyền cho bạn bè chỉnh sửa bài viết"
                        >
                          👥 Uỷ quyền sửa
                        </button>
                      )}

                      {post.canEdit && !isEditing && (
                        <button
                          className="ghost sm"
                          onClick={() => startEditPost(post)}
                          title="Chỉnh sửa bài đăng"
                        >
                          Sửa
                        </button>
                      )}

                      {post.canDelete && (
                        <button
                          className="ghost sm text-danger"
                          onClick={() => handleDeletePost(post.id)}
                          title="Chỉ tác giả mới có quyền xoá bài đăng"
                        >
                          Xoá
                        </button>
                      )}
                    </div>
                  </div>

                  {/* POST CONTENT OR INLINE EDIT */}
                  {isEditing ? (
                    <div className="post-edit-box">
                      <textarea
                        className="composer-textarea"
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={3}
                      />
                      <div className="edit-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 6 }}>
                        <button className="ghost sm" onClick={() => setEditingPostId(null)}>
                          Huỷ
                        </button>
                        <button className="primary sm" onClick={() => handleUpdatePost(post.id)}>
                          Lưu thay đổi
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {post.content && (
                        <div className="post-content">
                          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{post.content}</p>
                        </div>
                      )}

                      {/* Post media attachments */}
                      {Array.isArray(post.mediaUrls) && post.mediaUrls.length > 0 && (
                        <div className="post-media-container" style={{ margin: '8px 0' }}>
                          {/* Images */}
                          {(() => {
                            const images = post.mediaUrls.filter(
                              (m) => m.type === 'image' || /\.(jpe?g|png|gif|webp|bmp|svg)(\?.*)?$/i.test(m.url || '')
                            );
                            if (!images.length) return null;
                            const count = images.length;
                            const countClass = count === 1 ? 'count-1' : count === 2 ? 'count-2' : count === 3 ? 'count-3' : 'count-4';
                            return (
                              <div className={`post-images-grid ${countClass}`}>
                                {images.slice(0, 4).map((img, idx) => (
                                  <div
                                    key={idx}
                                    className="post-img-cell"
                                    onClick={() => setLightboxSrc(resolveMediaUrl(img.url))}
                                    title="Xem ảnh phóng to"
                                  >
                                    <img
                                      src={resolveMediaUrl(img.url)}
                                      alt={img.name || `Ảnh ${idx + 1}`}
                                      className="post-img-item"
                                    />
                                    {idx === 3 && count > 4 && (
                                      <div className="post-img-overlay">+{count - 3}</div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            );
                          })()}

                          {/* Videos Player */}
                          {(() => {
                            const videos = post.mediaUrls.filter(
                              (m) =>
                                m.type === 'video' ||
                                /\.(mp4|mov|webm|mkv|avi|m4v|3gp)(\?.*)?$/i.test(m.url || '')
                            );
                            if (!videos.length) return null;

                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {videos.map((vid, idx) => (
                                  <div key={idx} className="post-video-container">
                                    <video
                                      controls
                                      playsInline
                                      preload="metadata"
                                      className="post-video-player"
                                      src={resolveMediaUrl(vid.url)}
                                    >
                                      Trình duyệt không hỗ trợ xem video trực tiếp.
                                    </video>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}

                          {/* Files */}
                          {(() => {
                            const files = post.mediaUrls.filter(
                              (m) =>
                                m.type !== 'image' &&
                                m.type !== 'video' &&
                                !/\.(jpe?g|png|gif|webp|bmp|svg|mp4|mov|webm|mkv|avi|m4v|3gp)(\?.*)?$/i.test(m.url || '')
                            );
                            if (!files.length) return null;
                            return (
                              <div className="post-files-list">
                                {files.map((file, idx) => {
                                  const details = getFileDetails(file.name);
                                  return (
                                    <a
                                      key={idx}
                                      href={resolveMediaUrl(file.url)}
                                      download={file.name || 'attachment'}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="post-file-card"
                                    >
                                      <div className="post-file-left">
                                        <div className="post-file-icon-badge" style={{ borderColor: details.color }}>
                                          <span>{details.icon}</span>
                                        </div>
                                        <div className="post-file-info">
                                          <span className="post-file-name">{file.name || 'Tệp đính kèm'}</span>
                                          <span className="post-file-size">
                                            {details.label} {file.size ? `• ${formatFileSize(file.size)}` : ''}
                                          </span>
                                        </div>
                                      </div>
                                      <span className="post-file-download-btn">⬇ Tải về</span>
                                    </a>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </>
                  )}

                  {/* REACTIONS BAR & COUNTS */}
                  <div className="post-reactions-bar">
                    <div className="reaction-emojis-row">
                      {Object.entries(REACTION_EMOJIS).map(([type, emoji]) => {
                        const count = post.reactionsCount?.[type] || 0;
                        const isChosen = post.userReaction === type;
                        return (
                          <button
                            key={type}
                            className={`reaction-btn ${isChosen ? 'active' : ''}`}
                            onClick={() => handleToggleReaction(post.id, type)}
                            title={`Bày tỏ ${type}`}
                          >
                            <span>{emoji}</span>
                            {count > 0 && <span className="reaction-count">{count}</span>}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      className="link sm comments-toggle-btn"
                      onClick={() => toggleComments(post.id)}
                    >
                      💬 Bình luận ({post.commentsCount || 0})
                    </button>
                  </div>

                  {/* COMMENTS SECTION */}
                  {hasComments && (
                    <div className="post-comments-container">
                      {/* COMMENT INPUT */}
                      <div className="comment-composer">
                        {replyTarget[post.id] && (
                          <div className="reply-indicator">
                            <span>Đang phản hồi bình luận...</span>
                            <button
                              className="link sm"
                              onClick={() => setReplyTarget((p) => ({ ...p, [post.id]: null }))}
                            >
                              Huỷ
                            </button>
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input
                            type="text"
                            className="input sm"
                            placeholder="Viết bình luận của bạn..."
                            value={commentInputs[post.id] || ''}
                            onChange={(e) =>
                              setCommentInputs((p) => ({ ...p, [post.id]: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleAddComment(post.id);
                              }
                            }}
                          />
                          <button
                            className="primary sm"
                            onClick={() => handleAddComment(post.id)}
                          >
                            Gửi
                          </button>
                        </div>
                      </div>

                      {/* COMMENTS TREE (1-LEVEL REPLIES) */}
                      {commentsList.length === 0 ? (
                        <p className="muted" style={{ fontSize: '0.8rem', padding: '6px 0' }}>
                          Chưa có bình luận nào. Hãy là người đầu tiên bình luận!
                        </p>
                      ) : (
                        <ul className="comments-tree">
                          {commentsList.map((c) => (
                            <li key={c.id} className="comment-thread">
                              <div className="comment-bubble">
                                <div className="comment-bubble-head">
                                  <span className="comment-author">{c.author.username}</span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span className="comment-time">
                                      {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    {c.canDelete && (
                                      <button
                                        className="link sm text-danger"
                                        onClick={() => handleDeleteComment(post.id, c.id)}
                                        title="Xoá bình luận"
                                      >
                                        ✕
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <div className="comment-body">{c.content}</div>
                                <button
                                  className="link sm reply-btn"
                                  onClick={() => setReplyTarget((p) => ({ ...p, [post.id]: c.id }))}
                                >
                                  Phản hồi
                                </button>
                              </div>

                              {/* 1-LEVEL REPLIES */}
                              {c.replies && c.replies.length > 0 && (
                                <ul className="replies-list">
                                  {c.replies.map((reply) => (
                                    <li key={reply.id} className="reply-bubble">
                                      <div className="comment-bubble-head">
                                        <span className="comment-author">{reply.author.username}</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                          <span className="comment-time">
                                            {new Date(reply.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                          </span>
                                          {reply.canDelete && (
                                            <button
                                              className="link sm text-danger"
                                              onClick={() => handleDeleteComment(post.id, reply.id)}
                                              title="Xoá phản hồi"
                                            >
                                              ✕
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                      <div className="comment-body">{reply.content}</div>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </article>
              );
            })}

            {nextCursor && (
              <div style={{ textAlign: 'center', margin: '16px 0' }}>
                <button
                  className="ghost sm"
                  onClick={() => loadFeed(false)}
                  disabled={loadingMore}
                >
                  {loadingMore ? 'Đang tải thêm...' : 'Tải thêm bài viết'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ================= DELEGATION MODAL (POST EDITORS RBAC) ================= */}
      {delegatingPost && (
        <div className="modal-backdrop" onClick={() => setDelegatingPost(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-head">
              <h3>👥 Uỷ quyền chỉnh sửa bài viết</h3>
              <button className="icon-btn" onClick={() => setDelegatingPost(null)}>
                ✕
              </button>
            </div>

            <div className="modal-body">
              <p className="muted" style={{ fontSize: '0.85rem', marginBottom: 12 }}>
                Tác giả có thể cấp quyền chỉnh sửa bài đăng này cho bạn bè. Người được uỷ quyền sẽ có thể chỉnh sửa nội dung bài viết nhưng <strong>không thể xoá</strong> bài viết của bạn.
              </p>

              {/* GRANT NEW EDITOR */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                <select
                  className="input sm"
                  value={selectedFriendId}
                  onChange={(e) => setSelectedFriendId(e.target.value)}
                  style={{ flex: 1 }}
                >
                  <option value="">-- Chọn bạn bè để uỷ quyền --</option>
                  {friends
                    .filter((f) => !postEditors.some((e) => e.id === f.id))
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.username} ({f.email})
                      </option>
                    ))}
                </select>
                <button
                  className="primary sm"
                  onClick={handleGrantEditor}
                  disabled={!selectedFriendId}
                >
                  + Cấp quyền
                </button>
              </div>

              {/* LIST OF EDITORS */}
              <h4 className="section-subtitle">Danh sách người được uỷ quyền ({postEditors.length})</h4>
              {delegatingLoading && <p className="muted">Đang tải...</p>}
              {!delegatingLoading && postEditors.length === 0 && (
                <p className="muted" style={{ fontSize: '0.85rem' }}>
                  Chưa uỷ quyền cho ai. Chỉ mình bạn (tác giả) có thể chỉnh sửa bài đăng này.
                </p>
              )}
              {!delegatingLoading && postEditors.length > 0 && (
                <ul className="social-user-list">
                  {postEditors.map((editor) => (
                    <li key={editor.id} className="social-user-item">
                      <div className="member-avatar">
                        {editor.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="social-user-info">
                        <div className="social-user-name">{editor.username}</div>
                        <div className="social-user-email">{editor.email}</div>
                      </div>
                      <button
                        className="ghost sm text-danger"
                        onClick={() => handleRevokeEditor(editor.id)}
                        title="Thu hồi quyền chỉnh sửa"
                      >
                        Thu hồi
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="modal-foot">
              <button className="primary sm" onClick={() => setDelegatingPost(null)}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </aside>
  );
}
