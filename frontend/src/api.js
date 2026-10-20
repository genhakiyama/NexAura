const TOKEN_KEY = 'nexora_token';

export function normalizeBaseUrl(value) {
  const trimmed = String(value || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// Set VITE_API_URL on Vercel to the Render backend origin.
// Empty in local dev so the Vite proxy handles /auth, /chat and /socket.io.
const API_BASE = normalizeBaseUrl(
  import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || ''
);

// In a production build an empty base means every request falls into the
// Vercel SPA rewrite and gets index.html. Surface that instead of crashing on
// a null JSON payload.
export const API_CONFIGURED = !import.meta.env.PROD || Boolean(API_BASE);

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
        ? `Không kết nối được tới backend (${API_BASE}). Kiểm tra service Render đã chạy và CORS đã cho phép domain này.`
        : 'Không kết nối được tới backend. Bản deploy chưa cấu hình VITE_API_URL.',
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
        : `Frontend chưa cấu hình VITE_API_URL nên request đang rơi vào trang Vercel (HTTP ${res.status}). Hãy đặt VITE_API_URL = URL Render rồi redeploy.`);
    throw new ApiError(message, res.status);
  }

  if (data === null) {
    throw new ApiError(
      API_BASE
        ? 'Backend trả về dữ liệu không hợp lệ (không phải JSON).'
        : 'Frontend chưa cấu hình VITE_API_URL nên request đang rơi vào trang Vercel. Hãy đặt VITE_API_URL = URL Render rồi redeploy.',
      res.status
    );
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
};
