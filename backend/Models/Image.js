const { DataTypes } = require('sequelize');
const sequelize = require('../UTIL/Database');

const Image = sequelize.define('Image', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
    },
    url: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    originalName: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    mimetype: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    size: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    width: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    height: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    conversationId: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    messageId: {
        type: DataTypes.INTEGER,
        allowNull: true
    }
}, {
    tableName: 'Image'
});

module.exports = Image;
