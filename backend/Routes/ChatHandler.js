const ChatController = require('../Controller/Conversation');
const MessageController = require('../Controller/Message');
const upload = require('../Middleware/upload');
const express =require('express');

const router = express.Router();

router.post('/conversation/create' , ChatController.createChat);
router.post('/conversation/join/:conversationId' , ChatController.joinChat);
router.get('/conversation' , ChatController.getMyChats);

router.post('/message/send' , MessageController.sendMessage);
router.post('/message/upload' , upload.single('image') , MessageController.uploadImage);
router.delete('/message/delete' , MessageController.deleteMessage);
router.get('/conversation/:conversationId/messages' , MessageController.getMessages);

module.exports = router;