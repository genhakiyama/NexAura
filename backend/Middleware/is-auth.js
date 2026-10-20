require('dotenv').config();
const jwt = require('jsonwebtoken');

const authErr = require('../Errors/Authen');

module.exports = (req , res , next) => {
    const authHeader = req.get('Authorization');
    if (!authHeader) {
        return res.status(authErr.InvalidTokenError.defaultStatusCode).json({
            success : false , 
            payload : {
                error : authErr.InvalidTokenError.defaultMessage
            }
        });
    }

    const token = authHeader.split(' ')[1];
    let decodedToken;
    try {
        decodedToken = jwt.verify(token , process.env.SECRET_KEY);
    } catch(err) {
        return res.status(authErr.InvalidTokenError.defaultStatusCode).json({
            success : false , 
            payload : {
                error : authErr.InvalidTokenError.defaultMessage
            }
        });
    }

    if (!decodedToken) {
        return res.status(authErr.InvalidTokenError.defaultStatusCode).json({
            sucess : false , 
            payload : {
                error : authErr.InvalidTokenError.defaultMessage
            }
        });
    }

    req.userId = decodedToken.userId;
    req.username = decodedToken.username;
    req.role = decodedToken.role;
    next();
}