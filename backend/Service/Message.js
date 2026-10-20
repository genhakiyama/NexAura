require('dotenv').config();
const Message = require('../Models/Message');
const User = require('../Models/User');
const Conversation = require('../Models/Conversation');
const ConverMem = require('../Models/ConversationMembers');

const messageErr = require('../Errors/Message');
const chatErr = require('../Errors/Chat');

const room = require('../Socket/RoomManager');
const { uploadImage } = require('./Upload');

async function isMember(userId , conversationId){
    // A missing or non-numeric id used to become NaN, which Sequelize sent to
    // Postgres as `= NaN`. Postgres rejects that with `column "nan" does not
    // exist`, so the browser saw a generic 500 instead of a usable error.
    const id = Number(conversationId);
    if (!Number.isInteger(id) || id <= 0) {
        return {
            status_code : 400,
            error : 'Đoạn chat không hợp lệ.'
        }
    }

    const member = await ConverMem.findOne({ 
        where : {userId , conversationId : id}
    });
    if (!member) {
        return {
            status_code : chatErr.UserActionRestrictedError.defaultStatusCode , 
            error : chatErr.UserActionRestrictedError.defaultMessage
        }
    }
    return member;
}

async function getMessages(userId , conversationId) {
    const member = await isMember(userId, conversationId);
    if (member.error) return member;

    const messages = await Message.findAll({
        where : { conversationId : Number(conversationId) } ,
        include : [{ model : User , attributes : ['id' , 'username'] }] ,
        order : [['createdAt' , 'ASC']] ,
        limit : 200
    });

    return {
        messages : messages.map(msg => ({
            id : msg.id ,
            type : msg.type ,
            status : msg.status ,
            content : msg.content ,
            senderId : msg.userId ,
            senderName : msg.User ? msg.User.username : 'unknown' ,
            createdAt : msg.createdAt
        }))
    };
}

async function sendMessage(senderId , username , type , conversationId , content) {
    const text = typeof content === 'string' ? content.trim() : '';
    if (!text) {
        return {
            status_code : 400,
            error : 'Nội dung tin nhắn không được để trống.'
        }
    }

    // Message.content is now TEXT (no Postgres length limit), but we still
    // cap user-typed text to keep the UI tidy.
    if (text.length > 2000) {
        return {
            status_code : 400,
            error : 'Tin nhắn tối đa 2000 ký tự.'
        }
    }

    const member = await isMember(senderId, conversationId);
    if (member.error) return member;

    const id = Number(conversationId);

    const message = await Message.create({
        type , status : 'sent' , content : text ,
        userId : senderId ,
        conversationId : id
    });

    room.sendToRoom(id , {
        id : message.id,
        from : username , 
        message : text ,
        type ,
        chatId : id,
        createdAt: message.createdAt
    });

    return {
        message : 'Tin nhắn đã gửi',
        messageId : message.id
    };
}

async function sendImageMessage(senderId , username , conversationId , file) {
    if (!file || !file.buffer) {
        return {
            status_code : messageErr.InvalidAttachmentError.defaultStatusCode ,
            error : messageErr.InvalidAttachmentError.defaultMessage
        };
    }

    if (file.size > 5 * 1024 * 1024) {
        return {
            status_code : messageErr.AttachmentTooLargeError.defaultStatusCode ,
            error : messageErr.AttachmentTooLargeError.defaultMessage
        };
    }

    const member = await isMember(senderId , conversationId);
    if (member.error) return member;

    const id = Number(conversationId);

    // Upload to Supabase Storage and get the public URL
    let imageUrl;
    try {
        imageUrl = await uploadImage(
            file.buffer , file.originalname , file.mimetype , id
        );
    } catch (err) {
        console.error('[sendImageMessage] upload error:' , err.message);
        return {
            status_code : 500 ,
            error : `Lỗi lưu trữ ảnh: ${err.message}`
        };
    }

    const message = await Message.create({
        type : 'image' ,
        status : 'sent' ,
        content : imageUrl ,
        userId : senderId ,
        conversationId : id
    });

    room.sendToRoom(id , {
        id : message.id ,
        from : username ,
        message : imageUrl ,
        type : 'image' ,
        chatId : id ,
        createdAt : message.createdAt
    });

    return {
        message : 'Ảnh đã gửi' ,
        messageId : message.id ,
        imageUrl
    };
}

async function deleteMessage(senderId , username , conversationId , messageId) {
    const member = await isMember(senderId , conversationId);
    if (member.error) return member;

    // A non-numeric messageId (a temp client id, or a malformed request) used to
    // reach Postgres as-is and raise a 500. Reject it as a normal 404 instead.
    const id = Number(messageId);
    if (!Number.isInteger(id) || id <= 0) {
        return {
            status_code : messageErr.MessageNotFoundError.defaultStatusCode ,
            error : messageErr.MessageNotFoundError.defaultMessage
        }
    }

    // Look the row up BEFORE destroying it: Message.destroy() only returns the
    // number of affected rows, so ownership can never be checked from it.
    const message = await Message.findOne({ where : { id } });
    if (!message) {
        return {
            status_code : messageErr.MessageNotFoundError.defaultStatusCode ,
            error : messageErr.MessageNotFoundError.defaultMessage
        }
    }

    // Only the author may delete their own message.
    if (Number(message.userId) !== Number(senderId)) {
        return {
            status_code : messageErr.UnauthorizedMessageActionError.defaultStatusCode ,
            error : messageErr.UnauthorizedMessageActionError.defaultMessage
        }
    }

    await message.destroy();

    // io.to(room) so every client in the room — including the one that deleted —
    // drops the message without reloading.
    room.sendDeletedRoom(Number(conversationId) , {id , chatId : Number(conversationId)});
    return {message : 'Tin nhắn đã được xoá'};
}

module.exports = {
    sendMessage , 
    sendImageMessage ,
    deleteMessage ,
    getMessages
}