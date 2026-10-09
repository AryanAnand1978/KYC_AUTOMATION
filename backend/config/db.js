const mongoose = require('mongoose');

/**
 * DBMS ACID Requirement Notice:
 * Multi-document transactions in MongoDB require a Replica Set topology.
 * In production/cloud environments (e.g. MongoDB Atlas), replica sets are enabled by default.
 * In a local standalone mongod environment, start with replica set support:
 *   mongod --dbpath <path> --replSet rs0
 * and initialize once via mongo shell / mongosh:
 *   rs.initiate()
 */

// Helper to inspect whether the active MongoDB connection belongs to a replica set
async function isReplicaSet() {
  try {
    if (!mongoose.connection || !mongoose.connection.db) return false;
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    return Boolean(hello.setName);
  } catch (err) {
    return false;
  }
}

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/kyc-verification');
    console.log(`MongoDB Connected: ${conn.connection.host}`);

    const replicaSetAvailable = await isReplicaSet();
    if (!replicaSetAvailable) {
      console.warn(
        '⚠️  [MongoDB Warning]: Connected instance is a standalone node, NOT a Replica Set.\n' +
        '    Multi-document transactions (ACID) require a replica set (Atlas or local mongod --replSet rs0).\n' +
        '    Application will fall back to safe non-transactional writes when transactions cannot be started.'
      );
    } else {
      console.log('✅ [MongoDB]: Replica Set detected. Multi-document ACID transactions enabled.');
    }
  } catch (error) {
    console.error(`Database Connection Error: ${error.message}`);
    process.exit(1);
  }
};

connectDB.isReplicaSet = isReplicaSet;
module.exports = connectDB;
