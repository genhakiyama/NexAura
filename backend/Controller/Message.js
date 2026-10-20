require('dotenv').config();

const MessageService = require('../Service/Message');

async function sendMessage(req , res) {
    const userId = req.userId;
    const username = req.username;
    const { conversationId ,  type , content } = req.body;

    const sendMessage = await MessageService.sendMessage(
        userId , username , type , conversationId , content
    );

    if (sendMessage.error) {
        return res.status(sendMessage.status_code).json({
            success : false , 
            payload : {
                error : sendMessage.error
            }
        });
    }

    return res.status(200).json({
        success : true , 
        payload : {
            sendMessage 
        }
    });
}

async function uploadImage(req , res) {
    const userId = req.userId;
    const username = req.username;
    const conversationId = req.body.conversationId;

    if (!conversationId) {
        return res.status(400).json({
            success : false ,
            payload : { error : 'conversationId is required.' }
        });
    }

    const result = await MessageService.sendImageMessage(
        userId , username , conversationId , req.file
    );

    if (result.error) {
        return res.status(result.status_code).json({
            success : false ,
            payload : { error : result.error }
        });
    }

    return res.status(200).json({
        success : true ,
        payload : {
            message : result.message ,
            messageId : result.messageId ,
            imageUrl : result.imageUrl
        }
    });
}

async function deleteMessage(req , res) {
    const userId = req.userId;
    const username = req.username;
    const {conversationId , messageId} = req.body;

    const deleteMessage = await MessageService.deleteMessage(userId , username , conversationId , messageId);
    if (deleteMessage.error) {
        return res.status(deleteMessage.status_code).json({
            error : deleteMessage.error
        });
    }

    return res.status(200).json({
        payload : {
            deleteMessage
        }
    });
}

async function getMessages(req , res) {
    const userId = req.userId;
    const { conversationId } = req.params;

    const messages = await MessageService.getMessages(userId , conversationId);
    if (messages.error) {
        return res.status(messages.status_code).json({
            success : false ,
            payload : {
                error : messages.error
            }
        });
    }

    return res.status(200).json({
        success : true ,
        payload : {
            messages : messages.messages
        }
    });
}

module.exports = {
    sendMessage , 
    uploadImage ,
    deleteMessage ,
    getMessages
};
