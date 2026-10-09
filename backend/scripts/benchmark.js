/**
 * benchmark.js - Benchmarks query performance with explain('executionStats')
 *
 * Connected strictly to isolated database: kyc-benchmark
 *
 * Rules:
 *   - Identical filter, sort, and limit across scenarios of the same query
 *   - Both limit(20) top-N pagination and unlimited sort variants reported
 *   - 5 runs per scenario: 1st discarded (cache warmup), median of remaining 4 reported
 *   - Validates nReturned matches across scenarios of the same query
 *   - Writes benchmark-results.json and .csv with columns:
 *     Size, Query, Scenario, Stage, KeysExamined, DocsExamined, NReturned, MedianMs
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { connectBenchDB } = require('./lib/benchDb');

// Helper to locate the primary scan stage from the explain tree
function extractPrimaryStage(plan) {
  if (!plan) return 'UNKNOWN';
  if (plan.stage === 'IXSCAN' || plan.stage === 'COLLSCAN') {
    return plan.stage;
  }
  if (plan.inputStage) {
    const sub = extractPrimaryStage(plan.inputStage);
    if (sub !== 'UNKNOWN') return sub;
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
    keysExamined: stats.totalKeysExamined || 0,
    docsExamined: stats.totalDocsExamined || 0,
    nReturned: stats.nReturned || 0,
    timeMs: stats.executionTimeMillis || 0
  };
}

// Executes an explain query 5 times, discards run 1 (warmup), computes median of runs 2..5
async function benchmarkQuery(queryFn, runs = 5) {
  const timeResults = [];
  let finalStats = null;

  for (let i = 0; i < runs; i++) {
    const explainResult = await queryFn();
    const stats = parseStats(explainResult);
    if (i === 0) {
      finalStats = stats; // capture stage, keys, docs, nReturned
    } else {
      timeResults.push(stats.timeMs);
    }
  }

  // Calculate median execution time from the 4 warm runs
  timeResults.sort((a, b) => a - b);
  const mid = Math.floor(timeResults.length / 2);
  const medianMs = timeResults.length % 2 === 0
    ? Math.round((timeResults[mid - 1] + timeResults[mid]) / 2)
    : timeResults[mid];

  return {
    stage: finalStats.stage,
    keysExamined: finalStats.keysExamined,
    docsExamined: finalStats.docsExamined,
    nReturned: finalStats.nReturned,
    medianMs
  };
}

async function runBenchmark() {
  await connectBenchDB('kyc-benchmark');
  const collection = mongoose.connection.collection('sessions');

  const count = await collection.countDocuments();
  console.log(`\n========================================================================================`);
  console.log(` DATABASE QUERY OPTIMIZATION BENCHMARK (Dataset Size: ${count.toLocaleString()} docs)`);
  console.log(` Target Collection: sessions in kyc-benchmark`);
  console.log(`========================================================================================\n`);

  if (count === 0) {
    console.warn('⚠️  Collection is empty! Please run: node scripts/seedBenchmark.js [N] first.');
    await mongoose.disconnect();
    process.exit(1);
  }

  // Ensure necessary indexes exist in benchmark DB
  await collection.createIndex({ createdAt: 1 });
  await collection.createIndex({ status: 1, createdAt: 1 });
  await collection.createIndex({ name: 1 });
  await collection.createIndex({ nameLower: 1 });
  await collection.createIndex({ faceMatchScore: -1 });

  const currentRunResults = [];
  const now = Date.now();
  const sixtyDaysAgo = new Date(now - 60 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

  // --------------------------------------------------------------------------
  // BENCHMARK 1: Status + Date Range Filter + Sort
  // --------------------------------------------------------------------------
  console.log('[Query 1] Status + Date Range + Sort: { status: "VERIFIED", createdAt: [60d, 30d] } sort { createdAt: -1 }');
  const q1Filter = { status: 'VERIFIED', createdAt: { $gte: sixtyDaysAgo, $lte: thirtyDaysAgo } };
  const q1Sort = { createdAt: -1 };

  const q1A = await benchmarkQuery(() => collection.find(q1Filter).sort(q1Sort).hint({ $natural: 1 }).explain('executionStats'));
  const q1B = await benchmarkQuery(() => collection.find(q1Filter).sort(q1Sort).hint({ createdAt: 1 }).explain('executionStats'));
  const q1C = await benchmarkQuery(() => collection.find(q1Filter).sort(q1Sort).hint({ status: 1, createdAt: 1 }).explain('executionStats'));

  // Integrity Check: nReturned must match across scenarios
  if (q1A.nReturned !== q1B.nReturned || q1A.nReturned !== q1C.nReturned) {
    throw new Error(`[BENCHMARK INTEGRITY MISMATCH]: Query 1 returned inconsistent counts: A=${q1A.nReturned}, B=${q1B.nReturned}, C=${q1C.nReturned}`);
  }

  currentRunResults.push({ size: count, query: 'Status + Date Range + Sort', scenario: 'No Index (Natural COLLSCAN)', ...q1A });
  currentRunResults.push({ size: count, query: 'Status + Date Range + Sort', scenario: 'Single-Field Index {createdAt: 1}', ...q1B });
  currentRunResults.push({ size: count, query: 'Status + Date Range + Sort', scenario: 'Compound Index {status: 1, createdAt: 1}', ...q1C });

  // --------------------------------------------------------------------------
  // BENCHMARK 2: Name Search (Regex)
  // --------------------------------------------------------------------------
  console.log('[Query 2] Name Search: Unanchored Regex (.*Aarav.*) vs Prefix Regex (^aarav)');
  const q2A = await benchmarkQuery(() => collection.find({ name: /Aarav/i }).hint({ $natural: 1 }).explain('executionStats'));
  const q2B = await benchmarkQuery(() => collection.find({ nameLower: /^aarav/ }).hint({ nameLower: 1 }).explain('executionStats'));

  if (q2A.nReturned !== q2B.nReturned) {
    throw new Error(`[BENCHMARK INTEGRITY MISMATCH]: Query 2 returned inconsistent counts: Unanchored=${q2A.nReturned}, Prefix=${q2B.nReturned}`);
  }

  currentRunResults.push({ size: count, query: 'Name Search (Regex)', scenario: 'Unanchored (.*Aarav.*) [COLLSCAN]', ...q2A });
  currentRunResults.push({ size: count, query: 'Name Search (Regex)', scenario: 'Prefix (^aarav) with {nameLower: 1}', ...q2B });

  // --------------------------------------------------------------------------
  // BENCHMARK 3A: Sort by faceMatchScore (Top-20 Pagination: limit 20)
  // --------------------------------------------------------------------------
  console.log('[Query 3A] Sort by Score (Top-20 Pagination): { faceMatchScore >= 75 } sort { score: -1 } limit 20');
  const q3Filter = { faceMatchScore: { $gte: 75 } };
  const q3Sort = { faceMatchScore: -1 };

  const q3A_no = await benchmarkQuery(() => collection.find(q3Filter).sort(q3Sort).limit(20).hint({ $natural: 1 }).explain('executionStats'));
  const q3A_ix = await benchmarkQuery(() => collection.find(q3Filter).sort(q3Sort).limit(20).hint({ faceMatchScore: -1 }).explain('executionStats'));

  if (q3A_no.nReturned !== q3A_ix.nReturned) {
    throw new Error(`[BENCHMARK INTEGRITY MISMATCH]: Query 3A returned inconsistent counts: NoIndex=${q3A_no.nReturned}, Indexed=${q3A_ix.nReturned}`);
  }

  currentRunResults.push({ size: count, query: 'Sort by Score (limit 20)', scenario: 'Top-20 No Index (In-Memory Sort)', ...q3A_no });
  currentRunResults.push({ size: count, query: 'Sort by Score (limit 20)', scenario: 'Top-20 WITH Index {faceMatchScore: -1}', ...q3A_ix });

  // --------------------------------------------------------------------------
  // BENCHMARK 3B: Sort by faceMatchScore (Unlimited Full Set)
  // Uses allowDiskUse(true) so the unindexed COLLSCAN can spill to disk if it exceeds 32MB RAM
  // --------------------------------------------------------------------------
  console.log('[Query 3B] Sort by Score (Unlimited Full Scan): { faceMatchScore >= 75 } sort { score: -1 }');
  const q3B_no = await benchmarkQuery(() => collection.find(q3Filter).sort(q3Sort).allowDiskUse(true).hint({ $natural: 1 }).explain('executionStats'));
  const q3B_ix = await benchmarkQuery(() => collection.find(q3Filter).sort(q3Sort).allowDiskUse(true).hint({ faceMatchScore: -1 }).explain('executionStats'));

  if (q3B_no.nReturned !== q3B_ix.nReturned) {
    throw new Error(`[BENCHMARK INTEGRITY MISMATCH]: Query 3B returned inconsistent counts: NoIndex=${q3B_no.nReturned}, Indexed=${q3B_ix.nReturned}`);
  }

  currentRunResults.push({ size: count, query: 'Sort by Score (Unlimited)', scenario: 'Unlimited No Index (In-Memory Sort)', ...q3B_no });
  currentRunResults.push({ size: count, query: 'Sort by Score (Unlimited)', scenario: 'Unlimited WITH Index {faceMatchScore: -1}', ...q3B_ix });

  // --------------------------------------------------------------------------
  // PRINT SUMMARY TABLE
  // --------------------------------------------------------------------------
  console.log('\n====================================================================================================================');
  console.log(
    'Size'.padEnd(10) +
    'Query'.padEnd(30) +
    'Scenario'.padEnd(42) +
    'Stage'.padEnd(10) +
    'Keys Examined'.padEnd(16) +
    'Docs Examined'.padEnd(16) +
    'Returned'.padEnd(12) +
    'Median Ms'
  );
  console.log('--------------------------------------------------------------------------------------------------------------------');

  for (const r of currentRunResults) {
    console.log(
      String(r.size).padEnd(10) +
      r.query.padEnd(30) +
      r.scenario.padEnd(42) +
      r.stage.padEnd(10) +
      String(r.keysExamined).padEnd(16) +
      String(r.docsExamined).padEnd(16) +
      String(r.nReturned).padEnd(12) +
      `${r.medianMs} ms`
    );
  }
  console.log('====================================================================================================================\n');

  // --------------------------------------------------------------------------
  // MERGE & SAVE RESULTS TO JSON & CSV
  // --------------------------------------------------------------------------
  const outDir = path.join(__dirname, '..');
  const jsonPath = path.join(outDir, 'benchmark-results.json');
  const csvPath = path.join(outDir, 'benchmark-results.csv');

  let allResults = [];
  if (fs.existsSync(jsonPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      if (Array.isArray(existing.results)) {
        allResults = existing.results.filter(r => r.size !== count && [10000, 100000, 500000].includes(r.size));
      }
    } catch (e) {
      allResults = [];
    }
  }

  allResults = [...allResults, ...currentRunResults];
  allResults.sort((a, b) => (a.size - b.size) || a.query.localeCompare(b.query));

  fs.writeFileSync(jsonPath, JSON.stringify({
    lastUpdated: new Date().toISOString(),
    results: allResults
  }, null, 2));

  const csvRows = [
    'Size,Query,Scenario,Stage,KeysExamined,DocsExamined,NReturned,MedianMs',
    ...allResults.map(r => `${r.size},"${r.query}","${r.scenario}",${r.stage},${r.keysExamined},${r.docsExamined},${r.nReturned},${r.medianMs}`)
  ];
  fs.writeFileSync(csvPath, csvRows.join('\n'));

  console.log(`✅ Saved benchmark JSON to: ${jsonPath}`);
  console.log(`✅ Saved benchmark CSV to:  ${csvPath}`);

  await mongoose.disconnect();
}

runBenchmark().catch(err => {
  console.error('[Benchmark Error]:', err);
  process.exit(1);
});
