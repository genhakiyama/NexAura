const TOKEN_KEY = 'nexora_token';

export function normalizeBaseUrl(value) {
  const trimmed = String(value || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// Empty base means "same origin": the Vite dev server proxies /auth, /chat and
// /socket.io to :3000, and the Vercel deployment routes those paths to the
// backend service on the same domain. VITE_API_URL is only needed when the API
// lives on another host.
export const API_BASE = normalizeBaseUrl(
  import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || ''
);

/**
 * Resolves an image/media URL:
 * - If it's already an absolute URL (e.g. Supabase or external CDN), keep it.
 * - If it's a relative path (e.g. /uploads/...), prepend API_BASE if configured.
 */
export function resolveMediaUrl(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return API_BASE ? `${API_BASE}${url}` : url;
}

// Same-origin requests are always configured. Kept as an export because
// AuthPage renders a deployment warning based on it.
export const API_CONFIGURED = true;

// Access token lưu hoàn toàn trong biến RAM (Memory), KHÔNG lưu vào localStorage
let accessTokenInMemory = null;

export function getToken() {
  return accessTokenInMemory;
}

export function setToken(token) {
  accessTokenInMemory = token;
}

export function clearToken() {
  accessTokenInMemory = null;
  try {
    localStorage.removeItem('nexora_token');
  } catch {}
}

// Decode the JWT payload (no signature check — just to read userId/username for the UI).
// Returns null when the token is missing, malformed, or EXPIRED.
export function decodeToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(decodeURIComponent(escape(atob(payload))));
    if (decoded.exp && decoded.exp * 1000 < Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  constructor(message, status, code = null) {
    super(message);
    this.status = status;
    this.code = code; // NO_TOKEN, INVALID_TOKEN, TOKEN_EXPIRED, REFRESH_INVALID
  }
}

export const UNAUTHORIZED_EVENT = 'nexora:unauthorized';

// Shared refresh promise: đảm bảo nhiều request 401 cùng lúc chỉ kích hoạt DUY NHẤT một lượt refresh
let refreshPromise = null;

export async function refreshAccessToken() {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Truyền HttpOnly Cookie path=/auth/refresh
      });

      let data = null;
      try {
        data = await res.json();
      } catch {}

      const code = data?.code || (res.status === 401 || res.status === 403 ? 'REFRESH_INVALID' : 'INVALID_TOKEN');

      if (!res.ok || !data?.payload?.token) {
        clearToken();
        window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
        throw new ApiError(data?.payload?.message || 'Phiên làm việc đã hết hạn.', res.status, code);
      }

      const newToken = data.payload.token;
      setToken(newToken);
      return data.payload;
    } catch (err) {
      clearToken();
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
      throw err;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function request(method, path, body, { auth = true, isRetry = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      credentials: 'include', // truyền HttpOnly cookie
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      API_BASE
        ? `Không kết nối được tới backend (${API_BASE}). Kiểm tra service đã chạy và CORS đã cho phép domain này.`
        : 'Không kết nối được tới backend cùng domain. Kiểm tra service backend trong vercel.json đã deploy thành công chưa.',
      0,
      'NETWORK_ERROR'
    );
  }

  let data = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await res.json();
    } catch {}
  }

  // Interceptor: xử lý 401 TOKEN_EXPIRED -> refresh rồi retry đúng một lần
  if (res.status === 401 && auth && !isRetry && path !== '/auth/login' && path !== '/auth/refresh') {
    const errorCode = data?.code;

    if (errorCode === 'TOKEN_EXPIRED') {
      try {
        await refreshAccessToken();
        return request(method, path, body, { auth: true, isRetry: true });
      } catch {
        throw new ApiError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 401, 'REFRESH_INVALID');
      }
    } else {
      // NO_TOKEN hoặc INVALID_TOKEN hoặc REFRESH_INVALID
      clearToken();
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
      const msg = data?.payload?.error || data?.payload?.message || 'Yêu cầu không được cấp quyền.';
      throw new ApiError(msg, 401, errorCode || 'INVALID_TOKEN');
    }
  }

  if (!res.ok) {
    if (auth && res.status === 401) {
      clearToken();
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    const serverMessage = data && (data.payload?.error || data.payload?.message || data.error);
    const message =
      serverMessage ||
      (API_BASE
        ? `Yêu cầu thất bại (${res.status})`
        : `Yêu cầu thất bại (${res.status}). Backend cùng domain chưa phản hồi đúng.`);
    throw new ApiError(message, res.status, data?.code);
  }

  if (data === null) {
    throw new ApiError(
      API_BASE
        ? 'Backend trả về dữ liệu không hợp lệ (không phải JSON).'
        : 'Request đang nhận về trang HTML của frontend thay vì JSON.',
      res.status
    );
  }

  return data?.payload ?? data;
}

// Multipart variant — used for file uploads (FormData).
async function requestMultipart(path, formData, { isRetry = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: formData,
    });
  } catch {
    throw new ApiError('Không kết nối được tới backend khi tải ảnh lên.', 0, 'NETWORK_ERROR');
  }

  let data = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try { data = await res.json(); } catch {}
  }

  // Interceptor cho multipart nếu gặp 401 TOKEN_EXPIRED
  if (res.status === 401 && !isRetry) {
    const errorCode = data?.code;
    if (errorCode === 'TOKEN_EXPIRED') {
      try {
        await refreshAccessToken();
        return requestMultipart(path, formData, { isRetry: true });
      } catch {
        clearToken();
        window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
        throw new ApiError('Phiên đăng nhập đã hết hạn.', 401, 'REFRESH_INVALID');
      }
    }
    clearToken();
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }

  if (!res.ok) {
    const msg = data && (data.payload?.error || data.error);
    throw new ApiError(msg || `Upload thất bại (${res.status})`, res.status, data?.code);
  }

  return data?.payload ?? data;
}

export const api = {
  // ---- Auth (HTTP) ----
  signup: ({ email, username, password }) =>
    request('POST', '/auth/signup', { email, username, password }, { auth: false }),
  login: ({ email, username, password }) =>
    request('POST', '/auth/login', { email, username, password }, { auth: false }),
  verifyOtp: ({ email, otp }) =>
    request('POST', '/auth/verify-otp', { email, otp }, { auth: false }),
  resendVerification: ({ email }) =>
    request('POST', '/auth/resend-verification', { email }, { auth: false }),

  // ---- Conversations (HTTP) ----
  createChat: ({ conversation_name, conversation_type }) =>
    request('POST', '/chat/conversation/create', { conversation_name, conversation_type }),
  joinChat: (conversationId) =>
    request('POST', `/chat/conversation/join/${conversationId}`, {}),
  requestJoinChat: (conversationId) =>
    request('POST', `/chat/conversation/request-join/${conversationId}`, {}),
  getPendingRequests: (conversationId) =>
    request('GET', `/chat/conversation/${conversationId}/pending-requests`),
  approveMember: (conversationId, targetUserId) =>
    request('POST', `/chat/conversation/${conversationId}/approve`, { targetUserId }),
  rejectMember: (conversationId, targetUserId) =>
    request('POST', `/chat/conversation/${conversationId}/reject`, { targetUserId }),
  leaveChat: (conversationId) =>
    request('POST', `/chat/conversation/${conversationId}/leave`, {}),
  deleteChat: (conversationId) =>
    request('DELETE', `/chat/conversation/${conversationId}`, {}),
  getSharedMedia: (conversationId) =>
    request('GET', `/chat/conversation/${conversationId}/media`),
  myChats: () => request('GET', '/chat/conversation'),

  // ---- Messages (HTTP) ----
  sendMessage: ({ conversationId, type, content }) =>
    request('POST', '/chat/message/send', { conversationId, type, content }),
  deleteMessage: ({ conversationId, messageId }) => {
    const token = getToken();
    const payload = token ? decodeToken(token) : null;
    return request('DELETE', '/chat/message/delete', {
      conversationId,
      messageId,
      userId: payload?.userId,
    });
  },
  messages: (conversationId) =>
    request('GET', `/chat/conversation/${conversationId}/messages`),

  uploadImage: ({ conversationId, file }) => {
    const fd = new FormData();
    fd.append('conversationId', conversationId);
    fd.append('image', file);
    return requestMultipart('/chat/message/upload', fd);
  },

  uploadFile: ({ conversationId, file }) => {
    const fd = new FormData();
    fd.append('conversationId', conversationId);
    fd.append('file', file);
    return requestMultipart('/chat/message/upload-file', fd);
  },

  // ---- Friends & Users (Social) ----
  searchUsers: (q) => request('GET', `/users/search?q=${encodeURIComponent(q)}`),
  sendFriendRequest: (targetUserId) =>
    request('POST', '/friends/requests', { targetUserId }),
  getFriendRequests: (type = 'incoming') =>
    request('GET', `/friends/requests?type=${type}`),
  respondFriendRequest: (id, action) =>
    request('PATCH', `/friends/requests/${id}`, { action }),
  cancelFriendRequest: (id) =>
    request('DELETE', `/friends/requests/${id}`),
  unfriend: (friendId) =>
    request('DELETE', `/friends/${friendId}`),
  getFriends: () => request('GET', '/friends'),
  blockUser: (id) => request('POST', `/users/${id}/block`),
  unblockUser: (id) => request('POST', `/users/${id}/unblock`),
  createDirectChat: (targetUserId) =>
    request('POST', '/chat/conversation/direct', { targetUserId }),

  // ---- Social Feed & Posts ----
  getFeed: ({ limit = 10, cursor = null } = {}) => {
    let url = `/feed/posts?limit=${limit}`;
    if (cursor) url += `&cursor=${cursor}`;
    return request('GET', url);
  },
  createPost: ({ content, mediaUrls = [], visibility = 'friends' }) =>
    request('POST', '/feed/posts', { content, mediaUrls, visibility }),
  uploadFeedAttachment: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return requestMultipart('/feed/upload', fd);
  },
  updatePost: (postId, { content, mediaUrls, visibility }) =>
    request('PATCH', `/feed/posts/${postId}`, { content, mediaUrls, visibility }),
  deletePost: (postId) =>
    request('DELETE', `/feed/posts/${postId}`),

  // Delegated Post Editors (RBAC)
  grantPostEditor: (postId, targetUserId) =>
    request('POST', `/feed/posts/${postId}/editors`, { targetUserId }),
  revokePostEditor: (postId, targetUserId) =>
    request('DELETE', `/feed/posts/${postId}/editors/${targetUserId}`),
  getPostEditors: (postId) =>
    request('GET', `/feed/posts/${postId}/editors`),

  // Comments
  getComments: (postId) =>
    request('GET', `/feed/posts/${postId}/comments`),
  addComment: (postId, { content, parentId = null }) =>
    request('POST', `/feed/posts/${postId}/comments`, { content, parentId }),
  deleteComment: (commentId) =>
    request('DELETE', `/feed/comments/${commentId}`),

  // Reactions
  toggleReaction: ({ targetType, targetId, type = 'like' }) =>
    request('POST', '/feed/reactions', { targetType, targetId, type }),

  // Social Notifications
  getSocialNotifications: ({ limit = 20 } = {}) =>
    request('GET', `/feed/notifications?limit=${limit}`),
  markSocialNotificationAsRead: (id) =>
    request('PATCH', `/feed/notifications/${id}/read`),

  // ---- WebSocket Single-Use Ticket ----
  getWsTicket: () => request('POST', '/ws/ticket'),

  // ---- Refresh & Logout ----
  refreshToken: () => refreshAccessToken(),
  logout: () => request('POST', '/auth/logout', {}),
  logoutAll: () => request('POST', '/auth/logout-all', {}),
};
