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
