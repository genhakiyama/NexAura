const { DataTypes } = require('sequelize');
const sequelize = require('../UTIL/Database');

const User = sequelize.define('User' , {
    id : {
        type : DataTypes.INTEGER,
        autoIncrement : true , 
        allowNull : false , 
        primaryKey : true
    } , 
    email : DataTypes.STRING,
    username : DataTypes.STRING,
    password : DataTypes.STRING, 
    isVerified : DataTypes.BOOLEAN , 
    verificationToken : DataTypes.STRING , 
    verificationExpire : DataTypes.DATE,
    verificationOtp : DataTypes.STRING,
    resendCount : {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    lastResendAt : DataTypes.DATE,
    resendLockUntil : DataTypes.DATE
} , {
    tableName: 'users' 
});

module.exports = User;