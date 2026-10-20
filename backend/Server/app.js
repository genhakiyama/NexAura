const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const { corsOrigin } = require('../CORS');
const { initDatabase } = require('../DBInit');

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

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(morgan('combined' , {stream : accessLogStream}));

// Serve uploaded media statically
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));


//---- ROUTES 
    const AuthenHandler = require('../Routes/AuthHandler');
    const isAuth = require('../Middleware/is-auth');
    const ChatHandler = require('../Routes/ChatHandler');

//--- DATABASE  
    const User = require('../Models/User');
    const Conversation = require('../Models/Conversation');
    const ConversationMem = require('../Models/ConversationMembers');
    const Message = require('../Models/Message');
    const Image = require('../Models/Image');

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

    //---- IMAGE ASSOCIATIONS
    // 1 image ứng với 1 message và ngược lại (1-to-1)
    Message.hasOne(Image, { foreignKey: 'messageId', onDelete: 'CASCADE' });
    Image.belongsTo(Message, { foreignKey: 'messageId', onDelete: 'CASCADE' });

    // 1 conversation có nhiều image, image thuộc về 1 conversation (1-to-many)
    Conversation.hasMany(Image, { foreignKey: 'conversationId', onDelete: 'CASCADE' });
    Image.belongsTo(Conversation, { foreignKey: 'conversationId', onDelete: 'CASCADE' });

    // 1 user có nhiều image, image thuộc về 1 user (1-to-many)
    User.hasMany(Image, { foreignKey: 'userId', onDelete: 'CASCADE' });
    Image.belongsTo(User, { foreignKey: 'userId', onDelete: 'CASCADE' });

app.use(express.json());

// Public readiness probe. Works on both the long-running local server and the
// Vercel function, and reports which runtime answered.
app.get('/health' , async (req , res) => {
    try {
        await initDatabase();
        return res.status(200).json({
            ok : true ,
            db : 'up' ,
            runtime : process.env.VERCEL ? 'vercel' : 'node'
        });
    } catch (err) {
        console.error('[health] database check failed' , err.message);
        return res.status(503).json({ ok : false , db : 'down' });
    }
});

// On Vercel the app is imported before any request is handled, so the
// connection may still be warming up. Awaiting the cached init promise here
// makes the first API call wait for the database instead of failing.
app.use(async (req , res , next) => {
    try {
        await initDatabase();
        next();
    } catch (err) {
        next(err);
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