const sharp = require('sharp');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

// Target directory for local file storage: backend/uploads
const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');

/**
 * Compress an image buffer using Sharp and save it to the local uploads directory.
 *
 * Flow:
 * 1. Ensure conversation folder exists: backend/uploads/conv-<conversationId>
 * 2. Process image with Sharp:
 *    - Auto-rotate according to EXIF orientation
 *    - Limit maximum width/height to 1600px (withoutEnlargement keeps smaller images intact)
 *    - Convert and compress to modern WebP format at 80% quality (cuts file size by ~70-85%)
 * 3. Write compressed file to disk with unique random hex name
 * 4. Return relative static URL: /uploads/conv-<conversationId>/<filename>.webp
 *
 * @param {Buffer} buffer          Raw file buffer from Multer
 * @param {string} originalName    Original filename from client
 * @param {string} mimetype        MIME type
 * @param {number} conversationId  ID of the conversation
 * @returns {Promise<string>}      Relative URL path to the saved compressed image
 */
async function uploadImage(buffer, originalName, mimetype, conversationId) {
    const convDir = path.join(UPLOAD_ROOT, `conv-${conversationId}`);
    await fs.mkdir(convDir, { recursive: true });

    const filename = `${crypto.randomBytes(16).toString('hex')}.webp`;
    const targetPath = path.join(convDir, filename);

    // Compress & convert to WebP
    await sharp(buffer)
        .rotate() // auto-orient based on EXIF tag
        .resize({
            width: 1600,
            height: 1600,
            fit: 'inside',
            withoutEnlargement: true
        })
        .webp({
            quality: 80,
            effort: 4
        })
        .toFile(targetPath);

    return `/uploads/conv-${conversationId}/${filename}`;
}

module.exports = {
    uploadImage,
    UPLOAD_ROOT
};
