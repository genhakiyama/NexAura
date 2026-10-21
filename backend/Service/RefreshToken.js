const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const RefreshToken = require('../Models/RefreshToken');
const User = require('../Models/User');
const { encryptUserId } = require('../UTIL/UserCrypto');
require('dotenv').config();

const SECRET_KEY = process.env.SECRET_KEY || 'nexora-secret-salt-key-encryption';
const REFRESH_EXPIRES_DAYS = 7;
const ACCESS_EXPIRES = '15m'; // 15 phút theo chuẩn bảo mật ngắn hạn

/**
 * Hash a raw token string with SHA-256 for safe storage in the database.
 */
function hashToken(rawToken) {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Generate a short-lived Access Token (15 minutes).
 */
function generateAccessToken(user) {
    return jwt.sign({
        userId: user.id,
        encryptedUserId: encryptUserId(user.id),
        username: user.username,
        email: user.email
    }, SECRET_KEY, { expiresIn: ACCESS_EXPIRES });
}

/**
 * Create a new Refresh Token family and record in the database.
 * Returns the raw token string (only shown once to the client).
 */
async function createRefreshToken(userId) {
    const rawToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = hashToken(rawToken);
    const family = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

    await RefreshToken.create({
        userId,
        tokenHash,
        family,
        expiresAt,
        isRevoked: false
    });

    return rawToken;
}

/**
 * Rotate a refresh token:
 * 1. Validate the current token.
 * 2. If already revoked, DETECT TOKEN THEFT -> revoke the entire family immediately.
 * 3. Invalidate the old token and generate a fresh Access Token + Refresh Token in the same family.
 */
async function rotateRefreshToken(rawToken) {
    if (!rawToken || typeof rawToken !== 'string') {
        return { statusCode: 400, error: 'Refresh token không được để trống.' };
    }

    const tokenHash = hashToken(rawToken);
    const record = await RefreshToken.findOne({ where: { tokenHash } });

    if (!record) {
        return { statusCode: 401, error: 'Refresh token không hợp lệ hoặc đã hết hạn.' };
    }

    // Reuse Detection: If an already-revoked token is used again, someone stole it!
    if (record.isRevoked) {
        console.warn(`[SECURITY ALERT] Refresh token reuse detected for family ${record.family}! Revoking entire family.`);
        await RefreshToken.update({ isRevoked: true }, { where: { family: record.family } });
        return {
            statusCode: 403,
            error: 'Phát hiện tái sử dụng phiên đăng nhập bất thường! Toàn bộ phiên làm việc của bạn đã bị vô hiệu hoá vì lý do an toàn.'
        };
    }

    // Check expiration
    if (new Date() > record.expiresAt) {
        await record.update({ isRevoked: true });
        return { statusCode: 401, error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' };
    }

    // Step 1: Revoke the used token immediately
    await record.update({ isRevoked: true });

    // Step 2: Fetch user
    const user = await User.findByPk(record.userId);
    if (!user) {
        return { statusCode: 404, error: 'Người dùng không tồn tại.' };
    }

    // Step 3: Issue new tokens under the SAME family
    const newRawToken = crypto.randomBytes(40).toString('hex');
    const newTokenHash = hashToken(newRawToken);
    const newExpiresAt = new Date(Date.now() + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

    await RefreshToken.create({
        userId: user.id,
        tokenHash: newTokenHash,
        family: record.family, // keep family for reuse tracking
        expiresAt: newExpiresAt,
        isRevoked: false
    });

    const newAccessToken = generateAccessToken(user);

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
 * Revoke a refresh token on user logout.
 */
async function revokeRefreshToken(rawToken) {
    if (!rawToken || typeof rawToken !== 'string') return;
    const tokenHash = hashToken(rawToken);
    await RefreshToken.update({ isRevoked: true }, { where: { tokenHash } });
}

module.exports = {
    generateAccessToken,
    createRefreshToken,
    rotateRefreshToken,
    revokeRefreshToken
};
