/**
 * backup.js - Phase 2 Backup script
 *
 * Exports:
 *   - All NON-seeded sessions to backend/backups/<timestamp>/sessions-real.json
 *   - ALL auditevents to backend/backups/<timestamp>/auditevents.json
 *
 * Uses native MongoDB driver and BSON.EJSON.stringify.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { MongoClient, BSON } = require('mongodb');

async function runBackup() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');

  const client = new MongoClient(uri);
  await client.connect();

  const db = client.db();
  const dbName = db.databaseName;
  console.log(`Connected to database: ${dbName}`);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(__dirname, '..', 'backups', timestamp);
  fs.mkdirSync(backupDir, { recursive: true });

  const sessionsColl = db.collection('sessions');
  const auditColl = db.collection('auditevents');

  // 1. Export non-seeded sessions
  const nonSeededSessions = await sessionsColl.find({ seeded: { $ne: true } }).toArray();
  const sessionsPath = path.join(backupDir, 'sessions-real.json');
  fs.writeFileSync(sessionsPath, BSON.EJSON.stringify(nonSeededSessions, null, 2));

  // 2. Export ALL auditevents
  const allAuditevents = await auditColl.find({}).toArray();
  const auditsPath = path.join(backupDir, 'auditevents.json');
  fs.writeFileSync(auditsPath, BSON.EJSON.stringify(allAuditevents, null, 2));

  console.log('--- PHASE 2 BACKUP COMPLETE ---');
  console.log(`Backup Directory: ${backupDir}`);
  console.log(`Non-seeded Sessions exported: ${nonSeededSessions.length} -> ${sessionsPath}`);
  console.log(`Total Audit Events exported:   ${allAuditevents.length} -> ${auditsPath}`);

  await client.close();
  return {
    backupDir,
    sessionsPath,
    auditsPath,
    nonSeededCount: nonSeededSessions.length,
    auditeventsCount: allAuditevents.length
  };
}

runBackup().catch(err => {
  console.error('Backup failed:', err);
  process.exit(1);
});
