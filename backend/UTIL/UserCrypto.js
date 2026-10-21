const crypto = require('crypto');
require('dotenv').config();

// Derive a static 32-byte key from SECRET_KEY
const SECRET = process.env.SECRET_KEY || 'nexora-secret-salt-key-encryption';
const CIPHER_KEY = crypto.createHash('sha256').update(SECRET).digest();

/**
 * Encrypt a numeric User ID into a secure, URL-safe, unguessable string.
 * Format: u_<iv_base64url>.<ciphertext_base64url>.<auth_tag_base64url>
 *
 * @param {number|string} id 
 * @returns {string|null}
 */
function encryptUserId(id) {
    if (id === null || id === undefined || id === '') return null;
    const num = Number(id);
    if (!Number.isInteger(num) || num <= 0) return null;

    // Deterministic 12-byte IV for the same user ID so client references stay consistent
    const iv = crypto.createHmac('sha256', CIPHER_KEY).update(`user_${num}`).digest().subarray(0, 12);
    const cipher = crypto.createCipheriv('aes-256-gcm', CIPHER_KEY, iv);
    const encrypted = Buffer.concat([cipher.update(String(num), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return 'u_' + [
        iv.toString('base64url'),
        encrypted.toString('base64url'),
        tag.toString('base64url')
    ].join('.');
}

/**
 * Decrypt an encrypted User ID back to its numeric integer ID.
 * Supports:
 * - Encrypted format: "u_..."
 * - Plain numeric integer (for backward compatibility during migration)
 *
 * @param {string|number} value
 * @returns {number|null} Original integer ID or null if invalid
 */
function decryptUserId(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') {
        return Number.isInteger(value) && value > 0 ? value : null;
    }

    const str = String(value).trim();
    // Allow pure numeric string for backwards compatibility
    if (/^\d+$/.test(str)) {
        const num = Number(str);
        return Number.isInteger(num) && num > 0 ? num : null;
    }

    if (!str.startsWith('u_')) return null;

    try {
        const parts = str.slice(2).split('.');
        if (parts.length !== 3) return null;

        const [ivB64, encB64, tagB64] = parts;
        const iv = Buffer.from(ivB64, 'base64url');
        const enc = Buffer.from(encB64, 'base64url');
        const tag = Buffer.from(tagB64, 'base64url');

        const decipher = crypto.createDecipheriv('aes-256-gcm', CIPHER_KEY, iv);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
        const num = Number(decrypted);

        return Number.isInteger(num) && num > 0 ? num : null;
    } catch {
        return null;
    }
}

module.exports = {
    encryptUserId,
    decryptUserId
};
