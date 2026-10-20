const { DataTypes } = require('sequelize');
const sequelize = require('../UTIL/Database');

module.exports = sequelize.define('ConversationMembers', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
    },
    userRole: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'member'
    },
    conversationName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'approved' // 'pending', 'approved', 'rejected', 'banned'
    },
    requestedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    reviewedBy: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    reviewedAt: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'conversationMember'
});