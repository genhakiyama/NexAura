const path = require('path');
const { supabase, BUCKET_NAME } = require('../Config/Supabase');

/**
 * Upload an image buffer to Supabase Storage.
 *
 * Requirements:
 * - Stored in bucket "chat-images"
 * - Path format: conv-${conversationId}/${Date.now()}.${ext}
 * - contentType = file.mimetype
 * - upsert: false
 * - Returns publicUrl from getPublicUrl(path)
 *
 * @param {Object} file            Multer file object (file.buffer, file.originalname, file.mimetype)
 * @param {number} conversationId  Target conversation ID
 * @returns {Promise<{ publicUrl: string, path: string }>}
 */
async function uploadImage(file, conversationId) {
    if (!file || !file.buffer) {
        const err = new Error('Không có dữ liệu file để tải lên.');
        err.statusCode = 400;
        throw err;
    }

    // Determine extension safely without original special characters
    const rawExt = path.extname(file.originalname || '').replace(/^\./, '').toLowerCase();
    const ext = rawExt || (file.mimetype ? file.mimetype.split('/')[1] : 'png') || 'png';

    // Path format: conv-${conversationId}/${Date.now()}.${ext}
    const storagePath = `conv-${conversationId}/${Date.now()}.${ext}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(storagePath, file.buffer, {
            contentType: file.mimetype || 'image/png',
            upsert: false
        });

    if (error) {
        console.error('[Supabase Storage Upload Error]:', {
            message: error.message,
            statusCode: error.statusCode,
            error: error.error,
            path: storagePath
        });
        throw new Error(`Supabase Storage: ${error.message || 'Lỗi tải ảnh lên cloud'}`);
    }

    // Retrieve public URL
    const { data: publicUrlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(storagePath);

    const publicUrl = publicUrlData?.publicUrl;

    return {
        publicUrl,
        path: storagePath
    };
}

module.exports = {
    uploadImage,
    BUCKET_NAME
};
