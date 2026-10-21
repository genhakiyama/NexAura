import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

export default function AuthPage({ mode }) {
  const isSignup = mode === 'signup';
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [form, setForm] = useState({ email: '', username: '', password: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  // Verification State (OTP & Resend)
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);
  const [remainingSends, setRemainingSends] = useState(null);

  // Check URL query param (e.g. redirected after clicking email link)
  useEffect(() => {
    if (searchParams.get('verified') === 'true') {
      setNotice('Xác thực tài khoản thành công! Vui lòng đăng nhập để bắt đầu.');
    }
  }, [searchParams]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);

    try {
      if (isSignup) {
        const res = await signup(form);
        setVerifyEmail(form.email);
        setIsVerifying(true);
        setResendCooldown(60);
        setNotice(res?.message || 'Đăng ký thành công! Hãy kiểm tra hòm thư của bạn để lấy mã OTP hoặc bấm liên kết xác thực.');
      } else {
        await login(form);
        navigate('/chat');
      }
    } catch (err) {
      // Nếu server báo tài khoản chưa xác thực
      if (err.message && (err.message.includes('chưa được kích hoạt') || err.message.includes('chưa xác thực'))) {
        setVerifyEmail(form.email);
        setIsVerifying(true);
        setResendCooldown(30);
        setError(err.message);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otp || otp.trim().length !== 6) {
      setError('Vui lòng nhập đầy đủ mã OTP 6 chữ số.');
      return;
    }

    setError('');
    setNotice('');
    setOtpLoading(true);

    try {
      const res = await api.verifyOtp({ email: verifyEmail, otp: otp.trim() });
      setNotice(res?.message || 'Kích hoạt tài khoản thành công! Bạn có thể đăng nhập ngay.');
      setIsVerifying(false);
      setOtp('');
      // Chuyển về màn hình đăng nhập
      if (isSignup) {
        navigate('/login');
      }
    } catch (err) {
      setError(err.message || 'Mã OTP không hợp lệ hoặc đã hết hạn.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || resendLoading) return;
    setError('');
    setNotice('');
    setResendLoading(true);

    try {
      const res = await api.resendVerification({ email: verifyEmail });
      setNotice(res?.message || 'Đã gửi lại mã xác minh vào email của bạn.');
      setResendCooldown(60);
      if (typeof res?.remainingSends === 'number') {
        setRemainingSends(res.remainingSends);
      }
    } catch (err) {
      setError(err.message || 'Không thể gửi lại mã lúc này. Vui lòng thử lại sau.');
    } finally {
      setResendLoading(false);
    }
  };

  // MÀN HÌNH XÁC THỰC OTP
  if (isVerifying) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <p className="eyebrow">Bảo mật // Email Verification</p>
          <h1 className="brand">Nexora</h1>
          <p className="subtitle">Xác thực tài khoản qua Email</p>

          <div className="auth-verify-badge">
            <span className="verify-icon">✉</span>
            <div className="verify-desc">
              Mã OTP 6 số và liên kết kích hoạt đã được gửi đến:
              <strong className="verify-target-email">{verifyEmail}</strong>
            </div>
          </div>

          <form onSubmit={handleVerifyOtp} className="auth-form" style={{ marginTop: '16px' }}>
            <label>
              Mã OTP xác thực (6 chữ số)
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="• • • • • •"
                className="otp-input"
                autoFocus
                required
              />
            </label>

            {error && <div className="alert error">{error}</div>}
            {notice && <div className="alert success">{notice}</div>}

            <button type="submit" className="primary" disabled={otpLoading || otp.length < 6}>
              {otpLoading ? 'Đang xác thực...' : 'Xác nhận & Kích hoạt'}
            </button>
          </form>

          <div className="resend-section">
            <div className="resend-info">
              Không nhận được thư? Kiểm tra mục <strong>Spam / Thư rác</strong> hoặc:
            </div>
            <button
              type="button"
              className="resend-btn"
              onClick={handleResendOtp}
              disabled={resendCooldown > 0 || resendLoading}
            >
              {resendLoading
                ? 'Đang gửi...'
                : resendCooldown > 0
                ? `Gửi lại mã sau ${resendCooldown}s`
                : 'Gửi lại mã xác minh'}
            </button>
            {remainingSends !== null && (
              <div className="remaining-badge">Còn {remainingSends} lần gửi lại trong chu kỳ 1 giờ</div>
            )}
          </div>

          <p className="switch" style={{ marginTop: '20px' }}>
            <button
              type="button"
              className="text-link-btn"
              onClick={() => {
                setIsVerifying(false);
                setError('');
                setNotice('');
              }}
            >
              ← Quay lại trang {isSignup ? 'Đăng ký' : 'Đăng nhập'}
            </button>
          </p>
        </div>
      </div>
    );
  }

  // MÀN HÌNH ĐĂNG NHẬP / ĐĂNG KÝ THÔNG THƯỜNG
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <p className="eyebrow">Nexora // Messenger</p>
        <h1 className="brand">Nexora</h1>
        <p className="subtitle">{isSignup ? 'Tạo tài khoản mới' : 'Đăng nhập để tiếp tục'}</p>

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

