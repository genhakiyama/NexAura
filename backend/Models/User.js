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
    // Lưu SHA-256 hex (64 ký tự) của token/mã OTP. Cột trong DB phải đủ rộng
    // (VARCHAR 255), nếu không User.create() sẽ ném "value too long for type
    // character varying(10)" và tài khoản không bao giờ được tạo.
    verificationToken : DataTypes.STRING(255) , 
    verificationExpire : DataTypes.DATE,
    verificationOtp : DataTypes.STRING(255),
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
