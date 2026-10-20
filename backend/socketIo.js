let io;

module.exports = {
    init : httpServer => {
        const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173')
            .split(',')
            .map((origin) => origin.trim().replace(/\/+$/, ''))
            .filter(Boolean);

        io = require('socket.io')(httpServer, {
            cors: {
                origin: allowedOrigins,
                methods: ['GET', 'POST'],
                credentials: true
            }
        });
        return io;
    } , 
    getIO : () => {
        if (!io) {
            throw new Error('Socket.IO not initialized');
        }
        return io;
    }
};