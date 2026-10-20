import { api } from '../../api';

// Single entry point for deleting a message (frontend-only; uses the existing
// backend DELETE /chat/message/delete).
//
// FUTURE UPGRADES plug in here WITHOUT touching the backend:
//   - optimistic remove + "undo" toast (remove locally first, restore on failure)
//   - "delete for me" vs "delete for everyone" modes (local-only hide vs server delete)
//   - soft-delete / tombstone rendering instead of removing from the list
//   - batch / multi-select delete
export async function deleteMessageAction({ conversationId, messageId, userId }) {
  return api.deleteMessage({ conversationId, messageId, userId });
}
