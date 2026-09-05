const crypto = require('crypto');

/**
 * Constant-time string comparison to avoid leaking the token via timing.
 * timingSafeEqual throws on unequal buffer lengths, so we guard that first
 * (the early length return is itself not constant-time, but token length is
 * not secret — the token value is).
 */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Guards admin routes with a shared bearer token (process.env.ADMIN_TOKEN).
 *
 * Fails closed: if ADMIN_TOKEN is not configured on the server, every admin
 * request is refused with 500 rather than left open.
 */
function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_TOKEN;

  if (!expected) {
    console.error('[AdminAuth] ADMIN_TOKEN is not configured; refusing admin access.');
    return res.status(500).json({ error: 'Admin access is not configured on the server.' });
  }

  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  const provided = match ? match[1].trim() : '';

  if (!provided || !safeEqual(provided, expected)) {
    return res.status(401).json({ error: 'Unauthorized. A valid admin token is required.' });
  }

  next();
}

module.exports = requireAdmin;
