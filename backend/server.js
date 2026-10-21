/**
 * ============================================================
 * NEXORA LOCAL DEVELOPMENT SERVER
 * ============================================================
 * Khởi chạy backend đầy đủ bao gồm:
 * 1. Express HTTP REST API
 * 2. Socket.IO Realtime Server (Presence, Notifications, Messages)
 * 3. PostgreSQL Database Connection (với tự động đồng bộ bảng mới)
 * ============================================================
 */

const path = require('path');
const http = require('http');

// Load environment variables from backend/.env
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = require('./Server/app');
const { initDatabase } = require('./DBInit');
const socketIo = require('./socketIo');
const registerSocketHandlers = require('./Socket/SocketHandler');

// Models to ensure tables exist
const RefreshToken = require('./Models/RefreshToken');
const TokenBlacklist = require('./Models/TokenBlacklist');
const Friendship = require('./Models/Friendship');
const Post = require('./Models/Post');
const PostEditor = require('./Models/PostEditor');
const Comment = require('./Models/Comment');
const Reaction = require('./Models/Reaction');
const SocialNotification = require('./Models/SocialNotification');
const { startUserCleanupCron } = require('./Cron/UserCleanup');

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
    console.log('------------------------------------------------------------');
    console.log('🚀 Đang khởi động Nexora Local Server...');
    console.log('------------------------------------------------------------');

    try {
        // 1. Kết nối và đồng bộ cơ sở dữ liệu
        console.log('📦 [1/3] Đang kết nối PostgreSQL (Supabase)...');
        await initDatabase();
        console.log('✅ [1/3] Kết nối cơ sở dữ liệu thành công.');

        // 2. Tự động kiểm tra và tạo bảng mới nếu chưa tồn tại
        console.log('🔄 [2/3] Kiểm tra schema bảng mới (Friendships, Feed, RBAC, Tokens, Blacklist)...');
        await RefreshToken.sync();
        await TokenBlacklist.sync();
        await Friendship.sync();
        await Post.sync();
        await PostEditor.sync();
        await Comment.sync();
        await Reaction.sync();
        await SocialNotification.sync();
        console.log('✅ [2/3] Đồng bộ schema hoàn tất (không làm mất dữ liệu hiện có).');

        // 3. Khởi tạo HTTP server & Socket.IO
        console.log('⚡ [3/3] Đang gắn kết Socket.IO Realtime Handler...');
        const server = http.createServer(app);
        const io = socketIo.init(server);
        registerSocketHandlers(io);
        console.log('✅ [3/3] Socket.IO đã sẵn sàng.');

        // 4. Khởi chạy Cron Job tự động xoá tài khoản chưa xác thực quá 15 phút
        const cleanupCronTask = startUserCleanupCron();

        // 5. Lắng nghe cổng
        server.listen(PORT, () => {
            console.log('============================================================');
            console.log(`🎉 NEXORA BACKEND ĐÃ CHẠY TẠI: http://localhost:${PORT}`);
            console.log('============================================================');
            console.log(`• Health Check:         http://localhost:${PORT}/health`);
            console.log(`• Auth API:             http://localhost:${PORT}/auth`);
            console.log(`• Chat API:             http://localhost:${PORT}/chat`);
            console.log(`• Friends & Users API:  http://localhost:${PORT}/friends, /users`);
            console.log(`• Social Feed & RBAC:   http://localhost:${PORT}/feed`);
            console.log(`• WebSocket Ticket:     POST http://localhost:${PORT}/ws/ticket`);
            console.log(`• WebSocket Endpoint:   ws://localhost:${PORT}`);
            console.log(`• User Cleanup Cron:    Running (Every minute)`);
            console.log('------------------------------------------------------------');
            console.log('💡 Để chạy frontend: cd frontend && npm run dev');
            console.log('------------------------------------------------------------');
        });

        // Graceful shutdown
        const shutdown = (signal) => {
            console.log(`\n🛑 Nhận tín hiệu ${signal}. Đang đóng server...`);
            if (cleanupCronTask) cleanupCronTask.stop();
            server.close(() => {
                console.log('👋 Nexora Server đã dừng.');
                process.exit(0);
            });
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));

    } catch (err) {
        console.error('❌ Lỗi nghiêm trọng khi khởi động server:', err);
        process.exit(1);
    }
}

startServer();
