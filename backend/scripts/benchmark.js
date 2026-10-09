/**
 * benchmark.js - Benchmarks query performance with explain('executionStats')
 *
 * Compares query execution metrics WITHOUT vs WITH indexes:
 *   1. Status + Date Range Filter + Sort by createdAt
 *   2. Name Search: Unanchored Regex (COLLSCAN) vs Prefix-Anchored Regex (IXSCAN)
 *   3. Sort by faceMatchScore (In-Memory Sort vs Indexed B-Tree Traversal)
 *
 * Outputs:
 *   - Console summary table
 *   - backend/benchmark-results.json
 *   - backend/benchmark-results.csv
 *
 * Usage:
 *   node scripts/benchmark.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

function getBenchmarkUri() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/kyc-verification';
  return uri.includes('?') 
    ? uri.replace(/\/[^/?]+(\?)/, '/kyc-benchmark$1')
    : (uri.endsWith('/') ? `${uri}kyc-benchmark` : `${uri}/kyc-benchmark`);
}

// Helper to locate the primary scan stage from the explain tree
function extractPrimaryStage(plan) {
  if (!plan) return 'UNKNOWN';
  if (plan.stage === 'IXSCAN' || plan.stage === 'COLLSCAN') {
    return plan.stage;
  }
  if (plan.inputStage) {
    return extractPrimaryStage(plan.inputStage);
  }
  if (plan.inputStages && plan.inputStages.length > 0) {
    for (const sub of plan.inputStages) {
      const found = extractPrimaryStage(sub);
      if (found !== 'UNKNOWN') return found;
    }
  }
  return plan.stage || 'UNKNOWN';
}

function parseStats(explainResult) {
  const stats = explainResult.executionStats || {};
  const winningPlan = (explainResult.queryPlanner && explainResult.queryPlanner.winningPlan) || {};
  const stage = extractPrimaryStage(winningPlan);

  return {
    stage,
    totalKeysExamined: stats.totalKeysExamined || 0,
    totalDocsExamined: stats.totalDocsExamined || 0,
    nReturned: stats.nReturned || 0,
    executionTimeMillis: stats.executionTimeMillis || 0
  };
}

async function runBenchmark() {
  const benchmarkUri = getBenchmarkUri();
  console.log('Connecting to Benchmark Database:', benchmarkUri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@'));
  await mongoose.connect(benchmarkUri);
  const collection = mongoose.connection.collection('sessions');

  const count = await collection.countDocuments();
  console.log(`\n===============================================================`);
  console.log(` DATABASE QUERY OPTIMIZATION BENCHMARK`);
  console.log(` Target Collection: sessions (${count.toLocaleString()} documents)`);
  console.log(`===============================================================\n`);

  if (count === 0) {
    console.warn('⚠️  Collection is empty! Please run: node scripts/seedBenchmark.js 10000 first.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const results = [];
  const now = Date.now();
  const sixtyDaysAgo = new Date(now - 60 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

  // --------------------------------------------------------------------------
  // BENCHMARK 1: Status + Date Range Filter + Sort
  // --------------------------------------------------------------------------
  console.log('[Query 1] Status + Date Range + Sort: { status: "VERIFIED", createdAt: [60d, 30d] } sort { createdAt: -1 }');
  const q1Filter = { status: 'VERIFIED', createdAt: { $gte: sixtyDaysAgo, $lte: thirtyDaysAgo } };
  const q1Sort = { createdAt: -1 };

  // Drop compound index if present
  try { await collection.dropIndex('status_1_createdAt_1'); } catch (e) {}

  const q1Without = await collection.find(q1Filter).sort(q1Sort).explain('executionStats');
  const q1StatsWithout = parseStats(q1Without);

  // Create compound index
  await collection.createIndex({ status: 1, createdAt: 1 });

  const q1With = await collection.find(q1Filter).sort(q1Sort).explain('executionStats');
  const q1StatsWith = parseStats(q1With);

  results.push({
    query: 'Status + Date Range + Sort',
    scenario: 'WITHOUT Index',
    ...q1StatsWithout
  });
  results.push({
    query: 'Status + Date Range + Sort',
    scenario: 'WITH Index {status:1, createdAt:1}',
    ...q1StatsWith
  });

  // --------------------------------------------------------------------------
  // BENCHMARK 2: Name Search (Unanchored Regex vs Prefix-Anchored Regex)
  // --------------------------------------------------------------------------
  console.log('[Query 2] Name Search: Unanchored Regex (.*Aarav.*) vs Prefix Regex (^Aarav)');
  
  // Ensure index on name
  await collection.createIndex({ name: 1 });

  // 2A: Unanchored regex (cannot use B-Tree index efficiently -> COLLSCAN)
  const q2Unanchored = await collection.find({ name: new RegExp('Aarav', 'i') }).explain('executionStats');
  const q2StatsUnanchored = parseStats(q2Unanchored);

  // 2B: Prefix-anchored regex (uses B-Tree index -> IXSCAN)
  const q2Prefix = await collection.find({ name: new RegExp('^Aarav', 'i') }).explain('executionStats');
  const q2StatsPrefix = parseStats(q2Prefix);

  results.push({
    query: 'Name Search (Regex)',
    scenario: 'Unanchored (.*Aarav.*)',
    ...q2StatsUnanchored
  });
  results.push({
    query: 'Name Search (Regex)',
    scenario: 'Prefix (^Aarav) with {name:1}',
    ...q2StatsPrefix
  });

  // --------------------------------------------------------------------------
  // BENCHMARK 3: Sort by faceMatchScore
  // --------------------------------------------------------------------------
  console.log('[Query 3] Sort by Score: { faceMatchScore: { $gte: 75 } } sort { faceMatchScore: -1 }');
  const q3Filter = { faceMatchScore: { $gte: 75 } };
  const q3Sort = { faceMatchScore: -1 };

  // Drop score index if present
  try { await collection.dropIndex('faceMatchScore_-1'); } catch (e) {}

  const q3Without = await collection.find(q3Filter).sort(q3Sort).explain('executionStats');
  const q3StatsWithout = parseStats(q3Without);

  // Create score index
  await collection.createIndex({ faceMatchScore: -1 });

  const q3With = await collection.find(q3Filter).sort(q3Sort).explain('executionStats');
  const q3StatsWith = parseStats(q3With);

  results.push({
    query: 'Sort by faceMatchScore',
    scenario: 'WITHOUT Index',
    ...q3StatsWithout
  });
  results.push({
    query: 'Sort by faceMatchScore',
    scenario: 'WITH Index {faceMatchScore:-1}',
    ...q3StatsWith
  });

  // --------------------------------------------------------------------------
  // Ensure all standard indexes are present
  // --------------------------------------------------------------------------
  await collection.createIndex({ status: 1, createdAt: 1 });
  await collection.createIndex({ faceMatchScore: -1 });
  await collection.createIndex({ name: 1 });
  await collection.createIndex({ aadhaarMasked: 1 });

  // --------------------------------------------------------------------------
  // PRINT SUMMARY TABLE
  // --------------------------------------------------------------------------
  console.log('\n========================================================================================================');
  console.log(
    'Query'.padEnd(28) +
    'Scenario'.padEnd(32) +
    'Stage'.padEnd(10) +
    'Keys Examined'.padEnd(16) +
    'Docs Examined'.padEnd(16) +
    'Execution Time'
  );
  console.log('--------------------------------------------------------------------------------------------------------');

  for (const r of results) {
    console.log(
      r.query.padEnd(28) +
      r.scenario.padEnd(32) +
      r.stage.padEnd(10) +
      String(r.totalKeysExamined).padEnd(16) +
      String(r.totalDocsExamined).padEnd(16) +
      `${r.executionTimeMillis} ms`
    );
  }
  console.log('========================================================================================================\n');

  // --------------------------------------------------------------------------
  // SAVE RESULTS TO JSON & CSV
  // --------------------------------------------------------------------------
  const outDir = path.join(__dirname, '..');
  const jsonPath = path.join(outDir, 'benchmark-results.json');
  const csvPath = path.join(outDir, 'benchmark-results.csv');

  const jsonContent = JSON.stringify({
    timestamp: new Date().toISOString(),
    totalDocuments: count,
    results
  }, null, 2);
  fs.writeFileSync(jsonPath, jsonContent);

  const csvRows = [
    'Query,Scenario,Stage,TotalKeysExamined,TotalDocsExamined,NReturned,ExecutionTimeMillis',
    ...results.map(r => `"${r.query}","${r.scenario}",${r.stage},${r.totalKeysExamined},${r.totalDocsExamined},${r.nReturned},${r.executionTimeMillis}`)
  ];
  fs.writeFileSync(csvPath, csvRows.join('\n'));

  console.log(`✅ Saved benchmark JSON to: ${jsonPath}`);
  console.log(`✅ Saved benchmark CSV to:  ${csvPath}`);

  await mongoose.disconnect();
  process.exit(0);
}

runBenchmark().catch(err => {
  console.error('[Benchmark Error]:', err);
  process.exit(1);
});
