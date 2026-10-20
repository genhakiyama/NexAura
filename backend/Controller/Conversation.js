require('dotenv').config();

const chatService = require('../Service/Conversation');

async function createChat(req , res) {
    const userId = req.userId;
    const username = req.username;
    const {conversation_name , conversation_type} = req.body;

    const newChat = await chatService.createNewChat(userId , username , conversation_name , conversation_type);

    if (newChat.error) {
        return res.status(newChat.status_code).json({
            sucess : false , 
            payload : {
                error : newChat.error
            }
        });
    }

    return res.status(200).json({
        sucess : true , 
        payload : {
            message : newChat.message
        }
    });
};

async function joinChat(req , res) {
    const userId = req.userId;
    const username = req.username;
    const {conversationId} = req.params;

    const isJoin = await chatService.joinChat(username , userId , conversationId);

    if (isJoin.error) {
        return res.status(isJoin.status_code).json({
            sucess : false ,
            payload : {
                error : isJoin.error
            }
        });
    }

    return res.status(200).json({
        sucess : true , 
        payload : {
            message : isJoin.message
        }
    });
}

async function getMyChats(req , res) {
    const userId = req.userId;

    const myChats = await chatService.getMyConversations(userId);

    if (myChats.error) {
        return res.status(myChats.status_code).json({
            sucess : false ,
            payload : {
                error : myChats.error
            }
        });
    }

    return res.status(200).json({
        sucess : true ,
        payload : {
            conversations : myChats.conversations
        }
    });
}

module.exports = {
    createChat , 
    joinChat ,
    getMyChats
}