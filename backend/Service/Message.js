require('dotenv').config();
const Message = require('../Models/Message');
const User = require('../Models/User');
const Conversation = require('../Models/Conversation');
const ConverMem = require('../Models/ConversationMembers');

const messageErr = require('../Errors/Message');
const chatErr = require('../Errors/Chat');

const room = require('../Socket/RoomManager');

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

    // Message.content is VARCHAR(255); without this check Postgres throws
    // "value too long" and the browser only sees a generic 500.
    if (text.length > 255) {
        return {
            status_code : 400,
            error : 'Tin nhắn tối đa 255 ký tự.'
        }
    }

    const member = await isMember(senderId, conversationId);
    if (member.error) return member;

    const message = await Message.create({
        type , status : 'sent' , content : text ,
        userId : senderId ,
        conversationId : conversationId
    });

    room.sendToRoom(conversationId , {
        id : message.id,
        from : username , 
        message : text ,
        chatId : conversationId,
        createdAt: message.createdAt
    });

    return {
        message : 'Tin nhắn đã gửi',
        messageId : message.id
    };
}

async function deleteMessage(senderId , username , conversationId , messageId) {
    const member = await isMember(senderId , conversationId);
    if (member.error) return member;

    // Look the row up BEFORE destroying it: Message.destroy() only returns the
    // number of affected rows, so ownership can never be checked from it.
    const message = await Message.findOne({ where : { id : messageId } });
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
    room.sendDeletedRoom(conversationId , {id : Number(messageId) , chatId : Number(conversationId)});
    return {message : 'Tin nhắn đã được xoá'};
}

module.exports = {
    sendMessage , 
    deleteMessage ,
    getMessages
}