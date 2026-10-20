const { DataTypes } = require('sequelize');
const sequelize = require('../UTIL/Database');

module.exports = sequelize.define('Message' , {
    id : {
            type : DataTypes.INTEGER,
            autoIncrement : true , 
            allowNull : false , 
            primaryKey : true
    } , 
    type : {
        type : DataTypes.ENUM('text' , 'image' , 'file' , 'system'),
        defaultValue : 'text'
    },
    status : {
        type: DataTypes.ENUM('delivered' , 'sent' , 'seen') ,  
        defaultValue: 'delivered'
    } , 
    content : {
        type : DataTypes.STRING , 
        allowNull : false
    }
} , {
    tableName : 'Message'
});
