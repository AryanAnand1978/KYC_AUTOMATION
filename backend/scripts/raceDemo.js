/**
 * raceDemo.js - Demonstrates race conditions in check-then-save vs atomic conditional updates.
 *
 * Simulates N parallel requests attempting to transition the SAME session
 * from FACE_VERIFIED to VERIFIED at the exact same instant.
 *
 * Case A (Legacy check-then-save):
 *   Multiple parallel operations read status === 'FACE_VERIFIED' before any
 *   call commits save(), allowing multiple concurrent successes (>1).
 *
 * Case B (Atomic findOneAndUpdate):
 *   MongoDB atomic conditional update { sessionId, status: 'FACE_VERIFIED' }
 *   guarantees that exactly ONE operation succeeds, while N-1 operations receive
 *   a 409 Conflict / null update.
 *
 * Usage:
 *   node scripts/raceDemo.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');
const Session = require('../models/Session');

const N = 10; // Number of concurrent requests

// Connect to MongoDB
async function initDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/kyc-verification';
  // Use demo database to avoid touching real data
  const demoUri = uri.includes('?') 
    ? uri.replace(/\/[^/?]+(\?)/, '/kyc-demo$1')
    : (uri.endsWith('/') ? `${uri}kyc-demo` : `${uri}/kyc-demo`);
  
  await mongoose.connect(demoUri);
}

// Simulated Legacy Transition (Check-then-save)
async function simulateLegacyTransition(sessionId) {
  // 1. Read state
  const session = await Session.findOne({ sessionId });
  if (!session || session.status !== 'FACE_VERIFIED') {
    return { success: false, status: session ? session.status : 'NOT_FOUND' };
  }

  // Artificial concurrency window simulating network/disk I/O before write
  await new Promise(resolve => setTimeout(resolve, 30));

  // 2. Check and Save
  session.status = 'VERIFIED';
  session.completedAt = new Date();
  await session.save();

  return { success: true, status: 'VERIFIED' };
}

// Atomic Conditional Transition (Fixed)
async function simulateAtomicTransition(sessionId) {
  // Atomic query & update in a single DB operation
  const updated = await Session.findOneAndUpdate(
    { sessionId, status: 'FACE_VERIFIED' },
    {
      $inc: { attempts: 1 },
      $set: {
        status: 'VERIFIED',
        completedAt: new Date()
      }
    },
    { new: true }
  );

  if (!updated) {
    return { success: false, conflict: true, status: '409_CONFLICT' };
  }

  return { success: true, status: 'VERIFIED', attempts: updated.attempts };
}

async function runDemo() {
  await initDB();
  console.log('===============================================================');
  console.log(` DBMS CONCURRENCY AUDIT: RACE CONDITION DEMONSTRATION (N = ${N})`);
  console.log('===============================================================\n');

  // --- TEST 1: LEGACY LOGIC ---
  const legacySessionId = `race_legacy_${crypto.randomUUID()}`;
  await Session.create({
    sessionId: legacySessionId,
    name: 'RACE TEST APPLICANT',
    status: 'FACE_VERIFIED',
    attempts: 0,
    seeded: true
  });

  console.log(`[1] Testing LEGACY Logic (Check-then-Save)...`);
  console.log(`    Session ID: ${legacySessionId}`);
  console.log(`    Firing ${N} parallel verification attempts...`);

  const legacyResults = await Promise.all(
    Array.from({ length: N }).map(() => simulateLegacyTransition(legacySessionId))
  );

  const legacySuccesses = legacyResults.filter(r => r.success).length;
  const legacyFailures = legacyResults.filter(r => !r.success).length;

  console.log(`    -> Succeeded: ${legacySuccesses} / ${N}`);
  console.log(`    -> Failed:    ${legacyFailures} / ${N}`);
  console.log(`    [RESULT]: ${legacySuccesses > 1 ? '⚠️  VULNERABILITY CONFIRMED: Multiple requests succeeded concurrently!' : 'Only 1 succeeded.'}\n`);

  // --- TEST 2: ATOMIC CONDITIONAL UPDATE ---
  const atomicSessionId = `race_atomic_${crypto.randomUUID()}`;
  await Session.create({
    sessionId: atomicSessionId,
    name: 'RACE TEST APPLICANT',
    status: 'FACE_VERIFIED',
    attempts: 0,
    seeded: true
  });

  console.log(`[2] Testing FIXED Logic (Atomic findOneAndUpdate)...`);
  console.log(`    Session ID: ${atomicSessionId}`);
  console.log(`    Firing ${N} parallel verification attempts...`);

  const atomicResults = await Promise.all(
    Array.from({ length: N }).map(() => simulateAtomicTransition(atomicSessionId))
  );

  const atomicSuccesses = atomicResults.filter(r => r.success).length;
  const atomicConflicts = atomicResults.filter(r => r.conflict).length;

  console.log(`    -> Succeeded (200 OK):      ${atomicSuccesses} / ${N}`);
  console.log(`    -> Rejected (409 Conflict): ${atomicConflicts} / ${N}`);
  console.log(`    [RESULT]: ${atomicSuccesses === 1 ? '✅ MUTUAL EXCLUSION ENFORCED: Exactly 1 request succeeded; all others received 409 Conflict.' : 'Failed to enforce mutual exclusion.'}\n`);

  // Cleanup test documents
  await Session.deleteMany({ sessionId: { $in: [legacySessionId, atomicSessionId] } });
  console.log('Cleaned up demo session documents.');
  console.log('===============================================================');

  await mongoose.disconnect();
  process.exit(0);
}

runDemo().catch(err => {
  console.error('Race Demo Error:', err);
  process.exit(1);
});
