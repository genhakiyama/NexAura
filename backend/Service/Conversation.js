const Conversation = require('../Models/Conversation');
const ConverMem = require('../Models/ConversationMembers');

const chatErr = require('../Errors/Chat');

const room = require('../Socket/RoomManager');

const MAX_PER_CHAT = 300;

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
                id : conversation.id ,
                name : conversation.name ,
                type : conversation.type ,
                numberMembers : conversation.numberMembers ,
                userRole : member.userRole
            });
        }
    }

    return { conversations };
}

async function createNewChat(userId , username , conversation_name , converstation_type){
    const isMem = await ConverMem.findOne({
        where : {
            userId : userId , 
            conversationName : conversation_name
        }
    });

    if (isMem) return {
        status_code : chatErr.ChatAlreadyExistsError.defaultStatusCode , 
        error : chatErr.ChatAlreadyExistsError.defaultMessage
    }

    const conversation = await Conversation.create({ 
        name : conversation_name , 
        type : converstation_type
    });

    await conversation.addUser(userId , {
        through : {
            userRole : 'admin' , conversationName : conversation_name
        }
    });

    
    room.joinRoom(conversation.id , userId , {
        action : 'create new chat' , 
        message : `${username} đã tạo đoạn chat`,
        chatId : conversation.id
    });

    return {
        message : 'A new chat is created sucessfully'
    };
}

async function joinChat(username , userId , conversationId){
    const isMem = await ConverMem.findOne({
        where : {
            userId , 
            conversationId
        }
    });

    if (isMem) {
        return {
            message : 'User đã ở trong đoạn chat'
        }
    }

    const conversation = await Conversation.findOne({
        where : {
            id : conversationId
        }
    });

    if (!conversation) {
        return {
            status_code : chatErr.InvalidChatNameError.defaultStatusCode , 
            error : chatErr.InvalidChatNameError.defaultMessage
        }
    }

    const  numberMembers = conversation.numberMembers + 1;

    if (conversation.type === 'direct' || numberMembers > MAX_PER_CHAT) {
        return {
            status_code : chatErr.ChatCreateRateLimitedError.defaultStatusCode , 
            error : chatErr.ChatCreateFailedError.defaultMessage
        }
    }

    room.joinRoom(conversationId , userId , {
        action : "Join" , 
        message : `${username} đã tham gia vào đoạn chat`,
        chatId : conversationId
    })

    await conversation.update({numberMembers});
    await conversation.addUser(
        userId , {
            through : {
                userRole : 'member' , conversationName : conversation.name
            }
        }
    );

    return {
        message : 'Chào mừng gia nhập!'
    };
}

module.exports = {
    createNewChat ,
    joinChat ,
    getMyConversations
}