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
    deleteMessage ,
    getMessages
};
