/**
 * migrateAuditChain.js - Backfills sequence numbers, prevHash, and cryptographic hashes
 * for legacy AuditEvent records that predate the tamper-evident hash chaining system.
 *
 * Usage:
 *   node scripts/migrateAuditChain.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { computeEventHash } = require('../services/auditService');

(async () => {
  try {
    await connectDB();
    const collection = mongoose.connection.collection('auditevents');

    // Find all distinct sessionIds in the collection
    const sessionIds = await collection.distinct('sessionId');
    console.log(`[Migrate Audit Chain] Found ${sessionIds.length} unique session(s) in auditevents collection.`);

    let migratedTotal = 0;

    for (const sessionId of sessionIds) {
      const events = await collection.find({ sessionId }).sort({ createdAt: 1, _id: 1 }).toArray();

      let prevHash = 'GENESIS';
      for (let i = 0; i < events.length; i++) {
        const event = events[i];

        // Check if event already has valid sequence and hash
        if (typeof event.sequence === 'number' && event.hash && event.prevHash) {
          prevHash = event.hash;
          continue;
        }

        const sequence = i;
        const currentPrevHash = prevHash;
        const createdAt = event.createdAt ? new Date(event.createdAt) : new Date();
        const hash = computeEventHash(
          currentPrevHash,
          event.sessionId,
          sequence,
          event.type,
          event.message || '',
          event.meta || {},
          createdAt
        );

        await collection.updateOne(
          { _id: event._id },
          {
            $set: {
              sequence,
              prevHash: currentPrevHash,
              hash,
              createdAt
            }
          }
        );

        prevHash = hash;
        migratedTotal++;
      }
    }

    console.log(`[Migrate Audit Chain] Successfully migrated ${migratedTotal} event(s) across ${sessionIds.length} session(s).`);
    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('[Migrate Audit Chain Error]:', err);
    process.exit(1);
  }
})();
