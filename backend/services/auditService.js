const AuditEvent = require('../models/AuditEvent');

/**
 * Records an audit event for a verification session.
 *
 * In a transactional context (when dbSession is provided), errors are NOT swallowed
 * and are rethrown so the calling transaction is aborted.
 * Outside a transaction, it acts in a non-blocking fire-and-forget manner.
 *
 * @param {string} sessionId - The session the event belongs to.
 * @param {string} type - One of AuditEvent.TYPES.
 * @param {string} [message] - Human-readable description.
 * @param {object} [meta] - Structured context (score, challenge, attempt, ...).
 * @param {ClientSession} [dbSession] - Optional Mongoose ClientSession for ACID transactions.
 */
async function logEvent(sessionId, type, message = '', meta = {}, dbSession = null) {
  try {
    if (dbSession) {
      await AuditEvent.create([{ sessionId, type, message, meta }], { session: dbSession });
    } else {
      await AuditEvent.create({ sessionId, type, message, meta });
    }
  } catch (err) {
    if (dbSession) {
      // Inside a transactional context, rethrow to abort transaction
      throw err;
    }
    console.error(`[Audit] Failed to log ${type} for session ${sessionId}:`, err.message);
  }
}

module.exports = { logEvent };
