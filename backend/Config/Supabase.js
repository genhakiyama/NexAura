require('dotenv').config();

/**
 * Lightweight Supabase Storage client using only fetch (no SDK needed).
 *
 * Reads the same SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY already in .env.
 * The project ref is extracted from the connection string so no extra env vars
 * are required.
 */

// Extract the project ref from the Supabase connection URL.
// Format: postgresql://postgres.<ref>:...@...
function extractProjectRef(url) {
    const match = (url || '').match(/postgres\.([a-z0-9]+)/i);
    return match ? match[1] : null;
}

const PROJECT_REF = extractProjectRef(process.env.SUPABASE_URL);
const SERVICE_KEY  = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!PROJECT_REF) {
    console.warn('[supabase] could not extract project ref from SUPABASE_URL');
}
if (!SERVICE_KEY) {
    console.warn('[supabase] SUPABASE_SERVICE_ROLE_KEY is missing');
}

const STORAGE_BASE = PROJECT_REF
    ? `https://${PROJECT_REF}.supabase.co/storage/v1`
    : null;

const BUCKET = 'chat-images';

/**
 * Upload a buffer to Supabase Storage and return its public URL.
 *
 * @param {Buffer}  buffer      File contents
 * @param {string}  fileName    Destination path inside the bucket (e.g. "conv-5/abc.png")
 * @param {string}  contentType MIME type
 * @returns {Promise<string>}   Public URL of the uploaded file
 */
async function uploadToStorage(buffer, fileName, contentType) {
    if (!STORAGE_BASE) {
        throw new Error('Supabase Storage is not configured (missing project ref).');
    }

    const url = `${STORAGE_BASE}/object/${BUCKET}/${fileName}`;

    const res = await fetch(url, {
        method : 'POST',
        headers : {
            'Authorization'  : `Bearer ${SERVICE_KEY}`,
            'Content-Type'   : contentType,
            'x-upsert'       : 'true',   // overwrite if same name
        },
        body : buffer,
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Supabase upload failed (${res.status}): ${body}`);
    }

    // Public URL (bucket must have public access enabled)
    return `${STORAGE_BASE}/object/public/${BUCKET}/${fileName}`;
}

module.exports = {
    BUCKET,
    STORAGE_BASE,
    uploadToStorage,
};
