const FeedService = require('../Service/Feed');

/**
 * Feed Controller — Xử lý các request liên quan đến bài viết, bình luận, cảm xúc và uỷ quyền biên tập.
 */

async function createPost(req, res) {
    const userId = req.userId;
    const { content, mediaUrls, visibility } = req.body;

    try {
        const result = await FeedService.createPost(userId, { content, mediaUrls, visibility });
        if (result.error) {
            return res.status(result.statusCode || 400).json({ success: false, payload: { error: result.error } });
        }
        return res.status(result.statusCode || 201).json({ success: true, payload: result });
    } catch (err) {
        console.error('[createPost error]', err);
        return res.status(500).json({ success: false, payload: { error: 'Lỗi tạo bài đăng.' } });
    }
}

async function getFeed(req, res) {
    const userId = req.userId;
    const { limit, cursor } = req.query;

    try {
        const result = await FeedService.getFeed(userId, { limit, cursor });
        return res.status(200).json({ success: true, payload: result });
    } catch (err) {
        console.error('[getFeed error]', err);
        return res.status(500).json({ success: false, payload: { error: 'Lỗi tải bảng tin.' } });
    }
}

async function updatePost(req, res) {
    const userId = req.userId;
    const postId = Number(req.params.id);
    const { content, mediaUrls, visibility } = req.body;

    if (!postId) {
        return res.status(400).json({ success: false, payload: { error: 'Mã bài viết không hợp lệ.' } });
    }

    try {
        const result = await FeedService.updatePost(userId, postId, { content, mediaUrls, visibility });
        if (result.error) {
            return res.status(result.statusCode || 400).json({ success: false, payload: { error: result.error } });
        }
        return res.status(200).json({ success: true, payload: result });
    } catch (err) {
        console.error('[updatePost error]', err);
        return res.status(500).json({ success: false, payload: { error: 'Lỗi cập nhật bài đăng.' } });
    }
}

async function deletePost(req, res) {
    const userId = req.userId;
    const postId = Number(req.params.id);

    if (!postId) {
        return res.status(400).json({ success: false, payload: { error: 'Mã bài viết không hợp lệ.' } });
    }

    try {
        const result = await FeedService.deletePost(userId, postId);
        if (result.error) {
            return res.status(result.statusCode || 400).json({ success: false, payload: { error: result.error } });
        }
        return res.status(200).json({ success: true, payload: result });
    } catch (err) {
        console.error('[deletePost error]', err);
        return res.status(500).json({ success: false, payload: { error: 'Lỗi xoá bài đăng.' } });
    }
}

async function grantPostEditor(req, res) {
    const authorId = req.userId;
    const postId = Number(req.params.id);
    const { targetUserId } = req.body;

    if (!postId || !targetUserId) {
        return res.status(400).json({ success: false, payload: { error: 'Thiếu thông tin bài viết hoặc người được uỷ quyền.' } });
    }

    try {
        const result = await FeedService.grantPostEditor(authorId, postId, targetUserId);
        if (result.error) {
            return res.status(result.statusCode || 400).json({ success: false, payload: { error: result.error } });
        }
        return res.status(200).json({ success: true, payload: result });
    } catch (err) {
        console.error('[grantPostEditor error]', err);
        return res.status(500).json({ success: false, payload: { error: 'Lỗi cấp quyền chỉnh sửa.' } });
    }
}

async function revokePostEditor(req, res) {
    const authorId = req.userId;
    const postId = Number(req.params.id);
    const targetUserId = req.params.userId;

    if (!postId || !targetUserId) {
        return res.status(400).json({ success: false, payload: { error: 'Thiếu thông tin bài viết hoặc người dùng.' } });
    }

    try {
        const result = await FeedService.revokePostEditor(authorId, postId, targetUserId);
        if (result.error) {
            return res.status(result.statusCode || 400).json({ success: false, payload: { error: result.error } });
        }
        return res.status(200).json({ success: true, payload: result });
    } catch (err) {
        console.error('[revokePostEditor error]', err);
        return res.status(500).json({ success: false, payload: { error: 'Lỗi thu hồi quyền chỉnh sửa.' } });
    }
}

async function getPostEditors(req, res) {
    const authorId = req.userId;
    const postId = Number(req.params.id);

    if (!postId) {
        return res.status(400).json({ success: false, payload: { error: 'Mã bài viết không hợp lệ.' } });
    }

    try {
        const result = await FeedService.getPostEditors(authorId, postId);
        if (result.error) {
            return res.status(result.statusCode || 400).json({ success: false, payload: { error: result.error } });
        }
        return res.status(200).json({ success: true, payload: result });
    } catch (err) {
        console.error('[getPostEditors error]', err);
        return res.status(500).json({ success: false, payload: { error: 'Lỗi lấy danh sách người chỉnh sửa.' } });
    }
}

async function addComment(req, res) {
    const userId = req.userId;
    const postId = Number(req.params.id);
    const { content, parentId } = req.body;

    if (!postId) {
        return res.status(400).json({ success: false, payload: { error: 'Mã bài viết không hợp lệ.' } });
    }

    try {
        const result = await FeedService.addComment(userId, postId, { content, parentId });
        if (result.error) {
            return res.status(result.statusCode || 400).json({ success: false, payload: { error: result.error } });
        }
        return res.status(result.statusCode || 201).json({ success: true, payload: result });
    } catch (err) {
        console.error('[addComment error]', err);
        return res.status(500).json({ success: false, payload: { error: 'Lỗi thêm bình luận.' } });
    }
}

async function getComments(req, res) {
    const userId = req.userId;
    const postId = Number(req.params.id);

    if (!postId) {
        return res.status(400).json({ success: false, payload: { error: 'Mã bài viết không hợp lệ.' } });
    }

    try {
        const result = await FeedService.getComments(userId, postId);
        if (result.error) {
            return res.status(result.statusCode || 400).json({ success: false, payload: { error: result.error } });
        }
        return res.status(200).json({ success: true, payload: result });
    } catch (err) {
        console.error('[getComments error]', err);
        return res.status(500).json({ success: false, payload: { error: 'Lỗi tải bình luận.' } });
    }
}

async function deleteComment(req, res) {
    const userId = req.userId;
    const commentId = Number(req.params.id);

    if (!commentId) {
        return res.status(400).json({ success: false, payload: { error: 'Mã bình luận không hợp lệ.' } });
    }

    try {
        const result = await FeedService.deleteComment(userId, commentId);
        if (result.error) {
            return res.status(result.statusCode || 400).json({ success: false, payload: { error: result.error } });
        }
        return res.status(200).json({ success: true, payload: result });
    } catch (err) {
        console.error('[deleteComment error]', err);
        return res.status(500).json({ success: false, payload: { error: 'Lỗi xoá bình luận.' } });
    }
}

async function toggleReaction(req, res) {
    const userId = req.userId;
    const { targetType, targetId, type } = req.body;

    if (!targetType || !targetId) {
        return res.status(400).json({ success: false, payload: { error: 'Thiếu thông tin đối tượng cảm xúc.' } });
    }

    try {
        const result = await FeedService.toggleReaction(userId, { targetType, targetId: Number(targetId), type });
        if (result.error) {
            return res.status(result.statusCode || 400).json({ success: false, payload: { error: result.error } });
        }
        return res.status(200).json({ success: true, payload: result });
    } catch (err) {
        console.error('[toggleReaction error]', err);
        return res.status(500).json({ success: false, payload: { error: 'Lỗi cập nhật cảm xúc.' } });
    }
}

async function getNotifications(req, res) {
    const userId = req.userId;
    const { limit } = req.query;

    try {
        const result = await FeedService.getNotifications(userId, { limit });
        return res.status(200).json({ success: true, payload: result });
    } catch (err) {
        console.error('[getNotifications error]', err);
        return res.status(500).json({ success: false, payload: { error: 'Lỗi tải thông báo.' } });
    }
}

async function markNotificationAsRead(req, res) {
    const userId = req.userId;
    const notificationId = Number(req.params.id);

    try {
        const result = await FeedService.markNotificationAsRead(userId, notificationId);
        return res.status(200).json({ success: true, payload: result });
    } catch (err) {
        console.error('[markNotificationAsRead error]', err);
        return res.status(500).json({ success: false, payload: { error: 'Lỗi cập nhật thông báo.' } });
    }
}

async function uploadAttachment(req, res) {
    const userId = req.userId;
    const file = req.file;

    if (!file || !file.buffer) {
        return res.status(400).json({
            success: false,
            payload: { error: 'Vui lòng chọn tệp hoặc ảnh để tải lên.' }
        });
    }

    try {
        const result = await FeedService.uploadFeedAttachment(userId, file);
        if (result.error) {
            return res.status(result.statusCode || 400).json({
                success: false,
                payload: { error: result.error }
            });
        }
        return res.status(200).json({
            success: true,
            payload: result
        });
    } catch (err) {
        console.error('[uploadAttachment feed error]', err);
        return res.status(500).json({
            success: false,
            payload: { error: err.message || 'Lỗi tải tệp lên bảng tin.' }
        });
    }
}

module.exports = {
    createPost,
    getFeed,
    updatePost,
    deletePost,
    grantPostEditor,
    revokePostEditor,
    getPostEditors,
    addComment,
    getComments,
    deleteComment,
    toggleReaction,
    getNotifications,
    markNotificationAsRead,
    uploadAttachment
};
