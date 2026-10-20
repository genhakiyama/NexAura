/**
 * One-time script: creates the "chat-images" public bucket in your Supabase project.
 *
 * Run:  node scripts/create-bucket.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { supabase, BUCKET_NAME } = require('../Config/Supabase');

async function main() {
    console.log(`Kiểm tra / tạo bucket "${BUCKET_NAME}" trên Supabase Storage...\n`);

    try {
        const { data: buckets, error: listError } = await supabase.storage.listBuckets();

        if (listError) {
            console.error('❌ Lỗi khi kết nối Supabase Storage:', listError.message);
            console.error('👉 Kiểm tra lại SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY trong file .env');
            process.exit(1);
        }

        const exists = (buckets || []).some((b) => b.name === BUCKET_NAME || b.id === BUCKET_NAME);
        if (exists) {
            console.log(`ℹ️  Bucket "${BUCKET_NAME}" đã tồn tại trên Supabase — sẵn sàng sử dụng.`);
            process.exit(0);
        }

        const { data, error } = await supabase.storage.createBucket(BUCKET_NAME, {
            public: true,
            fileSizeLimit: 4 * 1024 * 1024, // 4MB
            allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
        });

        if (error) {
            console.error('❌ Không thể tạo bucket:', error.message);
            process.exit(1);
        }

        console.log(`✅  Đã tạo bucket "${BUCKET_NAME}" ở chế độ PUBLIC thành công!`);
        console.log(data);
    } catch (e) {
        console.error('❌ Lỗi ngoại lệ:', e.message);
        process.exit(1);
    }
}

main();
