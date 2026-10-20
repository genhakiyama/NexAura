require('dotenv').config();
const jwt = require('jsonwebtoken');

const Authen = require('../Service/Auth');
const Email = require('../Service/Email');

let Token ;

async function Signup(req , res) {
    const {email , username , password } = req.body;
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
    const {username , email , password} = req.body;
    const isCheck = await Authen.Login(email , username , password);

    if (isCheck.error) return res.status(isCheck.status_code).json({
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