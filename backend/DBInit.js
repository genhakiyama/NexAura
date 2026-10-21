const sequelize = require('./UTIL/Database');

// Schema sync is ALWAYS opt-in, on Vercel and locally.
//
// This project points at a single Supabase database, and `sync({ alter: true })`
// drops and rewrites columns to match the models. Running it against the shared
// production database once already removed Message.userId and
// Message.conversationId. Importing Sequelize models no longer mutates the
// schema on its own: set DB_SYNC=true (and DB_SYNC_ALTER=true to alter) when you
// deliberately want it against a scratch database.
const shouldSync = process.env.DB_SYNC === 'true';
const shouldAlter = process.env.DB_SYNC_ALTER === 'true';

let initializing = null;

/**
 * Connect once per process/function instance and reuse the same promise for
 * every concurrent request. A failed attempt clears the cache so the next
 * request can retry instead of being stuck on a rejected promise forever.
 */
function initDatabase() {
    if (initializing) return initializing;

    initializing = (async () => {
        await sequelize.authenticate();

        if (shouldSync) {
            await sequelize.sync(shouldAlter ? { alter: true } : {});
        }

        // Tự động bổ sung cột/bảng mới một cách an toàn (IF NOT EXISTS)
        // Tuyệt đối không dùng alter: true làm mất hoặc hỏng schema sản xuất
        try {
            await sequelize.query(`
                ALTER TABLE refresh_tokens 
                ADD COLUMN IF NOT EXISTS "sessionStartedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW();
            `);
            await sequelize.query(`
                CREATE TABLE IF NOT EXISTS token_blacklist (
                    id SERIAL PRIMARY KEY,
                    jti VARCHAR(64) NOT NULL UNIQUE,
                    "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
                    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
                );
            `);
        } catch (patchErr) {
            // Không chặn tiến trình nếu user Supabase không có quyền DDL
            console.warn('[DBInit safe schema check]', patchErr.message);
        }

        return sequelize;
    })().catch((err) => {
        initializing = null;
        throw err;
    });

    return initializing;
}

module.exports = {
    initDatabase,
    shouldSync,
    shouldAlter,
};
