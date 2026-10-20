require('dotenv').config();
const Sequelize = require('sequelize');

console.log(process.env.SUPABASE_URL);

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