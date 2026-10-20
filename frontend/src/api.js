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

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// Decode the JWT payload (no signature check — just to read userId/username for the UI).
// Returns null when the token is missing, malformed, or EXPIRED, so a stale
// token can't silently log the user back in.
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
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export const UNAUTHORIZED_EVENT = 'nexora:unauthorized';

async function request(method, path, body, { auth = true } = {}) {
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
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      API_BASE
        ? `Không kết nối được tới backend (${API_BASE}). Kiểm tra service đã chạy và CORS đã cho phép domain này.`
        : 'Không kết nối được tới backend cùng domain. Kiểm tra service backend trong vercel.json đã deploy thành công chưa.',
      0
    );
  }

  let data = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await res.json();
    } catch {
      // malformed JSON, handled below
    }
  }

  if (!res.ok) {
    // A 401 on an authenticated call means the stored session is dead server-side.
    // Drop it and let AuthProvider send the user back to /login instead of leaving
    // them on a chat shell that can no longer load anything.
    if (auth && res.status === 401) {
      clearToken();
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    const serverMessage = data && (data.payload?.error || data.payload?.message || data.error);
    const message =
      serverMessage ||
      (API_BASE
        ? `Yêu cầu thất bại (${res.status})`
        : `Yêu cầu thất bại (${res.status}). Backend cùng domain chưa phản hồi đúng — kiểm tra rewrite /auth và /chat trong vercel.json.`);
    throw new ApiError(message, res.status);
  }

  if (data === null) {
    throw new ApiError(
      API_BASE
        ? 'Backend trả về dữ liệu không hợp lệ (không phải JSON).'
        : 'Request đang nhận về trang HTML của frontend thay vì JSON. Kiểm tra rewrite /auth và /chat trong vercel.json đã trỏ tới service backend chưa.',
      res.status
    );
  }

  return data?.payload ?? data;
}

// Multipart variant — used for file uploads (FormData). The browser sets the
// Content-Type header with the correct boundary automatically; we must NOT
// override it.
async function requestMultipart(path, formData) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers,
      body: formData,
    });
  } catch {
    throw new ApiError('Không kết nối được tới backend khi tải ảnh lên.', 0);
  }

  let data = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try { data = await res.json(); } catch { /* ignore */ }
  }

  if (!res.ok) {
    if (res.status === 401) {
      clearToken();
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    const msg = data && (data.payload?.error || data.error);
    throw new ApiError(msg || `Upload thất bại (${res.status})`, res.status);
  }

  return data?.payload ?? data;
}

export const api = {
  // ---- Auth (HTTP) ----
  signup: ({ email, username, password }) =>
    request('POST', '/auth/signup', { email, username, password }, { auth: false }),
  login: ({ email, username, password }) =>
    request('POST', '/auth/login', { email, username, password }, { auth: false }),

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

  // ---- Image upload (multipart/form-data) ----
  uploadImage: ({ conversationId, file }) => {
    const fd = new FormData();
    fd.append('conversationId', conversationId);
    fd.append('image', file);
    return requestMultipart('/chat/message/upload', fd);
  },
};
