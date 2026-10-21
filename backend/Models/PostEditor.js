const { DataTypes } = require('sequelize');
const sequelize = require('../UTIL/Database');

const PostEditor = sequelize.define('PostEditor', {
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
    editor_user_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    granted_by: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    can_edit: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        allowNull: false
    }
}, {
    tableName: 'post_editors',
    timestamps: true,
    indexes: [
        {
            name: 'unique_post_editor',
            unique: true,
            fields: ['post_id', 'editor_user_id']
        }
    ]
});

module.exports = PostEditor;
