const multer = require('multer');
const path = require('path');

// Memory storage — the file stays in RAM as a Buffer and is uploaded straight
// to Supabase Storage or saved to local uploads directory without touching local temp.
const storage = multer.memoryStorage();

// Only accept common image types.
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_SIZE_MB = 10;

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

// General file upload (documents, PDFs, archives, audio, video, code, etc.)
// Nâng cấp hỗ trợ tải lên video và tệp đính kèm với dung lượng tối đa 200MB
const MAX_FILE_SIZE_MB = 200; // 200 MB max for video and files
const uploadAnyFile = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
    fileFilter(req, file, cb) {
        const dangerousExts = ['.exe', '.bat', '.cmd', '.sh', '.msi', '.vbs', '.scr', '.pif'];
        const ext = path.extname(file.originalname || '').toLowerCase();
        if (dangerousExts.includes(ext)) {
            const err = new Error('Vì lý do bảo mật, không cho phép gửi tệp thực thi (.exe, .bat, .sh...).');
            err.code = 'DISALLOWED_FILE_TYPE';
            err.status = 422;
            return cb(err, false);
        }
        cb(null, true);
    }
});

module.exports = upload;
module.exports.upload = upload;
module.exports.uploadAnyFile = uploadAnyFile;
