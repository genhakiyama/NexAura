const cron = require('node-cron');
const { Op } = require('sequelize');
const User = require('../Models/User');
const { initDatabase } = require('../DBInit');

/**
 * Sau bao lâu thì tài khoản chưa xác thực bị xoá (đơn vị: giờ).
 *
 * Hạn xác thực (VERIFY_EXPIRE_MINUTES) chỉ quyết định link / mã OTP còn dùng
 * được hay không. Việc XOÁ tài khoản phải chậm hơn nhiều: nếu xoá đúng lúc hết
 * hạn thì người dùng mở email muộn sẽ không tìm thấy tài khoản, bấm link báo
 * "không tồn tại" và cũng không gửi lại mã xác minh được -> kẹt vĩnh viễn ở
 * màn hình lỗi. Giữ tài khoản thêm thời gian để họ gửi lại mã và kích hoạt.
 */
const CLEANUP_AFTER_HOURS = Math.max(1, Number(process.env.VERIFY_CLEANUP_AFTER_HOURS) || 24);

/**
 * Quét và xoá các tài khoản chưa xác thực quá hạn:
 * 1. isVerified = false VÀ createdAt <= thời điểm cutoff (mặc định 24 giờ trước)
 * 2. Tài khoản đã quá hạn xác thực nhưng vẫn được giữ lại để người dùng có thể
 *    yêu cầu gửi lại mã OTP.
 */
async function cleanExpiredUnverifiedUsers() {
    try {
        await initDatabase();
        const cleanupCutoff = new Date(Date.now() - CLEANUP_AFTER_HOURS * 60 * 60 * 1000);

        // Tìm danh sách tài khoản quá hạn để ghi log chi tiết
        const expiredUsers = await User.findAll({
            where: {
                isVerified: false,
                createdAt: {
                    [Op.lte]: cleanupCutoff
                }
            },
            attributes: ['id', 'email', 'username', 'createdAt', 'verificationExpire']
        });

        if (expiredUsers.length === 0) {
            return { success: true, count: 0 };
        }

        const idsToDelete = expiredUsers.map(u => u.id);

        console.log(`[UserCleanupCron] Phát hiện ${expiredUsers.length} tài khoản chưa xác thực quá ${CLEANUP_AFTER_HOURS} giờ cần xoá:`,
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
