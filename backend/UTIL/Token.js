const crypto = require('crypto');

exports.TokenGeneration = () => {
    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    return {token , hashedToken};
};

exports.OtpGeneration = () => {
    const otp = crypto.randomInt(100000, 1000000).toString();
    const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');
    return { otp, hashedOtp };
};