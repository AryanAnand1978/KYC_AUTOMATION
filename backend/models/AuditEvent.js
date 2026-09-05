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
  // Links to Session.sessionId (not an ObjectId ref, so events survive
  // independently and are cheap to query by session).
  sessionId: {
    type: String,
    required: true,
    index: true
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
  }
}, {
  timestamps: true
});

// Timeline lookups for a single session.
auditEventSchema.index({ sessionId: 1, createdAt: 1 });
// Aggregations grouped by event type / over time.
auditEventSchema.index({ type: 1 });
auditEventSchema.index({ createdAt: 1 });

const AuditEvent = mongoose.model('AuditEvent', auditEventSchema);
AuditEvent.TYPES = AUDIT_EVENT_TYPES;

module.exports = AuditEvent;
