const fs = require('fs');
const path = require('path');
const { supabase, BUCKET_NAME } = require('../Config/Supabase');

const FILE_BUCKET_NAME = 'chat-files';

/**
 * Saves a file buffer locally to the uploads directory as a fallback.
 */
function saveLocally(file, conversationId, subfolder = '') {
    const localDir = path.join(__dirname, '..', 'uploads', `conv-${conversationId}`, subfolder);
    if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
    }
    const rawExt = path.extname(file.originalname || '').replace(/^\./, '').toLowerCase();
    const safeBaseName = path.basename(file.originalname || 'file', path.extname(file.originalname || ''))
        .replace(/[^a-zA-Z0-9_\-\.]/g, '_')
        .slice(0, 50) || 'file';
    const ext = rawExt || (file.mimetype ? file.mimetype.split('/')[1] : 'bin') || 'bin';
    const fileName = `${Date.now()}_${safeBaseName}.${ext}`;
    const fullPath = path.join(localDir, fileName);

    fs.writeFileSync(fullPath, file.buffer);
    const subpath = subfolder ? `${subfolder}/${fileName}` : fileName;
    return `/uploads/conv-${conversationId}/${subpath}`;
}

/**
 * Upload an image buffer to Supabase Storage (with automatic local fallback).
 */
async function uploadImage(file, conversationId) {
    if (!file || !file.buffer) {
        const err = new Error('Không có dữ liệu file để tải lên.');
        err.statusCode = 400;
        throw err;
    }

    const rawExt = path.extname(file.originalname || '').replace(/^\./, '').toLowerCase();
    const ext = rawExt || (file.mimetype ? file.mimetype.split('/')[1] : 'png') || 'png';
    const storagePath = `conv-${conversationId}/${Date.now()}.${ext}`;

    try {
        let { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(storagePath, file.buffer, {
                contentType: file.mimetype || 'image/png',
                upsert: false
            });

        if (error && (error.message?.includes('not found') || error.error === 'Bucket not found' || error.statusCode === '404' || error.statusCode === 404)) {
            const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
                public: true,
                fileSizeLimit: 10 * 1024 * 1024,
                allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
            });

            if (!createError || createError.message?.includes('already exists')) {
                const retry = await supabase.storage
                    .from(BUCKET_NAME)
                    .upload(storagePath, file.buffer, {
                        contentType: file.mimetype || 'image/png',
                        upsert: false
                    });
                data = retry.data;
                error = retry.error;
            }
        }

        if (!error) {
            const { data: publicUrlData } = supabase.storage
                .from(BUCKET_NAME)
                .getPublicUrl(storagePath);

            if (publicUrlData?.publicUrl) {
                return {
                    publicUrl: publicUrlData.publicUrl,
                    path: storagePath
                };
            }
        }
    } catch (supabaseErr) {
        console.warn('[Supabase Storage uploadImage] Fallback to local:', supabaseErr.message);
    }

    // Local fallback
    const localUrl = saveLocally(file, conversationId, 'images');
    return {
        publicUrl: localUrl,
        path: localUrl
    };
}

/**
 * Upload any general file buffer (PDF, documents, archives, audio, video, etc.)
 */
async function uploadFileToStorage(file, conversationId) {
    if (!file || !file.buffer) {
        const err = new Error('Không có dữ liệu file để tải lên.');
        err.statusCode = 400;
        throw err;
    }

    const rawExt = path.extname(file.originalname || '').replace(/^\./, '').toLowerCase();
    const safeBaseName = path.basename(file.originalname || 'file', path.extname(file.originalname || ''))
        .replace(/[^a-zA-Z0-9_\-\.]/g, '_')
        .slice(0, 50) || 'file';
    const ext = rawExt || 'bin';
    const storagePath = `conv-${conversationId}/${Date.now()}_${safeBaseName}.${ext}`;

    try {
        let { data, error } = await supabase.storage
            .from(FILE_BUCKET_NAME)
            .upload(storagePath, file.buffer, {
                contentType: file.mimetype || 'application/octet-stream',
                upsert: false
            });

        if (error && (error.message?.includes('not found') || error.error === 'Bucket not found' || error.statusCode === '404' || error.statusCode === 404)) {
            const { error: createError } = await supabase.storage.createBucket(FILE_BUCKET_NAME, {
                public: true,
                fileSizeLimit: 25 * 1024 * 1024
            });

            if (!createError || createError.message?.includes('already exists')) {
                const retry = await supabase.storage
                    .from(FILE_BUCKET_NAME)
                    .upload(storagePath, file.buffer, {
                        contentType: file.mimetype || 'application/octet-stream',
                        upsert: false
                    });
                data = retry.data;
                error = retry.error;
            }
        }

        if (!error) {
            const { data: publicUrlData } = supabase.storage
                .from(FILE_BUCKET_NAME)
                .getPublicUrl(storagePath);

            if (publicUrlData?.publicUrl) {
                return {
                    publicUrl: publicUrlData.publicUrl,
                    path: storagePath
                };
            }
        }
    } catch (supabaseErr) {
        console.warn('[Supabase Storage uploadFile] Fallback to local:', supabaseErr.message);
    }

    // Local fallback
    const localUrl = saveLocally(file, conversationId, 'files');
    return {
        publicUrl: localUrl,
        path: localUrl
    };
}

module.exports = {
    uploadImage,
    uploadFileToStorage,
    BUCKET_NAME,
    FILE_BUCKET_NAME
};
