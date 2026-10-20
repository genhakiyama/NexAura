const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const Sequelize = require('sequelize');

// Sequelize lazy-loads pg with a dynamic require. That makes the Vercel
// function bundler miss it, so the runtime says "Please install pg package
// manually". Requiring pg here and passing it explicitly forces it into the
// deployed bundle.
const pg = require('pg');

const dbUrl = (process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.SUPABASE_URL || '').trim();

if (!dbUrl) {
    throw new Error('[db] Cần biến môi trường kết nối database (SUPABASE_URL hoặc DATABASE_URL dạng postgresql://...)');
}

if (dbUrl.startsWith('https://') || dbUrl.startsWith('http://')) {
    throw new Error('[db] LỖI CẤU HÌNH: Biến SUPABASE_URL của bạn đang chứa link website (https://...). Biến này dùng để kết nối Database PostgreSQL nên bắt buộc phải là chuỗi connection string dạng "postgresql://postgres.[ref]:[password]@...:5432/postgres". Để cấu hình link web Supabase cho Storage, hãy dùng biến riêng SUPABASE_PROJECT_URL.');
}

const sequelize = new Sequelize(
    dbUrl , 
    {
        dialect: 'postgres',
        dialectModule: pg,
        // A Vercel deployment can cold-start several function instances at
        // once. Keep each instance's pool tiny so Supabase's pooler is not
        // exhausted; local development keeps a slightly larger pool.
        pool: {
            max: Number(process.env.DB_POOL_MAX) || (process.env.VERCEL ? 3 : 5),
            min: 0,
            acquire: 30000,
            idle: 10000
        },
        dialectOptions: {
            ssl: {
                require: true,
                rejectUnauthorized: false // Bắt buộc có khi kết nối SSL đến Supabase
            }
        }
    }
);

module.exports = sequelize;