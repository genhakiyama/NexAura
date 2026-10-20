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
    // Missing fields used to reach Sequelize/Postgres and surface as a 500
    // (`Conversation.type cannot be null`, or `WHERE parameter "undefined"`).
    const name = typeof conversation_name === 'string' ? conversation_name.trim() : '';
    const type = converstation_type === 'direct' ? 'direct' : 'group';
    if (!name) {
        return {
            status_code : chatErr.InvalidChatNameError.defaultStatusCode , 
            error : 'Tên đoạn chat không được để trống.'
        }
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
    }

    const conversation = await Conversation.create({ 
        name ,
        type
    });

    await conversation.addUser(userId , {
        through : {
            userRole : 'admin' , conversationName : name
        }
    });

    
    room.joinRoom(conversation.id , userId , {
        action : 'create new chat' , 
        message : `${username} đã tạo đoạn chat`,
        chatId : conversation.id
    });

    return {
        message : 'A new chat is created sucessfully',
        // The frontend needs the id to open the new chat immediately instead of
        // waiting for the next list refresh and risking a send with no id.
        id : conversation.id
    };
}

async function joinChat(username , userId , conversationId){
    // The route param arrives as a string straight from the URL. A non-numeric
    // or out-of-range value used to reach Postgres as-is and raise
    // `invalid input syntax for type integer`, which surfaced as a 500.
    const id = Number(conversationId);
    if (!Number.isInteger(id) || id <= 0 || id > 2147483647) {
        return {
            status_code : chatErr.InvalidChatNameError.defaultStatusCode , 
            error : chatErr.InvalidChatNameError.defaultMessage
        }
    }

    const isMem = await ConverMem.findOne({
        where : {
            userId , 
            conversationId : id
        }
    });

    if (isMem) {
        return {
            message : 'User đã ở trong đoạn chat'
        }
    }

    const conversation = await Conversation.findOne({
        where : {
            id
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