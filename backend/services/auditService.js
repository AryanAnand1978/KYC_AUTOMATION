const crypto = require('crypto');
const AuditEvent = require('../models/AuditEvent');

/**
 * Deterministically stringifies an object with recursively sorted keys.
 * Ensures that JSON key order variations produce identical hash payloads.
 */
function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

/**
 * Computes a SHA-256 hash for a tamper-evident audit event.
 * Format: prevHash|sessionId|sequence|type|message|stableStringify(meta)|createdAt_ISO
 */
function computeEventHash(prevHash, sessionId, sequence, type, message, meta, createdAt) {
  const isoTime = (createdAt instanceof Date ? createdAt : new Date(createdAt)).toISOString();
  const payload = `${prevHash}|${sessionId}|${sequence}|${type}|${message}|${stableStringify(meta || {})}|${isoTime}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Records a hash-chained, sequence-verified audit event for a verification session.
 *
 * Inside a transaction (dbSession provided): errors are rethrown to ensure ACID rollback.
 * Outside a transaction: errors are logged and swallowed (fire-and-forget).
 *
 * In concurrent environments, retries up to 3 times on E11000 duplicate key conflict.
 */
async function logEvent(sessionId, type, message = '', meta = {}, dbSession = null) {
  let attempts = 0;
  while (attempts < 3) {
    attempts++;
    try {
      // Fetch the most recent event in the hash chain for this session
      const query = AuditEvent.findOne({ sessionId }).sort({ sequence: -1 });
      if (dbSession) query.session(dbSession);
      const lastEvent = await query.lean();

      const sequence = (lastEvent && typeof lastEvent.sequence === 'number') ? lastEvent.sequence + 1 : 0;
      const prevHash = (lastEvent && lastEvent.hash) ? lastEvent.hash : 'GENESIS';
      const createdAt = new Date();
      const hash = computeEventHash(prevHash, sessionId, sequence, type, message, meta, createdAt);

      const eventPayload = {
        sessionId,
        sequence,
        prevHash,
        hash,
        type,
        message,
        meta,
        createdAt
      };

      if (dbSession) {
        await AuditEvent.create([eventPayload], { session: dbSession });
      } else {
        await AuditEvent.create(eventPayload);
      }
      return;
    } catch (err) {
      // Handle optimistic sequence collisions under concurrent writes
      const isDuplicateKey = err.code === 11000 || (err.message && err.message.includes('E11000'));
      if (isDuplicateKey && attempts < 3) {
        await new Promise(resolve => setTimeout(resolve, 15 * attempts));
        continue;
      }

      if (dbSession) {
        // Re-throw inside transactional context so MongoDB transaction aborts
        throw err;
      }
      console.error(`[Audit] Failed to log ${type} for session ${sessionId}:`, err.message);
      return;
    }
  }
}

module.exports = {
  logEvent,
  stableStringify,
  computeEventHash
};
