require('dotenv').config();

const chatService = require('../Service/Conversation');

async function createChat(req , res) {
    const userId = req.userId;
    const username = req.username;
    const {conversation_name , conversation_type} = req.body;

    const newChat = await chatService.createNewChat(userId , username , conversation_name , conversation_type);

    if (newChat.error) {
        return res.status(newChat.status_code).json({
            success : false , 
            payload : {
                error : newChat.error
            }
        });
    }

    return res.status(200).json({
        success : true , 
        payload : {
            message : newChat.message,
            id : newChat.id
        }
    });
}

async function joinChat(req , res) {
    const userId = req.userId;
    const username = req.username;
    const {conversationId} = req.params;

    const isJoin = await chatService.joinChat(username , userId , conversationId);

    if (isJoin.error) {
        return res.status(isJoin.status_code || 400).json({
            success : false ,
            payload : {
                error : isJoin.error
            }
        });
    }

    return res.status(isJoin.status_code || 200).json({
        success : true , 
        payload : {
            message : isJoin.message,
            status : isJoin.status,
            chatId : isJoin.chatId
        }
    });
}

async function requestJoin(req , res) {
    const userId = req.userId;
    const username = req.username;
    const {conversationId} = req.params;

    const result = await chatService.requestJoinChat(username , userId , conversationId);

    if (result.error) {
        return res.status(result.status_code || 400).json({
            success : false ,
            payload : {
                error : result.error
            }
        });
    }

    return res.status(200).json({
        success : true ,
        payload : result
    });
}

async function getPendingRequests(req , res) {
    const adminUserId = req.userId;
    const {conversationId} = req.params;

    const result = await chatService.getPendingRequests(adminUserId , conversationId);

    if (result.error) {
        return res.status(result.status_code || 400).json({
            success : false ,
            payload : {
                error : result.error
            }
        });
    }

    return res.status(200).json({
        success : true ,
        payload : result
    });
}

async function approveMember(req , res) {
    const adminUserId = req.userId;
    const {conversationId} = req.params;
    const {targetUserId} = req.body;

    if (!targetUserId) {
        return res.status(400).json({
            success : false ,
            payload : { error : 'targetUserId is required' }
        });
    }

    const result = await chatService.approveMember(adminUserId , conversationId , Number(targetUserId));

    if (result.error) {
        return res.status(result.status_code || 400).json({
            success : false ,
            payload : {
                error : result.error
            }
        });
    }

    return res.status(200).json({
        success : true ,
        payload : result
    });
}

async function rejectMember(req , res) {
    const adminUserId = req.userId;
    const {conversationId} = req.params;
    const {targetUserId} = req.body;

    if (!targetUserId) {
        return res.status(400).json({
            success : false ,
            payload : { error : 'targetUserId is required' }
        });
    }

    const result = await chatService.rejectMember(adminUserId , conversationId , Number(targetUserId));

    if (result.error) {
        return res.status(result.status_code || 400).json({
            success : false ,
            payload : {
                error : result.error
            }
        });
    }

    return res.status(200).json({
        success : true ,
        payload : result
    });
}

async function getMyChats(req , res) {
    const userId = req.userId;

    const myChats = await chatService.getMyConversations(userId);

    if (myChats.error) {
        return res.status(myChats.status_code).json({
            success : false ,
            payload : {
                error : myChats.error
            }
        });
    }

    return res.status(200).json({
        success : true ,
        payload : {
            conversations : myChats.conversations
        }
    });
}

module.exports = {
    createChat , 
    joinChat ,
    requestJoin ,
    getPendingRequests ,
    approveMember ,
    rejectMember ,
    getMyChats
};