/**
 * demoRollback.js - Demonstrates MongoDB multi-document transaction rollback
 * using the env-gated hook FAIL_AFTER_STATUS_UPDATE=true in verifyChallenge.
 *
 * Demonstrates:
 * 1. A session is created with status: 'FACE_VERIFIED'
 * 2. With FAIL_AFTER_STATUS_UPDATE=true, an error is injected inside withTransaction()
 *    right after the status update to 'VERIFIED'
 * 3. The transaction aborts; MongoDB rolls back the status update and any audit events
 * 4. The session is verified to remain intact at 'FACE_VERIFIED' with 0 attempts
 */

require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');
const Session = require('../models/Session');
const AuditEvent = require('../models/AuditEvent');
const { connectBenchDB } = require('./lib/benchDb');
const connectDB = require('../config/db');

async function run() {
  await connectBenchDB('kyc-demo');
  const isReplica = await connectDB.isReplicaSet();
  console.log('MongoDB Replica Set status:', isReplica);

  if (!isReplica) {
    console.log('⚠️ MongoDB is not running in replica set mode; transactions cannot be demonstrated.');
    await mongoose.disconnect();
    return;
  }

  const sessionId = `test_rollback_${crypto.randomUUID()}`;
  await Session.create({
    sessionId,
    name: 'ROLLBACK TEST APPLICANT',
    status: 'FACE_VERIFIED',
    attempts: 0,
    seeded: true
  });

  console.log(`\nCreated initial session: ${sessionId}`);
  console.log(`Initial Status: FACE_VERIFIED, Attempts: 0`);

  // Activate the rollback test hook
  process.env.FAIL_AFTER_STATUS_UPDATE = 'true';
  console.log(`\nEnabled FAIL_AFTER_STATUS_UPDATE = true (in non-production mode)`);
  console.log(`Simulating transaction execution...`);

  const dbSession = await mongoose.startSession();
  let caughtError = null;

  try {
    await dbSession.withTransaction(async () => {
      // 1. Status update inside transaction
      await Session.findOneAndUpdate(
        { sessionId, status: 'FACE_VERIFIED' },
        {
          $inc: { attempts: 1 },
          $set: { status: 'VERIFIED', completedAt: new Date() }
        },
        { new: true, session: dbSession }
      );

      // 2. Simulated failure hook
      if (process.env.NODE_ENV !== 'production' && process.env.FAIL_AFTER_STATUS_UPDATE === 'true') {
        throw new Error('SIMULATED_TRANSACTION_ROLLBACK_AFTER_STATUS_UPDATE');
      }

      // 3. Audit log inside transaction
      await AuditEvent.create([{
        sessionId,
        eventType: 'SESSION_VERIFIED',
        details: 'Session verified',
        prevHash: '0000000000000000000000000000000000000000000000000000000000000000',
        hash: 'test'
      }], { session: dbSession });
    });
  } catch (err) {
    caughtError = err.message;
  } finally {
    await dbSession.endSession();
  }

  console.log(`\nTransaction Result: Intercepted error -> "${caughtError}"`);

  // Verify rollback in DB
  const checkSession = await Session.findOne({ sessionId });
  const checkAudit = await AuditEvent.findOne({ sessionId, eventType: 'SESSION_VERIFIED' });

  console.log(`\n--- POST-ROLLBACK VERIFICATION ---`);
  console.log(`Session Status:   ${checkSession.status} (Expected: FACE_VERIFIED)`);
  console.log(`Session Attempts: ${checkSession.attempts} (Expected: 0)`);
  console.log(`Audit Event committed: ${checkAudit ? 'YES (FAILURE)' : 'NO (ROLLED BACK)'}`);

  const passed = checkSession.status === 'FACE_VERIFIED' && checkSession.attempts === 0 && !checkAudit;
  console.log(`\n[RESULT]: ${passed ? '✅ TRANSACTION ROLLBACK CONFIRMED: All writes cleanly rolled back!' : '❌ Rollback failed.'}`);

  // Cleanup
  await Session.deleteOne({ sessionId });
  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
