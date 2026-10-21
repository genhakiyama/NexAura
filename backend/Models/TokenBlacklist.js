const { DataTypes } = require('sequelize');
const sequelize = require('../UTIL/Database');

const TokenBlacklist = sequelize.define('TokenBlacklist', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
    },
    jti: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true
    },
    expiresAt: {
        type: DataTypes.DATE,
        allowNull: false
    }
}, {
    tableName: 'token_blacklist',
    timestamps: true,
    indexes: [
        {
            fields: ['jti']
        },
        {
            fields: ['expiresAt']
        }
    ]
});

module.exports = TokenBlacklist;
