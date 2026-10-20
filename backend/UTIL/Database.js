require('dotenv').config();
const Sequelize = require('sequelize');

if (!process.env.SUPABASE_URL) {
    // new Sequelize(undefined) dies with a cryptic TypeError at import time;
    // fail with the actual missing variable instead.
    throw new Error('[db] SUPABASE_URL environment variable is required');
}

const sequelize = new Sequelize(
    process.env.SUPABASE_URL , 
    {
        dialect: 'postgres',
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