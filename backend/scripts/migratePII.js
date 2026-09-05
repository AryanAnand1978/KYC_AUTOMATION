/**
 * One-off migration: convert any legacy Session documents that still hold a
 * plaintext `aadhaarNumber` into the secured, metadata-only form
 * (aadhaarHash + aadhaarMasked) and unset the plaintext field.
 *
 * Usage:  npm run migrate:pii     (from the backend/ directory)
 *
 * Safe to re-run: documents without a plaintext number are skipped, and an
 * already-computed hash/mask is preserved. Requires the same MONGODB_URI and
 * AADHAAR_HASH_PEPPER as the server so the hashes match those the live
 * controller produces.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');
const connectDB = require('../config/db');

// Kept in sync with the helpers in controllers/kycController.js.
const maskAadhaar = (num) => {
  if (!num) return '';
  const cleaned = String(num).replace(/\s/g, '');
  if (cleaned.length < 4) return 'XXXX';
  return `XXXX XXXX ${cleaned.slice(-4)}`;
};

const hashAadhaar = (num) => {
  if (!num) return '';
  const cleaned = String(num).replace(/\D/g, '');
  if (!cleaned) return '';
  const pepper = process.env.AADHAAR_HASH_PEPPER || '';
  return crypto.createHash('sha256').update(`${pepper}:${cleaned}`).digest('hex');
};

(async () => {
  try {
    await connectDB();

    // Query the raw collection directly: the legacy field is no longer part of
    // the Mongoose schema, so a model query would not surface it.
    const collection = mongoose.connection.collection('sessions');
    const legacy = await collection.find({ aadhaarNumber: { $exists: true } }).toArray();

    console.log(`[Migrate PII] Found ${legacy.length} document(s) with a legacy plaintext aadhaarNumber.`);

    let updated = 0;
    for (const doc of legacy) {
      const raw = doc.aadhaarNumber || '';
      await collection.updateOne(
        { _id: doc._id },
        {
          $set: {
            aadhaarHash: doc.aadhaarHash || hashAadhaar(raw),
            aadhaarMasked: doc.aadhaarMasked || maskAadhaar(raw)
          },
          $unset: { aadhaarNumber: '' }
        }
      );
      updated += 1;
    }

    console.log(`[Migrate PII] Migrated ${updated} document(s); plaintext Aadhaar numbers removed.`);
    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('[Migrate PII] Failed:', err);
    process.exit(1);
  }
})();
