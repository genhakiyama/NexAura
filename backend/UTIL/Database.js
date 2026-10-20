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
        dialectOptions: {
            ssl: {
                require: true,
                rejectUnauthorized: false // Bắt buộc có khi kết nối SSL đến Supabase
            }
        }
    }
);

module.exports = sequelize;