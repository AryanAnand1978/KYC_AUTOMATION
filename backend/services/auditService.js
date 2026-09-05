const AuditEvent = require('../models/AuditEvent');

/**
 * Records an audit event for a verification session.
 *
 * This is intentionally fire-and-forget: an audit-logging failure must never
 * break or roll back the verification flow, so errors are caught and logged
 * rather than thrown. Callers may `await` it, but a rejection is impossible.
 *
 * @param {string} sessionId - The session the event belongs to.
 * @param {string} type - One of AuditEvent.TYPES.
 * @param {string} [message] - Human-readable description.
 * @param {object} [meta] - Structured context (score, challenge, attempt, ...).
 */
async function logEvent(sessionId, type, message = '', meta = {}) {
  try {
    await AuditEvent.create({ sessionId, type, message, meta });
  } catch (err) {
    console.error(`[Audit] Failed to log ${type} for session ${sessionId}:`, err.message);
  }
}

module.exports = { logEvent };
