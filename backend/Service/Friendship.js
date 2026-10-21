const { Op } = require('sequelize');
const Friendship = require('../Models/Friendship');
const User = require('../Models/User');
const { encryptUserId, decryptUserId } = require('../UTIL/UserCrypto');
const { isUserOnline } = require('../Socket/Presence');
const room = require('../Socket/RoomManager');

/**
 * Check if two users are accepted friends.
 * Used for 1-1 direct chat authorization.
 *
 * @param {number} userA 
 * @param {number} userB 
 * @returns {Promise<boolean>}
 */
async function isFriend(userA, userB) {
    const idA = Number(userA);
    const idB = Number(userB);
    if (!idA || !idB || idA === idB) return false;

    const friendship = await Friendship.findOne({
        where: {
            status: 'accepted',
            [Op.or]: [
                { requester_id: idA, addressee_id: idB },
                { requester_id: idB, addressee_id: idA }
            ]
        }
    });

    return Boolean(friendship);
}

/**
 * Search users by username or email.
 * Includes relationship status with the requesting user and online presence.
 */
async function searchUsers(currentUserId, query) {
    const q = typeof query === 'string' ? query.trim() : '';
    if (!q) {
        return { users: [] };
    }

    const foundUsers = await User.findAll({
        where: {
            id: { [Op.ne]: currentUserId },
            [Op.or]: [
                { username: { [Op.iLike || Op.like]: `%${q}%` } },
                { email: { [Op.iLike || Op.like]: `%${q}%` } }
            ]
        },
        attributes: ['id', 'username', 'email'],
        limit: 30
    });

    const results = [];
    for (const u of foundUsers) {
        // Find existing relationship
        const rel = await Friendship.findOne({
            where: {
                [Op.or]: [
                    { requester_id: currentUserId, addressee_id: u.id },
                    { requester_id: u.id, addressee_id: currentUserId }
                ]
            }
        });

        let relationshipStatus = 'none';
        let requestId = null;

        if (rel) {
            requestId = rel.id;
            if (rel.status === 'accepted') {
                relationshipStatus = 'friends';
            } else if (rel.status === 'pending') {
                relationshipStatus = rel.requester_id === currentUserId ? 'pending_sent' : 'pending_received';
            } else if (rel.status === 'blocked') {
                relationshipStatus = rel.requester_id === currentUserId ? 'blocked_by_me' : 'blocked_by_them';
            }
        }

        results.push({
            id: encryptUserId(u.id),
            rawId: u.id,
            username: u.username,
            email: u.email,
            relationshipStatus,
            requestId,
            isOnline: isUserOnline(u.id)
        });
    }

    return { users: results };
}

/**
 * Send a friend request.
 */
async function sendFriendRequest(requesterId, targetUserIdInput) {
    const targetUserId = decryptUserId(targetUserIdInput);
    if (!targetUserId) {
        return { statusCode: 400, error: 'Mã người dùng không hợp lệ.' };
    }

    if (requesterId === targetUserId) {
        return { statusCode: 400, error: 'Bạn không thể tự kết bạn với chính mình.' };
    }

    const targetUser = await User.findByPk(targetUserId);
    if (!targetUser) {
        return { statusCode: 404, error: 'Người dùng không tồn tại.' };
    }

    // Check existing friendship
    const existing = await Friendship.findOne({
        where: {
            [Op.or]: [
                { requester_id: requesterId, addressee_id: targetUserId },
                { requester_id: targetUserId, addressee_id: requesterId }
            ]
        }
    });

    if (existing) {
        if (existing.status === 'accepted') {
            return { statusCode: 400, error: 'Hai người đã là bạn bè.' };
        }
        if (existing.status === 'pending') {
            if (existing.requester_id === requesterId) {
                return { statusCode: 400, error: 'Bạn đã gửi lời mời kết bạn trước đó.' };
            } else {
                return { statusCode: 400, error: 'Người này đã gửi lời mời kết bạn cho bạn. Hãy chấp nhận lời mời.' };
            }
        }
        if (existing.status === 'blocked') {
            return { statusCode: 403, error: 'Không thể gửi lời mời kết bạn do trạng thái chặn.' };
        }
        // If declined, allow resending request
        await existing.update({
            requester_id: requesterId,
            addressee_id: targetUserId,
            status: 'pending'
        });

        // Realtime notification
        const requester = await User.findByPk(requesterId);
        room.sendToUser(targetUserId, 'new_friend_request', {
            requestId: existing.id,
            requester: {
                id: encryptUserId(requesterId),
                username: requester ? requester.username : 'Ai đó'
            },
            createdAt: existing.updatedAt
        });

        return {
            statusCode: 200,
            message: 'Đã gửi lời mời kết bạn thành công.',
            requestId: existing.id
        };
    }

    const newFriendship = await Friendship.create({
        requester_id: requesterId,
        addressee_id: targetUserId,
        status: 'pending'
    });

    const requester = await User.findByPk(requesterId);
    room.sendToUser(targetUserId, 'new_friend_request', {
        requestId: newFriendship.id,
        requester: {
            id: encryptUserId(requesterId),
            username: requester ? requester.username : 'Ai đó'
        },
        createdAt: newFriendship.createdAt
    });

    return {
        statusCode: 201,
        message: 'Đã gửi lời mời kết bạn thành công.',
        requestId: newFriendship.id
    };
}

/**
 * Respond to a friend request (accept or decline).
 */
async function respondFriendRequest(userId, requestId, action) {
    if (!['accept', 'decline'].includes(action)) {
        return { statusCode: 400, error: 'Hành động không hợp lệ (chỉ chấp nhận accept hoặc decline).' };
    }

    const friendship = await Friendship.findOne({
        where: { id: requestId, addressee_id: userId, status: 'pending' }
    });

    if (!friendship) {
        return { statusCode: 404, error: 'Lời mời kết bạn không tồn tại hoặc đã được xử lý.' };
    }

    if (action === 'accept') {
        await friendship.update({ status: 'accepted' });

        const currentUser = await User.findByPk(userId);

        // Realtime notification to requester
        room.sendToUser(friendship.requester_id, 'friend_request_accepted', {
            friend: {
                id: encryptUserId(userId),
                username: currentUser ? currentUser.username : 'Bạn bè'
            },
            message: `${currentUser ? currentUser.username : 'Đối phương'} đã đồng ý lời mời kết bạn.`
        });

        return {
            statusCode: 200,
            message: 'Đã chấp nhận lời mời kết bạn thành công.'
        };
    } else {
        await friendship.update({ status: 'declined' });
        return {
            statusCode: 200,
            message: 'Đã từ chối lời mời kết bạn.'
        };
    }
}

/**
 * Cancel a sent friend request.
 */
async function cancelFriendRequest(userId, requestId) {
    const friendship = await Friendship.findOne({
        where: { id: requestId, requester_id: userId, status: 'pending' }
    });

    if (!friendship) {
        return { statusCode: 404, error: 'Lời mời kết bạn không tồn tại hoặc không thể huỷ.' };
    }

    await friendship.destroy();
    return { statusCode: 200, message: 'Đã huỷ lời mời kết bạn.' };
}

/**
 * Unfriend a user.
 */
async function unfriend(userId, friendIdInput) {
    const friendId = decryptUserId(friendIdInput);
    if (!friendId) {
        return { statusCode: 400, error: 'Mã bạn bè không hợp lệ.' };
    }

    const friendship = await Friendship.findOne({
        where: {
            status: 'accepted',
            [Op.or]: [
                { requester_id: userId, addressee_id: friendId },
                { requester_id: friendId, addressee_id: userId }
            ]
        }
    });

    if (!friendship) {
        return { statusCode: 404, error: 'Hai người chưa phải là bạn bè.' };
    }

    await friendship.destroy();

    // Realtime notification
    room.sendToUser(friendId, 'friend_removed', {
        userId: encryptUserId(userId)
    });

    return { statusCode: 200, message: 'Đã huỷ kết bạn thành công.' };
}

/**
 * Block a user.
 */
async function blockUser(userId, targetUserIdInput) {
    const targetUserId = decryptUserId(targetUserIdInput);
    if (!targetUserId || userId === targetUserId) {
        return { statusCode: 400, error: 'Không thể chặn người dùng này.' };
    }

    const existing = await Friendship.findOne({
        where: {
            [Op.or]: [
                { requester_id: userId, addressee_id: targetUserId },
                { requester_id: targetUserId, addressee_id: userId }
            ]
        }
    });

    if (existing) {
        await existing.update({
            requester_id: userId, // blocker
            addressee_id: targetUserId,
            status: 'blocked'
        });
    } else {
        await Friendship.create({
            requester_id: userId,
            addressee_id: targetUserId,
            status: 'blocked'
        });
    }

    return { statusCode: 200, message: 'Đã chặn người dùng thành công.' };
}

/**
 * Unblock a user.
 */
async function unblockUser(userId, targetUserIdInput) {
    const targetUserId = decryptUserId(targetUserIdInput);
    if (!targetUserId) {
        return { statusCode: 400, error: 'Mã người dùng không hợp lệ.' };
    }

    const blocked = await Friendship.findOne({
        where: {
            requester_id: userId,
            addressee_id: targetUserId,
            status: 'blocked'
        }
    });

    if (!blocked) {
        return { statusCode: 404, error: 'Không tìm thấy thông tin chặn người dùng này.' };
    }

    await blocked.destroy();
    return { statusCode: 200, message: 'Đã bỏ chặn người dùng.' };
}

/**
 * Get accepted friends list with online/offline status.
 */
async function getFriends(userId) {
    const friendships = await Friendship.findAll({
        where: {
            status: 'accepted',
            [Op.or]: [
                { requester_id: userId },
                { addressee_id: userId }
            ]
        },
        order: [['updatedAt', 'DESC']]
    });

    const friendIds = friendships.map(f => f.requester_id === userId ? f.addressee_id : f.requester_id);

    if (friendIds.length === 0) {
        return { friends: [] };
    }

    const users = await User.findAll({
        where: { id: { [Op.in]: friendIds } },
        attributes: ['id', 'username', 'email']
    });

    const friends = users.map(u => ({
        id: encryptUserId(u.id),
        rawId: u.id,
        username: u.username,
        email: u.email,
        isOnline: isUserOnline(u.id)
    }));

    return { friends };
}

/**
 * Get friend requests (incoming or outgoing).
 */
async function getRequests(userId, type = 'incoming') {
    if (type === 'incoming') {
        const requests = await Friendship.findAll({
            where: { addressee_id: userId, status: 'pending' },
            include: [{ model: User, as: 'requester', attributes: ['id', 'username', 'email'] }],
            order: [['createdAt', 'DESC']]
        });

        return {
            requests: requests.map(r => ({
                id: r.id,
                user: {
                    id: encryptUserId(r.requester.id),
                    username: r.requester.username,
                    email: r.requester.email
                },
                createdAt: r.createdAt
            }))
        };
    } else {
        const requests = await Friendship.findAll({
            where: { requester_id: userId, status: 'pending' },
            include: [{ model: User, as: 'addressee', attributes: ['id', 'username', 'email'] }],
            order: [['createdAt', 'DESC']]
        });

        return {
            requests: requests.map(r => ({
                id: r.id,
                user: {
                    id: encryptUserId(r.addressee.id),
                    username: r.addressee.username,
                    email: r.addressee.email
                },
                createdAt: r.createdAt
            }))
        };
    }
}

module.exports = {
    isFriend,
    searchUsers,
    sendFriendRequest,
    respondFriendRequest,
    cancelFriendRequest,
    unfriend,
    blockUser,
    unblockUser,
    getFriends,
    getRequests
};
