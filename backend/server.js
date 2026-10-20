const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const http = require('http');
const app = require('./Server/app');
const sequelize = require('./UTIL/Database');

const registerHandlers = require('./Socket/SocketHandler');
const server = http.createServer(app);

const io = require('./socketIo').init(server);
registerHandlers(io);

const PORT = process.env.PORT || 3000;
const isDeployed = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
const shouldAlter = process.env.DB_SYNC_ALTER !== undefined
    ? process.env.DB_SYNC_ALTER === 'true'
    : !isDeployed;

async function start() {
    try {
        await sequelize.authenticate();
        console.log('[db] connected');

        // An unawaited sync({ alter: true }) used to reject in the background
        // and kill Node 22 on Render. Await it, and never run destructive
        // ALTERs on a deployed database unless DB_SYNC_ALTER=true is explicit.
        await sequelize.sync(shouldAlter ? { alter : true } : {});
        console.log(`[db] models synchronized (alter=${shouldAlter})`);
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