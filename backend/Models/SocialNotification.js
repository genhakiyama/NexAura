const { DataTypes } = require('sequelize');
const sequelize = require('../UTIL/Database');

const SocialNotification = sequelize.define('SocialNotification', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
    },
    recipient_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    actor_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    type: {
        type: DataTypes.ENUM('post_reaction', 'comment', 'comment_reply', 'post_editor_granted'),
        allowNull: false
    },
    post_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    comment_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    read_at: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'social_notifications',
    timestamps: true,
    indexes: [
        {
            name: 'idx_notifications_recipient_read',
            fields: ['recipient_id', 'read_at']
        }
    ]
});

module.exports = SocialNotification;
