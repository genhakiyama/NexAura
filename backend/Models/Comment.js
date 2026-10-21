const { DataTypes } = require('sequelize');
const sequelize = require('../UTIL/Database');

const Comment = sequelize.define('Comment', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
    },
    post_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    author_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    parent_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    content: {
        type: DataTypes.TEXT,
        allowNull: false
    }
}, {
    tableName: 'comments',
    timestamps: true,
    indexes: [
        {
            name: 'idx_comments_post_id',
            fields: ['post_id']
        },
        {
            name: 'idx_comments_parent_id',
            fields: ['parent_id']
        }
    ]
});

module.exports = Comment;
