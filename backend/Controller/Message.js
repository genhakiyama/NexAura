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

    if (!req.file || !req.file.buffer) {
        return res.status(400).json({
            success : false ,
            payload : { error : 'Vui lòng chọn một tệp ảnh để tải lên.' }
        });
    }

    try {
        const result = await MessageService.sendImageMessage(
            userId , username , conversationId , req.file
        );

        if (result.error) {
            return res.status(result.status_code || 400).json({
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
    } catch (err) {
        console.error('[uploadImage controller]' , err);
        return res.status(500).json({
            success : false ,
            payload : { error : err.message || 'Lỗi gửi ảnh.' }
        });
    }
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

async function leaveChat(req , res) {
    const userId = req.userId;
    const username = req.username;
    const { conversationId } = req.params;

    const result = await MessageService.leaveChat(userId , username , conversationId);
    if (result.error) {
        return res.status(result.status_code || 400).json({
            success : false ,
            payload : { error : result.error }
        });
    }

    return res.status(200).json({
        success : true ,
        payload : result
    });
}

async function deleteChat(req , res) {
    const userId = req.userId;
    const username = req.username;
    const { conversationId } = req.params;

    const result = await MessageService.deleteChat(userId , username , conversationId);
    if (result.error) {
        return res.status(result.status_code || 400).json({
            success : false ,
            payload : { error : result.error }
        });
    }

    return res.status(200).json({
        success : true ,
        payload : result
    });
}

async function getSharedMedia(req , res) {
    const userId = req.userId;
    const { conversationId } = req.params;

    const result = await MessageService.getSharedMedia(userId , conversationId);
    if (result.error) {
        return res.status(result.status_code || 400).json({
            success : false ,
            payload : { error : result.error }
        });
    }

    return res.status(200).json({
        success : true ,
        payload : result
    });
}

module.exports = {
    sendMessage , 
    uploadImage ,
    deleteMessage ,
    getMessages ,
    leaveChat ,
    deleteChat ,
    getSharedMedia
};
