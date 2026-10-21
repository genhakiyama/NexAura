const { DataTypes } = require('sequelize');
const sequelize = require('../UTIL/Database');

const Post = sequelize.define('Post', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
    },
    author_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    content: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    media_urls: {
        type: DataTypes.JSON,
        defaultValue: []
    },
    visibility: {
        type: DataTypes.ENUM('public', 'friends', 'private'),
        defaultValue: 'friends',
        allowNull: false
    }
}, {
    tableName: 'posts',
    timestamps: true,
    indexes: [
        {
            name: 'idx_posts_author_id',
            fields: ['author_id']
        },
        {
            name: 'idx_posts_created_at',
            fields: ['createdAt']
        }
    ]
});

module.exports = Post;
