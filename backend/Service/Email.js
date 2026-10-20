require('dotenv').config();
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const User = require('../Models/User');
const Token = require('../UTIL/Token');

const mailError = require('../Errors/Email');

const transporter = nodemailer.createTransport({
    service : 'gmail' ,
    auth : {
        user : process.env.EMAIL_USER ,
        pass : process.env.EMAIL_PASSWORD
    }
});

// Prevent a rejected SMTP connection from becoming an uncaught exception
// (which would crash the whole process and take down every request).
transporter.on('error' , (err) => {
    console.error('[mail transport error]' , err.message);
});

async function SendVerification(email , token) {
    const link = `${process.env.BASE_URL}/auth/verify-Email?token=${token}`;
    try {
        return await transporter.sendMail({
            from : process.env.EMAIL_USER ,
            to : email ,
            subject : "Verify your email" ,
            html : `
                <h2>Welcome to Home!</h2>
                <p>Please click the link below to verify your email:</p>
                <a href="${link}">Verify Email</a>
                <p>This link expires in 15 minutes.</p>
            `
        });
    } catch (err) {
        console.error('[SendVerification failed]' , err.message);
        return { rejected : true };
    }
}

async function verifyEmail(token) {
    if (!token || typeof token !== 'string') {
        return {
            error : 'Invalid verification link'
        };
    }
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');;
    const user = await User.findOne({
        where : {
            verificationToken : hashedToken
        }
    });
    
    if (!user) return {
        status_code : mailError.EmailNotFoundError.defaultStatusCode , 
        error : mailError.EmailNotFoundError.defaultMessage
    };

    if (!user.verificationToken) return {
        status_code : mailError.EmailAlreadyInUseError.defaultStatusCode , 
        error : mailError.EmailAlreadyInUseError.defaultMessage
    };

    if (user.verificationExpire <= new Date()) {
        return {
            status_code : mailError.EmailVerificationExpiredError.defaultStatusCode , 
            error : mailError.EmailVerificationExpiredError.defaultMessage
        };
    }

    await user.update({
        isVerified : true , 
        verificationToken : null , 
        verificationExpire : null
    });

    return {message : `User ${user.id} xax tuc email thanh cong`};
}

module.exports = {
    SendVerification,
    verifyEmail
};