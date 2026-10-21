const express = require('express');
const FeedController = require('../Controller/Feed');

const router = express.Router();

// Posts CRUD
router.post('/posts', FeedController.createPost);
router.get('/posts', FeedController.getFeed);
router.patch('/posts/:id', FeedController.updatePost);
router.delete('/posts/:id', FeedController.deletePost);

// Delegated Post Editors (RBAC)
router.post('/posts/:id/editors', FeedController.grantPostEditor);
router.delete('/posts/:id/editors/:userId', FeedController.revokePostEditor);
router.get('/posts/:id/editors', FeedController.getPostEditors);

// Comments & 1-level replies
router.post('/posts/:id/comments', FeedController.addComment);
router.get('/posts/:id/comments', FeedController.getComments);
router.delete('/comments/:id', FeedController.deleteComment);

// Reactions (posts & comments)
router.post('/reactions', FeedController.toggleReaction);

// Social Notifications
router.get('/notifications', FeedController.getNotifications);
router.patch('/notifications/:id/read', FeedController.markNotificationAsRead);

module.exports = router;
