const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const requireAdmin = require('../middleware/adminAuth');
const adminController = require('../controllers/adminController');

// Rate limiter for admin endpoints (protects the token from brute forcing and
// caps dashboard polling). Applied before auth so failed attempts count too.
const adminLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 200, // generous for a dashboard that fetches stats + lists + details
  message: { error: "Too many admin requests. Please try again shortly." }
});

// Every admin route is rate-limited and requires a valid bearer token.
router.use(adminLimiter);
router.use(requireAdmin);

router.get('/verify', adminController.verifyToken);
router.get('/verifications', adminController.listVerifications);
router.get('/verifications/:sessionId', adminController.getVerificationDetail);
router.get('/stats', adminController.getStats);

module.exports = router;
