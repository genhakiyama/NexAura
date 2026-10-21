const FriendshipService = require('../Service/Friendship');

async function searchUsers(req, res) {
    const userId = req.userId;
    const query = req.query.q;

    try {
        const result = await FriendshipService.searchUsers(userId, query);
        return res.status(200).json({
            success: true,
            payload: result
        });
    } catch (err) {
        console.error('[searchUsers error]', err);
        return res.status(500).json({
            success: false,
            payload: { error: 'Lỗi tìm kiếm người dùng.' }
        });
    }
}

async function sendRequest(req, res) {
    const userId = req.userId;
    const targetUserId = req.body.targetUserId || req.body.userId;

    if (!targetUserId) {
        return res.status(400).json({
            success: false,
            payload: { error: 'Mã người dùng không được để trống.' }
        });
    }

    try {
        const result = await FriendshipService.sendFriendRequest(userId, targetUserId);
        if (result.error) {
            return res.status(result.statusCode || 400).json({
                success: false,
                payload: { error: result.error }
            });
        }

        return res.status(result.statusCode || 200).json({
            success: true,
            payload: result
        });
    } catch (err) {
        console.error('[sendRequest error]', err);
        return res.status(500).json({
            success: false,
            payload: { error: 'Lỗi gửi lời mời kết bạn.' }
        });
    }
}

async function getRequests(req, res) {
    const userId = req.userId;
    const type = req.query.type || 'incoming';

    try {
        const result = await FriendshipService.getRequests(userId, type);
        return res.status(200).json({
            success: true,
            payload: result
        });
    } catch (err) {
        console.error('[getRequests error]', err);
        return res.status(500).json({
            success: false,
            payload: { error: 'Lỗi lấy danh sách lời mời.' }
        });
    }
}

async function respondRequest(req, res) {
    const userId = req.userId;
    const requestId = req.params.id;
    const action = req.body.action;

    try {
        const result = await FriendshipService.respondFriendRequest(userId, requestId, action);
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
        console.error('[respondRequest error]', err);
        return res.status(500).json({
            success: false,
            payload: { error: 'Lỗi phản hồi lời mời kết bạn.' }
        });
    }
}

async function cancelRequest(req, res) {
    const userId = req.userId;
    const requestId = req.params.id;

    try {
        const result = await FriendshipService.cancelFriendRequest(userId, requestId);
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
        console.error('[cancelRequest error]', err);
        return res.status(500).json({
            success: false,
            payload: { error: 'Lỗi huỷ lời mời kết bạn.' }
        });
    }
}

async function unfriend(req, res) {
    const userId = req.userId;
    const friendId = req.params.friendId;

    try {
        const result = await FriendshipService.unfriend(userId, friendId);
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
        console.error('[unfriend error]', err);
        return res.status(500).json({
            success: false,
            payload: { error: 'Lỗi huỷ kết bạn.' }
        });
    }
}

async function getFriends(req, res) {
    const userId = req.userId;

    try {
        const result = await FriendshipService.getFriends(userId);
        return res.status(200).json({
            success: true,
            payload: result
        });
    } catch (err) {
        console.error('[getFriends error]', err);
        return res.status(500).json({
            success: false,
            payload: { error: 'Lỗi lấy danh sách bạn bè.' }
        });
    }
}

async function blockUser(req, res) {
    const userId = req.userId;
    const targetUserId = req.params.id;

    try {
        const result = await FriendshipService.blockUser(userId, targetUserId);
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
        console.error('[blockUser error]', err);
        return res.status(500).json({
            success: false,
            payload: { error: 'Lỗi chặn người dùng.' }
        });
    }
}

async function unblockUser(req, res) {
    const userId = req.userId;
    const targetUserId = req.params.id;

    try {
        const result = await FriendshipService.unblockUser(userId, targetUserId);
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
        console.error('[unblockUser error]', err);
        return res.status(500).json({
            success: false,
            payload: { error: 'Lỗi bỏ chặn người dùng.' }
        });
    }
}

module.exports = {
    searchUsers,
    sendRequest,
    getRequests,
    respondRequest,
    cancelRequest,
    unfriend,
    getFriends,
    blockUser,
    unblockUser
};
