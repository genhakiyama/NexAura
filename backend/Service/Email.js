require('dotenv').config();
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const User = require('../Models/User');
const Token = require('../UTIL/Token');

const mailError = require('../Errors/Email');

const transporter = nodemailer.createTransport({
    service : 'gmail' ,
    auth : {
        user : process.env.EMAIL_USER ,
        pass : process.env.EMAIL_PASSWORD
    }
});

// Prevent a rejected SMTP connection from becoming an uncaught exception
// (which would crash the whole process and take down every request).
transporter.on('error' , (err) => {
    console.error('[mail transport error]' , err.message);
});

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
    return configured || fallbackUrl || 'http://localhost:3000';
}

async function SendVerification(email , token) {
    const link = `${resolveBaseUrl()}/auth/verify-Email?token=${token}`;
    try {
        const info = await transporter.sendMail({
            from : `"Nexora Messenger" <${process.env.EMAIL_USER}>` ,
            to : email ,
            subject : "Xác thực tài khoản Nexora của bạn" ,
            html : `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
                    <div style="margin-bottom: 20px;">
                        <span style="font-weight: 800; font-size: 20px; letter-spacing: -0.02em; color: #0f172a;">NEXORA</span>
                    </div>
                    <h2 style="color: #0f172a; margin-top: 0; font-size: 20px;">Chào mừng bạn đến với Nexora!</h2>
                    <p style="color: #475569; font-size: 15px; line-height: 1.6;">
                        Cảm ơn bạn đã đăng ký tài khoản. Vui lòng bấm vào nút bên dưới để kích hoạt tài khoản của bạn:
                    </p>
                    <div style="margin: 28px 0;">
                        <a href="${link}" style="background: #111827; color: #ffffff; padding: 12px 26px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14.5px; display: inline-block;">
                            Xác thực tài khoản
                        </a>
                    </div>
                    <p style="color: #94a3b8; font-size: 12.5px; line-height: 1.5; border-top: 1px solid #f1f5f9; padding-top: 16px;">
                        Liên kết có hiệu lực trong 15 phút. Nếu bạn không yêu cầu tạo tài khoản, vui lòng bỏ qua thư này.
                    </p>
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
        console.error('[SendVerification failed]' , err.message);
        let errorMsg = 'Không thể gửi email xác thực lúc này. Vui lòng thử lại sau.';
        if (err.responseCode === 550 || err.message?.includes('5.1.1') || err.message?.includes('does not exist')) {
            errorMsg = 'Địa chỉ email này không tồn tại hoặc không thể nhận thư.';
        }
        return { success: false, error: errorMsg };
    }
}

async function verifyEmail(token) {
    if (!token || typeof token !== 'string') {
        return {
            error : 'Invalid verification link'
        };
    }
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');;
    const user = await User.findOne({
        where : {
            verificationToken : hashedToken
        }
    });
    
    if (!user) return {
        status_code : mailError.EmailNotFoundError.defaultStatusCode , 
        error : mailError.EmailNotFoundError.defaultMessage
    };

    if (!user.verificationToken) return {
        status_code : mailError.EmailAlreadyInUseError.defaultStatusCode , 
        error : mailError.EmailAlreadyInUseError.defaultMessage
    };

    if (user.verificationExpire <= new Date()) {
        return {
            status_code : mailError.EmailVerificationExpiredError.defaultStatusCode , 
            error : mailError.EmailVerificationExpiredError.defaultMessage
        };
    }

    await user.update({
        isVerified : true , 
        verificationToken : null , 
        verificationExpire : null
    });

    return {message : `User ${user.id} xax tuc email thanh cong`};
}

module.exports = {
    SendVerification,
    verifyEmail,
    resolveBaseUrl
};