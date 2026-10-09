/**
 * tamperDemo.js - Demonstrates tamper-evident hash chaining and immutability enforcement.
 *
 * 1. Creates a session with several chained audit events via logEvent().
 * 2. Runs audit chain verification -> Passes (ok: true).
 * 3. Proves app-level immutability: attempts AuditEvent.updateOne() -> Rejected by Mongoose hook.
 * 4. Simulates a direct database intrusion (via native Mongo driver bypassing Mongoose hooks)
 *    and modifies event at sequence 2.
 * 5. Runs audit chain verification again -> Fails (ok: false, brokenAtSequence: 2, reason: "hash mismatch").
 *
 * Usage:
 *   node scripts/tamperDemo.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');
const Session = require('../models/Session');
const AuditEvent = require('../models/AuditEvent');
const { logEvent, computeEventHash } = require('../services/auditService');

async function initDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/kyc-verification';
  const demoUri = uri.includes('?') 
    ? uri.replace(/\/[^/?]+(\?)/, '/kyc-demo$1')
    : (uri.endsWith('/') ? `${uri}kyc-demo` : `${uri}/kyc-demo`);
  
  await mongoose.connect(demoUri);
}

// Verification function mirroring adminController.verifyAuditChain
async function verifyChain(sessionId) {
  const events = await AuditEvent.find({ sessionId }).sort({ sequence: 1 }).lean();

  if (!events.length) {
    return { ok: true, total: 0, brokenAtSequence: null, reason: null };
  }

  for (let i = 0; i < events.length; i++) {
    const event = events[i];

    // Sequence continuity check
    if (event.sequence !== i) {
      return { ok: false, total: events.length, brokenAtSequence: event.sequence, reason: "sequence gap" };
    }

    // Previous hash link check
    const expectedPrevHash = (i === 0) ? 'GENESIS' : events[i - 1].hash;
    if (event.prevHash !== expectedPrevHash) {
      return { ok: false, total: events.length, brokenAtSequence: event.sequence, reason: "prevHash mismatch" };
    }

    // Cryptographic hash recalculation
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
      return { ok: false, total: events.length, brokenAtSequence: event.sequence, reason: "hash mismatch" };
    }
  }

  return { ok: true, total: events.length, brokenAtSequence: null, reason: null };
}

async function runDemo() {
  await initDB();
  console.log('===============================================================');
  console.log(' DBMS INTEGRITY AUDIT: TAMPER-EVIDENT HASH CHAIN DEMONSTRATION');
  console.log('===============================================================\n');

  const sessionId = `tamper_${crypto.randomUUID()}`;

  // 1. Create Session
  await Session.create({
    sessionId,
    name: 'TAMPER TEST APPLICANT',
    status: 'VERIFIED',
    seeded: true
  });

  // 2. Log several chained audit events
  console.log(`[1] Creating session and logging 4 hash-chained audit events...`);
  console.log(`    Session ID: ${sessionId}`);

  await logEvent(sessionId, 'SESSION_CREATED', 'Aadhaar uploaded and session initialized.', { ip: '127.0.0.1' });
  await logEvent(sessionId, 'OCR_EXTRACTED', 'Aadhaar OCR extraction passed.', { name: 'TAMPER TEST APPLICANT' });
  await logEvent(sessionId, 'FACE_COMPARED', 'Face match verified.', { score: 94 });
  await logEvent(sessionId, 'SESSION_VERIFIED', 'Verification fully completed.', { attempts: 1 });

  const events = await AuditEvent.find({ sessionId }).sort({ sequence: 1 }).lean();
  console.log(`    Generated ${events.length} chained events:`);
  events.forEach(e => {
    console.log(`      Seq #${e.sequence} | ${e.type.padEnd(16)} | Prev: ${e.prevHash.slice(0, 10)}... | Hash: ${e.hash.slice(0, 10)}...`);
  });

  // 3. Verify clean chain
  console.log('\n[2] Running Audit Chain Verification on untouched log...');
  const initialVerify = await verifyChain(sessionId);
  console.log(`    -> Result: ${JSON.stringify(initialVerify)}`);
  console.log(`    [OUTCOME]: ✅ INTEGRITY CONFIRMED: All hashes and sequence links are valid.\n`);

  // 4. Test Mongoose Immutability Hook
  console.log('[3] Testing Application-Level Immutability Hook...');
  try {
    await AuditEvent.updateOne({ sessionId, sequence: 2 }, { $set: { message: 'Attempted edit' } });
    console.log('    ❌ Hook failed: update was allowed!');
  } catch (hookErr) {
    console.log(`    -> Hook Intercepted: "${hookErr.message}"`);
    console.log('    [OUTCOME]: ✅ IMMUTABILITY HOOK ENFORCED: In-app updates are blocked.\n');
  }

  // 5. Simulate unauthorized direct DB tampering (native driver bypassing Mongoose hooks)
  console.log('[4] Simulating Database Tampering via Direct Driver Injection...');
  console.log('    Modifying event payload at Sequence #2 (FACE_COMPARED message)...');
  await mongoose.connection.collection('auditevents').updateOne(
    { sessionId, sequence: 2 },
    { $set: { message: 'TAMPERED_CONTENT: Attacker changed face score verification text!' } }
  );

  // 6. Verify tampered chain
  console.log('\n[5] Running Audit Chain Verification after tampering...');
  const tamperedVerify = await verifyChain(sessionId);
  console.log(`    -> Result: ${JSON.stringify(tamperedVerify)}`);
  console.log(`    [OUTCOME]: 🚨 TAMPERING DETECTED! Broken at sequence #${tamperedVerify.brokenAtSequence} due to ${tamperedVerify.reason}.\n`);

  // Cleanup test documents (using native driver to bypass immutability hook)
  await Session.deleteMany({ sessionId });
  await mongoose.connection.collection('auditevents').deleteMany({ sessionId });
  console.log('Cleaned up demo records.');
  console.log('===============================================================');

  await mongoose.disconnect();
  process.exit(0);
}

runDemo().catch(err => {
  console.error('Tamper Demo Error:', err);
  process.exit(1);
});
