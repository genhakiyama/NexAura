require('dotenv').config();
const jwt = require('jsonwebtoken');
const { isTokenBlacklisted } = require('../Service/RefreshToken');

module.exports = async (req, res, next) => {
    const authHeader = req.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            code: 'NO_TOKEN',
            payload: {
                error: 'Thiếu Authorization Bearer token.'
            }
        });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({
            success: false,
            code: 'NO_TOKEN',
            payload: {
                error: 'Token không được để trống.'
            }
        });
    }

    let decodedToken;
    try {
        decodedToken = jwt.verify(token, process.env.SECRET_KEY || 'nexora-secret-salt-key-encryption');
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                code: 'TOKEN_EXPIRED',
                payload: {
                    error: 'Access token đã hết hạn.'
                }
            });
        }
        return res.status(401).json({
            success: false,
            code: 'INVALID_TOKEN',
            payload: {
                error: 'Access token không hợp lệ.'
            }
        });
    }

    if (!decodedToken || !decodedToken.userId) {
        return res.status(401).json({
            success: false,
            code: 'INVALID_TOKEN',
            payload: {
                error: 'Dữ liệu token không hợp lệ.'
            }
        });
    }

    // Kiểm tra Access Token JTI trong Blacklist (vô hiệu hóa tức thời khi logout / đổi pass)
    if (decodedToken.jti) {
        const blacklisted = await isTokenBlacklisted(decodedToken.jti);
        if (blacklisted) {
            return res.status(401).json({
                success: false,
                code: 'INVALID_TOKEN',
                payload: {
                    error: 'Token đã bị thu hồi (đăng xuất hoặc vô hiệu hóa).'
                }
            });
        }
    }

    req.userId = decodedToken.userId;
    req.username = decodedToken.username;
    req.role = decodedToken.role;
    req.tokenPayload = decodedToken;
    next();
};