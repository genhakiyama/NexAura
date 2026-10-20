const ChatController = require('../Controller/Conversation');
const MessageController = require('../Controller/Message');
const upload = require('../Middleware/upload');
const express = require('express');

const router = express.Router();

// Conversations & Memberships
router.post('/conversation/create' , ChatController.createChat);
router.post('/conversation/join/:conversationId' , ChatController.joinChat);
router.post('/conversation/request-join/:conversationId' , ChatController.requestJoin);
router.get('/conversation/:conversationId/pending-requests' , ChatController.getPendingRequests);
router.post('/conversation/:conversationId/approve' , ChatController.approveMember);
router.post('/conversation/:conversationId/reject' , ChatController.rejectMember);
router.get('/conversation' , ChatController.getMyChats);
router.post('/conversation/:conversationId/leave' , MessageController.leaveChat);
router.delete('/conversation/:conversationId' , MessageController.deleteChat);

// Messages & Media
router.post('/message/send' , MessageController.sendMessage);
router.post('/message/upload' , upload.single('image') , MessageController.uploadImage);
router.delete('/message/delete' , MessageController.deleteMessage);
router.get('/conversation/:conversationId/messages' , MessageController.getMessages);
router.get('/conversation/:conversationId/media' , MessageController.getSharedMedia);

module.exports = router;