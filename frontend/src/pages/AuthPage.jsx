import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_CONFIGURED } from '../api';

export default function AuthPage({ mode }) {
  const isSignup = mode === 'signup';
  const { login, signup } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ email: '', username: '', password: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    try {
      if (isSignup) {
        const res = await signup(form);
        setNotice(res?.message || 'Đăng kí thành công — hãy kiểm tra email để xác thực');
      } else {
        await login(form);
        navigate('/chat');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1 className="brand">Nexora</h1>
        <p className="subtitle">{isSignup ? 'Tạo tài khoản mới' : 'Đăng nhập để tiếp tục'}</p>

        {!API_CONFIGURED && (
          <div className="alert error">
            Bản deploy chưa có <code>VITE_API_URL</code>. Trên Vercel vào Settings →
            Environment Variables, đặt <code>VITE_API_URL</code> bằng URL Render (ví dụ{' '}
            <code>https://ten-service.onrender.com</code>) rồi Redeploy.
          </div>
        )}

        <form onSubmit={onSubmit} className="auth-form">
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={update('email')}
              placeholder="you@example.com"
              required
            />
          </label>

          <label>
            Username
            <input
              type="text"
              value={form.username}
              onChange={update('username')}
              placeholder="username"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={update('password')}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </label>

          {error && <div className="alert error">{error}</div>}
          {notice && <div className="alert success">{notice}</div>}

          <button type="submit" className="primary" disabled={loading}>
            {loading ? 'Đang xử lý...' : isSignup ? 'Đăng kí' : 'Đăng nhập'}
          </button>
        </form>

        <p className="switch">
          {isSignup ? (
            <>
              Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
            </>
          ) : (
            <>
              Chưa có tài khoản? <Link to="/signup">Đăng kí</Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
