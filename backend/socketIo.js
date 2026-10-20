const { corsOrigin } = require('./CORS');

let io;

module.exports = {
    init : httpServer => {
        io = require('socket.io')(httpServer, {
            cors: {
                origin: corsOrigin,
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