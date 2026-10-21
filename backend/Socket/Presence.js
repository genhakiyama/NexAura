/**
 * Presence Manager: Tracks online/offline users in real time.
 */
const onlineUserSockets = new Map(); // userId -> Set of socketIds (handles multiple tabs)

function userConnected(userId, socketId) {
    const id = Number(userId);
    if (!onlineUserSockets.has(id)) {
        onlineUserSockets.set(id, new Set());
    }
    onlineUserSockets.get(id).add(socketId);
    return onlineUserSockets.get(id).size === 1; // true if this is the user's first connection
}

function userDisconnected(userId, socketId) {
    const id = Number(userId);
    const set = onlineUserSockets.get(id);
    if (!set) return true; // already offline

    set.delete(socketId);
    if (set.size === 0) {
        onlineUserSockets.delete(id);
        return true; // true if user has no remaining connections (went offline)
    }
    return false;
}

function isUserOnline(userId) {
    return onlineUserSockets.has(Number(userId));
}

function getOnlineUserIds() {
    return Array.from(onlineUserSockets.keys());
}

module.exports = {
    userConnected,
    userDisconnected,
    isUserOnline,
    getOnlineUserIds
};
