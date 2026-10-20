const User = require('../Models/User');
const brcrypt = require('bcrypt');
const crypto = require('crypto');

const authErr = require('../Errors/Authen');

const EmailService = require('./Email');
const Token = require('../UTIL/Token');
const { error } = require('console');

async function SignUp(email , username , password) {
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
            return {
                status_code : 400 ,
                error : 'Email không hợp lệ.'
            };
        }

        // A missing username/password used to reach Sequelize and throw
        // `WHERE parameter "username" has invalid "undefined" value` -> 500.
        if (!username || typeof username !== 'string' || !username.trim()) {
            return {
                status_code : 400 ,
                error : 'Tên đăng nhập không được để trống.'
            };
        }
        if (!password || typeof password !== 'string' || password.length < 6) {
            return {
                status_code : 400 ,
                error : 'Mật khẩu phải có ít nhất 6 ký tự.'
            };
        }

        const existingUser = await User.findOne({
            where : {
                username : username
            }
        });
        if (existingUser) {   
            return {
                status_code : authErr.UserAlreadyExistsError.defaultStatusCode , 
                error : authErr.UserAlreadyExistsError.defaultMessage
            };
        }
        const hashedpassword = await brcrypt.hash(password , 12);
        const {token , hashedToken} = Token.TokenGeneration();
        await User.create({
            email , username , password : hashedpassword , 
            isVerified : false , 
            verificationToken : hashedToken,
            verificationExpire : new Date(Date.now() + 15 * 60 * 1000)
        });
        // Account is already created; a failed verification email must NOT break signup.
        try {
            await EmailService.SendVerification(email , token);
        } catch (err) {
            console.error('[signup email failed]' , err.message);
        }
        return {
            message : 'Đăng kí thành công - Làm ơn check Email'
        }
}   

async function Login(email  , username , password){
    // A missing field used to reach Sequelize and throw
    // `WHERE parameter "email" has invalid "undefined" value` -> 500.
    if (!email || !username || !password) {
        return {
            status_code : 400 ,
            error : 'Vui lòng nhập đầy đủ email, tên đăng nhập và mật khẩu.'
        }
    }

    const user = await User.findOne({where : {email : email , username : username}});
    if (!user) {
        return {
            status_code : authErr.UserNotFoundError.defaultStatusCode,
            error : authErr.UserNotFoundError.defaultMessage
        }
    }

    if (!user.isVerified) {
        return {
            status_code : 403,
            error : 'Tài khoản chưa xác thực email. Hãy mở link xác thực trong email đăng kí (kiểm tra cả thư rác).'
        }
    }

    if (await brcrypt.compare(password , user.password)) {
        return {
            message : `Chào mừng trở lại ${user.username}` ,
            userId : user.id
        };
    }

    return {
        status_code : authErr.InvalidCredentialsError.defaultStatusCode , 
        error : authErr.InvalidCredentialsError.defaultMessage
    }
}

module.exports = {
    SignUp  , 
    Login
}