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
  aadhaarNumber: {
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
  createdAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date
  }
});

// Helper to check if session has expired (10 minutes)
sessionSchema.methods.isExpired = function() {
  if (this.status === 'EXPIRED') return true;
  const tenMinutes = 10 * 60 * 1000;
  const expired = Date.now() - this.createdAt.getTime() > tenMinutes;
  return expired;
};

module.exports = mongoose.model('Session', sessionSchema);
