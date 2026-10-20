/**
 * One-time script: creates the "chat-images" bucket in your Supabase project.
 *
 * Run once:   node scripts/create-bucket.js
 *
 * The bucket is created as PUBLIC so image URLs work without authentication.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { STORAGE_BASE } = require('../Config/Supabase');
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

async function main() {
    if (!STORAGE_BASE) {
        console.error('❌  STORAGE_BASE is null — check SUPABASE_URL in .env');
        process.exit(1);
    }

    console.log(`Storage base: ${STORAGE_BASE}`);
    console.log('Creating bucket "chat-images"...\n');

    const res = await fetch(`${STORAGE_BASE}/bucket`, {
        method : 'POST',
        headers : {
            'Authorization' : `Bearer ${SERVICE_KEY}`,
            'Content-Type'  : 'application/json',
        },
        body : JSON.stringify({
            id     : 'chat-images',
            name   : 'chat-images',
            public : true,
            file_size_limit : 5 * 1024 * 1024,   // 5 MB
            allowed_mime_types : [
                'image/jpeg',
                'image/png',
                'image/gif',
                'image/webp',
            ],
        }),
    });

    const body = await res.json().catch(() => res.text());

    if (res.ok) {
        console.log('✅  Bucket created successfully!');
        console.log(body);
    } else if (res.status === 409 || (body?.message || '').includes('already exists')) {
        console.log('ℹ️  Bucket "chat-images" already exists — nothing to do.');
    } else {
        console.error(`❌  Failed (${res.status}):`, body);
        process.exit(1);
    }
}

main();
