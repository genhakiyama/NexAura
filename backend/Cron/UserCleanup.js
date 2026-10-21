const cron = require('node-cron');
const { Op } = require('sequelize');
const User = require('../Models/User');
const { initDatabase } = require('../DBInit');

/**
 * Quét và xoá các tài khoản chưa xác thực hoặc bị lỗi quá 15 phút:
 * 1. isVerified = false VÀ verificationExpire <= thời điểm hiện tại (đã quá 15 phút)
 * 2. isVerified = false VÀ createdAt <= 15 phút trước (trường hợp token bị lỗi hoặc không có expire)
 */
async function cleanExpiredUnverifiedUsers() {
    try {
        await initDatabase();
        const now = new Date();
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

        // Tìm danh sách tài khoản quá hạn để ghi log chi tiết
        const expiredUsers = await User.findAll({
            where: {
                isVerified: false,
                [Op.or]: [
                    {
                        verificationExpire: {
                            [Op.ne]: null,
                            [Op.lte]: now
                        }
                    },
                    {
                        createdAt: {
                            [Op.lte]: fifteenMinutesAgo
                        }
                    }
                ]
            },
            attributes: ['id', 'email', 'username', 'createdAt', 'verificationExpire']
        });

        if (expiredUsers.length === 0) {
            return { success: true, count: 0 };
        }

        const idsToDelete = expiredUsers.map(u => u.id);

        console.log(`[UserCleanupCron] Phát hiện ${expiredUsers.length} tài khoản chưa xác thực quá 15 phút cần xoá:`, 
            expiredUsers.map(u => `${u.username} (${u.email})`).join(', ')
        );

        const deletedCount = await User.destroy({
            where: {
                id: {
                    [Op.in]: idsToDelete
                }
            }
        });

        console.log(`[UserCleanupCron] ✅ Đã tự động dọn dẹp ${deletedCount} tài khoản chưa xác thực / quá hạn.`);
        return { success: true, count: deletedCount, deletedUsers: expiredUsers };

    } catch (err) {
        console.error('[UserCleanupCron error] Lỗi khi dọn dẹp tài khoản quá hạn:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Khởi chạy Cron Job dọn dẹp định kỳ (mặc định mỗi 1 phút quét 1 lần)
 * Cú pháp cron: '* * * * *' = mỗi phút một lần
 */
function startUserCleanupCron(cronSchedule = '* * * * *') {
    console.log(`[UserCleanupCron] ⏰ Khởi tạo Cron Job tự động xoá tài khoản chưa xác thực (Lịch: "${cronSchedule}")...`);

    // Chạy dọn dẹp ngay khi server vừa bật để xử lý tài khoản tồn đọng
    cleanExpiredUnverifiedUsers().catch(err => {
        console.error('[UserCleanupCron initial run error]:', err.message);
    });

    const task = cron.schedule(cronSchedule, async () => {
        await cleanExpiredUnverifiedUsers();
    });

    return task;
}

module.exports = {
    cleanExpiredUnverifiedUsers,
    startUserCleanupCron
};
