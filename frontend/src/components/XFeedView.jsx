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

const PROMPT_SUGGESTIONS = [
  'Chia sẻ một phát kiến kỹ thuật thú vị hoặc dự án tâm đắc bạn đang thực hiện hôm nay...',
  'Điều gì làm bạn bất ngờ nhất trong tuần này? Hãy cùng thảo luận nhé...',
  'Explain quantum computing in simple terms and why it matters...',
  'Một công cụ AI hoặc thư viện code hữu ích mà bạn muốn giới thiệu cho mọi người...',
  'Góc nhìn của bạn về xu hướng phát triển web và tương lai của công nghệ...'
];

/**
 * XFeedView — Giao diện Bảng tin toàn màn hình chuẩn phong cách X (Twitter)
 * Thiết kế theo hệ thống: Neo-brutalist Tech / Lime Wireframe + AI Prompt Composer
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

  // Post composer state
  const [newContent, setNewContent] = useState('');
  const [newVisibility, setNewVisibility] = useState('friends');
  const [posting, setPosting] = useState(false);
  const [attachedMedia, setAttachedMedia] = useState([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showVisibilityMenu, setShowVisibilityMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  // Lightbox for previewing images
  const [lightboxSrc, setLightboxSrc] = useState(null);

  // File input refs
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

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

  // Upload attachments (images & files)
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
      showFeedback(`// ĐÃ TẢI LÊN ${successCount} TỆP/ẢNH THÀNH CÔNG`, 'success');
    }
  };

  const handleRemoveAttachment = (idx) => {
    setAttachedMedia((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleDeepResearchPrompt = () => {
    const randomPrompt = PROMPT_SUGGESTIONS[Math.floor(Math.random() * PROMPT_SUGGESTIONS.length)];
    setNewContent((prev) => {
      const trimmed = prev.trim();
      return trimmed ? `${trimmed}\n${randomPrompt}` : randomPrompt;
    });
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleToggleSpeech = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setNewContent((prev) =>
        prev ? `${prev} [🎙️ Voice Note: Hôm nay là một ngày tuyệt vời!]` : '[🎙️ Voice Note: Hôm nay là một ngày tuyệt vời!]'
      );
      showFeedback('Trình duyệt chưa hỗ trợ Web Speech API trực tiếp, đã thêm mẫu ghi chú.', 'info');
      return;
    }

    if (isRecording) {
      setIsRecording(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'vi-VN';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      setIsRecording(true);
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setNewContent((prev) => (prev ? `${prev} ${transcript}` : transcript));
        setIsRecording(false);
      };

      recognition.onerror = () => setIsRecording(false);
      recognition.onend = () => setIsRecording(false);

      recognition.start();
    } catch {
      setIsRecording(false);
    }
  };

  const handleDropFiles = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer?.files?.length) {
      handleUploadFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleClearComposer = () => {
    if (newContent || attachedMedia.length > 0) {
      if (window.confirm('Xoá bản nháp bài viết hiện tại?')) {
        setNewContent('');
        setAttachedMedia([]);
      }
    }
  };

  // 2. Đăng bài mới (cho phép kèm nội dung, ảnh hoặc tệp)
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

        {/* POST COMPOSER - AI PROMPT BAR STYLE */}
        <div className="feed-prompt-container">
          {/* TOP EYEBROW BADGES */}
          <div className="feed-prompt-header">
            <div
              className="feed-prompt-badge-left"
              onClick={handleDeepResearchPrompt}
              title="Nhấn để nhận ý tưởng hoặc chủ đề thảo luận"
            >
              <span>✨</span>
              <span>Unlock more with Pro Plan</span>
            </div>
            <div className="feed-prompt-badge-right">
              <span>❄️</span>
              <span>Powered by Assistant v2.6</span>
            </div>
          </div>

          {/* CRISP WHITE PROMPT CARD */}
          <div
            className={`feed-prompt-card ${isDragOver ? 'drag-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDropFiles}
          >
            <div className="feed-prompt-input-row">
              {/* PLUS BUTTON */}
              <button
                type="button"
                className="feed-prompt-plus-btn"
                title="Đính kèm ảnh hoặc tệp"
                onClick={() => imageInputRef.current?.click()}
              >
                +
              </button>

              {/* VERTICAL DIVIDER */}
              <div className="feed-prompt-divider" />

              {/* INPUT / TEXTAREA */}
              <textarea
                ref={textareaRef}
                className="feed-prompt-textarea"
                placeholder='Example : "Explain quantum computing in simple terms"'
                rows={1}
                value={newContent}
                onChange={(e) => {
                  setNewContent(e.target.value);
                  const el = e.target;
                  if (el.scrollHeight > el.clientHeight && el.scrollHeight <= 140) {
                    el.style.height = `${el.scrollHeight}px`;
                  } else if (!e.target.value) {
                    el.style.height = '';
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleCreatePost(e);
                  }
                }}
                maxLength={5000}
              />

              {/* RIGHT ACTIONS: MIC + SEND */}
              <div className="feed-prompt-actions-right">
                <button
                  type="button"
                  className={`feed-prompt-mic-btn ${isRecording ? 'active' : ''}`}
                  title={isRecording ? 'Đang ghi âm... nhấn để dừng' : 'Nhập bằng giọng nói / Ghi âm'}
                  onClick={handleToggleSpeech}
                >
                  🎙️
                </button>

                <button
                  type="button"
                  className="feed-prompt-send-btn"
                  title="Đăng bài (Ctrl+Enter)"
                  disabled={posting || uploadingAttachment || (!newContent.trim() && attachedMedia.length === 0)}
                  onClick={handleCreatePost}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </button>
              </div>
            </div>

            {/* ATTACHMENT PREVIEW CHIPS */}
            {(attachedMedia.length > 0 || uploadingAttachment) && (
              <div className="feed-prompt-previews">
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
                    <span>⏳</span> Đang tải tệp/video lên...
                  </div>
                )}
              </div>
            )}
          </div>

          {/* BOTTOM CAPSULE / PILL BUTTONS ROW */}
          <div className="feed-pill-row">
            {/* 1. Upload image */}
            <button
              type="button"
              className="feed-pill-btn"
              onClick={() => imageInputRef.current?.click()}
              title="Tải ảnh lên bài viết"
            >
              <span className="feed-pill-btn-icon">🖼️</span>
              <span>Upload image</span>
            </button>

            {/* 2. Upload file hoặc video */}
            <button
              type="button"
              className="feed-pill-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Đính kèm tệp tài liệu hoặc video (tối đa 200MB)"
            >
              <span className="feed-pill-btn-icon">📁</span>
              <span>Upload file hoặc video</span>
            </button>

            {/* 3. Quyền riêng tư */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className="feed-pill-btn"
                onClick={() => setShowVisibilityMenu((v) => !v)}
                title="Thay đổi quyền riêng tư của bài viết"
              >
                <span className="feed-pill-btn-icon">
                  {newVisibility === 'public' ? '🌐' : newVisibility === 'friends' ? '👥' : '🔒'}
                </span>
                <span>
                  Quyền riêng tư: {newVisibility === 'public' ? 'Công khai' : newVisibility === 'friends' ? 'Bạn bè' : 'Chỉ mình tôi'}
                </span>
              </button>

              {showVisibilityMenu && (
                <div className="feed-visibility-popover">
                  <button
                    type="button"
                    className={`feed-visibility-item ${newVisibility === 'friends' ? 'selected' : ''}`}
                    onClick={() => { setNewVisibility('friends'); setShowVisibilityMenu(false); }}
                  >
                    <span>👥</span> Bạn bè
                  </button>
                  <button
                    type="button"
                    className={`feed-visibility-item ${newVisibility === 'public' ? 'selected' : ''}`}
                    onClick={() => { setNewVisibility('public'); setShowVisibilityMenu(false); }}
                  >
                    <span>🌐</span> Công khai
                  </button>
                  <button
                    type="button"
                    className={`feed-visibility-item ${newVisibility === 'private' ? 'selected' : ''}`}
                    onClick={() => { setNewVisibility('private'); setShowVisibilityMenu(false); }}
                  >
                    <span>🔒</span> Chỉ mình tôi
                  </button>
                </div>
              )}
            </div>

            {/* 4. More ... */}
            <button
              type="button"
              className="feed-pill-btn feed-pill-more"
              onClick={handleClearComposer}
              title="Làm mới bản nháp"
            >
              <span>•••</span>
            </button>
          </div>

          {/* HIDDEN FILE INPUTS */}
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
                    <>
                      {post.content && <div className="post-content">{post.content}</div>}

                      {/* POST MEDIA ATTACHMENTS (Images & Files) */}
                      {Array.isArray(post.mediaUrls) && post.mediaUrls.length > 0 && (
                        <div className="post-media-container">
                          {/* Images Grid */}
                          {(() => {
                            const images = post.mediaUrls.filter(
                              (m) => m.type === 'image' || /\.(jpe?g|png|gif|webp|bmp|svg)(\?.*)?$/i.test(m.url || '')
                            );
                            if (!images.length) return null;
                            const count = images.length;
                            const countClass =
                              count === 1
                                ? 'count-1'
                                : count === 2
                                ? 'count-2'
                                : count === 3
                                ? 'count-3'
                                : count === 4
                                ? 'count-4'
                                : 'count-more';
                            const displayImages = images.slice(0, 4);

                            return (
                              <div className={`post-images-grid ${countClass}`}>
                                {displayImages.map((img, idx) => {
                                  const isLast = idx === 3 && count > 4;
                                  const fullUrl = resolveMediaUrl(img.url);
                                  return (
                                    <div
                                      key={idx}
                                      className="post-img-cell"
                                      onClick={() => setLightboxSrc(fullUrl)}
                                      title="Bấm để xem ảnh phóng to"
                                    >
                                      <img
                                        src={fullUrl}
                                        alt={img.name || `Ảnh ${idx + 1}`}
                                        className="post-img-item"
                                        loading="lazy"
                                      />
                                      {isLast && (
                                        <div className="post-img-overlay">
                                          +{count - 3}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
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

                          {/* Files List */}
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
                                  const downloadUrl = resolveMediaUrl(file.url);
                                  return (
                                    <a
                                      key={idx}
                                      href={downloadUrl}
                                      download={file.name || 'attachment'}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="post-file-card"
                                      title={`Tải xuống ${file.name || 'tệp'}`}
                                    >
                                      <div className="post-file-left">
                                        <div
                                          className="post-file-icon-badge"
                                          style={{ borderColor: details.color }}
                                        >
                                          <span>{details.icon}</span>
                                        </div>
                                        <div className="post-file-info">
                                          <span className="post-file-name">{file.name || 'Tệp đính kèm'}</span>
                                          <span className="post-file-size">
                                            {details.label} {file.size ? `• ${formatFileSize(file.size)}` : ''}
                                          </span>
                                        </div>
                                      </div>
                                      <span className="post-file-download-btn">
                                        ⬇ Tải về
                                      </span>
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

      {/* LIGHTBOX FOR PREVIEWING POST IMAGES */}
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  );
}
