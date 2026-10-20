const Conversation = require('../Models/Conversation');
const ConverMem = require('../Models/ConversationMembers');
const User = require('../Models/User');
const chatErr = require('../Errors/Chat');
const room = require('../Socket/RoomManager');
const { encryptChatId, decryptChatId } = require('../UTIL/ChatCrypto');

const MAX_PER_CHAT = 300;

/**
 * Get all conversations for a user.
 * Returns encrypted IDs for public consumption so internal numeric IDs are not exposed.
 */
async function getMyConversations(userId) {
    const members = await ConverMem.findAll({
        where : { userId }
    });

    const conversations = [];
    for (const member of members) {
        const conversation = await Conversation.findOne({
            where : { id : member.conversationId }
        });
        if (conversation) {
            conversations.push({
                id : encryptChatId(conversation.id) ,
                name : conversation.name ,
                type : conversation.type ,
                numberMembers : conversation.numberMembers ,
                userRole : member.userRole ,
                status : member.status || 'approved'
            });
        }
    }

    return { conversations };
}

/**
 * Create a new chat. Creator is assigned 'admin' with status 'approved'.
 */
async function createNewChat(userId , username , conversation_name , converstation_type) {
    const name = typeof conversation_name === 'string' ? conversation_name.trim() : '';
    const type = converstation_type === 'direct' ? 'direct' : 'group';
    if (!name) {
        return {
            status_code : chatErr.InvalidChatNameError.defaultStatusCode , 
            error : 'Tên đoạn chat không được để trống.'
        };
    }

    const isMem = await ConverMem.findOne({
        where : {
            userId : userId , 
            conversationName : name
        }
    });

    if (isMem) return {
        status_code : chatErr.ChatAlreadyExistsError.defaultStatusCode , 
        error : chatErr.ChatAlreadyExistsError.defaultMessage
    };

    const conversation = await Conversation.create({ 
        name ,
        type
    });

    await conversation.addUser(userId , {
        through : {
            userRole : 'admin' , 
            conversationName : name ,
            status : 'approved'
        }
    });

    const encryptedId = encryptChatId(conversation.id);

    room.joinRoom(conversation.id , userId , {
        action : 'create new chat' , 
        message : `${username} đã tạo đoạn chat`,
        chatId : encryptedId
    });

    return {
        message : 'Đoạn chat mới đã được tạo thành công.',
        id : encryptedId
    };
}

/**
 * Request to join a chat. In group chats, members start as 'pending' until approved by an Admin.
 */
async function requestJoinChat(username , userId , conversationId) {
    const id = decryptChatId(conversationId);
    if (!id) {
        return {
            status_code : 400 ,
            error : 'Mã đoạn chat không hợp lệ.'
        };
    }

    const conversation = await Conversation.findOne({ where : { id } });
    if (!conversation) {
        return {
            status_code : 404 ,
            error : 'Đoạn chat không tồn tại.'
        };
    }

    if (conversation.type === 'direct') {
        return {
            status_code : 400 ,
            error : 'Không thể yêu cầu tham gia cuộc trò chuyện trực tiếp (1-1).'
        };
    }

    if (conversation.numberMembers >= MAX_PER_CHAT) {
        return {
            status_code : 400 ,
            error : 'Đoạn chat đã đạt số lượng thành viên tối đa.'
        };
    }

    const existingMem = await ConverMem.findOne({
        where : { userId , conversationId : id }
    });

    if (existingMem) {
        if (existingMem.status === 'approved') {
            return {
                status_code : 200 ,
                message : 'Bạn đã là thành viên của đoạn chat này.',
                status : 'approved' ,
                chatId : encryptChatId(id)
            };
        }
        if (existingMem.status === 'pending') {
            return {
                status_code : 400 ,
                error : 'Yêu cầu tham gia của bạn đang chờ Quản trị viên phê duyệt.' ,
                status : 'pending'
            };
        }
        if (existingMem.status === 'banned') {
            return {
                status_code : 403 ,
                error : 'Bạn đã bị cấm tham gia đoạn chat này.'
            };
        }
        // If rejected previously, allow re-request
        await existingMem.update({
            status : 'pending' ,
            requestedAt : new Date()
        });
    } else {
        await ConverMem.create({
            userId ,
            conversationId : id ,
            conversationName : conversation.name ,
            userRole : 'member' ,
            status : 'pending' ,
            requestedAt : new Date()
        });
    }

    const encryptedId = encryptChatId(id);

    // Notify admins in real-time
    const admins = await ConverMem.findAll({
        where : { conversationId : id , userRole : 'admin' , status : 'approved' }
    });

    for (const admin of admins) {
        room.sendToUser(admin.userId , 'new_join_request' , {
            chatId : encryptedId ,
            conversationName : conversation.name ,
            userId ,
            username ,
            requestedAt : new Date()
        });
    }

    return {
        status_code : 200 ,
        message : 'Yêu cầu tham gia đã được gửi tới Quản trị viên để phê duyệt.' ,
        status : 'pending' ,
        chatId : encryptedId
    };
}

/**
 * Get pending join requests for a conversation (Admin only).
 */
async function getPendingRequests(adminUserId , conversationId) {
    const id = decryptChatId(conversationId);
    if (!id) {
        return { status_code : 400 , error : 'Mã đoạn chat không hợp lệ.' };
    }

    const adminMem = await ConverMem.findOne({
        where : { userId : adminUserId , conversationId : id , userRole : 'admin' , status : 'approved' }
    });

    if (!adminMem) {
        return {
            status_code : 403 ,
            error : 'Chỉ Quản trị viên mới có quyền xem danh sách chờ duyệt.'
        };
    }

    const pendingMembers = await ConverMem.findAll({
        where : { conversationId : id , status : 'pending' }
    });

    const requests = [];
    for (const mem of pendingMembers) {
        const u = await User.findOne({
            where : { id : mem.userId } ,
            attributes : ['id' , 'username' , 'email']
        });
        if (u) {
            requests.push({
                userId : u.id ,
                username : u.username ,
                email : u.email ,
                requestedAt : mem.requestedAt
            });
        }
    }

    return {
        chatId : encryptChatId(id) ,
        pendingRequests : requests
    };
}

/**
 * Approve a pending member (Admin only).
 */
async function approveMember(adminUserId , conversationId , targetUserId) {
    const id = decryptChatId(conversationId);
    if (!id) {
        return { status_code : 400 , error : 'Mã đoạn chat không hợp lệ.' };
    }

    const adminMem = await ConverMem.findOne({
        where : { userId : adminUserId , conversationId : id , userRole : 'admin' , status : 'approved' }
    });

    if (!adminMem) {
        return {
            status_code : 403 ,
            error : 'Chỉ Quản trị viên mới có quyền phê duyệt thành viên.'
        };
    }

    const targetMem = await ConverMem.findOne({
        where : { userId : targetUserId , conversationId : id , status : 'pending' }
    });

    if (!targetMem) {
        return {
            status_code : 404 ,
            error : 'Yêu cầu tham gia không tồn tại hoặc đã được xử lý.'
        };
    }

    await targetMem.update({
        status : 'approved' ,
        reviewedBy : adminUserId ,
        reviewedAt : new Date()
    });

    const conversation = await Conversation.findByPk(id);
    if (conversation) {
        await conversation.increment('numberMembers', { by : 1 });
    }

    const targetUser = await User.findByPk(targetUserId);
    const encryptedId = encryptChatId(id);

    // Notify room and target user
    room.joinRoom(id , targetUserId , {
        action : 'Join' ,
        message : `${targetUser ? targetUser.username : 'Thành viên mới'} đã được duyệt vào đoạn chat.` ,
        chatId : encryptedId
    });

    room.sendToUser(targetUserId , 'join_approved' , {
        chatId : encryptedId ,
        message : `Yêu cầu tham gia đoạn chat "${conversation?.name || ''}" của bạn đã được phê duyệt!`
    });

    return {
        message : 'Đã phê duyệt thành viên thành công.' ,
        chatId : encryptedId ,
        userId : targetUserId
    };
}

/**
 * Reject a pending member (Admin only).
 */
async function rejectMember(adminUserId , conversationId , targetUserId) {
    const id = decryptChatId(conversationId);
    if (!id) {
        return { status_code : 400 , error : 'Mã đoạn chat không hợp lệ.' };
    }

    const adminMem = await ConverMem.findOne({
        where : { userId : adminUserId , conversationId : id , userRole : 'admin' , status : 'approved' }
    });

    if (!adminMem) {
        return {
            status_code : 403 ,
            error : 'Chỉ Quản trị viên mới có quyền từ chối yêu cầu.'
        };
    }

    const targetMem = await ConverMem.findOne({
        where : { userId : targetUserId , conversationId : id }
    });

    if (!targetMem) {
        return {
            status_code : 404 ,
            error : 'Yêu cầu tham gia không tồn tại.'
        };
    }

    await targetMem.update({
        status : 'rejected' ,
        reviewedBy : adminUserId ,
        reviewedAt : new Date()
    });

    const encryptedId = encryptChatId(id);

    room.sendToUser(targetUserId , 'join_rejected' , {
        chatId : encryptedId ,
        message : 'Yêu cầu tham gia đoạn chat của bạn đã bị từ chối.'
    });

    return {
        message : 'Đã từ chối yêu cầu tham gia.' ,
        chatId : encryptedId ,
        userId : targetUserId
    };
}

// Backward-compatible alias for joinChat
async function joinChat(username , userId , conversationId) {
    return requestJoinChat(username , userId , conversationId);
}

module.exports = {
    createNewChat ,
    joinChat ,
    requestJoinChat ,
    getPendingRequests ,
    approveMember ,
    rejectMember ,
    getMyConversations
};