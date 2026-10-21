require('dotenv').config();
const jwt = require('jsonwebtoken');
const ticketStore = require('./TicketStore');
const { isAllowedOrigin } = require('../CORS');
const { wsRateLimiter } = require('../Middleware/rateLimiter');
const ConverMem = require('../Models/ConversationMembers');
const { decryptChatId } = require('../UTIL/ChatCrypto');
const registerNotification = require('./Notification');

const { userConnected, userDisconnected } = require('./Presence');
const { encryptUserId } = require('../UTIL/UserCrypto');

module.exports = (io) => {
  // Authentication & Origin verification middleware
  io.use(async (socket, next) => {
    // 1. Strict Origin Check
    const origin = socket.handshake.headers.origin;
    if (origin && !isAllowedOrigin(origin)) {
      console.warn(`[Socket auth rejected] Unauthorized origin: ${origin}`);
      return next(new Error('Authentication error: Origin not allowed'));
    }

    // 2. Single-use Ticket verification (Primary secure authentication)
    const ticket = socket.handshake.auth?.ticket || socket.handshake.query?.ticket;

    if (ticket) {
      const ticketData = ticketStore.consumeTicket(ticket);
      if (!ticketData) {
        return next(new Error('Authentication error: Invalid or expired WebSocket ticket'));
      }
      socket.userId = ticketData.userId;
      socket.username = ticketData.username;
      return next();
    }

    // 3. Backward-compatible JWT fallback (e.g. for existing clients or tests)
    let token = socket.handshake.auth?.token;
    if (!token && socket.handshake.headers.authorization) {
      token = socket.handshake.headers.authorization;
    }

    if (!token) {
      return next(new Error('Authentication error: Missing ticket or token'));
    }

    try {
      const decodedToken = jwt.verify(token, process.env.SECRET_KEY);
      socket.userId = decodedToken.userId;
      socket.username = decodedToken.username;
      next();
    } catch (err) {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', (client) => {
    const userId = client.userId;
    const username = client.username;
    client.join(`user:${userId}`);

    // Update presence
    const isFirstConnection = userConnected(userId, client.id);
    if (isFirstConnection) {
      // Broadcast online status to any listeners
      io.emit('user_presence_change', {
        userId: encryptUserId(userId),
        rawUserId: userId,
        status: 'online'
      });
    }

    registerNotification(io, client);

    // Apply per-user event rate limiting middleware
    const checkRateLimit = () => {
      if (!wsRateLimiter.allow(userId)) {
        client.emit('rate_limit_exceeded', {
          message: 'Thao tác quá nhanh. Vui lòng chậm lại một chút.'
        });
        return false;
      }
      return true;
    };

    // RBAC: Verify room membership before joining conversation socket room
    client.on('join_room', async (conversationId) => {
      if (!checkRateLimit()) return;
      if (!conversationId) return;

      const realId = decryptChatId(conversationId);
      if (!realId) return;

      try {
        const member = await ConverMem.findOne({
          where: { userId, conversationId: realId, status: 'approved' }
        });

        if (!member) {
          client.emit('room_error', {
            conversationId,
            message: 'Bạn không có quyền tham gia phòng trò chuyện này.'
          });
          return;
        }

        client.join(`conversation:${conversationId}`);
        client.join(`conversation:${realId}`);
      } catch (err) {
        console.error('[join_room error]', err);
      }
    });

    client.on('leave_room', (conversationId) => {
      if (!checkRateLimit()) return;
      if (!conversationId) return;
      client.leave(`conversation:${conversationId}`);
      const realId = decryptChatId(conversationId);
      if (realId) client.leave(`conversation:${realId}`);
    });

    client.on('disconnect', () => {
      const isCompletelyOffline = userDisconnected(userId, client.id);
      if (isCompletelyOffline) {
        io.emit('user_presence_change', {
          userId: encryptUserId(userId),
          rawUserId: userId,
          status: 'offline',
          lastSeen: new Date().toISOString()
        });
      }
    });
  });
};