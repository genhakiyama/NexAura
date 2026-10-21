const { DataTypes } = require('sequelize');
const sequelize = require('../UTIL/Database');

const Friendship = sequelize.define('Friendship', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
    },
    requester_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    addressee_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    status: {
        type: DataTypes.ENUM('pending', 'accepted', 'declined', 'blocked'),
        defaultValue: 'pending',
        allowNull: false
    }
}, {
    tableName: 'friendships',
    timestamps: true,
    indexes: [
        {
            name: 'unique_friendship_pair',
            unique: true,
            fields: [
                sequelize.fn('LEAST', sequelize.col('requester_id'), sequelize.col('addressee_id')),
                sequelize.fn('GREATEST', sequelize.col('requester_id'), sequelize.col('addressee_id'))
            ]
        },
        {
            name: 'idx_friendship_status',
            fields: ['status']
        }
    ]
});

module.exports = Friendship;
