import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

const OTP_LENGTH = 6;

/**
 * Thời hạn hiệu lực của mã OTP (phút).
 * Phải khớp với VERIFY_EXPIRE_MINUTES ở backend (mặc định 15).
 */
const OTP_TTL_MINUTES = 15;

const emptyBoxes = () => Array(OTP_LENGTH).fill('');

export default function AuthPage({ mode }) {
  const isSignup = mode === 'signup';
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [form, setForm] = useState({ email: '', username: '', password: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  // ---- Verification State (OTP & Resend) ----
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState('');
  const [verifyEmailInput, setVerifyEmailInput] = useState('');
  const [otpBoxes, setOtpBoxes] = useState(emptyBoxes);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);
  const [remainingSends, setRemainingSends] = useState(null);
  const [otpExpiresAt, setOtpExpiresAt] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  const boxRefs = useRef([]);
  const autoSubmittedRef = useRef('');
  const submittingRef = useRef(false);

  const otp = otpBoxes.join('');
  const secondsLeft = otpExpiresAt ? Math.max(0, Math.floor((otpExpiresAt - now) / 1000)) : 0;
  const otpExpired = otpExpiresAt !== null && secondsLeft === 0;
  const countdown = `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(
    secondsLeft % 60
  ).padStart(2, '0')}`;

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

  // Countdown hết hạn của mã OTP
  useEffect(() => {
    if (!otpExpiresAt) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [otpExpiresAt]);

  const focusBox = useCallback((index) => {
    const el = boxRefs.current[index];
    if (el) el.focus();
  }, []);

  // Đưa con trỏ vào ô đầu tiên khi mở màn hình nhập mã
  useEffect(() => {
    if (!isVerifying || !verifyEmail) return;
    const timer = setTimeout(() => focusBox(0), 60);
    return () => clearTimeout(timer);
  }, [isVerifying, verifyEmail, focusBox]);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // ------------------------------------------------------------------
  // Đăng nhập / Đăng ký
  // ------------------------------------------------------------------
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
        setOtpExpiresAt(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
        setOtpBoxes(emptyBoxes());
        autoSubmittedRef.current = '';
        setNotice(
          res?.message ||
            'Đăng ký thành công! Hãy kiểm tra hòm thư của bạn để lấy mã OTP hoặc bấm liên kết xác thực.'
        );
      } else {
        await login(form);
        navigate('/chat');
      }
    } catch (err) {
      // Nếu server báo tài khoản chưa xác thực -> chuyển thẳng sang màn hình mã OTP
      if (err.message && (err.message.includes('chưa được kích hoạt') || err.message.includes('chưa xác thực'))) {
        setVerifyEmail(form.email);
        setIsVerifying(true);
        setResendCooldown(30);
        setOtpExpiresAt(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
        setOtpBoxes(emptyBoxes());
        autoSubmittedRef.current = '';
        setError(err.message);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // ------------------------------------------------------------------
  // Xác thực bằng mã OTP (passcode)
  // ------------------------------------------------------------------
  const submitOtp = useCallback(
    async (code) => {
      const clean = String(code || '').trim();
      if (!verifyEmail || clean.length !== OTP_LENGTH) return;
      if (submittingRef.current) return;

      submittingRef.current = true;
      setError('');
      setNotice('');
      setOtpError(false);
      setOtpLoading(true);

      try {
        const res = await api.verifyOtp({ email: verifyEmail, otp: clean });
        setNotice(res?.message || 'Kích hoạt tài khoản thành công! Bạn có thể đăng nhập ngay.');
        setIsVerifying(false);
        setOtpBoxes(emptyBoxes());
        autoSubmittedRef.current = '';
        // Về trang đăng nhập kèm cờ báo thành công
        navigate('/login?verified=true');
      } catch (err) {
        setOtpError(true);
        setError(err.message || 'Mã OTP không hợp lệ hoặc đã hết hạn.');
        focusBox(0);
      } finally {
        submittingRef.current = false;
        setOtpLoading(false);
      }
    },
    [verifyEmail, navigate, focusBox]
  );

  // Tự động gửi khi đã đủ 6 chữ số
  useEffect(() => {
    if (otp.length !== OTP_LENGTH) return;
    if (autoSubmittedRef.current === otp) return;
    autoSubmittedRef.current = otp;
    submitOtp(otp);
  }, [otp, submitOtp]);

  const handleBoxChange = (index, raw) => {
    const digits = String(raw).replace(/\D/g, '');
    setOtpError(false);
    if (!digits) {
      setOtpBoxes((prev) => {
        const next = [...prev];
        next[index] = '';
        return next;
      });
      return;
    }
    setOtpBoxes((prev) => {
      const next = [...prev];
      if (digits.length === 1) {
        next[index] = digits;
      } else {
        // Dán nhiều số vào một ô -> phân bố dần sang các ô phía sau
        let pos = index;
        for (const d of digits) {
          if (pos >= OTP_LENGTH) break;
          next[pos] = d;
          pos += 1;
        }
      }
      return next;
    });
    if (digits.length === 1) {
      if (index < OTP_LENGTH - 1) focusBox(index + 1);
    } else {
      focusBox(Math.min(index + digits.length, OTP_LENGTH - 1));
    }
  };

  const handleBoxKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      setOtpError(false);
      const hadValue = Boolean(otpBoxes[index]);
      setOtpBoxes((prev) => {
        const next = [...prev];
        if (next[index]) next[index] = '';
        else if (index > 0) next[index - 1] = '';
        return next;
      });
      if (!hadValue && index > 0) focusBox(index - 1);
      return;
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      focusBox(index - 1);
      return;
    }
    if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      e.preventDefault();
      focusBox(index + 1);
    }
  };

  const handleBoxPaste = (e) => {
    e.preventDefault();
    const text = String(e.clipboardData?.getData('text') || '').replace(/\D/g, '');
    if (!text) return;
    setOtpError(false);
    setOtpBoxes((prev) => {
      const next = [...prev];
      for (let i = 0; i < OTP_LENGTH && i < text.length; i += 1) next[i] = text[i];
      return next;
    });
    focusBox(Math.min(text.length, OTP_LENGTH - 1));
  };

  // ------------------------------------------------------------------
  // Gửi lại mã / Gửi mã lần đầu
  // ------------------------------------------------------------------
  const sendCode = async (email) => {
    const res = await api.resendVerification({ email });
    setOtpExpiresAt(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
    setOtpBoxes(emptyBoxes());
    autoSubmittedRef.current = '';
    setResendCooldown(60);
    if (typeof res?.remainingSends === 'number') setRemainingSends(res.remainingSends);
    return res;
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || resendLoading) return;
    setError('');
    setNotice('');
    setResendLoading(true);

    try {
      const res = await sendCode(verifyEmail);
      setNotice(res?.message || 'Đã gửi lại mã xác minh vào email của bạn.');
    } catch (err) {
      if (err.status === 404) {
        setError('Chưa có tài khoản nào với email này. Hãy đăng ký tài khoản mới trước khi nhận mã xác thực.');
      } else {
        setError(err.message || 'Không thể gửi lại mã lúc này. Vui lòng thử lại sau.');
      }
    } finally {
      setResendLoading(false);
    }
  };

  // Người dùng tự mở màn hình mã OTP từ trang đăng nhập (chưa có email)
  const handleSendCode = async (e) => {
    e.preventDefault();
    const email = verifyEmailInput.trim();
    if (!email) {
      setError('Vui lòng nhập email bạn đã đăng ký.');
      return;
    }
    setError('');
    setNotice('');
    setResendLoading(true);

    try {
      const res = await sendCode(email);
      setVerifyEmail(email);
      setNotice(res?.message || 'Mã xác thực đã được gửi. Kiểm tra hòm thư của bạn.');
    } catch (err) {
      if (err.status === 404) {
        setError('Chưa có tài khoản nào với email này. Hãy đăng ký tài khoản mới trước khi nhận mã xác thực.');
      } else {
        setError(err.message || 'Không thể gửi mã xác thực lúc này. Vui lòng thử lại sau.');
      }
    } finally {
      setResendLoading(false);
    }
  };

  const backToForm = () => {
    setIsVerifying(false);
    setError('');
    setNotice('');
    setOtpError(false);
    setOtpBoxes(emptyBoxes());
    autoSubmittedRef.current = '';
  };

  // ------------------------------------------------------------------
  // MÀN HÌNH XÁC THỰC OTP
  // ------------------------------------------------------------------
  if (isVerifying) {
    const hasEmail = verifyEmail.trim().length > 0;

    return (
      <div className="auth-shell">
        <div className="auth-card">
          <p className="eyebrow">Bảo mật // Email Verification</p>
          <h1 className="brand">Nexora</h1>
          <p className="subtitle">Xác thực tài khoản qua Email</p>

          <div className="auth-verify-badge">
            <span className="verify-icon">✉</span>
            <div className="verify-desc">
              {hasEmail ? (
                <>
                  Mã OTP 6 số và liên kết kích hoạt đã được gửi đến:
                  <strong className="verify-target-email">{verifyEmail}</strong>
                </>
              ) : (
                'Nhập email bạn đã đăng ký, chúng tôi sẽ gửi mã OTP 6 số và liên kết kích hoạt.'
              )}
            </div>
          </div>

          {!hasEmail ? (
            <form onSubmit={handleSendCode} className="auth-form" style={{ marginTop: '16px' }}>
              <label>
                Email đã đăng ký
                <input
                  type="email"
                  value={verifyEmailInput}
                  onChange={(e) => setVerifyEmailInput(e.target.value)}
                  placeholder="you@example.com"
                  autoFocus
                  required
                />
              </label>

              {error && <div className="alert error">{error}</div>}
              {notice && <div className="alert success">{notice}</div>}

              <button type="submit" className="primary" disabled={resendLoading}>
                {resendLoading ? 'Đang gửi...' : 'Gửi mã xác thực'}
              </button>
            </form>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitOtp(otp);
              }}
              className="auth-form"
              style={{ marginTop: '16px' }}
            >
              <p className="otp-label">Mã OTP xác thực (6 chữ số)</p>

              <div className="otp-boxes" role="group" aria-label="Mã OTP 6 chữ số">
                {otpBoxes.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      boxRefs.current[i] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleBoxChange(i, e.target.value)}
                    onKeyDown={(e) => handleBoxKeyDown(i, e)}
                    onPaste={handleBoxPaste}
                    onFocus={(e) => e.target.select()}
                    className={`otp-box${digit ? ' filled' : ''}${otpError ? ' error' : ''}`}
                    aria-label={`Chữ số thứ ${i + 1}`}
                    disabled={otpLoading}
                  />
                ))}
              </div>

              <div className="otp-meta">
                <span className="otp-hint">Dán mã 6 số từ email hoặc nhập tay.</span>
                {otpExpiresAt !== null && (
                  <span className={`otp-countdown${otpExpired ? ' expired' : ''}`}>
                    {otpExpired ? 'Mã đã hết hạn' : `Hết hạn sau ${countdown}`}
                  </span>
                )}
              </div>

              {error && <div className="alert error">{error}</div>}
              {notice && <div className="alert success">{notice}</div>}

              <button type="submit" className="primary" disabled={otpLoading || otp.length < OTP_LENGTH}>
                {otpLoading ? 'Đang xác thực...' : 'Xác nhận & Kích hoạt'}
              </button>
            </form>
          )}

          <div className="resend-section">
            {hasEmail && (
              <>
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
              </>
            )}

            <p className="switch" style={{ marginTop: '18px' }}>
              <button type="button" className="text-link-btn" onClick={backToForm}>
                ← Quay lại trang {isSignup ? 'Đăng ký' : 'Đăng nhập'}
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // MÀN HÌNH ĐĂNG NHẬP / ĐĂNG KÝ
  // ------------------------------------------------------------------
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

        {!isSignup && (
          <p className="switch" style={{ marginTop: '10px' }}>
            <button
              type="button"
              className="text-link-btn"
              onClick={() => {
                setIsVerifying(true);
                setVerifyEmail('');
                setVerifyEmailInput(form.email);
                setError('');
                setNotice('');
                setOtpError(false);
                setOtpBoxes(emptyBoxes());
                autoSubmittedRef.current = '';
              }}
            >
              Đã có mã xác thực? Nhập mã OTP
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
