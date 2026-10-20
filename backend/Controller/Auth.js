require('dotenv').config();
const jwt = require('jsonwebtoken');

const Authen = require('../Service/Auth');
const Email = require('../Service/Email');

let Token ;

async function Signup(req , res) {
    // express.json() leaves req.body undefined when the client sends no body at
    // all (or a Content-Type the parser ignores). Destructuring that threw a
    // TypeError and the browser only saw a generic 500.
    const {email , username , password } = req.body || {};
    try {
        const authen = await Authen.SignUp(email , username , password );
        if (authen.error){
             return res.status(authen.status_code || 400).json({
                success : false ,
                payload :{
                    message : authen.error
                }
            });
        }

        return res.status(200).json({
            success : true , 
            payload : {
                message : authen.message
            }
        })
    } catch (err) {
        console.error('[Signup error]' , err);
        return res.status(500).json({
            success : false ,
            payload : { message : 'Đã xảy ra lỗi máy chủ. Vui lòng thử lại.' }
        });
    }
};

async function LogIn(req , res) {
    const {username , email , password} = req.body || {};

    // Login had no try/catch, so any rejection (a bad WHERE value, a database
    // cold-start failure) became an unhandled 500 instead of a usable message.
    try {
        const isCheck = await Authen.Login(email , username , password);

        if (isCheck.error) return res.status(isCheck.status_code || 400).json({
            sucess : false , 
            payload : {
                message : isCheck.error
            }
        });

        const userId = isCheck.userId

        const Token = jwt.sign({
            username , email , userId
        } , process.env.SECRET_KEY , {expiresIn : '1h'});

        return res.status(200).json({
            sucess : true , 
            payload : {
                message : isCheck.message,
                token : Token
            }
        });
    } catch (err) {
        console.error('[Login error]' , err);
        return res.status(500).json({
            success : false ,
            payload : { message : 'Đã xảy ra lỗi máy chủ. Vui lòng thử lại.' }
        });
    }
}

async function VerifyEmail(req , res) {
    const {token} = req.query;
    const isCheck = await Email.verifyEmail(token);

    if (isCheck.error){
        return res.status(isCheck.status_code || 400).json({
            success : false , 
            payload : {
                message : isCheck.error
            }
        });
    }

    return res.status(200).json({
        sucess : true , 
        payload : {
            message : 'Xac thuc Email thanh cong'
        }
    });
}

module.exports = {
    Signup , 
    LogIn ,
    VerifyEmail
};