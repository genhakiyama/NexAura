require('dotenv').config();
const Message = require('../Models/Message');
const Image = require('../Models/Image');
const User = require('../Models/User');
const Conversation = require('../Models/Conversation');
const ConverMem = require('../Models/ConversationMembers');

const messageErr = require('../Errors/Message');
const chatErr = require('../Errors/Chat');

const room = require('../Socket/RoomManager');
const { uploadImage } = require('./Upload');
const { encryptChatId, decryptChatId } = require('../UTIL/ChatCrypto');

async function isMember(userId , conversationId){
    const id = decryptChatId(conversationId);
    if (!id) {
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
            status_code : 403 , 
            error : 'Bạn không phải là thành viên của đoạn chat này.'
        }
    }

    if (member.status === 'pending') {
        return {
            status_code : 403 ,
            error : 'Yêu cầu tham gia của bạn đang chờ Quản trị viên phê duyệt.'
        };
    }

    if (member.status !== 'approved') {
        return {
            status_code : 403 ,
            error : 'Bạn không có quyền truy cập đoạn chat này.'
        };
    }

    member.realConversationId = id;
    member.encryptedChatId = encryptChatId(id);
    return member;
}

async function getMessages(userId , conversationId) {
    const member = await isMember(userId, conversationId);
    if (member.error) return member;
    const id = member.realConversationId;

    const messages = await Message.findAll({
        where : { conversationId : id } ,
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

    const id = member.realConversationId;
    const encryptedId = member.encryptedChatId;

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
        chatId : encryptedId,
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
            status_code : 400 ,
            error : 'Vui lòng đính kèm một tệp ảnh hợp lệ.'
        };
    }

    if (file.size > 4 * 1024 * 1024) {
        return {
            status_code : messageErr.AttachmentTooLargeError.defaultStatusCode ,
            error : 'Tệp ảnh vượt quá dung lượng cho phép (tối đa 4MB trên Vercel).'
        };
    }

    const member = await isMember(senderId , conversationId);
    if (member.error) return member;

    const id = member.realConversationId;
    const encryptedId = member.encryptedChatId;

    // Upload to Supabase Storage and get the public URL
    let uploadResult;
    try {
        uploadResult = await uploadImage(file , id);
    } catch (err) {
        console.error('[sendImageMessage] upload error:' , err.message);
        return {
            status_code : err.statusCode || 500 ,
            error : `Lỗi lưu trữ ảnh: ${err.message}`
        };
    }

    const imageUrl = uploadResult.publicUrl;

    const message = await Message.create({
        type : 'image' ,
        status : 'sent' ,
        content : imageUrl ,
        userId : senderId ,
        conversationId : id
    });

    // Tạo bản ghi Image liên kết tương ứng
    try {
        await Image.create({
            url : imageUrl ,
            originalName : file.originalname ,
            mimetype : file.mimetype ,
            size : file.size ,
            userId : senderId ,
            conversationId : id ,
            messageId : message.id
        });
    } catch (imageErr) {
        console.error('[sendImageMessage] failed to create Image record:' , imageErr.message);
    }

    room.sendToRoom(id , {
        id : message.id ,
        from : username ,
        message : imageUrl ,
        type : 'image' ,
        chatId : encryptedId ,
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
    const conversationRealId = member.realConversationId;
    const encryptedChatId = member.encryptedChatId;

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
    room.sendDeletedRoom(conversationRealId , { id , chatId : encryptedChatId });
    return {message : 'Tin nhắn đã được xoá'};
}

module.exports = {
    sendMessage , 
    sendImageMessage ,
    deleteMessage ,
    getMessages
}