import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken, clearToken, decodeToken, UNAUTHORIZED_EVENT } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Khi app khởi động hoặc reload: mặc định checking = true để gọi /auth/refresh lấy token từ RAM
  const [checking, setChecking] = useState(true);
  const [token, setTokenState] = useState(null);

  // Khi app khởi động hoặc reload trang: gọi POST /auth/refresh 1 lần để lấy access token mới vào RAM
  useEffect(() => {
    let alive = true;
    api
      .refreshToken()
      .then((payload) => {
        if (!alive) return;
        const newToken = payload?.token;
        if (newToken) {
          setTokenState(newToken);
          setUser(decodeToken(newToken));
        }
      })
      .catch(() => {
        // Yên lặng khi chưa có phiên đăng nhập (chưa login hoặc cookie hết hạn)
        if (!alive) return;
        setUser(null);
        setTokenState(null);
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
    if (!payload?.token) {
      throw new Error('Backend không trả về token đăng nhập. Vui lòng thử lại.');
    }
    setToken(payload.token);
    setTokenState(payload.token);
    setUser(decodeToken(payload.token));
    setChecking(false);
    return payload;
  };

  const signup = async ({ email, username, password }) => api.signup({ email, username, password });

  const logout = async () => {
    try {
      await api.logout();
    } catch {}
    clearToken();
    setTokenState(null);
    setUser(null);
  };

  const logoutAll = async () => {
    try {
      await api.logoutAll();
    } catch {}
    clearToken();
    setTokenState(null);
    setUser(null);
  };

  const value = useMemo(
    () => ({ user, token, isAuthenticated: !!user, checking, login, signup, logout, logoutAll }),
    [user, token, checking]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
