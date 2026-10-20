const { DataTypes } = require('sequelize');
const sequelize = require('../UTIL/Database');

module.exports = sequelize.define('Conversation' , {
    id : {
            type : DataTypes.INTEGER,
            autoIncrement : true , 
            allowNull : false , 
            primaryKey : true
    } , 
    numberMembers : {
        type : DataTypes.INTEGER , 
        defaultValue : 1
    } , 
    type : {
        type : DataTypes.ENUM('group' , 'direct') , 
        allowNull : false 
    },
    name : {
        type : DataTypes.STRING(255),
        allowNull : false 
    }
} , {
    tableName : 'Conversation'
});
