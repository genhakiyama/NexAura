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

// Serve static uploaded files (with automatic directory creation)
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

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

    //---- REFRESH TOKEN ASSOCIATIONS
    const RefreshToken = require('../Models/RefreshToken');
    User.hasMany(RefreshToken, { foreignKey: 'userId', onDelete: 'CASCADE' });
    RefreshToken.belongsTo(User, { foreignKey: 'userId', onDelete: 'CASCADE' });

    //---- FRIENDSHIP ASSOCIATIONS
    const Friendship = require('../Models/Friendship');
    User.hasMany(Friendship, { foreignKey: 'requester_id', as: 'sentFriendRequests', onDelete: 'CASCADE' });
    User.hasMany(Friendship, { foreignKey: 'addressee_id', as: 'receivedFriendRequests', onDelete: 'CASCADE' });
    Friendship.belongsTo(User, { foreignKey: 'requester_id', as: 'requester' });
    Friendship.belongsTo(User, { foreignKey: 'addressee_id', as: 'addressee' });

    //---- FEED & POST ASSOCIATIONS
    const Post = require('../Models/Post');
    const PostEditor = require('../Models/PostEditor');
    const Comment = require('../Models/Comment');
    const Reaction = require('../Models/Reaction');
    const SocialNotification = require('../Models/SocialNotification');

    User.hasMany(Post, { foreignKey: 'author_id', as: 'posts', onDelete: 'CASCADE' });
    Post.belongsTo(User, { foreignKey: 'author_id', as: 'author' });

    Post.hasMany(PostEditor, { foreignKey: 'post_id', as: 'editors', onDelete: 'CASCADE' });
    PostEditor.belongsTo(Post, { foreignKey: 'post_id' });
    PostEditor.belongsTo(User, { foreignKey: 'editor_user_id', as: 'editor' });
    PostEditor.belongsTo(User, { foreignKey: 'granted_by', as: 'granter' });

    Post.hasMany(Comment, { foreignKey: 'post_id', as: 'comments', onDelete: 'CASCADE' });
    Comment.belongsTo(Post, { foreignKey: 'post_id' });
    Comment.belongsTo(User, { foreignKey: 'author_id', as: 'author' });
    Comment.hasMany(Comment, { foreignKey: 'parent_id', as: 'replies', onDelete: 'CASCADE' });
    Comment.belongsTo(Comment, { foreignKey: 'parent_id', as: 'parent' });

    SocialNotification.belongsTo(User, { foreignKey: 'actor_id', as: 'actor' });
    SocialNotification.belongsTo(User, { foreignKey: 'recipient_id', as: 'recipient' });

const cookieParser = require('cookie-parser');
app.use(cookieParser());
app.use(express.json({ limit: '250mb' }));
app.use(express.urlencoded({ extended: true, limit: '250mb' }));

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

// Friends & Users routes (Authenticated)
const FriendHandler = require('../Routes/FriendHandler');
const UserHandler = require('../Routes/UserHandler');
app.use('/friends' , isAuth , FriendHandler);
app.use('/users' , isAuth , UserHandler);

// Feed & Social routes (Authenticated)
const FeedHandler = require('../Routes/FeedHandler');
app.use('/feed' , isAuth , FeedHandler);

// Single-use WebSocket ticket endpoint
const AuthController = require('../Controller/Auth');
app.post('/ws/ticket' , isAuth , AuthController.GetWsTicket);

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