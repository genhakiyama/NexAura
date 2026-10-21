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

// Posts CRUD (hỗ trợ cả /posts và /post)
router.post(['/posts', '/post'], FeedController.createPost);
router.post('/upload', handleFeedUpload, FeedController.uploadAttachment);
router.get(['/posts', '/post'], FeedController.getFeed);
router.patch(['/posts/:id', '/post/:id'], FeedController.updatePost);
router.delete(['/posts/:id', '/post/:id'], FeedController.deletePost);

// Delegated Post Editors (RBAC)
router.post(['/posts/:id/editors', '/post/:id/editors'], FeedController.grantPostEditor);
router.delete(['/posts/:id/editors/:userId', '/post/:id/editors/:userId'], FeedController.revokePostEditor);
router.get(['/posts/:id/editors', '/post/:id/editors'], FeedController.getPostEditors);

// Comments & 1-level replies
router.post(['/posts/:id/comments', '/post/:id/comments'], FeedController.addComment);
router.get(['/posts/:id/comments', '/post/:id/comments'], FeedController.getComments);
router.delete('/comments/:id', FeedController.deleteComment);

// Reactions (posts & comments)
router.post('/reactions', FeedController.toggleReaction);

// Social Notifications
router.get('/notifications', FeedController.getNotifications);
router.patch('/notifications/:id/read', FeedController.markNotificationAsRead);

module.exports = router;
