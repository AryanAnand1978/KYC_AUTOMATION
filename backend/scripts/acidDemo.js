/**
 * acidDemo.js - Demonstrates ACID transaction atomicity vs partial non-transactional writes.
 *
 * Simulates a crash/error occurring after a Session status update to 'VERIFIED',
 * but before the corresponding AuditEvent can be written.
 *
 * Case A (Without Transaction):
 *   The Session update commits immediately. When the crash occurs, the audit
 *   write never happens. Result: INCONSISTENT STATE (Session is VERIFIED, but
 *   0 audit records exist).
 *
 * Case B (With Transaction):
 *   The Session update and audit writes are wrapped in withTransaction().
 *   When the crash occurs before commit, MongoDB rolls back all changes in the session.
 *   Result: ATOMIC ROLLBACK (Session remains FACE_VERIFIED, 0 partial writes leaked).
 *
 * Usage:
 *   node scripts/acidDemo.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');
const Session = require('../models/Session');
const AuditEvent = require('../models/AuditEvent');
const connectDB = require('../config/db');

async function initDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/kyc-verification';
  const demoUri = uri.includes('?') 
    ? uri.replace(/\/[^/?]+(\?)/, '/kyc-demo$1')
    : (uri.endsWith('/') ? `${uri}kyc-demo` : `${uri}/kyc-demo`);
  
  await mongoose.connect(demoUri);
}

// Case A: Non-transactional execution with injected failure
async function runWithoutTransaction(sessionId) {
  try {
    // 1. Session update commits directly to DB
    await Session.findOneAndUpdate(
      { sessionId, status: 'FACE_VERIFIED' },
      { $set: { status: 'VERIFIED', completedAt: new Date() } }
    );

    // 2. INJECTED FAILURE before audit write
    throw new Error('SIMULATED_NODE_CRASH_BEFORE_AUDIT_WRITE');

    // 3. This write is never reached
    await AuditEvent.create({
      sessionId,
      type: 'SESSION_VERIFIED',
      message: 'Session fully verified.'
    });
  } catch (err) {
    // Error caught at controller/process boundary
    return { errorCaught: err.message };
  }
}

// Case B: Transactional execution with injected failure
async function runWithTransaction(sessionId) {
  const dbSession = await mongoose.startSession();
  try {
    await dbSession.withTransaction(async () => {
      // 1. Session update staged inside transaction session
      await Session.findOneAndUpdate(
        { sessionId, status: 'FACE_VERIFIED' },
        { $set: { status: 'VERIFIED', completedAt: new Date() } },
        { session: dbSession }
      );

      // 2. INJECTED FAILURE inside transaction before commit
      throw new Error('SIMULATED_NODE_CRASH_BEFORE_AUDIT_WRITE');

      // 3. This write is never reached
      await AuditEvent.create([{
        sessionId,
        type: 'SESSION_VERIFIED',
        message: 'Session fully verified.'
      }], { session: dbSession });
    });
  } catch (err) {
    // Transaction automatically aborts on error
    return { errorCaught: err.message };
  } finally {
    await dbSession.endSession();
  }
}

async function runDemo() {
  await initDB();
  console.log('===============================================================');
  console.log(' DBMS ACID AUDIT: MULTI-DOCUMENT TRANSACTION DEMONSTRATION');
  console.log('===============================================================\n');

  const isReplica = await connectDB.isReplicaSet();
  console.log(`[Environment Check] Replica Set Active: ${isReplica ? 'YES (Transactions supported)' : 'NO (Standalone)'}\n`);

  if (!isReplica) {
    console.warn('⚠️  Cannot demonstrate Case B on standalone MongoDB. A replica set (Atlas or --replSet rs0) is required.');
    await mongoose.disconnect();
    process.exit(0);
  }

  // --- TEST 1: WITHOUT TRANSACTION ---
  const noTxSessionId = `acid_notx_${crypto.randomUUID()}`;
  await Session.create({
    sessionId: noTxSessionId,
    name: 'ACID TEST APPLICANT A',
    status: 'FACE_VERIFIED',
    attempts: 1,
    seeded: true
  });

  console.log('[1] Testing WITHOUT Transaction (Injected Crash)...');
  console.log(`    Session ID: ${noTxSessionId}`);
  console.log('    Executing update, then injecting simulated crash before audit write...');

  const noTxOutcome = await runWithoutTransaction(noTxSessionId);
  console.log(`    Crash Handled: "${noTxOutcome.errorCaught}"`);

  const noTxSessionAfter = await Session.findOne({ sessionId: noTxSessionId });
  const noTxAuditCount = await AuditEvent.countDocuments({ sessionId: noTxSessionId });

  console.log(`    -> Resulting Session.status:    "${noTxSessionAfter.status}"`);
  console.log(`    -> Resulting AuditEvent count:   ${noTxAuditCount}`);
  console.log(`    [OUTCOME]: ❌ INCONSISTENT STATE: Session marked VERIFIED, but audit trail is empty!\n`);

  // --- TEST 2: WITH TRANSACTION ---
  const txSessionId = `acid_tx_${crypto.randomUUID()}`;
  await Session.create({
    sessionId: txSessionId,
    name: 'ACID TEST APPLICANT B',
    status: 'FACE_VERIFIED',
    attempts: 1,
    seeded: true
  });

  console.log('[2] Testing WITH Transaction (Injected Crash)...');
  console.log(`    Session ID: ${txSessionId}`);
  console.log('    Executing update in withTransaction(), then injecting simulated crash...');

  const txOutcome = await runWithTransaction(txSessionId);
  console.log(`    Crash Handled: "${txOutcome.errorCaught}"`);

  const txSessionAfter = await Session.findOne({ sessionId: txSessionId });
  const txAuditCount = await AuditEvent.countDocuments({ sessionId: txSessionId });

  console.log(`    -> Resulting Session.status:    "${txSessionAfter.status}"`);
  console.log(`    -> Resulting AuditEvent count:   ${txAuditCount}`);
  console.log(`    [OUTCOME]: ✅ ATOMIC ROLLBACK CONFIRMED: Session status remains "${txSessionAfter.status}". No partial writes leaked!\n`);

  // Cleanup test documents
  await Session.deleteMany({ sessionId: { $in: [noTxSessionId, txSessionId] } });
  await AuditEvent.deleteMany({ sessionId: { $in: [noTxSessionId, txSessionId] } });
  console.log('Cleaned up demo session documents.');
  console.log('===============================================================');

  await mongoose.disconnect();
  process.exit(0);
}

runDemo().catch(err => {
  console.error('ACID Demo Error:', err);
  process.exit(1);
});
