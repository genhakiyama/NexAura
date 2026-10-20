const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

function getSupabaseUrl() {
    const raw = process.env.SUPABASE_PROJECT_URL || process.env.SUPABASE_URL || '';
    if (raw.startsWith('http')) return raw;
    const match = raw.match(/postgres\.([a-z0-9]+)/i);
    return match ? `https://${match[1]}.supabase.co` : raw;
}

const supabaseUrl = getSupabaseUrl();
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!supabaseUrl) {
    console.warn('[supabase] Cảnh báo: Chưa cấu hình SUPABASE_URL');
}
if (!supabaseKey) {
    console.warn('[supabase] Cảnh báo: Chưa cấu hình SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
    }
});

const BUCKET_NAME = 'chat-images';

module.exports = {
    supabase,
    supabaseUrl,
    BUCKET_NAME,
};
