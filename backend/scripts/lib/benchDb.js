require('dotenv').config();
const mongoose = require('mongoose');

const PROD_DB_NAME = process.env.DB_NAME || 'kyc-verification';

/**
 * Connects strictly to an isolated non-production database ('kyc-benchmark' or 'kyc-demo')
 *
 * @param {'kyc-benchmark' | 'kyc-demo'} expectedDbName
 * @returns {Promise<typeof mongoose>}
 */
async function connectBenchDB(expectedDbName = 'kyc-benchmark') {
  if (expectedDbName === PROD_DB_NAME) {
    throw new Error(`[CRITICAL SECURITY]: connectBenchDB refuses to target production database '${PROD_DB_NAME}'!`);
  }

  const baseUri = (expectedDbName === 'kyc-benchmark' && process.env.BENCHMARK_URI)
    ? process.env.BENCHMARK_URI
    : (process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017');

  // Explicit dbName ensures MongoDB driver uses exactly this database
  await mongoose.connect(baseUri, { dbName: expectedDbName });
  const actualDbName = mongoose.connection.name;

  console.log(`[DB Isolation]: Connected to database '${actualDbName}' (Expected: '${expectedDbName}')`);

  // Hard safety assertions before any writes or queries are allowed
  if (actualDbName !== expectedDbName) {
    await mongoose.disconnect();
    throw new Error(`[CRITICAL ASSERTION FAILED]: Expected database '${expectedDbName}' but connected to '${actualDbName}'! Aborting.`);
  }

  if (actualDbName === PROD_DB_NAME) {
    await mongoose.disconnect();
    throw new Error(`[CRITICAL ASSERTION FAILED]: Connected database '${actualDbName}' matches production DB '${PROD_DB_NAME}'! Aborting.`);
  }

  return mongoose;
}

module.exports = {
  connectBenchDB,
  PROD_DB_NAME
};
