const { DataTypes } = require('sequelize');
const sequelize = require('../UTIL/Database');

const Reaction = sequelize.define('Reaction', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
    },
    target_type: {
        type: DataTypes.ENUM('post', 'comment'),
        allowNull: false
    },
    target_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    type: {
        type: DataTypes.ENUM('like', 'heart', 'haha', 'wow', 'sad', 'angry'),
        defaultValue: 'like',
        allowNull: false
    }
}, {
    tableName: 'reactions',
    timestamps: true,
    indexes: [
        {
            name: 'unique_user_target_reaction',
            unique: true,
            fields: ['target_type', 'target_id', 'user_id']
        },
        {
            name: 'idx_reactions_target',
            fields: ['target_type', 'target_id']
        }
    ]
});

module.exports = Reaction;
