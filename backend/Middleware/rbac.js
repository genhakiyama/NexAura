const ConversationMembers = require('../Models/ConversationMembers');
const { decryptChatId } = require('../UTIL/ChatCrypto');

/**
 * RBAC Room Check Middleware Factory.
 * Verifies that the authenticated user belongs to the conversation with one of the allowed roles.
 *
 * @param {string[]} allowedRoles Array of roles, e.g. ['owner', 'admin'] or ['owner', 'admin', 'member']
 */
function requireRoomRole(allowedRoles = ['owner', 'admin']) {
    return async (req, res, next) => {
        const userId = req.userId;
        const conversationIdParam = req.params.conversationId || req.body.conversationId;

        if (!conversationIdParam) {
            return res.status(400).json({
                success: false,
                payload: { error: 'Thiếu mã cuộc trò chuyện.' }
            });
        }

        const realConversationId = decryptChatId(conversationIdParam);
        if (!realConversationId) {
            return res.status(400).json({
                success: false,
                payload: { error: 'Mã cuộc trò chuyện không hợp lệ.' }
            });
        }

        try {
            const member = await ConversationMembers.findOne({
                where: {
                    userId,
                    conversationId: realConversationId,
                    status: 'approved'
                }
            });

            if (!member) {
                return res.status(403).json({
                    success: false,
                    payload: { error: 'Bạn không phải là thành viên của đoạn chat này.' }
                });
            }

            // Treat 'admin' as having owner privileges if role is stored as 'admin'
            const role = member.userRole;
            const hasPermission = allowedRoles.includes(role) || (allowedRoles.includes('owner') && role === 'admin');

            if (!hasPermission) {
                return res.status(403).json({
                    success: false,
                    payload: { error: 'Bạn không có quyền thực hiện thao tác này trong phòng chat.' }
                });
            }

            req.roomMember = member;
            req.realConversationId = realConversationId;
            next();
        } catch (err) {
            console.error('[requireRoomRole error]', err);
            return res.status(500).json({
                success: false,
                payload: { error: 'Lỗi kiểm tra phân quyền phòng chat.' }
            });
        }
    };
}

module.exports = {
    requireRoomRole
};
