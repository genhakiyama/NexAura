import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken, clearToken, decodeToken, UNAUTHORIZED_EVENT } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => decodeToken(getToken()));
  // A token in localStorage is only a claim. Confirm it against the backend before
  // the router decides, so opening the link with an old/invalid session lands on
  // /login instead of dropping straight into the chat screen.
  const [checking, setChecking] = useState(() => !!getToken());
  // Kept in state (not just localStorage) so consumers like useSocket can
  // reconnect when it actually becomes available.
  const [token, setTokenState] = useState(() => getToken());

  useEffect(() => {
    if (!getToken()) return undefined;
    let alive = true;
    api
      .myChats()
      .catch((err) => {
        if (!alive) return;
        // 401 already clears the token through the global UNAUTHORIZED event.
        // A network/CORS failure must NOT log the user out and destroy a valid
        // session — the chat page will show the connection error instead.
        console.error('[session check failed]', err.message);
      })
      .finally(() => {
        if (alive) setChecking(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      setTokenState(null);
      setChecking(false);
    };
    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
  }, []);

  const login = async ({ email, username, password }) => {
    const payload = await api.login({ email, username, password });
    // Backend puts the token under payload.token (watch for its `sucess` typo — we only read payload).
    if (!payload?.token) {
      throw new Error('Backend không trả về token đăng nhập. Kiểm tra service backend trên Vercel rồi thử lại.');
    }
    setToken(payload.token);
    setTokenState(payload.token);
    setUser(decodeToken(payload.token));
    setChecking(false);
    return payload;
  };

  const signup = async ({ email, username, password }) => api.signup({ email, username, password });

  const logout = () => {
    clearToken();
    setTokenState(null);
    setUser(null);
  };

  const value = useMemo(
    () => ({ user, token, isAuthenticated: !!user, checking, login, signup, logout }),
    [user, token, checking]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
