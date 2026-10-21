require('dotenv').config();
const Message = require('../Models/Message');
const Image = require('../Models/Image');
const User = require('../Models/User');
const Conversation = require('../Models/Conversation');
const ConverMem = require('../Models/ConversationMembers');

const { Op } = require('sequelize');
const messageErr = require('../Errors/Message');
const chatErr = require('../Errors/Chat');

const room = require('../Socket/RoomManager');
const { uploadImage, uploadFileToStorage } = require('./Upload');
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

async function sendFileMessage(senderId , username , conversationId , file) {
    if (!file || !file.buffer) {
        return {
            status_code : 400 ,
            error : 'Vui lòng đính kèm một tệp hợp lệ.'
        };
    }

    const MAX_FILE_SIZE = 25 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
        return {
            status_code : messageErr.AttachmentTooLargeError?.defaultStatusCode || 400 ,
            error : 'Tệp vượt quá dung lượng cho phép (tối đa 25MB).'
        };
    }

    const member = await isMember(senderId , conversationId);
    if (member.error) return member;

    const id = member.realConversationId;
    const encryptedId = member.encryptedChatId;

    let uploadResult;
    try {
        uploadResult = await uploadFileToStorage(file , id);
    } catch (err) {
        console.error('[sendFileMessage] upload error:' , err.message);
        return {
            status_code : err.statusCode || 500 ,
            error : `Lỗi lưu trữ tệp: ${err.message}`
        };
    }

    const fileUrl = uploadResult.publicUrl;
    const filePayload = JSON.stringify({
        url: fileUrl,
        name: file.originalname,
        size: file.size,
        mimetype: file.mimetype
    });

    const message = await Message.create({
        type : 'file' ,
        status : 'sent' ,
        content : filePayload ,
        userId : senderId ,
        conversationId : id
    });

    room.sendToRoom(id , {
        id : message.id ,
        from : username ,
        message : filePayload ,
        type : 'file' ,
        chatId : encryptedId ,
        createdAt : message.createdAt
    });

    return {
        message : 'Tệp đã gửi' ,
        messageId : message.id ,
        fileUrl ,
        fileName : file.originalname ,
        fileSize : file.size
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

/**
 * Leave a conversation.
 * If user is the last approved member, delete the conversation.
 * If user was the only admin, promote the next oldest approved member.
 */
async function leaveChat(userId , username , conversationId) {
    const member = await isMember(userId , conversationId);
    if (member.error) return member;

    const conversationRealId = member.realConversationId;
    const encryptedChatId = member.encryptedChatId;

    const conversation = await Conversation.findByPk(conversationRealId);
    if (!conversation) {
        return {
            status_code : 404 ,
            error : 'Đoạn chat không tồn tại.'
        };
    }

    const totalApproved = await ConverMem.count({
        where : { conversationId : conversationRealId , status : 'approved' }
    });

    // If this is the last approved member, clean up conversation entirely
    if (totalApproved <= 1) {
        await Message.destroy({ where : { conversationId : conversationRealId } });
        await Image.destroy({ where : { conversationId : conversationRealId } });
        await ConverMem.destroy({ where : { conversationId : conversationRealId } });
        await conversation.destroy();

        room.sendToRoom(conversationRealId , {
            action : 'chat_deleted' ,
            message : 'Đoạn chat đã kết thúc vì thành viên cuối cùng đã rời khỏi.' ,
            chatId : encryptedChatId
        });

        return {
            message : 'Bạn đã rời khỏi và đoạn chat đã được đóng.' ,
            chatId : encryptedChatId ,
            deleted : true
        };
    }

    // If leaving user is admin, promote another member if no other admin remains
    if (member.userRole === 'admin') {
        const otherAdmin = await ConverMem.findOne({
            where : {
                conversationId : conversationRealId ,
                status : 'approved' ,
                userRole : 'admin' ,
                userId : { [Op.ne] : userId }
            }
        });

        if (!otherAdmin) {
            const nextMember = await ConverMem.findOne({
                where : {
                    conversationId : conversationRealId ,
                    status : 'approved' ,
                    userId : { [Op.ne] : userId }
                } ,
                order : [['createdAt' , 'ASC']]
            });
            if (nextMember) {
                await nextMember.update({ userRole : 'admin' });
            }
        }
    }

    // Remove membership record
    await member.destroy();

    // Decrement number of members
    if (conversation.numberMembers > 0) {
        await conversation.decrement('numberMembers' , { by : 1 });
    }

    // Broadcast user left
    room.sendToRoom(conversationRealId , {
        action : 'user_left' ,
        message : `${username || 'Thành viên'} đã rời khỏi đoạn chat.` ,
        userId ,
        chatId : encryptedChatId
    });

    return {
        message : 'Bạn đã rời khỏi đoạn chat thành công.' ,
        chatId : encryptedChatId ,
        deleted : false
    };
}

/**
 * Delete a conversation (Admin only).
 * Cascades removal of messages, images, members, and the conversation record.
 */
async function deleteChat(userId , username , conversationId) {
    const member = await isMember(userId , conversationId);
    if (member.error) return member;

    if (member.userRole !== 'admin') {
        return {
            status_code : 403 ,
            error : 'Chỉ Quản trị viên mới có quyền xoá đoạn chat này.'
        };
    }

    const conversationRealId = member.realConversationId;
    const encryptedChatId = member.encryptedChatId;

    const conversation = await Conversation.findByPk(conversationRealId);
    if (!conversation) {
        return {
            status_code : 404 ,
            error : 'Đoạn chat không tồn tại.'
        };
    }

    const chatName = conversation.name;

    // Broadcast deletion to all users in the room
    room.sendToRoom(conversationRealId , {
        action : 'chat_deleted' ,
        message : `Đoạn chat "${chatName}" đã bị Quản trị viên ${username} xoá.` ,
        chatId : encryptedChatId
    });

    // Delete all related records
    await Message.destroy({ where : { conversationId : conversationRealId } });
    await Image.destroy({ where : { conversationId : conversationRealId } });
    await ConverMem.destroy({ where : { conversationId : conversationRealId } });
    await conversation.destroy();

    return {
        message : 'Đoạn chat đã được xoá thành công.' ,
        chatId : encryptedChatId
    };
}

/**
 * Get shared images and files for a conversation.
 */
async function getSharedMedia(userId , conversationId) {
    const member = await isMember(userId , conversationId);
    if (member.error) return member;

    const conversationRealId = member.realConversationId;

    const imageRows = await Image.findAll({
        where : { conversationId : conversationRealId } ,
        order : [['createdAt' , 'DESC']] ,
        limit : 100
    });

    const imageMessages = await Message.findAll({
        where : { conversationId : conversationRealId , type : 'image' } ,
        include : [{ model : User , attributes : ['id' , 'username'] }] ,
        order : [['createdAt' , 'DESC']] ,
        limit : 100
    });

    const seenUrls = new Set();
    const media = [];

    for (const img of imageRows) {
        if (img.url && !seenUrls.has(img.url)) {
            seenUrls.add(img.url);
            media.push({
                id : img.id ,
                url : img.url ,
                name : img.originalName || 'Hình ảnh' ,
                mimetype : img.mimetype || 'image/jpeg' ,
                size : img.size || null ,
                createdAt : img.createdAt
            });
        }
    }

    for (const msg of imageMessages) {
        if (msg.content && !seenUrls.has(msg.content)) {
            seenUrls.add(msg.content);
            media.push({
                id : `msg-${msg.id}` ,
                url : msg.content ,
                name : 'Hình ảnh' ,
                mimetype : 'image/jpeg' ,
                size : null ,
                senderName : msg.User ? msg.User.username : null ,
                createdAt : msg.createdAt
            });
        }
    }

    return {
        chatId : member.encryptedChatId ,
        media
    };
}

module.exports = {
    sendMessage , 
    sendImageMessage ,
    sendFileMessage ,
    deleteMessage ,
    getMessages ,
    leaveChat ,
    deleteChat ,
    getSharedMedia
};