const multer = require('multer');

// Memory storage — the file stays in RAM as a Buffer and is uploaded straight
// to Supabase Storage without touching the local filesystem.
const storage = multer.memoryStorage();

// Only accept common image types.
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_SIZE_MB   = 4; // Giới hạn body Vercel function ~4.5MB

const upload = multer({
    storage,
    limits : { fileSize : MAX_SIZE_MB * 1024 * 1024 },
    fileFilter(req, file, cb) {
        if (ALLOWED_TYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            const err = new Error('Chỉ chấp nhận ảnh JPEG, PNG, GIF, hoặc WebP.');
            err.code = 'INVALID_FILE_TYPE';
            err.status = 422;
            cb(err, false);
        }
    },
});

module.exports = upload;
