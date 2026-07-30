const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/kyc-verification');
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Database Connection Error: ${error.message}`);
    // Do not crash the server in case they are running in pure local demo mode without mongodb started yet,
    // but log a warning.
    process.exit(1);
  }
};

module.exports = connectDB;
