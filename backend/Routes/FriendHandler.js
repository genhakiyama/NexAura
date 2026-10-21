const express = require('express');
const FriendshipController = require('../Controller/Friendship');

const router = express.Router();

// Friend requests and friendship management
router.post('/requests', FriendshipController.sendRequest);
router.get('/requests', FriendshipController.getRequests);
router.patch('/requests/:id', FriendshipController.respondRequest);
router.delete('/requests/:id', FriendshipController.cancelRequest);
router.delete('/:friendId', FriendshipController.unfriend);
router.get('/', FriendshipController.getFriends);

module.exports = router;
