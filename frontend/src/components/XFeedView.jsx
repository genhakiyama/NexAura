import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

const REACTION_EMOJIS = {
  like: '👍',
  heart: '❤️',
  haha: '😆',
  wow: '😮',
  sad: '😢',
  angry: '😡'
};

/**
 * XFeedView — Giao diện Bảng tin toàn màn hình chuẩn phong cách X (Twitter)
 * Thiết kế theo hệ thống: Neo-brutalist Tech / Lime Wireframe
 * Phân quyền:
 * - Chỉnh sửa: Tác giả & người được uỷ quyền (PostEditor)
 * - Xoá bài: DUY NHẤT Tác giả
 */
export default function XFeedView({
  currentUser,
  friends = [],
  on,
  off,
  onOpenDirectChat
}) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [feedback, setFeedback] = useState({ text: '', type: 'info' });

  // Post composer
  const [newContent, setNewContent] = useState('');
  const [newVisibility, setNewVisibility] = useState('friends');
  const [posting, setPosting] = useState(false);

  // Edit post
  const [editingPostId, setEditingPostId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [editVisibility, setEditVisibility] = useState('friends');

  // Delegation modal
  const [delegatingPost, setDelegatingPost] = useState(null);
  const [postEditors, setPostEditors] = useState([]);
  const [selectedFriendId, setSelectedFriendId] = useState('');
  const [delegatingLoading, setDelegatingLoading] = useState(false);

  // Comments
  const [expandedComments, setExpandedComments] = useState({});
  const [commentsData, setCommentsData] = useState({});
  const [commentInputs, setCommentInputs] = useState({});
  const [replyTarget, setReplyTarget] = useState({});

  const showFeedback = (text, type = 'info') => {
    setFeedback({ text, type });
    setTimeout(() => setFeedback({ text: '', type: 'info' }), 4000);
  };

  // 1. Tải bảng tin
  const loadFeed = useCallback(async (isInitial = true) => {
    if (isInitial) setLoading(true);
    else setLoadingMore(true);

    try {
      const res = await api.getFeed({ limit: 12, cursor: isInitial ? null : nextCursor });
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

  useEffect(() => {
    loadFeed(true);
  }, []);

  // Socket notification listener
  useEffect(() => {
    if (!on || !off) return;
    const handleNotif = (notif) => {
      showFeedback(notif.message || 'Có tương tác mới trên bảng tin.', 'info');
      loadFeed(true);
    };
    on('new_social_notification', handleNotif);
    return () => off('new_social_notification', handleNotif);
  }, [on, off, loadFeed]);

  // 2. Đăng bài mới
  const handleCreatePost = async (e) => {
    e.preventDefault();
    if (!newContent.trim()) return;

    setPosting(true);
    try {
      const res = await api.createPost({
        content: newContent,
        visibility: newVisibility
      });
      if (res?.post) {
        setPosts((prev) => [res.post, ...prev]);
        setNewContent('');
        showFeedback('// BÀI VIẾT ĐÃ ĐƯỢC ĐĂNG THÀNH CÔNG', 'success');
      }
    } catch (err) {
      showFeedback(err.message || 'Lỗi đăng bài viết.', 'error');
    } finally {
      setPosting(false);
    }
  };

  // 3. Cập nhật bài viết
  const handleUpdatePost = async (postId) => {
    if (!editContent.trim()) return;
    try {
      const res = await api.updatePost(postId, {
        content: editContent,
        visibility: editVisibility
      });
      if (res?.post) {
        setPosts((prev) =>
          prev.map((p) => (p.id === postId ? { ...p, content: res.post.content, visibility: res.post.visibility } : p))
        );
        setEditingPostId(null);
        showFeedback('// ĐÃ CẬP NHẬT BÀI ĐĂNG', 'success');
      }
    } catch (err) {
      showFeedback(err.message || 'Lỗi cập nhật.', 'error');
    }
  };

  // 4. Xoá bài viết (Chỉ tác giả)
  const handleDeletePost = async (postId) => {
    if (!window.confirm('XÁC NHẬN: Xoá bài đăng này vĩnh viễn?')) return;
    try {
      await api.deletePost(postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      showFeedback('// ĐÃ XOÁ BÀI ĐĂNG', 'info');
    } catch (err) {
      showFeedback(err.message || 'Lỗi xoá bài viết.', 'error');
    }
  };

  // 5. Uỷ quyền biên tập (PostEditor RBAC)
  const openDelegationModal = async (post) => {
    setDelegatingPost(post);
    setDelegatingLoading(true);
    try {
      const res = await api.getPostEditors(post.id);
      setPostEditors(res?.editors || []);
    } catch (err) {
      showFeedback(err.message, 'error');
    } finally {
      setDelegatingLoading(false);
    }
  };

  const handleGrantEditor = async () => {
    if (!delegatingPost || !selectedFriendId) return;
    try {
      await api.grantPostEditor(delegatingPost.id, selectedFriendId);
      showFeedback('// ĐÃ CẤP QUYỀN BIÊN TẬP CHO BẠN BÈ', 'success');
      const res = await api.getPostEditors(delegatingPost.id);
      setPostEditors(res?.editors || []);
      setSelectedFriendId('');
    } catch (err) {
      showFeedback(err.message, 'error');
    }
  };

  const handleRevokeEditor = async (editorUserId) => {
    if (!delegatingPost) return;
    try {
      await api.revokePostEditor(delegatingPost.id, editorUserId);
      showFeedback('// ĐÃ THU HỒI QUYỀN BIÊN TẬP', 'info');
      setPostEditors((prev) => prev.filter((e) => e.id !== editorUserId));
    } catch (err) {
      showFeedback(err.message, 'error');
    }
  };

  // 6. Reactions
  const handleToggleReaction = async (postId, type = 'heart') => {
    try {
      const res = await api.toggleReaction({ targetType: 'post', targetId: postId, type });
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, reactionsCount: res.reactionsCount || {}, userReaction: res.userReaction }
            : p
        )
      );
    } catch (err) {
      showFeedback(err.message, 'error');
    }
  };

  // 7. Bình luận
  const toggleComments = async (postId) => {
    const isExpanded = !expandedComments[postId];
    setExpandedComments((prev) => ({ ...prev, [postId]: isExpanded }));

    if (isExpanded && !commentsData[postId]) {
      try {
        const res = await api.getComments(postId);
        setCommentsData((prev) => ({ ...prev, [postId]: res?.comments || [] }));
      } catch (err) {
        showFeedback(err.message, 'error');
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
        setPosts((prev) =>
          prev.map((p) => (p.id === postId ? { ...p, commentsCount: (p.commentsCount || 0) + 1 } : p))
        );
        setCommentInputs((prev) => ({ ...prev, [postId]: '' }));
        setReplyTarget((prev) => ({ ...prev, [postId]: null }));
      }
    } catch (err) {
      showFeedback(err.message, 'error');
    }
  };

  const handleDeleteComment = async (postId, commentId) => {
    if (!window.confirm('Xoá bình luận này?')) return;
    try {
      await api.deleteComment(commentId);
      setCommentsData((prev) => {
        const list = prev[postId] || [];
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
      showFeedback(err.message, 'error');
    }
  };

  return (
    <div className="chat-main" style={{ overflowY: 'auto', padding: '24px 20px 40px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', width: '100%' }}>
        {/* TOP HEADER */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
          <div>
            <p className="eyebrow">X-Feed // Timeline</p>
            <h1 style={{ fontSize: '26px', marginTop: 4 }}>Bảng tin</h1>
            <span className="muted">Mạng xã hội bạn bè phân quyền RBAC</span>
          </div>

          <button className="ghost sm" onClick={() => loadFeed(true)}>
            ⟳ Làm mới
          </button>
        </div>

        {/* FEEDBACK TOAST */}
        {feedback.text && (
          <div className="friends-toast" style={{ borderRadius: 'var(--r-sm)', border: '1px solid var(--line)', marginBottom: 16 }}>
            {feedback.text}
          </div>
        )}

        {/* POST COMPOSER */}
        <div className="post-composer-card">
          <form onSubmit={handleCreatePost}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div className="post-avatar-square">
                {currentUser?.username ? currentUser.username.charAt(0).toUpperCase() : 'U'}
              </div>
              <span className="eyebrow">@{currentUser?.username || 'user'} // Soạn bài mới</span>
            </div>

            <textarea
              className="composer-textarea"
              placeholder="Bạn đang nghĩ gì hôm nay? Nhập nội dung chia sẻ..."
              rows={3}
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              maxLength={5000}
            />

            <div className="composer-footer">
              <select
                className="visibility-select"
                value={newVisibility}
                onChange={(e) => setNewVisibility(e.target.value)}
              >
                <option value="friends">👥 BẠN BÈ</option>
                <option value="public">🌐 CÔNG KHAI</option>
                <option value="private">🔒 CHỈ MÌNH TÔI</option>
              </select>

              <button type="submit" className="primary sm" disabled={posting || !newContent.trim()}>
                {posting ? '[ĐANG ĐĂNG...]' : '[ ĐĂNG BÀI → ]'}
              </button>
            </div>
          </form>
        </div>

        {/* POSTS LIST */}
        {loading && (
          <p className="muted" style={{ textAlign: 'center', padding: '32px 0', fontFamily: 'var(--font-mono)' }}>
            // ĐANG TẢI DỮ LIỆU BẢNG TIN...
          </p>
        )}

        {!loading && posts.length === 0 && (
          <div className="post-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <span style={{ fontSize: '32px' }}>📭</span>
            <h3 style={{ marginTop: 10 }}>Chưa có bài viết nào</h3>
            <p className="muted">Hãy chia sẻ bài viết đầu tiên của bạn hoặc kết bạn với người khác!</p>
          </div>
        )}

        {!loading && posts.length > 0 && (
          <div className="posts-stream">
            {posts.map((post) => {
              const isEditing = editingPostId === post.id;
              const hasComments = expandedComments[post.id];
              const commentsList = commentsData[post.id] || [];
              const totalHearts = post.reactionsCount?.heart || post.reactionsCount?.like || 0;
              const hasLiked = post.userReaction === 'heart' || post.userReaction === 'like';

              return (
                <article key={post.id} className="post-card">
                  {/* HEADER */}
                  <div className="post-header">
                    <div className="post-author-wrap">
                      <div className="post-avatar-square">
                        {post.author.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="post-author-info">
                        <span className="post-author-name">@{post.author.username}</span>
                        <div className="post-meta-sub">
                          <span>
                            {new Date(post.createdAt).toLocaleDateString([], {
                              month: 'numeric',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                          <span>•</span>
                          <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>
                            [{post.visibility}]
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* RBAC ACTION BUTTONS */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      {post.canDelete && (
                        <button
                          className="ghost sm"
                          onClick={() => openDelegationModal(post)}
                          title="Uỷ quyền cho bạn bè cùng chỉnh sửa bài viết"
                        >
                          👥 Uỷ quyền
                        </button>
                      )}

                      {post.canEdit && !isEditing && (
                        <button
                          className="ghost sm"
                          onClick={() => {
                            setEditingPostId(post.id);
                            setEditContent(post.content);
                            setEditVisibility(post.visibility);
                          }}
                        >
                          Sửa
                        </button>
                      )}

                      {post.canDelete && (
                        <button
                          className="ghost sm text-danger"
                          onClick={() => handleDeletePost(post.id)}
                          title="Chỉ tác giả mới có quyền xoá bài viết"
                        >
                          Xoá
                        </button>
                      )}
                    </div>
                  </div>

                  {/* CONTENT */}
                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <textarea
                        className="composer-textarea"
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={3}
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                        <button className="ghost sm" onClick={() => setEditingPostId(null)}>
                          Huỷ
                        </button>
                        <button className="primary sm" onClick={() => handleUpdatePost(post.id)}>
                          Lưu bài
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="post-content">{post.content}</div>
                  )}

                  {/* X-STYLE ACTION BAR (4 BUTTONS) */}
                  <div className="post-reactions-bar">
                    {/* 1. COMMENTS */}
                    <button
                      className="x-action-btn"
                      onClick={() => toggleComments(post.id)}
                      title="Xem và gửi bình luận"
                    >
                      💬 <span>{post.commentsCount || 0}</span>
                    </button>

                    {/* 2. HEART / REACT LIKE X */}
                    <button
                      className={`x-action-btn ${hasLiked ? 'active' : ''}`}
                      onClick={() => handleToggleReaction(post.id, 'heart')}
                      title="Thả cảm xúc"
                    >
                      ❤️ <span>{totalHearts}</span>
                    </button>

                    {/* 3. DIRECT CHAT WITH AUTHOR */}
                    <button
                      className="x-action-btn"
                      onClick={() => onOpenDirectChat?.(post.author.id)}
                      title={`Nhắn tin 1-1 với @${post.author.username}`}
                    >
                      ✉️ <span>Nhắn</span>
                    </button>

                    {/* 4. POST ID METRIC */}
                    <span className="eyebrow" style={{ fontSize: '10px' }}>
                      #{post.id}
                    </span>
                  </div>

                  {/* EXPANDED COMMENTS */}
                  {hasComments && (
                    <div className="post-comments-container">
                      {/* INPUT */}
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          type="text"
                          placeholder={
                            replyTarget[post.id]
                              ? 'Đang trả lời phản hồi... Nhập nội dung...'
                              : 'Viết bình luận của bạn...'
                          }
                          value={commentInputs[post.id] || ''}
                          onChange={(e) =>
                            setCommentInputs((p) => ({ ...p, [post.id]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddComment(post.id);
                            }
                          }}
                          style={{ flex: 1 }}
                        />
                        <button className="primary sm" onClick={() => handleAddComment(post.id)}>
                          Gửi
                        </button>
                      </div>

                      {/* COMMENTS TREE */}
                      {commentsList.length === 0 ? (
                        <p className="muted" style={{ fontSize: '12px', margin: '4px 0' }}>
                          // Chưa có bình luận nào.
                        </p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {commentsList.map((c) => (
                            <div key={c.id} className="comment-bubble">
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
                                  @{c.author.username}
                                </strong>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                  <span className="muted" style={{ fontSize: '11px' }}>
                                    {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                  {c.canDelete && (
                                    <button
                                      className="link sm text-danger"
                                      onClick={() => handleDeleteComment(post.id, c.id)}
                                    >
                                      ✕
                                    </button>
                                  )}
                                </div>
                              </div>
                              <p style={{ margin: '6px 0', fontSize: '14px' }}>{c.content}</p>
                              <button
                                className="link sm"
                                onClick={() => setReplyTarget((p) => ({ ...p, [post.id]: c.id }))}
                              >
                                [Trả lời]
                              </button>

                              {/* 1-LEVEL REPLIES */}
                              {c.replies && c.replies.length > 0 && (
                                <ul className="replies-list">
                                  {c.replies.map((r) => (
                                    <li key={r.id} style={{ background: 'var(--surface-2)', padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <strong style={{ fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                                          @{r.author.username}
                                        </strong>
                                        {r.canDelete && (
                                          <button
                                            className="link sm text-danger"
                                            onClick={() => handleDeleteComment(post.id, r.id)}
                                          >
                                            ✕
                                          </button>
                                        )}
                                      </div>
                                      <div style={{ fontSize: '13px', marginTop: 2 }}>{r.content}</div>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}

            {nextCursor && (
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <button className="ghost" onClick={() => loadFeed(false)} disabled={loadingMore}>
                  {loadingMore ? '[ĐANG TẢI...]' : '[ TẢI THÊM BÀI VIẾT ⟱ ]'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* DELEGATION MODAL */}
      {delegatingPost && (
        <div className="modal-backdrop" onClick={() => setDelegatingPost(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>👥 UỶ QUYỀN CHỈNH SỬA (RBAC)</h3>
              <button className="icon-btn" onClick={() => setDelegatingPost(null)}>
                ✕
              </button>
            </div>

            <p className="muted" style={{ marginBottom: 12 }}>
              Tác giả có thể cấp quyền chỉnh sửa bài đăng này cho bạn bè. Người được uỷ quyền <strong>không thể xoá</strong> bài viết của bạn.
            </p>

            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              <select
                value={selectedFriendId}
                onChange={(e) => setSelectedFriendId(e.target.value)}
                style={{ flex: 1 }}
              >
                <option value="">-- Chọn bạn bè để uỷ quyền --</option>
                {friends
                  .filter((f) => !postEditors.some((e) => e.id === f.id))
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      @{f.username} ({f.email})
                    </option>
                  ))}
              </select>
              <button className="primary sm" onClick={handleGrantEditor} disabled={!selectedFriendId}>
                CẤP QUYỀN
              </button>
            </div>

            <h4>DANH SÁCH BIÊN TẬP VIÊN ({postEditors.length})</h4>
            {delegatingLoading && <p className="muted">// Đang tải danh sách...</p>}
            {!delegatingLoading && postEditors.length === 0 && (
              <p className="muted">// Chưa uỷ quyền cho ai. Chỉ bạn (tác giả) mới có thể sửa.</p>
            )}

            {!delegatingLoading && postEditors.length > 0 && (
              <ul className="social-user-list" style={{ marginTop: 8 }}>
                {postEditors.map((e) => (
                  <li key={e.id} className="social-user-item">
                    <span>@{e.username}</span>
                    <button
                      className="ghost sm text-danger"
                      onClick={() => handleRevokeEditor(e.id)}
                    >
                      Thu hồi
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="modal-foot">
              <button className="primary sm" onClick={() => setDelegatingPost(null)}>
                ĐÓNG
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
