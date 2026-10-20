const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const http = require('http');
const app = require('./Server/app');
const sequelize = require('./UTIL/Database');
const { initDatabase, shouldSync, shouldAlter } = require('./DBInit');

const registerHandlers = require('./Socket/SocketHandler');
const server = http.createServer(app);

const io = require('./socketIo').init(server);
registerHandlers(io);

const PORT = process.env.PORT || 3000;

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