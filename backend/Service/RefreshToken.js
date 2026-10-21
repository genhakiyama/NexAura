const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const RefreshToken = require('../Models/RefreshToken');
const TokenBlacklist = require('../Models/TokenBlacklist');
const User = require('../Models/User');
const { encryptUserId } = require('../UTIL/UserCrypto');
require('dotenv').config();

const SECRET_KEY = process.env.SECRET_KEY || 'nexora-secret-salt-key-encryption';
const REFRESH_EXPIRES_DAYS = 7;
const ABSOLUTE_SESSION_MAX_DAYS = 30; // Giới hạn tuyệt đối 30 ngày cho phiên trượt
const ACCESS_EXPIRES = '15m'; // 15 phút

/**
 * Băm token dạng thô bằng SHA-256 để lưu an toàn vào cơ sở dữ liệu
 */
function hashToken(rawToken) {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Tạo Access Token (JWT) ngắn hạn (15 phút) kèm `jti` ngẫu nhiên để hỗ trợ blacklist
 */
function generateAccessToken(user) {
    const jti = crypto.randomUUID();
    return jwt.sign({
        userId: user.id,
        encryptedUserId: encryptUserId(user.id),
        username: user.username,
        email: user.email,
        jti
    }, SECRET_KEY, { expiresIn: ACCESS_EXPIRES });
}

/**
 * Khởi tạo Refresh Token mới khi đăng nhập
 * - rawToken: gửi cho client (chỉ hiển thị 1 lần qua Cookie)
 * - tokenHash: lưu server-side
 * - sessionStartedAt: lưu thời điểm bắt đầu phiên để áp dụng mốc trượt tối đa 30 ngày
 */
async function createRefreshToken(userId) {
    const rawToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = hashToken(rawToken);
    const family = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

    await RefreshToken.create({
        userId,
        tokenHash,
        family,
        expiresAt,
        sessionStartedAt: now,
        isRevoked: false
    });

    // Dọn lười theo xác suất (2% cơ hội mỗi lần login)
    maybeLazyCleanup();

    return rawToken;
}

/**
 * Cơ chế Rotation cho Refresh Token:
 * 1. Kiểm tra tính hợp lệ & hết hạn
 * 2. Phát hiện tái sử dụng (Reuse Detection): nếu token đã bị revoked mà được gửi lại
 *    -> coi như token bị đánh cắp -> lập tức thu hồi toàn bộ Family!
 * 3. Kiểm tra giới hạn tuyệt đối 30 ngày (sessionStartedAt)
 * 4. Xóa/thu hồi token cũ, phát hành token mới trong cùng Family
 */
async function rotateRefreshToken(rawToken) {
    if (!rawToken || typeof rawToken !== 'string') {
        return { statusCode: 401, code: 'REFRESH_INVALID', error: 'Refresh token không được để trống.' };
    }

    const tokenHash = hashToken(rawToken);
    const record = await RefreshToken.findOne({ where: { tokenHash } });

    if (!record) {
        return { statusCode: 401, code: 'REFRESH_INVALID', error: 'Refresh token không tồn tại.' };
    }

    // 1. PHÁT HIỆN TÁI SỬ DỤNG (TOKEN THEFT REUSE DETECTION)
    if (record.isRevoked) {
        console.warn(`[SECURITY ALERT] Tái sử dụng Refresh Token bị phát hiện cho Family ${record.family}! Thu hồi toàn bộ Family.`);
        // Thu hồi toàn bộ token cùng Family để bảo vệ tài khoản
        await RefreshToken.update({ isRevoked: true }, { where: { family: record.family } });
        return {
            statusCode: 403,
            code: 'REFRESH_INVALID',
            error: 'Phát hiện tái sử dụng phiên đăng nhập bất thường! Toàn bộ phiên làm việc đã bị thu hồi vì lý do bảo mật.'
        };
    }

    const now = new Date();

    // 2. KIỂM TRA GIỚI HẠN TUYỆT ĐỐI 30 NGÀY CỦA PHIÊN (ABSOLUTE SESSION LIMIT)
    const sessionStart = record.sessionStartedAt ? new Date(record.sessionStartedAt) : new Date(record.createdAt);
    const maxAbsoluteExpire = new Date(sessionStart.getTime() + ABSOLUTE_SESSION_MAX_DAYS * 24 * 60 * 60 * 1000);
    if (now > maxAbsoluteExpire) {
        await record.update({ isRevoked: true });
        return {
            statusCode: 401,
            code: 'REFRESH_INVALID',
            error: 'Phiên đăng nhập đã đạt giới hạn tối đa 30 ngày. Vui lòng đăng nhập lại.'
        };
    }

    // 3. KIỂM TRA HẠN 7 NGÀY CỦA TOKEN
    if (now > new Date(record.expiresAt)) {
        await record.update({ isRevoked: true });
        return {
            statusCode: 401,
            code: 'REFRESH_INVALID',
            error: 'Refresh token đã hết hạn.'
        };
    }

    // 4. VÔ HIỆU HÓA TOKEN VỪA DÙNG (CHỈ DÙNG 1 LẦN)
    await record.update({ isRevoked: true });

    // 5. LẤY THÔNG TIN USER
    const user = await User.findByPk(record.userId);
    if (!user) {
        return { statusCode: 404, code: 'REFRESH_INVALID', error: 'Người dùng không còn tồn tại.' };
    }

    // 6. CẤP REFRESH TOKEN MỚI TRONG CÙNG FAMILY (GIỮ NGUYÊN sessionStartedAt)
    const newRawToken = crypto.randomBytes(40).toString('hex');
    const newTokenHash = hashToken(newRawToken);
    const newExpiresAt = new Date(now.getTime() + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

    await RefreshToken.create({
        userId: user.id,
        tokenHash: newTokenHash,
        family: record.family,
        expiresAt: newExpiresAt,
        sessionStartedAt: sessionStart,
        isRevoked: false
    });

    // 7. CẤP ACCESS TOKEN MỚI (15 PHÚT)
    const newAccessToken = generateAccessToken(user);

    // Dọn lười theo xác suất (2% cơ hội)
    maybeLazyCleanup();

    return {
        accessToken: newAccessToken,
        refreshToken: newRawToken,
        user: {
            id: encryptUserId(user.id),
            rawId: user.id,
            username: user.username,
            email: user.email
        }
    };
}

/**
 * Thu hồi Refresh Token khi đăng xuất 1 thiết bị
 */
async function revokeRefreshToken(rawToken) {
    if (!rawToken || typeof rawToken !== 'string') return;
    const tokenHash = hashToken(rawToken);
    await RefreshToken.update({ isRevoked: true }, { where: { tokenHash } });
}

/**
 * Đăng xuất tất cả thiết bị (thu hồi mọi Refresh Token của user)
 */
async function revokeAllUserTokens(userId) {
    if (!userId) return;
    await RefreshToken.update({ isRevoked: true }, { where: { userId } });
}

/**
 * Đưa jti của Access Token vào Blacklist (kèm thời điểm hết hạn của JWT)
 */
async function blacklistAccessToken(decodedToken) {
    if (!decodedToken || !decodedToken.jti || !decodedToken.exp) return;
    try {
        const expiresAt = new Date(decodedToken.exp * 1000);
        await TokenBlacklist.findOrCreate({
            where: { jti: decodedToken.jti },
            defaults: {
                jti: decodedToken.jti,
                expiresAt
            }
        });
    } catch (err) {
        console.error('[blacklistAccessToken error]', err.message);
    }
}

/**
 * Kiểm tra jti có nằm trong Blacklist hay không
 */
async function isTokenBlacklisted(jti) {
    if (!jti) return false;
    try {
        const found = await TokenBlacklist.findOne({
            where: {
                jti,
                expiresAt: {
                    [Op.gt]: new Date()
                }
            }
        });
        return !!found;
    } catch {
        return false;
    }
}

/**
 * Dọn dẹp token hết hạn trong database
 */
async function cleanupExpiredTokens() {
    try {
        const now = new Date();
        const deletedRefresh = await RefreshToken.destroy({
            where: {
                expiresAt: {
                    [Op.lt]: now
                }
            }
        });

        const deletedBlacklist = await TokenBlacklist.destroy({
            where: {
                expiresAt: {
                    [Op.lt]: now
                }
            }
        });

        return {
            success: true,
            deletedRefresh,
            deletedBlacklist
        };
    } catch (err) {
        console.error('[cleanupExpiredTokens error]', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Dọn lười theo xác suất (2% cơ hội để không làm chậm request chính)
 */
function maybeLazyCleanup() {
    if (Math.random() < 0.02) {
        cleanupExpiredTokens().catch(err => {
            console.error('[LazyCleanup error]', err.message);
        });
    }
}

module.exports = {
    generateAccessToken,
    createRefreshToken,
    rotateRefreshToken,
    revokeRefreshToken,
    revokeAllUserTokens,
    blacklistAccessToken,
    isTokenBlacklisted,
    cleanupExpiredTokens
};
