const path = require('path');
// Ensure .env in backend directory is always loaded regardless of working directory
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');

function getSupabaseUrl() {
    const raw = process.env.SUPABASE_PROJECT_URL || process.env.SUPABASE_URL || '';
    if (raw.startsWith('http')) return raw;
    const match = raw.match(/postgres\.([a-z0-9]+)/i);
    return match ? `https://${match[1]}.supabase.co` : raw;
}

let _supabaseClient = null;

function getSupabase() {
    if (_supabaseClient) return _supabaseClient;

    const supabaseUrl = getSupabaseUrl();
    const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

    if (!supabaseUrl) {
        throw new Error('Chưa cấu hình SUPABASE_URL hoặc SUPABASE_PROJECT_URL trong .env');
    }
    if (!supabaseKey) {
        throw new Error('Chưa cấu hình SUPABASE_SERVICE_ROLE_KEY trong .env');
    }

    _supabaseClient = createClient(supabaseUrl, supabaseKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        }
    });

    return _supabaseClient;
}

// Transparent proxy to allow `supabase.storage...` calls with lazy initialization
const supabase = new Proxy({}, {
    get(target, prop) {
        const client = getSupabase();
        return client[prop];
    }
});

const BUCKET_NAME = 'chat-images';

module.exports = {
    supabase,
    getSupabase,
    getSupabaseUrl,
    BUCKET_NAME,
};
