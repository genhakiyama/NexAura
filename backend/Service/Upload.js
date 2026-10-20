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
    let { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(storagePath, file.buffer, {
            contentType: file.mimetype || 'image/png',
            upsert: false
        });

    // Nếu gặp lỗi Bucket not found, tự động khởi tạo bucket "chat-images" (PUBLIC) và thử lại
    if (error && (error.message?.includes('not found') || error.error === 'Bucket not found' || error.statusCode === '404' || error.statusCode === 404)) {
        console.warn(`[Supabase Storage] Bucket "${BUCKET_NAME}" chưa tồn tại. Đang tự động tạo...`);
        const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
            public: true,
            fileSizeLimit: 4 * 1024 * 1024,
            allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
        });

        if (!createError || createError.message?.includes('already exists')) {
            console.log(`[Supabase Storage] Đã tự động tạo bucket "${BUCKET_NAME}" thành công! Đang thử tải lại...`);
            const retry = await supabase.storage
                .from(BUCKET_NAME)
                .upload(storagePath, file.buffer, {
                    contentType: file.mimetype || 'image/png',
                    upsert: false
                });
            data = retry.data;
            error = retry.error;
        } else {
            console.error('[Supabase Storage] Tự động tạo bucket thất bại:', createError);
        }
    }

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
