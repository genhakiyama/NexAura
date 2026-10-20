const TOKEN_KEY = 'nexora_token';

// Set VITE_API_URL on Vercel to the Render backend origin.
// Empty in local dev so the Vite proxy handles /auth, /chat and /socket.io.
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

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

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON body
  }

  if (!res.ok) {
    // A 401 on an authenticated call means the stored session is dead server-side.
    // Drop it and let AuthProvider send the user back to /login instead of leaving
    // them on a chat shell that can no longer load anything.
    if (auth && res.status === 401) {
      clearToken();
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    const message =
      (data && (data.payload?.error || data.payload?.message || data.error)) ||
      `Yêu cầu thất bại (${res.status})`;
    throw new ApiError(message, res.status);
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
