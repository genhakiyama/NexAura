const sequelize = require('./UTIL/Database');

// Vercel runs each cold start in a fresh function instance, so schema sync
// must stay opt-in there. Local `nodemon server.js` keeps the previous
// behaviour (sync + alter) because that is the development database.
const isServerless = Boolean(process.env.VERCEL);
const shouldSync = process.env.DB_SYNC !== undefined
    ? process.env.DB_SYNC === 'true'
    : !isServerless;
const shouldAlter = process.env.DB_SYNC_ALTER !== undefined
    ? process.env.DB_SYNC_ALTER === 'true'
    : !isServerless;

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
