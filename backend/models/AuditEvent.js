const mongoose = require('mongoose');

// Every meaningful transition in a verification's lifecycle is recorded as a
// separate audit event. A dedicated collection (rather than an embedded array)
// keeps session documents lean, lets the trail grow unbounded, and makes
// cross-session analytics via aggregation straightforward.
const AUDIT_EVENT_TYPES = [
  'SESSION_CREATED',
  'OCR_EXTRACTED',
  'FACE_CROPPED',
  'FACE_COMPARED',
  'FACE_PASSED',
  'FACE_FAILED',
  'CHALLENGE_ASSIGNED',
  'CHALLENGE_ATTEMPTED',
  'CHALLENGE_PASSED',
  'CHALLENGE_FAILED',
  'SESSION_VERIFIED',
  'SESSION_FAILED',
  'SESSION_EXPIRED',
  'MEDIA_CLEANED'
];

const auditEventSchema = new mongoose.Schema({
  // Links to Session.sessionId
  sessionId: {
    type: String,
    required: true
  },
  // Monotonically increasing sequence number per session (0, 1, 2, ...)
  sequence: {
    type: Number,
    required: true
  },
  // Cryptographic hash of the previous event in the chain ('GENESIS' for sequence 0)
  prevHash: {
    type: String,
    required: true
  },
  // SHA-256 digest of prevHash + event content + deterministic timestamp
  hash: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: AUDIT_EVENT_TYPES,
    required: true
  },
  message: {
    type: String,
    default: ''
  },
  // Free-form structured context (score, challenge, attempt number, etc.).
  meta: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Explicitly stored creation timestamp used in hash calculation
  createdAt: {
    type: Date,
    default: Date.now,
    required: true
  }
}, {
  // Do not allow automatic timestamp overwrite since createdAt is hashed
  timestamps: false
});

// Enforce unique monotonic sequence per session
auditEventSchema.index({ sessionId: 1, sequence: 1 }, { unique: true });

// Timeline lookups for a single session.
auditEventSchema.index({ sessionId: 1, createdAt: 1 });
// Aggregations grouped by event type / over time.
auditEventSchema.index({ type: 1 });
auditEventSchema.index({ createdAt: 1 });

// Application-level immutability enforcement: block modifications and deletions
const blockMutation = function(next) {
  const err = new Error('IMMUTABLE_AUDIT_LOG: AuditEvent records are append-only and cannot be updated, replaced, or deleted.');
  if (typeof next === 'function') return next(err);
  throw err;
};

auditEventSchema.pre('updateOne', blockMutation);
auditEventSchema.pre('updateMany', blockMutation);
auditEventSchema.pre('findOneAndUpdate', blockMutation);
auditEventSchema.pre('replaceOne', blockMutation);
auditEventSchema.pre('deleteOne', blockMutation);
auditEventSchema.pre('deleteMany', blockMutation);

const AuditEvent = mongoose.model('AuditEvent', auditEventSchema);
AuditEvent.TYPES = AUDIT_EVENT_TYPES;

module.exports = AuditEvent;
