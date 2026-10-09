/**
 * benchmark.js - Benchmarks query performance with explain('executionStats')
 *
 * Compares query execution metrics across:
 *   1. Status + Date Range Filter + Sort by createdAt:
 *      - Scenario A: No Index (Natural COLLSCAN) via .hint({ $natural: 1 })
 *      - Scenario B: Single-Field Index { createdAt: 1 } via .hint({ createdAt: 1 })
 *      - Scenario C: Compound Index { status: 1, createdAt: 1 } via .hint({ status: 1, createdAt: 1 })
 *   2. Name Search:
 *      - Scenario A: Unanchored Regex (.*Aarav.*) via .hint({ $natural: 1 }) [COLLSCAN]
 *      - Scenario B: Case-sensitive Prefix Regex (^aarav) on { nameLower: 1 } [IXSCAN]
 *   3. Sort by faceMatchScore:
 *      - Scenario A: No Index (In-Memory Sort) via .hint({ $natural: 1 }) [COLLSCAN]
 *      - Scenario B: Indexed B-Tree Traversal { faceMatchScore: -1 } [IXSCAN]
 *
 * Outputs:
 *   - Console summary table
 *   - backend/benchmark-results.json (contains `size` column/property)
 *   - backend/benchmark-results.csv  (contains `Size` column)
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
  console.log(`\n========================================================================================`);
  console.log(` DATABASE QUERY OPTIMIZATION BENCHMARK (Dataset Size: ${count.toLocaleString()} docs)`);
  console.log(` Target Collection: sessions in kyc-benchmark`);
  console.log(`========================================================================================\n`);

  if (count === 0) {
    console.warn('⚠️  Collection is empty! Please run: node scripts/seedBenchmark.js [N] first.');
    await mongoose.disconnect();
    process.exit(1);
  }

  // Ensure necessary indexes exist before testing hinted queries
  await collection.createIndex({ createdAt: 1 });
  await collection.createIndex({ status: 1, createdAt: 1 });
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

  // 1A: No index baseline (True natural scan COLLSCAN)
  const q1NoIndex = await collection.find(q1Filter).sort(q1Sort).hint({ $natural: 1 }).explain('executionStats');
  const q1StatsNoIndex = parseStats(q1NoIndex);

  // 1B: Single-field index
  const q1Single = await collection.find(q1Filter).sort(q1Sort).hint({ createdAt: 1 }).explain('executionStats');
  const q1StatsSingle = parseStats(q1Single);

  // 1C: Compound index
  const q1Compound = await collection.find(q1Filter).sort(q1Sort).hint({ status: 1, createdAt: 1 }).explain('executionStats');
  const q1StatsCompound = parseStats(q1Compound);

  currentRunResults.push({
    size: count,
    query: 'Status + Date Range + Sort',
    scenario: 'No Index (Natural COLLSCAN)',
    ...q1StatsNoIndex
  });
  currentRunResults.push({
    size: count,
    query: 'Status + Date Range + Sort',
    scenario: 'Single-Field Index {createdAt: 1}',
    ...q1StatsSingle
  });
  currentRunResults.push({
    size: count,
    query: 'Status + Date Range + Sort',
    scenario: 'Compound Index {status: 1, createdAt: 1}',
    ...q1StatsCompound
  });

  // --------------------------------------------------------------------------
  // BENCHMARK 2: Name Search (Unanchored Regex vs Case-Sensitive Prefix Regex)
  // --------------------------------------------------------------------------
  console.log('[Query 2] Name Search: Unanchored Regex (.*Aarav.*) vs Prefix Regex (^aarav)');

  // 2A: Unanchored regex (Natural scan COLLSCAN baseline)
  const q2Unanchored = await collection.find({ name: /Aarav/i }).hint({ $natural: 1 }).explain('executionStats');
  const q2StatsUnanchored = parseStats(q2Unanchored);

  // 2B: Prefix regex on lowercased field (Index range scan IXSCAN)
  const q2Prefix = await collection.find({ nameLower: /^aarav/ }).hint({ nameLower: 1 }).explain('executionStats');
  const q2StatsPrefix = parseStats(q2Prefix);

  currentRunResults.push({
    size: count,
    query: 'Name Search (Regex)',
    scenario: 'Unanchored (.*Aarav.*) [COLLSCAN]',
    ...q2StatsUnanchored
  });
  currentRunResults.push({
    size: count,
    query: 'Name Search (Regex)',
    scenario: 'Prefix (^aarav) with {nameLower: 1}',
    ...q2StatsPrefix
  });

  // --------------------------------------------------------------------------
  // BENCHMARK 3: Sort by faceMatchScore
  // --------------------------------------------------------------------------
  console.log('[Query 3] Sort by Score: { faceMatchScore: { $gte: 75 } } sort { faceMatchScore: -1 }');
  const q3Filter = { faceMatchScore: { $gte: 75 } };
  const q3Sort = { faceMatchScore: -1 };

  // 3A: Without index (Natural COLLSCAN + In-memory SORT)
  const q3NoIndex = await collection.find(q3Filter).sort(q3Sort).hint({ $natural: 1 }).explain('executionStats');
  const q3StatsNoIndex = parseStats(q3NoIndex);

  // 3B: With index (Index order IXSCAN)
  const q3WithIndex = await collection.find(q3Filter).sort(q3Sort).hint({ faceMatchScore: -1 }).explain('executionStats');
  const q3StatsWithIndex = parseStats(q3WithIndex);

  currentRunResults.push({
    size: count,
    query: 'Sort by faceMatchScore',
    scenario: 'No Index (In-Memory Sort)',
    ...q3StatsNoIndex
  });
  currentRunResults.push({
    size: count,
    query: 'Sort by faceMatchScore',
    scenario: 'WITH Index {faceMatchScore: -1}',
    ...q3StatsWithIndex
  });

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
    'Time (ms)'
  );
  console.log('--------------------------------------------------------------------------------------------------------------------');

  for (const r of currentRunResults) {
    console.log(
      String(r.size).padEnd(10) +
      r.query.padEnd(30) +
      r.scenario.padEnd(42) +
      r.stage.padEnd(10) +
      String(r.totalKeysExamined).padEnd(16) +
      String(r.totalDocsExamined).padEnd(16) +
      `${r.executionTimeMillis} ms`
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
        // Filter out prior run for this specific size to avoid duplication
        allResults = existing.results.filter(r => r.size !== count);
      }
    } catch (e) {
      allResults = [];
    }
  }

  allResults = [...allResults, ...currentRunResults];
  // Sort allResults by size ascending, then query
  allResults.sort((a, b) => (a.size - b.size) || a.query.localeCompare(b.query));

  const jsonContent = JSON.stringify({
    lastUpdated: new Date().toISOString(),
    results: allResults
  }, null, 2);
  fs.writeFileSync(jsonPath, jsonContent);

  const csvRows = [
    'Size,Query,Scenario,Stage,TotalKeysExamined,TotalDocsExamined,NReturned,ExecutionTimeMillis',
    ...allResults.map(r => `${r.size},"${r.query}","${r.scenario}",${r.stage},${r.totalKeysExamined},${r.totalDocsExamined},${r.nReturned},${r.executionTimeMillis}`)
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
