require('dotenv').config();
const jwt = require('jsonwebtoken');

const registerNotification = require('./Notification');

module.exports = (io) => {
  io.use((socket , next) => {
    var token = socket.handshake.auth?.token;

    if (!token &&  socket.handshake.headers.authorization) {
      token = socket.handshake.headers.authorization;
    }

    if (!token) {
      return next(new Error("Authentication error: Missing token"));
    }

    try {
      const decodedToken = jwt.verify(token, process.env.SECRET_KEY);
      socket.userId = decodedToken.userId;
      socket.username = decodedToken.username;

      next();
    } catch (err) {
      return next(new Error("Invalid token"));
    }
  });

  io.on('connection', (client) => {
    const userId = client.userId;
    const username = client.username;
    client.join(`user:${userId}`);

    registerNotification(io , client);

    client.on('join_room' , (conversationId) => {
      if (!conversationId) return;
      client.join(`conversation:${conversationId}`);
    });

    client.on('leave_room' , (conversationId) => {
      if (!conversationId) return;
      client.leave(`conversation:${conversationId}`);
    });

    client.on('disconnect' , () => {
        console.log(`User ${userId} disconnected`);
    });
  });
};