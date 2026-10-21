/**
 * Script: Reset toàn bộ dữ liệu database (TRUNCATE CASCADE + RESTART IDENTITY).
 * Đưa cơ sở dữ liệu về trạng thái trống hoàn toàn nhưng giữ nguyên toàn bộ schema và bảng.
 *
 * Cách chạy:
 *   node scripts/reset-db.js
 *   hoặc: npm run db:reset
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const sequelize = require('../UTIL/Database');

async function resetDatabase() {
    console.log('============================================================');
    console.log('⚠️  Đang tiến hành RESET TOÀN BỘ CƠ SỞ DỮ LIỆU (TRUNCATE CASCADE)...');
    console.log('============================================================\n');

    try {
        await sequelize.authenticate();
        console.log('✅ Kết nối cơ sở dữ liệu thành công.');

        // Lấy danh sách toàn bộ các bảng trong schema public
        const [tables] = await sequelize.query(`
            SELECT tablename 
            FROM pg_tables 
            WHERE schemaname = 'public' 
              AND tablename NOT LIKE 'pg_%' 
              AND tablename NOT LIKE 'sql_%'
        `);

        if (!tables || tables.length === 0) {
            console.log('ℹ️ Không tìm thấy bảng nào trong database.');
            process.exit(0);
        }

        const tableNames = tables.map(t => `"${t.tablename}"`);
        console.log(`📋 Tìm thấy ${tableNames.length} bảng cần làm sạch:`);
        console.log(tableNames.join(', ') + '\n');

        // Thực hiện TRUNCATE CASCADE và RESTART IDENTITY để reset cả auto-increment ID
        console.log('🧹 Đang làm sạch dữ liệu...');
        await sequelize.query(`TRUNCATE TABLE ${tableNames.join(', ')} RESTART IDENTITY CASCADE;`);
        console.log('✅ Đã xóa sạch toàn bộ dữ liệu và reset ID về 1 thành công!\n');

        // Kiểm tra lại số lượng bản ghi của từng bảng
        console.log('🔍 Kiểm tra xác nhận số lượng bản ghi sau khi reset:');
        for (const t of tables) {
            const [countRes] = await sequelize.query(`SELECT count(*) FROM "${t.tablename}"`);
            console.log(`  - ${t.tablename.padEnd(25)}: ${countRes[0].count} dòng`);
        }

        console.log('\n✨ Database đã được đưa về trạng thái sạch sẽ, sẵn sàng sử dụng!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Lỗi khi reset database:', err);
        process.exit(1);
    }
}

resetDatabase();
