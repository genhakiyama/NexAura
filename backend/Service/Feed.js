const { Op } = require('sequelize');
const Post = require('../Models/Post');
const PostEditor = require('../Models/PostEditor');
const Comment = require('../Models/Comment');
const Reaction = require('../Models/Reaction');
const SocialNotification = require('../Models/SocialNotification');
const Friendship = require('../Models/Friendship');
const User = require('../Models/User');
const { encryptUserId, decryptUserId } = require('../UTIL/UserCrypto');
const room = require('../Socket/RoomManager');
const { uploadImage, uploadFileToStorage } = require('./Upload');

/**
 * Kiểm tra xem người dùng có quyền CHỈNH SỬA bài đăng hay không.
 * Điều kiện:
 * 1. Là tác giả bài viết (post.author_id === userId)
 * HOẶC
 * 2. Được tác giả uỷ quyền trong bảng post_editors (can_edit === true)
 */
async function canEditPost(userId, post) {
    if (!userId || !post) return false;
    if (post.author_id === userId) return true;

    const editorRecord = await PostEditor.findOne({
        where: {
            post_id: post.id,
            editor_user_id: userId,
            can_edit: true
        }
    });

    return !!editorRecord;
}

/**
 * Kiểm tra quyền XOÁ bài đăng.
 * ĐẶC BIỆT: Chỉ duy nhất tác giả mới có quyền xoá bài đăng!
 */
function canDeletePost(userId, post) {
    if (!userId || !post) return false;
    return post.author_id === userId;
}

/**
 * Lấy danh sách ID bạn bè đã accepted của user.
 */
async function getFriendUserIds(userId) {
    const friendships = await Friendship.findAll({
        where: {
            status: 'accepted',
            [Op.or]: [
                { requester_id: userId },
                { addressee_id: userId }
            ]
        },
        attributes: ['requester_id', 'addressee_id']
    });

    return friendships.map(f => f.requester_id === userId ? f.addressee_id : f.requester_id);
}

/**
 * 1. Tạo bài đăng mới.
 */
async function createPost(userId, { content, mediaUrls = [], visibility = 'friends' }) {
    const trimmedContent = typeof content === 'string' ? content.trim() : '';
    const hasMedia = Array.isArray(mediaUrls) && mediaUrls.length > 0;
    if (!trimmedContent && !hasMedia) {
        return { statusCode: 400, error: 'Vui lòng nhập nội dung hoặc đính kèm ảnh/tệp.' };
    }

    if (trimmedContent.length > 5000) {
        return { statusCode: 400, error: 'Nội dung bài viết vượt quá giới hạn 5000 ký tự.' };
    }

    const validVisibilities = ['public', 'friends', 'private'];
    const postVisibility = validVisibilities.includes(visibility) ? visibility : 'friends';

    const post = await Post.create({
        author_id: userId,
        content: trimmedContent,
        media_urls: Array.isArray(mediaUrls) ? mediaUrls : [],
        visibility: postVisibility
    });

    const author = await User.findByPk(userId, {
        attributes: ['id', 'username', 'email']
    });

    return {
        statusCode: 201,
        message: 'Đăng bài viết thành công.',
        post: {
            id: post.id,
            content: post.content,
            mediaUrls: post.media_urls,
            visibility: post.visibility,
            createdAt: post.createdAt,
            updatedAt: post.updatedAt,
            author: {
                id: encryptUserId(author.id),
                username: author.username,
                email: author.email
            },
            canEdit: true,
            canDelete: true,
            reactionsCount: {},
            userReaction: null,
            commentsCount: 0
        }
    };
}

/**
 * 2. Lấy Bảng tin (Feed) của bạn bè và chính user.
 */
async function getFeed(userId, { limit = 10, cursor = null }) {
    const friendIds = await getFriendUserIds(userId);
    const allowedAuthorIds = [...friendIds, userId];

    const whereConditions = {
        [Op.and]: [
            {
                [Op.or]: [
                    // Bài viết của chính mình (thấy mọi visibility)
                    { author_id: userId },
                    // Bài viết của bạn bè (phải là public hoặc friends)
                    {
                        author_id: { [Op.in]: friendIds },
                        visibility: { [Op.in]: ['public', 'friends'] }
                    }
                ]
            }
        ]
    };

    if (cursor) {
        whereConditions[Op.and].push({ id: { [Op.lt]: Number(cursor) } });
    }

    const posts = await Post.findAll({
        where: whereConditions,
        limit: Math.min(Number(limit) || 10, 30),
        order: [['createdAt', 'DESC']],
        include: [
            {
                model: User,
                as: 'author',
                attributes: ['id', 'username', 'email']
            }
        ]
    });

    // Lấy thông tin thống kê cho từng bài viết
    const formattedPosts = await Promise.all(posts.map(async (p) => {
        // Reactions
        const reactions = await Reaction.findAll({
            where: { target_type: 'post', target_id: p.id }
        });

        const reactionsCount = {};
        let userReaction = null;
        reactions.forEach((r) => {
            reactionsCount[r.type] = (reactionsCount[r.type] || 0) + 1;
            if (r.user_id === userId) {
                userReaction = r.type;
            }
        });

        // Comments count
        const commentsCount = await Comment.count({
            where: { post_id: p.id }
        });

        const isAuthor = p.author_id === userId;
        const isEditor = isAuthor ? true : await canEditPost(userId, p);

        // Editors list (chỉ trả về cho tác giả)
        let editors = [];
        if (isAuthor) {
            const editorRecords = await PostEditor.findAll({
                where: { post_id: p.id, can_edit: true },
                include: [{ model: User, as: 'editor', attributes: ['id', 'username', 'email'] }]
            });
            editors = editorRecords.map((e) => ({
                id: encryptUserId(e.editor.id),
                username: e.editor.username,
                email: e.editor.email,
                grantedAt: e.createdAt
            }));
        }

        return {
            id: p.id,
            content: p.content,
            mediaUrls: p.media_urls || [],
            visibility: p.visibility,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
            author: {
                id: encryptUserId(p.author.id),
                username: p.author.username,
                email: p.author.email
            },
            canEdit: isEditor,
            canDelete: isAuthor,
            editors,
            reactionsCount,
            userReaction,
            commentsCount
        };
    }));

    const nextCursor = posts.length > 0 ? posts[posts.length - 1].id : null;

    return {
        posts: formattedPosts,
        nextCursor
    };
}

/**
 * 3. Chỉnh sửa bài đăng.
 * BẢO MẬT: Chỉ tác giả HOẶC người được tác giả uỷ quyền mới được chỉnh sửa.
 */
async function updatePost(userId, postId, { content, mediaUrls, visibility }) {
    const post = await Post.findByPk(postId);
    if (!post) {
        return { statusCode: 404, error: 'Không tìm thấy bài viết.' };
    }

    const hasEditPermission = await canEditPost(userId, post);
    if (!hasEditPermission) {
        return {
            statusCode: 403,
            error: 'Bạn không có quyền chỉnh sửa bài đăng này. Chỉ tác giả và người được uỷ quyền mới có quyền chỉnh sửa.'
        };
    }

    const updates = {};
    const finalMedia = mediaUrls !== undefined ? mediaUrls : (post.media_urls || []);
    if (content !== undefined) {
        const trimmed = typeof content === 'string' ? content.trim() : '';
        if (!trimmed && (!Array.isArray(finalMedia) || finalMedia.length === 0)) {
            return { statusCode: 400, error: 'Bài viết cần có nội dung hoặc đính kèm ảnh/tệp.' };
        }
        if (trimmed.length > 5000) {
            return { statusCode: 400, error: 'Nội dung bài viết vượt quá 5000 ký tự.' };
        }
        updates.content = trimmed;
    }

    if (mediaUrls !== undefined && Array.isArray(mediaUrls)) {
        updates.media_urls = mediaUrls;
    }

    // Chỉ tác giả mới được thay đổi visibility của bài viết
    if (visibility !== undefined && post.author_id === userId) {
        if (['public', 'friends', 'private'].includes(visibility)) {
            updates.visibility = visibility;
        }
    }

    await post.update(updates);

    return {
        statusCode: 200,
        message: 'Đã cập nhật bài viết thành công.',
        post: {
            id: post.id,
            content: post.content,
            mediaUrls: post.media_urls,
            visibility: post.visibility,
            updatedAt: post.updatedAt
        }
    };
}

/**
 * 4. Xoá bài đăng.
 * BẢO MẬT: Chỉ DUY NHẤT tác giả mới có quyền xoá bài đăng!
 */
async function deletePost(userId, postId) {
    const post = await Post.findByPk(postId);
    if (!post) {
        return { statusCode: 404, error: 'Không tìm thấy bài viết.' };
    }

    if (!canDeletePost(userId, post)) {
        return {
            statusCode: 403,
            error: 'Bạn không thể xoá bài viết này. Chỉ duy nhất tác giả bài viết mới có quyền xoá.'
        };
    }

    // Cascade delete
    await PostEditor.destroy({ where: { post_id: post.id } });
    await Comment.destroy({ where: { post_id: post.id } });
    await Reaction.destroy({ where: { target_type: 'post', target_id: post.id } });
    await SocialNotification.destroy({ where: { post_id: post.id } });
    await post.destroy();

    return {
        statusCode: 200,
        message: 'Đã xoá bài viết thành công.'
    };
}

/**
 * 5. Cấp quyền chỉnh sửa bài đăng cho bạn bè (Delegate Editor).
 * BẢO MẬT: Chỉ tác giả bài đăng mới có quyền uỷ quyền.
 */
async function grantPostEditor(authorId, postId, targetUserIdInput) {
    const post = await Post.findByPk(postId);
    if (!post) {
        return { statusCode: 404, error: 'Không tìm thấy bài viết.' };
    }

    if (post.author_id !== authorId) {
        return { statusCode: 403, error: 'Chỉ tác giả mới có quyền uỷ quyền chỉnh sửa bài đăng.' };
    }

    const targetUserId = decryptUserId(targetUserIdInput);
    if (!targetUserId) {
        return { statusCode: 400, error: 'Mã người dùng uỷ quyền không hợp lệ.' };
    }

    if (targetUserId === authorId) {
        return { statusCode: 400, error: 'Tác giả đã có toàn quyền trên bài viết.' };
    }

    const targetUser = await User.findByPk(targetUserId);
    if (!targetUser) {
        return { statusCode: 404, error: 'Người dùng được uỷ quyền không tồn tại.' };
    }

    const [editor, created] = await PostEditor.findOrCreate({
        where: { post_id: post.id, editor_user_id: targetUserId },
        defaults: {
            granted_by: authorId,
            can_edit: true
        }
    });

    if (!created && !editor.can_edit) {
        await editor.update({ can_edit: true });
    }

    const author = await User.findByPk(authorId);

    // Gửi thông báo realtime cho người được uỷ quyền
    await SocialNotification.create({
        recipient_id: targetUserId,
        actor_id: authorId,
        type: 'post_editor_granted',
        post_id: post.id
    });

    room.sendToUser(targetUserId, 'new_social_notification', {
        type: 'post_editor_granted',
        actor: {
            id: encryptUserId(authorId),
            username: author ? author.username : 'Ai đó'
        },
        postId: post.id,
        message: `${author ? author.username : 'Tác giả'} đã cấp quyền chỉnh sửa bài viết cho bạn.`
    });

    return {
        statusCode: 200,
        message: `Đã cấp quyền chỉnh sửa cho ${targetUser.username}.`
    };
}

/**
 * 6. Thu hồi quyền chỉnh sửa bài đăng.
 * BẢO MẬT: Chỉ tác giả bài đăng mới có quyền thu hồi.
 */
async function revokePostEditor(authorId, postId, targetUserIdInput) {
    const post = await Post.findByPk(postId);
    if (!post) {
        return { statusCode: 404, error: 'Không tìm thấy bài viết.' };
    }

    if (post.author_id !== authorId) {
        return { statusCode: 403, error: 'Chỉ tác giả mới có quyền thu hồi uỷ quyền bài đăng.' };
    }

    const targetUserId = decryptUserId(targetUserIdInput);
    if (!targetUserId) {
        return { statusCode: 400, error: 'Mã người dùng không hợp lệ.' };
    }

    const editor = await PostEditor.findOne({
        where: { post_id: post.id, editor_user_id: targetUserId }
    });

    if (!editor) {
        return { statusCode: 404, error: 'Người dùng này chưa được cấp quyền chỉnh sửa.' };
    }

    await editor.destroy();

    return {
        statusCode: 200,
        message: 'Đã thu hồi quyền chỉnh sửa thành công.'
    };
}

/**
 * 7. Lấy danh sách người được cấp quyền chỉnh sửa của bài viết.
 */
async function getPostEditors(authorId, postId) {
    const post = await Post.findByPk(postId);
    if (!post) {
        return { statusCode: 404, error: 'Không tìm thấy bài viết.' };
    }

    if (post.author_id !== authorId) {
        return { statusCode: 403, error: 'Chỉ tác giả mới có quyền xem danh sách uỷ quyền.' };
    }

    const editors = await PostEditor.findAll({
        where: { post_id: post.id, can_edit: true },
        include: [{ model: User, as: 'editor', attributes: ['id', 'username', 'email'] }]
    });

    return {
        editors: editors.map(e => ({
            id: encryptUserId(e.editor.id),
            username: e.editor.username,
            email: e.editor.email,
            grantedAt: e.createdAt
        }))
    };
}

/**
 * 8. Thêm bình luận vào bài viết (Hỗ trợ 1-level reply).
 */
async function addComment(userId, postId, { content, parentId = null }) {
    if (!content || !content.trim()) {
        return { statusCode: 400, error: 'Nội dung bình luận không được để trống.' };
    }

    const post = await Post.findByPk(postId);
    if (!post) {
        return { statusCode: 404, error: 'Không tìm thấy bài viết.' };
    }

    let actualParentId = null;
    let parentComment = null;

    if (parentId) {
        parentComment = await Comment.findByPk(parentId);
        if (!parentComment || parentComment.post_id !== post.id) {
            return { statusCode: 400, error: 'Bình luận phản hồi không tồn tại trong bài viết này.' };
        }
        // Chuẩn hoá: nếu parentComment vốn đã là reply con, quy về parent gốc để giữ cấu trúc 1-level
        actualParentId = parentComment.parent_id || parentComment.id;
    }

    const comment = await Comment.create({
        post_id: post.id,
        author_id: userId,
        parent_id: actualParentId,
        content: content.trim()
    });

    const author = await User.findByPk(userId);

    // Gửi thông báo
    if (actualParentId && parentComment && parentComment.author_id !== userId) {
        // Thông báo phản hồi bình luận
        await SocialNotification.create({
            recipient_id: parentComment.author_id,
            actor_id: userId,
            type: 'comment_reply',
            post_id: post.id,
            comment_id: comment.id
        });
        room.sendToUser(parentComment.author_id, 'new_social_notification', {
            type: 'comment_reply',
            actor: { id: encryptUserId(userId), username: author?.username || 'Ai đó' },
            postId: post.id,
            message: `${author?.username || 'Ai đó'} đã trả lời bình luận của bạn.`
        });
    } else if (post.author_id !== userId) {
        // Thông báo bình luận bài viết
        await SocialNotification.create({
            recipient_id: post.author_id,
            actor_id: userId,
            type: 'comment',
            post_id: post.id,
            comment_id: comment.id
        });
        room.sendToUser(post.author_id, 'new_social_notification', {
            type: 'comment',
            actor: { id: encryptUserId(userId), username: author?.username || 'Ai đó' },
            postId: post.id,
            message: `${author?.username || 'Ai đó'} đã bình luận vào bài viết của bạn.`
        });
    }

    return {
        statusCode: 201,
        message: 'Đã thêm bình luận.',
        comment: {
            id: comment.id,
            postId: comment.post_id,
            parentId: comment.parent_id,
            content: comment.content,
            createdAt: comment.createdAt,
            author: {
                id: encryptUserId(author.id),
                username: author.username
            },
            canDelete: true
        }
    };
}

/**
 * 9. Lấy danh sách bình luận của bài viết (xếp theo cây 1 cấp).
 */
async function getComments(userId, postId) {
    const post = await Post.findByPk(postId);
    if (!post) {
        return { statusCode: 404, error: 'Không tìm thấy bài viết.' };
    }

    const comments = await Comment.findAll({
        where: { post_id: postId },
        order: [['createdAt', 'ASC']],
        include: [{ model: User, as: 'author', attributes: ['id', 'username', 'email'] }]
    });

    const isPostAuthor = post.author_id === userId;

    // Phân loại thành top-level comments và replies
    const topLevel = [];
    const replyMap = new Map();

    comments.forEach((c) => {
        const item = {
            id: c.id,
            parentId: c.parent_id,
            content: c.content,
            createdAt: c.createdAt,
            author: {
                id: encryptUserId(c.author.id),
                username: c.author.username,
                email: c.author.email
            },
            canDelete: c.author_id === userId || isPostAuthor,
            replies: []
        };

        if (!c.parent_id) {
            topLevel.push(item);
        } else {
            if (!replyMap.has(c.parent_id)) {
                replyMap.set(c.parent_id, []);
            }
            replyMap.get(c.parent_id).push(item);
        }
    });

    // Gắn replies vào topLevel
    topLevel.forEach((parent) => {
        parent.replies = replyMap.get(parent.id) || [];
    });

    return { comments: topLevel };
}

/**
 * 10. Xoá bình luận.
 * Cho phép tác giả bình luận HOẶC tác giả bài viết xoá.
 */
async function deleteComment(userId, commentId) {
    const comment = await Comment.findByPk(commentId);
    if (!comment) {
        return { statusCode: 404, error: 'Không tìm thấy bình luận.' };
    }

    const post = await Post.findByPk(comment.post_id);
    const canDelete = comment.author_id === userId || (post && post.author_id === userId);

    if (!canDelete) {
        return { statusCode: 403, error: 'Bạn không có quyền xoá bình luận này.' };
    }

    // Xoá comment và các replies con nếu có
    await Comment.destroy({
        where: {
            [Op.or]: [
                { id: comment.id },
                { parent_id: comment.id }
            ]
        }
    });

    return {
        statusCode: 200,
        message: 'Đã xoá bình luận thành công.'
    };
}

/**
 * 11. Thả hoặc thay đổi Reaction (like, heart, haha, etc.).
 */
async function toggleReaction(userId, { targetType, targetId, type = 'like' }) {
    if (!['post', 'comment'].includes(targetType)) {
        return { statusCode: 400, error: 'targetType không hợp lệ (chỉ post hoặc comment).' };
    }

    const validTypes = ['like', 'heart', 'haha', 'wow', 'sad', 'angry'];
    if (!validTypes.includes(type)) {
        return { statusCode: 400, error: 'Loại cảm xúc không hợp lệ.' };
    }

    const existing = await Reaction.findOne({
        where: { target_type: targetType, target_id: targetId, user_id: userId }
    });

    let currentAction = 'added';

    if (existing) {
        if (existing.type === type) {
            // Huỷ reaction nếu bấm lại cùng 1 loại
            await existing.destroy();
            currentAction = 'removed';
        } else {
            // Đổi loại reaction
            await existing.update({ type });
            currentAction = 'updated';
        }
    } else {
        await Reaction.create({
            target_type: targetType,
            target_id: targetId,
            user_id: userId,
            type
        });

        // Gửi thông báo nếu target là post
        if (targetType === 'post') {
            const post = await Post.findByPk(targetId);
            if (post && post.author_id !== userId) {
                const actor = await User.findByPk(userId);
                await SocialNotification.create({
                    recipient_id: post.author_id,
                    actor_id: userId,
                    type: 'post_reaction',
                    post_id: post.id
                });
                room.sendToUser(post.author_id, 'new_social_notification', {
                    type: 'post_reaction',
                    actor: { id: encryptUserId(userId), username: actor?.username || 'Ai đó' },
                    postId: post.id,
                    reactionType: type,
                    message: `${actor?.username || 'Ai đó'} đã bày tỏ cảm xúc về bài viết của bạn.`
                });
            }
        }
    }

    // Đếm lại tổng số reactions
    const allReactions = await Reaction.findAll({
        where: { target_type: targetType, target_id: targetId }
    });

    const reactionsCount = {};
    let userReaction = null;
    allReactions.forEach((r) => {
        reactionsCount[r.type] = (reactionsCount[r.type] || 0) + 1;
        if (r.user_id === userId) {
            userReaction = r.type;
        }
    });

    return {
        statusCode: 200,
        action: currentAction,
        reactionsCount,
        userReaction
    };
}

/**
 * 12. Quản lý thông báo mạng xã hội (Social Notifications).
 */
async function getNotifications(userId, { limit = 20 }) {
    const list = await SocialNotification.findAll({
        where: { recipient_id: userId },
        order: [['createdAt', 'DESC']],
        limit: Math.min(Number(limit) || 20, 50),
        include: [{ model: User, as: 'actor', attributes: ['id', 'username', 'email'] }]
    });

    return {
        notifications: list.map((n) => ({
            id: n.id,
            type: n.type,
            postId: n.post_id,
            commentId: n.comment_id,
            isRead: !!n.read_at,
            createdAt: n.createdAt,
            actor: {
                id: encryptUserId(n.actor.id),
                username: n.actor.username,
                email: n.actor.email
            }
        }))
    };
}

async function markNotificationAsRead(userId, notificationId) {
    const notif = await SocialNotification.findOne({
        where: { id: notificationId, recipient_id: userId }
    });

    if (notif && !notif.read_at) {
        await notif.update({ read_at: new Date() });
    }

    return { success: true };
}

/**
 * 8. Tải tệp/ảnh đính kèm cho bài viết trên Bảng tin.
 */
async function uploadFeedAttachment(userId, file) {
    if (!file || !file.buffer) {
        return { statusCode: 400, error: 'Không có dữ liệu tệp để tải lên.' };
    }

    const MAX_SIZE = 200 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
        return { statusCode: 400, error: 'Dung lượng tệp/video không được vượt quá 200MB.' };
    }

    const isImage = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.mimetype);
    const isVideo = file.mimetype?.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi|m4v|3gp)$/i.test(file.originalname || '');
    let uploadResult;

    if (isImage) {
        uploadResult = await uploadImage(file, `feed_${userId}`);
    } else {
        uploadResult = await uploadFileToStorage(file, `feed_${userId}`);
    }

    let detectedType = 'file';
    if (isImage) detectedType = 'image';
    else if (isVideo) detectedType = 'video';

    return {
        statusCode: 200,
        url: uploadResult.publicUrl,
        type: detectedType,
        name: file.originalname,
        size: file.size
    };
}

module.exports = {
    canEditPost,
    canDeletePost,
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
    uploadFeedAttachment
};
