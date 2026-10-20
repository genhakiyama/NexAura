// Local development entrypoint (npm start) — and a safe fallback for Vercel.
//
// Vercel normally runs index.js, but package.json sets "main": "server.js", and
// Vercel's Node builder falls back to that `main` file when it cannot match an
// entrypoint by name. If this file had no export, Vercel would abort with:
//   No exports found in module "/var/task/backend/server.js"
//   Did you forget to export a function or a server?
//
// So this file now always exports the Express app, and only starts the HTTP
// listener (plus Socket.IO) when it is NOT running on Vercel. Vercel owns the
// listener there, and a Function WebSocket is pinned to one instance and capped
// at 300s on Hobby, so realtime falls back to the frontend's polling sync.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Vercel's Express builder only recognises a file whose own source imports
// express (packages/express/src/build.ts in vercel/vercel).
const express = require('express');
void express;

const http = require('http');
const app = require('./Server/app');
const sequelize = require('./UTIL/Database');
const { initDatabase, shouldSync, shouldAlter } = require('./DBInit');

const isVercel = Boolean(process.env.VERCEL);
const PORT = process.env.PORT || 3000;

// Always export the app so importing this module on Vercel never fails.
module.exports = app;

// Only build the socket server and listen outside Vercel. `require` calls stay
// inside this block so a Vercel cold start never loads Socket.IO at all.
if (!isVercel) {
    const registerHandlers = require('./Socket/SocketHandler');
    const server = http.createServer(app);
    const io = require('./socketIo').init(server);
    registerHandlers(io);

    async function start() {
        try {
            await initDatabase();
            console.log('[db] connected');

            // An unawaited sync({ alter: true }) used to reject in the background
            // and kill Node 22. The schema step now lives in DBInit: it runs for
            // local development and stays disabled on Vercel unless DB_SYNC=true.
            console.log(
                shouldSync
                    ? `[db] models synchronized (alter=${shouldAlter})`
                    : '[db] schema sync skipped'
            );
        } catch (err) {
            console.error('[fatal] database initialization failed:' , err.message);
            process.exit(1);
        }

        server.listen(PORT , () => {
            console.log(`Nexora server listening on port ${PORT}`);
        });
    }

    start();

    async function shutdown(signal) {
        console.log(`[server] ${signal} received, shutting down`);
        server.close(async () => {
            await sequelize.close();
            process.exit(0);
        });
    }

    process.on('SIGTERM' , () => shutdown('SIGTERM'));
    process.on('SIGINT' , () => shutdown('SIGINT'));
}
