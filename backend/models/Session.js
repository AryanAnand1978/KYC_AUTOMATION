const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    default: ''
  },
  nameLower: {
    type: String,
    default: '',
    index: true
  },
  // PII is stored metadata-only. We keep a salted, non-reversible hash
  // (for distinct-applicant analytics) and a masked value (for display).
  // The raw Aadhaar number is never persisted.
  aadhaarHash: {
    type: String,
    default: '',
    index: true
  },
  aadhaarMasked: {
    type: String,
    default: ''
  },
  aadhaarImagePath: {
    type: String,
    default: ''
  },
  aadhaarFacePath: {
    type: String,
    default: ''
  },
  selfieImagePath: {
    type: String,
    default: ''
  },
  faceMatchScore: {
    type: Number,
    default: 0
  },
  challenge: {
    type: String,
    enum: ["SHOW_LEFT_HAND", "SHOW_RIGHT_HAND", "TURN_HEAD_LEFT", "TURN_HEAD_RIGHT", ""],
    default: ''
  },
  attempts: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ["PENDING", "FACE_VERIFIED", "VERIFIED", "FAILED", "EXPIRED"],
    default: "PENDING"
  },
  // Request context captured at upload time, for audit + analytics.
  ipAddress: {
    type: String,
    default: ''
  },
  userAgent: {
    type: String,
    default: ''
  },
  completedAt: {
    type: Date
  },
  seeded: {
    type: Boolean,
    default: false
  }
}, {
  // Supplies createdAt + updatedAt automatically.
  timestamps: true
});

// Cron expiry scan + admin list ordering.
sessionSchema.index({ status: 1, createdAt: 1 });
// Time-series analytics (verifications over time).
sessionSchema.index({ createdAt: 1 });
// Query optimization indexes for admin searching & score sorting
sessionSchema.index({ faceMatchScore: -1 });
sessionSchema.index({ name: 1 });
sessionSchema.index({ nameLower: 1 });
sessionSchema.index({ aadhaarMasked: 1 });

// Automatically compute nameLower before saving
sessionSchema.pre('save', function(next) {
  if (this.name) {
    this.nameLower = this.name.toLowerCase();
  } else if (!this.nameLower) {
    this.nameLower = '';
  }
  next();
});

// Helper to check if session has expired (10 minutes)
sessionSchema.methods.isExpired = function() {
  if (this.status === 'EXPIRED') return true;
  const tenMinutes = 10 * 60 * 1000;
  const expired = Date.now() - this.createdAt.getTime() > tenMinutes;
  return expired;
};

module.exports = mongoose.model('Session', sessionSchema);
