const Session = require('../models/Session');
const AuditEvent = require('../models/AuditEvent');
const { computeEventHash } = require('../services/auditService');

const VALID_STATUSES = ['PENDING', 'FACE_VERIFIED', 'VERIFIED', 'FAILED', 'EXPIRED'];

// Fields safe to expose in the admin list (no raw PII, no disk paths).
const LIST_FIELDS = 'sessionId name aadhaarMasked status faceMatchScore challenge attempts createdAt completedAt';

// Escapes user input before using it inside a RegExp.
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 0. Token check — the login screen calls this to validate the admin key.
const verifyToken = (req, res) => {
  return res.status(200).json({ ok: true });
};

// 1. Paginated, filterable list of verifications.
const listVerifications = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const filter = {};

    if (req.query.status && VALID_STATUSES.includes(req.query.status)) {
      filter.status = req.query.status;
    }

    // Free-text search on name or masked Aadhaar (e.g. last 4 digits).
    if (req.query.q && req.query.q.trim()) {
      const rx = new RegExp(escapeRegex(req.query.q.trim()), 'i');
      filter.$or = [{ name: rx }, { aadhaarMasked: rx }];
    }

    // Date-range filter on creation time.
    const createdAt = {};
    if (req.query.from) {
      const from = new Date(req.query.from);
      if (!isNaN(from.getTime())) createdAt.$gte = from;
    }
    if (req.query.to) {
      const to = new Date(req.query.to);
      if (!isNaN(to.getTime())) createdAt.$lte = to;
    }
    if (Object.keys(createdAt).length) filter.createdAt = createdAt;

    // Small allowlist of sort orders.
    const sortMap = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      score: { faceMatchScore: -1 }
    };
    const sort = sortMap[req.query.sort] || sortMap.newest;

    const [items, total] = await Promise.all([
      Session.find(filter).select(LIST_FIELDS).sort(sort).skip(skip).limit(limit).lean(),
      Session.countDocuments(filter)
    ]);

    return res.status(200).json({
      items,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      limit
    });
  } catch (error) {
    console.error('Admin listVerifications Error:', error);
    return res.status(500).json({ error: `Internal Server Error: ${error.message}` });
  }
};

// 2. One verification record plus its full audit timeline.
const getVerificationDetail = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await Session.findOne({ sessionId })
      .select(`${LIST_FIELDS} aadhaarHash ipAddress userAgent updatedAt`)
      .lean();

    if (!session) {
      return res.status(404).json({ error: 'Verification not found.' });
    }

    const events = await AuditEvent.find({ sessionId })
      .sort({ createdAt: 1, _id: 1 })
      .select('type message meta createdAt')
      .lean();

    return res.status(200).json({ verification: session, events });
  } catch (error) {
    console.error('Admin getVerificationDetail Error:', error);
    return res.status(500).json({ error: `Internal Server Error: ${error.message}` });
  }
};

// 3. Dashboard analytics — powered entirely by MongoDB aggregation.
const getStats = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      statusAgg,
      avgScoreAgg,
      distinctAgg,
      todayCount,
      overTimeAgg,
      challengeAgg
    ] = await Promise.all([
      // Counts by status.
      Session.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      // Average face-match score (only sessions that reached comparison).
      Session.aggregate([
        { $match: { faceMatchScore: { $gt: 0 } } },
        { $group: { _id: null, avg: { $avg: '$faceMatchScore' } } }
      ]),
      // Distinct applicants by salted hash.
      Session.aggregate([
        { $match: { aadhaarHash: { $ne: '' } } },
        { $group: { _id: '$aadhaarHash' } },
        { $count: 'count' }
      ]),
      // Sessions created today.
      Session.countDocuments({ createdAt: { $gte: startOfToday } }),
      // Verifications per day over the last 30 days.
      Session.aggregate([
        { $match: { createdAt: { $gte: thirtyDaysAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            total: { $sum: 1 },
            verified: { $sum: { $cond: [{ $eq: ['$status', 'VERIFIED'] }, 1, 0] } },
            failed: { $sum: { $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0] } }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      // Liveness-challenge outcomes broken down by challenge type.
      AuditEvent.aggregate([
        { $match: { type: 'CHALLENGE_ATTEMPTED' } },
        {
          $group: {
            _id: '$meta.challenge',
            total: { $sum: 1 },
            passed: { $sum: { $cond: [{ $eq: ['$meta.success', true] }, 1, 0] } }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ]);

    // Reduce status aggregation into a keyed object.
    const byStatus = {};
    for (const row of statusAgg) byStatus[row._id] = row.count;
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);

    const verified = byStatus.VERIFIED || 0;
    const failed = byStatus.FAILED || 0;
    const expired = byStatus.EXPIRED || 0;

    const challengeAttempts = challengeAgg.reduce((a, r) => a + r.total, 0);
    const challengePassed = challengeAgg.reduce((a, r) => a + r.passed, 0);

    const round1 = (n) => Math.round(n * 10) / 10;

    return res.status(200).json({
      totals: {
        total,
        pending: byStatus.PENDING || 0,
        faceVerified: byStatus.FACE_VERIFIED || 0,
        verified,
        failed,
        expired,
        today: todayCount,
        distinctApplicants: distinctAgg[0] ? distinctAgg[0].count : 0
      },
      rates: {
        passRate: total ? round1((verified / total) * 100) : 0,
        avgFaceMatchScore: avgScoreAgg[0] ? round1(avgScoreAgg[0].avg) : 0,
        challengeSuccessRate: challengeAttempts ? round1((challengePassed / challengeAttempts) * 100) : 0
      },
      statusBreakdown: VALID_STATUSES.map((status) => ({ status, count: byStatus[status] || 0 })),
      verificationsOverTime: overTimeAgg.map((r) => ({
        date: r._id,
        total: r.total,
        verified: r.verified,
        failed: r.failed
      })),
      challengeBreakdown: challengeAgg.map((r) => ({
        challenge: r._id || 'UNKNOWN',
        total: r.total,
        passed: r.passed,
        failed: r.total - r.passed
      }))
    });
  } catch (error) {
    console.error('Admin getStats Error:', error);
    return res.status(500).json({ error: `Internal Server Error: ${error.message}` });
  }
};

// 4. Verify cryptographic hash chain integrity for a verification session
const verifyAuditChain = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const events = await AuditEvent.find({ sessionId })
      .sort({ sequence: 1 })
      .lean();

    if (!events.length) {
      return res.status(200).json({
        ok: true,
        total: 0,
        brokenAtSequence: null,
        reason: null,
        message: "No audit events found for this session."
      });
    }

    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      // 1. Verify sequence continuity (no sequence gaps or duplicates)
      if (event.sequence !== i) {
        return res.status(200).json({
          ok: false,
          total: events.length,
          brokenAtSequence: event.sequence,
          reason: "sequence gap"
        });
      }

      // 2. Verify prevHash link
      const expectedPrevHash = (i === 0) ? 'GENESIS' : events[i - 1].hash;
      if (event.prevHash !== expectedPrevHash) {
        return res.status(200).json({
          ok: false,
          total: events.length,
          brokenAtSequence: event.sequence,
          reason: "prevHash mismatch"
        });
      }

      // 3. Re-calculate and verify cryptographic hash
      const expectedHash = computeEventHash(
        event.prevHash,
        event.sessionId,
        event.sequence,
        event.type,
        event.message,
        event.meta,
        event.createdAt
      );

      if (event.hash !== expectedHash) {
        return res.status(200).json({
          ok: false,
          total: events.length,
          brokenAtSequence: event.sequence,
          reason: "hash mismatch"
        });
      }
    }

    return res.status(200).json({
      ok: true,
      total: events.length,
      brokenAtSequence: null,
      reason: null
    });
  } catch (error) {
    console.error('verifyAuditChain Error:', error);
    return res.status(500).json({ error: `Internal Server Error: ${error.message}` });
  }
};

module.exports = {
  verifyToken,
  listVerifications,
  getVerificationDetail,
  getStats,
  verifyAuditChain
};
