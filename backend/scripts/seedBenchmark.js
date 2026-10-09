/**
 * seedBenchmark.js - Bulk-generates synthetic KYC verification sessions for benchmarking.
 *
 * Populates N realistic documents into an isolated `kyc-benchmark` database.
 * Documents are marked with `seeded: true` for clean teardown.
 *
 * Usage:
 *   node scripts/seedBenchmark.js [N]
 *   node scripts/seedBenchmark.js 10000
 *   node scripts/seedBenchmark.js --clean
 */

require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');

const FIRST_NAMES = [
  'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan',
  'Krishna', 'Ishaan', 'Diya', 'Saanvi', 'Ananya', 'Aadhya', 'Pari', 'Priya',
  'Kavya', 'Riya', 'Sneha', 'Tanvi', 'Rohan', 'Amit', 'Neha', 'Pooja', 'Vikram'
];

const LAST_NAMES = [
  'Sharma', 'Verma', 'Patel', 'Singh', 'Kumar', 'Gupta', 'Reddy', 'Mehta',
  'Chopra', 'Joshi', 'Bose', 'Nair', 'Malhotra', 'Bhatia', 'Saxena', 'Kapoor'
];

const STATUSES = ['PENDING', 'FACE_VERIFIED', 'VERIFIED', 'FAILED', 'EXPIRED'];
const CHALLENGES = ['SHOW_LEFT_HAND', 'SHOW_RIGHT_HAND', 'TURN_HEAD_LEFT', 'TURN_HEAD_RIGHT'];

function getBenchmarkUri() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/kyc-verification';
  // Ensure target is strictly the separate benchmark database
  return uri.includes('?') 
    ? uri.replace(/\/[^/?]+(\?)/, '/kyc-benchmark$1')
    : (uri.endsWith('/') ? `${uri}kyc-benchmark` : `${uri}/kyc-benchmark`);
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function run() {
  const args = process.argv.slice(2);
  const benchmarkUri = getBenchmarkUri();

  console.log('Connecting to Benchmark Database:', benchmarkUri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@'));
  await mongoose.connect(benchmarkUri);
  const collection = mongoose.connection.collection('sessions');

  if (args.includes('--clean')) {
    console.log('[Seed] Cleaning existing seeded benchmark documents...');
    const delRes = await collection.deleteMany({ seeded: true });
    console.log(`[Seed] Deleted ${delRes.deletedCount} benchmark documents.`);
    await mongoose.disconnect();
    process.exit(0);
  }

  const rawN = args.find(a => !a.startsWith('--'));
  const N = Math.max(1, parseInt(rawN, 10) || 10000);

  console.log(`===============================================================`);
  console.log(` SEEDING BENCHMARK DATA: N = ${N.toLocaleString()} documents`);
  console.log(` Target DB: kyc-benchmark (Isolated from production)`);
  console.log(`===============================================================\n`);

  const startTime = Date.now();
  const BATCH_SIZE = 5000;
  const now = Date.now();
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

  let insertedCount = 0;

  while (insertedCount < N) {
    const currentBatchSize = Math.min(BATCH_SIZE, N - insertedCount);
    const docs = [];

    for (let i = 0; i < currentBatchSize; i++) {
      const first = randomItem(FIRST_NAMES);
      const last = randomItem(LAST_NAMES);
      const name = `${first} ${last}`;
      const status = randomItem(STATUSES);
      const randomAgeMs = Math.floor(Math.random() * ninetyDaysMs);
      const createdAt = new Date(now - randomAgeMs);
      const completedAt = (status === 'VERIFIED' || status === 'FAILED' || status === 'EXPIRED')
        ? new Date(createdAt.getTime() + randomInt(60000, 300000))
        : null;

      const lastFour = String(randomInt(1000, 9999));
      const aadhaarMasked = `XXXX XXXX ${lastFour}`;
      const aadhaarHash = crypto.createHash('sha256').update(`seed-pepper:${name}:${lastFour}`).digest('hex');

      docs.push({
        sessionId: crypto.randomUUID(),
        name,
        aadhaarHash,
        aadhaarMasked,
        aadhaarImagePath: '',
        aadhaarFacePath: '',
        selfieImagePath: '',
        faceMatchScore: randomInt(45, 99),
        challenge: randomItem(CHALLENGES),
        attempts: randomInt(0, 2),
        status,
        ipAddress: `192.168.1.${randomInt(1, 254)}`,
        userAgent: 'Mozilla/5.0 Benchmark Synthetic Agent',
        createdAt,
        updatedAt: completedAt || createdAt,
        completedAt,
        seeded: true
      });
    }

    await collection.insertMany(docs, { ordered: false });
    insertedCount += currentBatchSize;
    process.stdout.write(`  Inserted ${insertedCount.toLocaleString()} / ${N.toLocaleString()} docs...\r`);
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n✅ Seeding complete: ${insertedCount.toLocaleString()} documents inserted in ${durationSec}s.`);

  // Verify total count in collection
  const totalInCollection = await collection.countDocuments({ seeded: true });
  console.log(`Total seeded documents in collection: ${totalInCollection.toLocaleString()}`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => {
  console.error('[Seed Error]:', err);
  process.exit(1);
});
