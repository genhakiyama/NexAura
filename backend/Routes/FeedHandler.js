const express = require('express');
const FeedController = require('../Controller/Feed');
const { uploadAnyFile } = require('../Middleware/upload');

const router = express.Router();

const handleFeedUpload = (req, res, next) => {
    uploadAnyFile.single('file')(req, res, (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({
                    success: false,
                    payload: { error: 'Dung lượng tệp/video không được vượt quá 200MB.' }
                });
            }
            return res.status(err.status || 400).json({
                success: false,
                payload: { error: err.message || 'Lỗi tải lên tệp.' }
            });
        }
        next();
    });
};

// Posts CRUD
router.post('/posts', FeedController.createPost);
router.post('/upload', handleFeedUpload, FeedController.uploadAttachment);
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
