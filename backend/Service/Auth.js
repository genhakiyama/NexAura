const User = require('../Models/User');
const brcrypt = require('bcrypt');
const crypto = require('crypto');

const authErr = require('../Errors/Authen');

const EmailService = require('./Email');
const Token = require('../UTIL/Token');
const { validateEmailAuthenticity } = require('../UTIL/EmailDetector');

async function SignUp(email , username , password) {
        // 1. Kiểm tra phát hiện email ảo, kiểm tra tên miền MX và xác thực hòm thư Gmail
        const emailCheck = await validateEmailAuthenticity(email, process.env.EMAIL_USER);
        if (!emailCheck.valid) {
            return {
                status_code : 400 ,
                error : emailCheck.error
            };
        }
        const cleanEmail = emailCheck.email;

        // 2. Kiểm tra tính hợp lệ của username & password
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

        const cleanUsername = username.trim();

        // 3. Kiểm tra xem username đã tồn tại chưa
        const existingUser = await User.findOne({
            where : {
                username : cleanUsername
            }
        });
        if (existingUser) {   
            return {
                status_code : authErr.UserAlreadyExistsError.defaultStatusCode , 
                error : authErr.UserAlreadyExistsError.defaultMessage
            };
        }

        // 4. Kiểm tra xem email đã được đăng ký tài khoản khác chưa
        const existingEmail = await User.findOne({
            where : {
                email : cleanEmail
            }
        });
        if (existingEmail) {
            return {
                status_code : 409 ,
                error : 'Địa chỉ email này đã được sử dụng cho một tài khoản khác.'
            };
        }

        // 5. Chuẩn bị token xác thực và gửi email xác thực qua Gmail
        // Chỉ cho phép đăng ký thành công khi Gmail gửi tin thành công
        const {token , hashedToken} = Token.TokenGeneration();
        const mailResult = await EmailService.SendVerification(cleanEmail , token);
        if (!mailResult || !mailResult.success) {
            return {
                status_code : 400 ,
                error : mailResult?.error || 'Gmail không thể gửi thư tới địa chỉ này. Email có thể không tồn tại.'
            };
        }

        // 6. Sau khi Gmail gửi tin thành công, lưu tài khoản vào cơ sở dữ liệu
        const hashedpassword = await brcrypt.hash(password , 12);
        await User.create({
            email : cleanEmail ,
            username : cleanUsername ,
            password : hashedpassword , 
            isVerified : false , 
            verificationToken : hashedToken,
            verificationExpire : new Date(Date.now() + 15 * 60 * 1000)
        });

        return {
            message : 'Đăng ký thành công! Vui lòng kiểm tra hộp thư email để kích hoạt tài khoản.'
        };
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