require('dotenv').config();
const jwt = require('jsonwebtoken');

const Authen = require('../Service/Auth');
const Email = require('../Service/Email');

let Token ;

async function Signup(req , res) {
    // express.json() leaves req.body undefined when the client sends no body at
    // all (or a Content-Type the parser ignores). Destructuring that threw a
    // TypeError and the browser only saw a generic 500.
    const {email , username , password } = req.body || {};
    try {
        const authen = await Authen.SignUp(email , username , password );
        if (authen.error){
             return res.status(authen.status_code || 400).json({
                success : false ,
                payload :{
                    message : authen.error
                }
            });
        }

        return res.status(200).json({
            success : true , 
            payload : {
                message : authen.message,
                needsVerification : authen.needsVerification,
                email : authen.email
            }
        });
    } catch (err) {
        console.error('[Signup error]' , err);
        return res.status(500).json({
            success : false ,
            payload : { message : 'Đã xảy ra lỗi máy chủ. Vui lòng thử lại.' }
        });
    }
};

const RefreshTokenService = require('../Service/RefreshToken');
const ticketStore = require('../Socket/TicketStore');
const { encryptUserId } = require('../UTIL/UserCrypto');

async function LogIn(req , res) {
    const {username , email , password} = req.body || {};

    try {
        const isCheck = await Authen.Login(email , username , password);

        if (isCheck.error) {
            return res.status(isCheck.status_code || 400).json({
                success : false , 
                payload : {
                    message : isCheck.error,
                    needsVerification : isCheck.needsVerification || false,
                    email : isCheck.email || null
                }
            });
        }

        const userId = isCheck.userId;

        // Generate 15-minute Access Token
        const accessToken = RefreshTokenService.generateAccessToken({
            id: userId,
            username,
            email
        });

        // Generate rotating Refresh Token (hashed in DB)
        const rawRefreshToken = await RefreshTokenService.createRefreshToken(userId);

        // Set HttpOnly, Secure, SameSite cookie
        res.cookie('refreshToken', rawRefreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        return res.status(200).json({
            sucess : true , 
            payload : {
                message : isCheck.message,
                token : accessToken,
                refreshToken : rawRefreshToken,
                userId : encryptUserId(userId),
                expiresIn : 900 // 15 mins
            }
        });
    } catch (err) {
        console.error('[Login error]' , err);
        return res.status(500).json({
            success : false ,
            payload : { message : 'Đã xảy ra lỗi máy chủ. Vui lòng thử lại.' }
        });
    }
}

async function RefreshAccessToken(req , res) {
    const rawRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    try {
        const result = await RefreshTokenService.rotateRefreshToken(rawRefreshToken);

        if (result.error) {
            res.clearCookie('refreshToken');
            return res.status(result.statusCode || 401).json({
                success: false,
                payload: { message: result.error }
            });
        }

        // Set updated refresh token cookie
        res.cookie('refreshToken', result.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        return res.status(200).json({
            success: true,
            payload: {
                token: result.accessToken,
                refreshToken: result.refreshToken,
                user: result.user,
                expiresIn: 900
            }
        });
    } catch (err) {
        console.error('[Refresh error]', err);
        return res.status(500).json({
            success: false,
            payload: { message: 'Lỗi làm mới phiên đăng nhập.' }
        });
    }
}

async function LogOut(req , res) {
    const rawRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    try {
        if (rawRefreshToken) {
            await RefreshTokenService.revokeRefreshToken(rawRefreshToken);
        }
        res.clearCookie('refreshToken');

        return res.status(200).json({
            success: true,
            payload: { message: 'Đăng xuất thành công.' }
        });
    } catch (err) {
        console.error('[Logout error]', err);
        res.clearCookie('refreshToken');
        return res.status(200).json({
            success: true,
            payload: { message: 'Đã hoàn tất đăng xuất.' }
        });
    }
}

async function GetWsTicket(req , res) {
    const userId = req.userId;
    const username = req.username;

    if (!userId) {
        return res.status(401).json({
            success: false,
            payload: { error: 'Chưa xác thực người dùng.' }
        });
    }

    try {
        const ticket = ticketStore.createTicket(userId, username);

        return res.status(200).json({
            success: true,
            payload: {
                ticket,
                expiresIn: 30 // 30 seconds TTL
            }
        });
    } catch (err) {
        console.error('[GetWsTicket error]', err);
        return res.status(500).json({
            success: false,
            payload: { error: 'Lỗi cấp vé kết nối WebSocket.' }
        });
    }
}

async function VerifyEmail(req , res) {
    const { token } = req.query;
    const isCheck = await Email.verifyEmail(token);
    const baseUrl = Email.resolveBaseUrl();

    // Nếu request đến từ trình duyệt người dùng click vào email
    const acceptsHtml = req.accepts('html') && !req.xhr && !req.headers.accept?.includes('application/json');

    if (isCheck.error) {
        if (acceptsHtml) {
            return res.status(isCheck.status_code || 400).send(`
                <!DOCTYPE html>
                <html lang="vi">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Xác thực không thành công | Nexora</title>
                    <style>
                        body { margin: 0; padding: 0; background: #0b0f19; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
                        .card { max-width: 440px; margin: 20px; padding: 36px 28px; background: #131b2e; border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 20px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.4); }
                        .icon-wrap { width: 68px; height: 68px; margin: 0 auto 20px; background: rgba(239, 68, 68, 0.15); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #ef4444; font-size: 32px; }
                        h1 { font-size: 22px; margin: 0 0 12px; font-weight: 700; color: #f87171; }
                        p { font-size: 14.5px; line-height: 1.6; color: #94a3b8; margin: 0 0 26px; }
                        .btn { display: inline-block; background: #3b82f6; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-weight: 600; font-size: 14.5px; transition: all 0.2s; }
                        .btn:hover { background: #2563eb; transform: translateY(-1px); }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <div class="icon-wrap">✕</div>
                        <h1>Xác thực không thành công</h1>
                        <p>${isCheck.error}</p>
                        <a href="${baseUrl}/login" class="btn">Đến trang Đăng nhập & Gửi lại mã</a>
                    </div>
                </body>
                </html>
            `);
        }

        return res.status(isCheck.status_code || 400).json({
            success : false , 
            payload : {
                message : isCheck.error
            }
        });
    }

    if (acceptsHtml) {
        return res.status(200).send(`
            <!DOCTYPE html>
            <html lang="vi">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Kích hoạt thành công | Nexora</title>
                <style>
                    body { margin: 0; padding: 0; background: #0b0f19; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
                    .card { max-width: 440px; margin: 20px; padding: 36px 28px; background: #131b2e; border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 20px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.4); }
                    .icon-wrap { width: 68px; height: 68px; margin: 0 auto 20px; background: rgba(16, 185, 129, 0.15); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #10b981; font-size: 32px; }
                    h1 { font-size: 22px; margin: 0 0 12px; font-weight: 700; color: #34d399; }
                    p { font-size: 14.5px; line-height: 1.6; color: #94a3b8; margin: 0 0 26px; }
                    .btn { display: inline-block; background: #10b981; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-weight: 600; font-size: 14.5px; transition: all 0.2s; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3); }
                    .btn:hover { background: #059669; transform: translateY(-1px); }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="icon-wrap">✓</div>
                    <h1>Kích hoạt tài khoản thành công!</h1>
                    <p>Địa chỉ email của bạn đã được xác thực hoàn tất. Bạn có thể đăng nhập ngay để kết nối và trò chuyện.</p>
                    <a href="${baseUrl}/login" class="btn">Đăng nhập vào Nexora</a>
                </div>
            </body>
            </html>
        `);
    }

    return res.status(200).json({
        success : true , 
        payload : {
            message : 'Xác thực Email thành công. Bạn có thể đăng nhập ngay!'
        }
    });
}

/**
 * Controller xác thực qua mã OTP 6 số
 */
async function VerifyOtp(req , res) {
    const { email, otp } = req.body || {};

    try {
        const result = await Email.verifyOtp(email, otp);
        if (result.error) {
            return res.status(result.status_code || 400).json({
                success: false,
                payload: { message: result.error }
            });
        }

        return res.status(200).json({
            success: true,
            payload: { message: result.message }
        });
    } catch (err) {
        console.error('[VerifyOtp error]', err);
        return res.status(500).json({
            success: false,
            payload: { message: 'Đã xảy ra lỗi máy chủ khi xác thực OTP.' }
        });
    }
}

/**
 * Controller gửi lại email xác thực (có Rate Limit & cooldown)
 */
async function ResendVerification(req , res) {
    const { email } = req.body || {};

    try {
        const result = await Email.resendVerification(email);
        if (result.error) {
            return res.status(result.status_code || 400).json({
                success: false,
                payload: { message: result.error }
            });
        }

        return res.status(200).json({
            success: true,
            payload: {
                message: result.message,
                remainingSends: result.remainingSends
            }
        });
    } catch (err) {
        console.error('[ResendVerification error]', err);
        return res.status(500).json({
            success: false,
            payload: { message: 'Đã xảy ra lỗi máy chủ khi gửi lại email.' }
        });
    }
}

module.exports = {
    Signup , 
    LogIn ,
    RefreshAccessToken ,
    LogOut ,
    GetWsTicket ,
    VerifyEmail,
    VerifyOtp,
    ResendVerification
};