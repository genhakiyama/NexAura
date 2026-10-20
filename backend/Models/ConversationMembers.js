const { DataTypes } = require('sequelize');
const sequelize = require('../UTIL/Database');

module.exports = sequelize.define('ConversationMembers' , {
    id : {
        type : DataTypes.INTEGER,
        autoIncrement : true , 
        allowNull : false , 
        primaryKey : true
    } , 
    userRole : {
        type : DataTypes.STRING ,
        allowNull : false
    },
    conversationName : {
        type : DataTypes.STRING , 
        allowNull : false 
    }
} , {
    tableName : 'conversationMember'
});