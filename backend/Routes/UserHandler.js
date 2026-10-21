const express = require('express');
const FriendshipController = require('../Controller/Friendship');

const router = express.Router();

router.get('/search', FriendshipController.searchUsers);
router.post('/search', FriendshipController.searchUsers);
router.post('/:id/block', FriendshipController.blockUser);
router.post('/:id/unblock', FriendshipController.unblockUser);

module.exports = router;
