const crypto = require('crypto');
const path   = require('path');
const { uploadToStorage } = require('../Config/Supabase');

/**
 * Upload an image buffer to Supabase Storage.
 *
 * Files are stored under `conv-<conversationId>/` so a future clean-up or
 * per-conversation gallery is simple. The filename is a random hex string to
 * avoid collisions and information leakage.
 *
 * @param {Buffer}  buffer          Raw file bytes from multer
 * @param {string}  originalName    The name the user's browser sent
 * @param {string}  mimetype        MIME type (e.g. "image/png")
 * @param {number}  conversationId  Target conversation
 * @returns {Promise<string>}       Public URL of the uploaded image
 */
async function uploadImage(buffer, originalName, mimetype, conversationId) {
    const ext  = path.extname(originalName || '').toLowerCase() || '.png';
    const name = `${crypto.randomBytes(16).toString('hex')}${ext}`;
    const dest = `conv-${conversationId}/${name}`;

    return uploadToStorage(buffer, dest, mimetype);
}

module.exports = { uploadImage };
