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
                message : authen.message
            }
        })
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

        if (isCheck.error) return res.status(isCheck.status_code || 400).json({
            sucess : false , 
            payload : {
                message : isCheck.error
            }
        });

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
    const {token} = req.query;
    const isCheck = await Email.verifyEmail(token);

    if (isCheck.error){
        return res.status(isCheck.status_code || 400).json({
            success : false , 
            payload : {
                message : isCheck.error
            }
        });
    }

    return res.status(200).json({
        sucess : true , 
        payload : {
            message : 'Xac thuc Email thanh cong'
        }
    });
}

module.exports = {
    Signup , 
    LogIn ,
    RefreshAccessToken ,
    LogOut ,
    GetWsTicket ,
    VerifyEmail
};