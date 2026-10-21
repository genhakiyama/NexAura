const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config();

const nodemailer = require('nodemailer');
const crypto = require('crypto');

const User = require('../Models/User');
const Token = require('../UTIL/Token');

const mailError = require('../Errors/Email');

function createTransporter() {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD
        }
    });
}

let transporter = createTransporter();

// Prevent a rejected SMTP connection from becoming an uncaught exception
// (which would crash the whole process and take down every request).
transporter.on('error', (err) => {
    console.error('[mail transport error]', err.message);
});

/**
 * Thời hạn hiệu lực của link kích hoạt và mã OTP (đơn vị: phút).
 * Dùng chung cho cả đăng ký lẫn gửi lại mã để hai luồng không lệch nhau.
 */
const VERIFY_TTL_MINUTES = Math.max(1, Number(process.env.VERIFY_EXPIRE_MINUTES) || 15);

function resolveBaseUrl() {
    const configured = String(process.env.BASE_URL || '').trim().replace(/\/+$/, '');
    const renderUrl = String(process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/+$/, '');
    // Vercel exposes the deployment host without a scheme. Prefer the stable
    // production domain over the per-deployment URL, since verification links
    // are opened later and preview URLs can expire.
    const vercelHost = String(
        process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || ''
    ).trim().replace(/\/+$/, '');
    const vercelUrl = vercelHost && !/^https?:\/\//i.test(vercelHost)
        ? `https://${vercelHost}`
        : vercelHost;
    const fallbackUrl = renderUrl || vercelUrl;
    const pointsToLocalhost = !configured || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(configured);

    // Prefer the platform-provided public URL when BASE_URL still contains the
    // local development address, otherwise the verification link in the email
    // points at localhost and the account can never be verified after signup.
    if (fallbackUrl && pointsToLocalhost) return fallbackUrl;

    let result = configured || fallbackUrl || `http://localhost:${process.env.PORT || 3000}`;
    if (result && !/^https?:\/\//i.test(result)) {
        result = `https://${result}`;
    }
    return result;
}

const resolveBaseURL = resolveBaseUrl;

function resolveClientUrl() {
    const configuredClient = String(
        process.env.CLIENT_URL ||
        process.env.FRONTEND_URL ||
        process.env.APP_URL ||
        ''
    ).trim().replace(/\/+$/, '');

    if (configuredClient) {
        return /^https?:\/\//i.test(configuredClient) ? configuredClient : `https://${configuredClient}`;
    }

    // On Vercel (monorepo), both frontend and backend are on the same domain
    const vercelHost = String(
        process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || ''
    ).trim().replace(/\/+$/, '');
    if (vercelHost) {
        // Vercel cấp host KHÔNG kèm scheme ("app.vercel.app"), nên phải tự thêm
        // "https://". Trước đây điều kiện ở đây bị đảo ngược: host có scheme thì
        // bị gộp thành "https://https://...", host không có scheme thì trả về
        // chuỗi trần. Kết quả là href trên trang kích hoạt trở thành đường dẫn
        // tương đối và người dùng không đến được trang đăng nhập.
        return /^https?:\/\//i.test(vercelHost) ? vercelHost : `https://${vercelHost}`;
    }

    // In local development, frontend Vite default is on port 5173
    return 'http://localhost:5173';
}

const resolveClientURL = resolveClientUrl;

async function SendVerification(email, token, otp) {
    if (!email) {
        return { success: false, error: 'Địa chỉ email không được để trống.' };
    }
    const cleanToken = String(token || '').trim();
    const encodedToken = encodeURIComponent(cleanToken);
    const link = `${resolveBaseUrl()}/auth/verify-Email?token=${encodedToken}`;

    const otpSection = otp ? `
        <!-- OTP Code Display Box -->
        <div style="background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border: 2px dashed #cbd5e1; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
            <div style="font-size: 12px; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 0.08em; margin-bottom: 8px;">Mã OTP xác thực của bạn</div>
            <div style="font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #4f46e5; font-family: 'Courier New', Courier, monospace;">${otp}</div>
            <div style="font-size: 12.5px; color: #94a3b8; margin-top: 8px;">Hiệu lực trong vòng <strong>15 phút</strong> (chỉ dùng 1 lần)</div>
        </div>
    ` : '';

    const instructionText = otp
        ? 'Cảm ơn bạn đã đăng ký Nexora. Bạn có thể kích hoạt tài khoản bằng cách nhập mã OTP 6 số bên dưới hoặc bấm nút kích hoạt trực tiếp:'
        : 'Cảm ơn bạn đã đăng ký Nexora. Vui lòng bấm vào nút bên dưới để kích hoạt tài khoản của bạn:';

    try {
        const info = await transporter.sendMail({
            from: `"Nexora Messenger" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: "Xác thực tài khoản Nexora của bạn - Mã OTP kích hoạt",
            html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff; color: #0f172a;">
                    <div style="margin-bottom: 24px; text-align: center;">
                        <span style="font-weight: 900; font-size: 24px; letter-spacing: -0.03em; color: #4f46e5; display: inline-block;">NEXORA</span>
                    </div>
                    <h2 style="color: #0f172a; margin-top: 0; font-size: 21px; text-align: center; font-weight: 700;">Xác thực tài khoản Nexora</h2>
                    <p style="color: #475569; font-size: 15px; line-height: 1.6; text-align: center; margin-bottom: 24px;">
                        ${instructionText}
                    </p>

                    ${otpSection}

                    <!-- Direct Verification Button -->
                    <div style="margin: 28px 0; text-align: center;">
                        <a href="${link}" style="background: #4f46e5; color: #ffffff; padding: 13px 30px; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 15px; display: inline-block; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25);">
                            Kích hoạt nhanh bằng liên kết
                        </a>
                    </div>

                    <div style="border-top: 1px solid #f1f5f9; padding-top: 18px; margin-top: 24px; font-size: 12px; color: #94a3b8; line-height: 1.5; text-align: center;">
                        <p style="margin: 0 0 6px 0;">Nếu nút bấm không hoạt động, bạn có thể sao chép liên kết này vào trình duyệt:</p>
                        <p style="margin: 0; word-break: break-all; color: #64748b;">${link}</p>
                        <p style="margin: 12px 0 0 0; color: #cbd5e1;">Nếu bạn không yêu cầu đăng ký Nexora, vui lòng bỏ qua thư này.</p>
                    </div>
                </div>
            `
        });

        if (info.rejected && info.rejected.length > 0) {
            return {
                success: false,
                error: 'Máy chủ thư từ chối gửi tới địa chỉ này. Email có thể không tồn tại.'
            };
        }

        return { success: true, info };
    } catch (err) {
        console.error('[SendVerification failed]', err.message);
        let errorMsg = 'Không thể gửi email xác thực lúc này. Vui lòng thử lại sau.';
        if (err.responseCode === 550 || err.message?.includes('5.1.1') || err.message?.includes('does not exist')) {
            errorMsg = 'Địa chỉ email này không tồn tại hoặc không thể nhận thư.';
        }
        return { success: false, error: errorMsg };
    }
}

const sendVerification = SendVerification;

async function verifyEmail(token) {
    if (!token || typeof token !== 'string') {
        return {
            error: 'Liên kết xác thực không hợp lệ.'
        };
    }
    const hashedToken = crypto.createHash('sha256').update(token.trim()).digest('hex');
    const user = await User.findOne({
        where: {
            verificationToken: hashedToken
        }
    });

    if (!user) {
        return {
            status_code: 400,
            error: 'Liên kết xác thực không tồn tại hoặc tài khoản đã được kích hoạt trước đó. Vui lòng yêu cầu gửi lại mã xác minh mới.'
        };
    }

    if (user.isVerified) {
        return {
            status_code: 200,
            message: 'Tài khoản của bạn đã được xác thực trước đó. Bạn có thể đăng nhập ngay.'
        };
    }

    if (!user.verificationExpire || new Date(user.verificationExpire) <= new Date()) {
        return {
            status_code: 400,
            error: 'Liên kết xác thực đã hết hạn (chỉ có hiệu lực trong 15 phút). Vui lòng yêu cầu gửi lại mã xác minh mới.'
        };
    }

    await user.update({
        isVerified: true,
        verificationToken: null,
        verificationOtp: null,
        verificationExpire: null,
        resendCount: 0
    });

    return {
        success: true,
        message: 'Xác thực tài khoản thành công! Bạn có thể đăng nhập ngay bây giờ.'
    };
}

/**
 * Xác thực tài khoản thông qua mã OTP 6 số
 */
async function verifyOtp(email, otp) {
    if (!email || !otp) {
        return {
            status_code: 400,
            error: 'Vui lòng cung cấp email và mã OTP 6 chữ số.'
        };
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = String(otp).trim();

    if (cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
        return {
            status_code: 400,
            error: 'Mã OTP phải gồm đúng 6 chữ số.'
        };
    }

    const user = await User.findOne({ where: { email: cleanEmail } });
    if (!user) {
        return {
            status_code: 404,
            error: 'Không tìm thấy tài khoản với email này.'
        };
    }

    if (user.isVerified) {
        return {
            success: true,
            message: 'Tài khoản đã được xác thực trước đó. Bạn có thể đăng nhập ngay.'
        };
    }

    if (!user.verificationExpire || new Date(user.verificationExpire) <= new Date()) {
        return {
            status_code: 400,
            error: 'Mã OTP đã hết hiệu lực (quá 15 phút). Vui lòng bấm gửi lại mã mới.'
        };
    }

    const hashedInputOtp = crypto.createHash('sha256').update(cleanOtp).digest('hex');
    if (user.verificationOtp !== hashedInputOtp && user.verificationOtp !== cleanOtp) {
        return {
            status_code: 400,
            error: 'Mã OTP không chính xác. Vui lòng kiểm tra lại trong hòm thư của bạn.'
        };
    }

    // Single-use token: sau khi xác thực thành công lập tức vô hiệu hoá OTP và Token
    await user.update({
        isVerified: true,
        verificationToken: null,
        verificationOtp: null,
        verificationExpire: null,
        resendCount: 0
    });

    return {
        success: true,
        message: 'Xác thực tài khoản thành công! Bạn có thể đăng nhập ngay.'
    };
}

/**
 * Gửi lại email xác minh kèm chống spam / giới hạn số lần gửi
 */
async function resendVerification(email) {
    if (!email || typeof email !== 'string') {
        return {
            status_code: 400,
            error: 'Vui lòng cung cấp địa chỉ email.'
        };
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ where: { email: cleanEmail } });

    if (!user) {
        return {
            status_code: 404,
            error: 'Không tìm thấy tài khoản với email này.'
        };
    }

    if (user.isVerified) {
        return {
            status_code: 400,
            error: 'Tài khoản này đã được xác thực rồi. Vui lòng đăng nhập.'
        };
    }

    // 1. Kiểm tra khoá gửi lại (Resend Lockout nếu spam quá 5 lần)
    if (user.resendLockUntil && new Date(user.resendLockUntil) > new Date()) {
        const remainingMinutes = Math.ceil((new Date(user.resendLockUntil) - Date.now()) / (60 * 1000));
        return {
            status_code: 429,
            error: `Bạn đã yêu cầu gửi mã quá nhiều lần. Vui lòng đợi ${remainingMinutes} phút nữa trước khi thử lại.`
        };
    }

    // 2. Cooldown 60 giây giữa 2 lần gửi liên tiếp
    if (user.lastResendAt) {
        const timeSinceLastResend = Date.now() - new Date(user.lastResendAt).getTime();
        const COOLDOWN_MS = 60 * 1000;
        if (timeSinceLastResend < COOLDOWN_MS) {
            const secondsLeft = Math.ceil((COOLDOWN_MS - timeSinceLastResend) / 1000);
            return {
                status_code: 429,
                error: `Vui lòng đợi ${secondsLeft} giây trước khi yêu cầu gửi lại mã.`
            };
        }
    }

    // 3. Giới hạn số lần gửi trong chu kỳ (tối đa 5 lần)
    const currentAttempts = (user.resendCount || 0) + 1;
    if (currentAttempts > 5) {
        // Khoá 1 giờ nếu vượt quá 5 lần
        await user.update({
            resendLockUntil: new Date(Date.now() + 60 * 60 * 1000),
            resendCount: 0
        });
        return {
            status_code: 429,
            error: 'Bạn đã đạt giới hạn 5 lần gửi lại mã xác minh. Để tránh thư rác, tính năng gửi mã bị tạm khoá 1 giờ.'
        };
    }

    // 4. Sinh mã token & OTP mới
    const { token, hashedToken } = Token.TokenGeneration();
    const { otp, hashedOtp } = Token.OtpGeneration();

    // 5. Lưu token/OTP mới vào DB TRƯỚC khi gửi mail.
    //    Gửi mail trước rồi mới lưu DB tạo ra một khoảng thời gian mà link trong
    //    email không khớp với token đang lưu -> người dùng bấm link bị báo
    //    "không tồn tại". Lưu trước rồi gửi sau là thứ tự an toàn.
    const previous = {
        verificationToken: user.verificationToken,
        verificationOtp: user.verificationOtp,
        verificationExpire: user.verificationExpire,
        resendCount: user.resendCount,
        lastResendAt: user.lastResendAt
    };
    await user.update({
        verificationToken: hashedToken,
        verificationOtp: hashedOtp,
        verificationExpire: new Date(Date.now() + VERIFY_TTL_MINUTES * 60 * 1000),
        resendCount: currentAttempts,
        lastResendAt: new Date()
    });

    // 6. Gửi thư xác thực
    const mailResult = await SendVerification(cleanEmail, token, otp);
    if (!mailResult || !mailResult.success) {
        // Hoàn tác thay đổi để mã cũ (nếu còn hiệu lực) vẫn dùng được và
        // không bị trừ 1 lượt gửi lại mà thực tế không nhận được email.
        await user.update(previous);
        return {
            status_code: 400,
            error: mailResult?.error || 'Không thể gửi email xác thực lúc này. Vui lòng kiểm tra lại email.'
        };
    }

    const remainingSends = 5 - currentAttempts;

    return {
        success: true,
        message: `Đã gửi mã xác minh mới vào hộp thư ${cleanEmail}. (Còn ${remainingSends} lần yêu cầu gửi lại trong chu kỳ)`,
        remainingSends
    };
}

module.exports = {
    SendVerification,
    sendVerification,
    verifyEmail,
    verifyOtp,
    resendVerification,
    resolveBaseUrl,
    resolveBaseURL,
    resolveClientUrl,
    resolveClientURL,
    VERIFY_TTL_MINUTES
};
