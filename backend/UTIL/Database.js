require('dotenv').config();
const Sequelize = require('sequelize');

// Sequelize lazy-loads pg with a dynamic require. That makes the Vercel
// function bundler miss it, so the runtime says "Please install pg package
// manually". Requiring pg here and passing it explicitly forces it into the
// deployed bundle.
const pg = require('pg');

if (!process.env.SUPABASE_URL) {
    // new Sequelize(undefined) dies with a cryptic TypeError at import time;
    // fail with the actual missing variable instead.
    throw new Error('[db] SUPABASE_URL environment variable is required');
}

const sequelize = new Sequelize(
    process.env.SUPABASE_URL , 
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