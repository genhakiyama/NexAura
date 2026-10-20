const express = require('express');
const app = express();
const sequelize = require('../UTIL/Database');  
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const { corsOrigin } = require('../CORS');

app.use(cors({
  origin: corsOrigin,
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
}));

const helmet = require('helmet');
const morgan = require('morgan');

// Render only keeps stdout logs; writing to access.log there hides every
// request from the dashboard and grows an ephemeral file for no reason.
const accessLogStream = process.env.NODE_ENV === 'production' || process.env.RENDER
  ? process.stdout
  : fs.createWriteStream(path.join(__dirname, 'access.log'), { flags: 'a' });

app.use(helmet());
app.use(morgan('combined' , {stream : accessLogStream}));


//---- ROUTES 
    const AuthenHandler = require('../Routes/AuthHandler');
    const isAuth = require('../Middleware/is-auth');
    const ChatHandler = require('../Routes/ChatHandler');

//--- DATABASE  
    const User = require('../Models/User');
    const Conversation = require('../Models/Conversation');
    const ConversationMem = require('../Models/ConversationMembers');
    const Message = require('../Models/Message');

    User.belongsToMany(Conversation, {
        through: ConversationMem, 
        foreignKey: 'userId' // Sửa 'foreginKey' thành 'foreignKey'
    });
    Conversation.belongsToMany(User , {
        through : ConversationMem , 
        foreignKey : 'conversationId'
    });

    User.hasMany(Message , {foreignKey : 'userId'});
    Message.belongsTo(User , {foreignKey : 'userId'});

    Conversation.hasMany(Message , {foreignKey : 'conversationId'});
    Message.belongsTo(Conversation , {foreignKey : 'conversationId'});

app.use(express.json());

// Public readiness probe used to verify the Render service and its database
// independently from the frontend.
app.get('/health' , async (req , res) => {
    try {
        await sequelize.authenticate();
        return res.status(200).json({ ok : true , db : 'up' });
    } catch (err) {
        console.error('[health] database check failed' , err.message);
        return res.status(503).json({ ok : false , db : 'down' });
    }
});

app.use('/auth' , AuthenHandler);
app.use('/chat' , isAuth , ChatHandler);

// Express 5 forwards rejected async handlers here. Without this the browser
// receives an HTML stack page and the frontend can only report "request fail".
app.use((err , req , res , next) => {
    console.error('[request error]' , err);
    if (res.headersSent) return next(err);
    const status = err.status || err.statusCode || 500;
    return res.status(status).json({
        success : false ,
        payload : {
            error : status >= 500
                ? 'Đã xảy ra lỗi máy chủ. Vui lòng thử lại.'
                : err.message
        }
    });
});

module.exports = app;