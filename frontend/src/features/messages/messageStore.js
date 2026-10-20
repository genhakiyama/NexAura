// Local projection of a conversation's messages.
//
// Live socket events only carry `{ from, message, chatId }` — no message id —
// so an incoming message has to be shown under a temporary id. When the real
// id later shows up (history reload, or a delete broadcast) the temp row must
// be reconciled with it instead of being orphaned. These helpers keep that
// bookkeeping in one place and are pure so they can be unit-tested.

let seq = 0;
export const nextTempId = () => `tmp-${Date.now()}-${seq++}`;

export const isTempId = (id) => typeof id === 'string' && id.startsWith('tmp-');

// Ids can be numbers (JSON from HTTP) or strings (URL params, socket frames).
// Compare by string form so a delete broadcast always matches the row it
// refers to, whichever layer produced the id.
export const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/**
 * Append a message. If it already exists under a real id, ignore it — this
 * prevents duplicates when history is re-fetched while live events arrive.
 */
export function appendMessage(list, message) {
  if (message?.id != null && !isTempId(message.id)) {
    if (list.some((m) => sameId(m.id, message.id))) return list;
  }
  return [...list, message];
}

/**
 * Fold a batch of authoritative messages (from GET /messages) into the local
 * list, preserving any newer live messages and dropping tombstones.
 */
export function mergeHistory(list, history, tombstones) {
  const has = (id) => Array.from(tombstones).some((t) => sameId(t, id));
  const seen = new Set();
  const merged = [];

  history.forEach((m) => {
    if (has(m.id)) return;
    const key = String(m.id);
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(m);
  });

  // Keep live rows that history does not know about yet (still temp ids).
  list.forEach((m) => {
    if (isTempId(m.id) || !seen.has(String(m.id))) {
      if (!has(m.id)) merged.push(m);
    }
  });

  merged.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  return merged;
}

/**
 * Remove a message. Returns the new list plus a `matched` flag, so callers can
 * tell "deleted locally" apart from "we never had it" (e.g. the delete
 * broadcast arrived before history finished loading).
 */
export function removeMessage(list, messageId) {
  let matched = false;
  const next = list.filter((m) => {
    if (sameId(m.id, messageId)) {
      matched = true;
      return false;
    }
    return true;
  });
  return { list: next, matched };
}

/**
 * @param {Array} list            current messages
 * @param {Object} data           server payload: { id, chatId, message, from, createdAt }
 * @param {string} currentUsername the signed-in username
 * @returns {{ list: Array, ids: Array }} `ids` are every id now representing
 *          this message (temp + real), so callers can remember them.
 */
export function upsertIncoming(list, data, currentUsername) {
  const ids = [];
  let next = list;

  // Socket broadcasts may use `from`/`fromUser`; history uses `senderName`.
  const senderName = data.from ?? data.fromUser ?? data.senderName ?? null;
  const realId = data.id ?? data.messageId ?? null;
  const content = data.message ?? data.content ?? '';
  const createdAt = data.createdAt || new Date().toISOString();
  const mine = !!senderName && senderName === currentUsername;

  let added = false;
  if (realId != null) {
    const replacement = {
      id: realId,
      type: data.type || 'text',
      content,
      senderName,
      senderId: data.senderId ?? (mine && data.userId != null ? data.userId : null),
      createdAt,
    };
    const index = list.findIndex((m) => isTempId(m.id) && m.content === content && m.senderName === senderName);
    if (index >= 0) {
      next = list.map((m, i) => (i === index ? replacement : m));
    } else if (!list.some((m) => sameId(m.id, realId))) {
      next = appendMessage(list, replacement);
      added = true;
    }
    ids.push(realId);
  } else {
    next = appendMessage(list, {
      id: nextTempId(),
      type: 'text',
      content,
      senderName,
      senderId: mine ? data.userId ?? null : null,
      createdAt,
    });
    added = true;
  }

  next.forEach((m) => {
    if (isTempId(m.id) && m.content === content && m.senderName === senderName) ids.push(m.id);
  });

  return { list: next, ids, added };
}
