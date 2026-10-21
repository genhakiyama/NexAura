const User = require('../Models/User');
const brcrypt = require('bcrypt');
const crypto = require('crypto');

const authErr = require('../Errors/Authen');

const EmailService = require('./Email');
const { VERIFY_TTL_MINUTES } = EmailService;
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

        // 3. Kiểm tra xem username đã tồn tại chưa (tự động dọn dẹp nếu là tài khoản chưa xác thực quá hạn 15 phút)
        const existingUser = await User.findOne({
            where : {
                username : cleanUsername
            }
        });
        if (existingUser) {
            const isExpired = !existingUser.isVerified && (
                (existingUser.verificationExpire && new Date(existingUser.verificationExpire) <= new Date()) ||
                (existingUser.createdAt && new Date(existingUser.createdAt) <= new Date(Date.now() - VERIFY_TTL_MINUTES * 60 * 1000))
            );
            if (isExpired) {
                await existingUser.destroy();
            } else {
                if (!existingUser.isVerified) {
                    return {
                        status_code : 400,
                        error : 'Tài khoản này đã đăng ký nhưng chưa xác thực. Vui lòng đăng nhập để nhập mã OTP hoặc gửi lại mã xác minh.'
                    };
                }
                return {
                    status_code : authErr.UserAlreadyExistsError.defaultStatusCode , 
                    error : authErr.UserAlreadyExistsError.defaultMessage
                };
            }
        }

        // 4. Kiểm tra xem email đã được đăng ký tài khoản khác chưa (tự động dọn dẹp nếu là tài khoản chưa xác thực quá hạn 15 phút)
        const existingEmail = await User.findOne({
            where : {
                email : cleanEmail
            }
        });
        if (existingEmail) {
            const isExpired = !existingEmail.isVerified && (
                (existingEmail.verificationExpire && new Date(existingEmail.verificationExpire) <= new Date()) ||
                (existingEmail.createdAt && new Date(existingEmail.createdAt) <= new Date(Date.now() - VERIFY_TTL_MINUTES * 60 * 1000))
            );
            if (isExpired) {
                await existingEmail.destroy();
            } else {
                if (!existingEmail.isVerified) {
                    return {
                        status_code : 400,
                        error : 'Địa chỉ email này đã đăng ký nhưng chưa kích hoạt. Vui lòng đăng nhập để nhập mã OTP hoặc gửi lại mã xác minh.'
                    };
                }
                return {
                    status_code : 409 ,
                    error : 'Địa chỉ email này đã được sử dụng cho một tài khoản khác.'
                };
            }
        }

        // 5. Chuẩn bị token xác thực + mã OTP 6 số
        const {token , hashedToken} = Token.TokenGeneration();
        const {otp , hashedOtp} = Token.OtpGeneration();
        const hashedpassword = await brcrypt.hash(password , 12);

        // 6. Tạo tài khoản TRƯỚC khi gửi mail xác thực.
        //    Thứ tự này là bắt buộc: nếu gửi mail trước mà ghi DB sau thì khi
        //    ghi DB thất bại (ví dụ cột verificationOtp bị giới hạn độ dài),
        //    người dùng vẫn nhận được email kích hoạt nhưng tài khoản không tồn
        //    tại -> bấm link báo "không tồn tại" và cũng không gửi lại mã được.
        const newUser = await User.create({
            email : cleanEmail ,
            username : cleanUsername ,
            password : hashedpassword , 
            isVerified : false , 
            verificationToken : hashedToken,
            verificationOtp : hashedOtp,
            verificationExpire : new Date(Date.now() + VERIFY_TTL_MINUTES * 60 * 1000),
            resendCount : 0,
            lastResendAt : new Date()
        });

        // 7. Gửi email xác thực qua Gmail. Nếu gửi lỗi thì xoá tài khoản vừa
        //    tạo, tránh để lại tài khoản "mồ côi" không có cách nào kích hoạt.
        const mailResult = await EmailService.SendVerification(cleanEmail , token, otp);
        if (!mailResult || !mailResult.success) {
            await newUser.destroy();
            return {
                status_code : 400 ,
                error : mailResult?.error || 'Gmail không thể gửi thư tới địa chỉ này. Email có thể không tồn tại.'
            };
        }

        return {
            message : 'Đăng ký thành công! Vui lòng kiểm tra email để lấy mã OTP hoặc bấm liên kết xác thực.',
            needsVerification : true,
            email : cleanEmail
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

    const user = await User.findOne({where : {email : email.trim().toLowerCase() , username : username.trim()}});
    if (!user) {
        return {
            status_code : authErr.UserNotFoundError.defaultStatusCode,
            error : authErr.UserNotFoundError.defaultMessage
        }
    }

    if (!user.isVerified) {
        return {
            status_code : 403,
            error : 'Tài khoản chưa được kích hoạt. Vui lòng nhập mã OTP hoặc bấm liên kết xác thực trong email của bạn.',
            needsVerification : true,
            email : user.email
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
