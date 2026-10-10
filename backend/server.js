require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const connectDB = require('./config/db');
const kycRoutes = require('./routes/kycRoutes');
const adminRoutes = require('./routes/adminRoutes');
const Session = require('./models/Session');
const { cleanupSessionMedia } = require('./controllers/kycController');
const { logEvent } = require('./services/auditService');

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

// Middlewares
app.use(cors({
  origin: '*', // For development, allow all. In production, narrow to frontend origin (e.g. http://localhost:5173)
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' })); // Support larger base64 payloads for selfies
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve Uploads as static folder
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
// Mount the more specific admin prefix first, then the public KYC routes.
app.use('/api/admin', adminRoutes);
app.use('/api', kycRoutes);

// Simple Status Route
app.get('/health', (req, res) => {
  res.status(200).json({ status: "OK", message: "KYC backend is running." });
});

app.get('/', (req, res) => {
  res.send("KYC Automation Backend is running!");
});

// Create uploads folder structure synchronously
const createUploadDirs = () => {
  const dirs = [
    path.join(__dirname, 'uploads'),
    path.join(__dirname, 'uploads', 'aadhaar'),
    path.join(__dirname, 'uploads', 'selfies')
  ];
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};
createUploadDirs();

// Periodic Cron Job: Runs every 2 minutes to expire old PENDING/FACE_VERIFIED sessions (>10 mins) and cleanup files
setInterval(async () => {
  try {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    
    // Find sessions that are PENDING or FACE_VERIFIED but created more than 10 minutes ago (capped per tick)
    const expiredSessions = await Session.find({
      status: { $in: ["PENDING", "FACE_VERIFIED"] },
      createdAt: { $lt: tenMinutesAgo }
    }).limit(50);

    if (expiredSessions.length > 0) {
      console.log(`[Expiry Job] Found ${expiredSessions.length} expired session(s). Initializing cleanup...`);
      
      for (const session of expiredSessions) {
        // Atomic conditional transition: only expire if status is still PENDING or FACE_VERIFIED
        const updated = await Session.findOneAndUpdate(
          { _id: session._id, status: { $in: ["PENDING", "FACE_VERIFIED"] } },
          { $set: { status: "EXPIRED", completedAt: new Date() } },
          { new: true }
        );

        if (!updated) {
          // Concurrently verified or failed by an active request
          continue;
        }

        await logEvent(session.sessionId, 'SESSION_EXPIRED', 'Session expired by the background cleanup job.');

        // Reuse the shared media-cleanup helper (also records MEDIA_CLEANED).
        await cleanupSessionMedia(updated);

        console.log(`[Expiry Job] Cleaned up media and expired session: ${session.sessionId}`);
      }
    }

    // SWEEPER: Find terminal sessions (VERIFIED, FAILED, EXPIRED) with uncleared media paths or orphaned files (capped per tick)
    const terminalSessionsWithFiles = await Session.find({
      status: { $in: ["VERIFIED", "FAILED", "EXPIRED"] },
      $or: [
        { aadhaarImagePath: { $gt: "" } },
        { aadhaarFacePath: { $gt: "" } },
        { selfieImagePath: { $gt: "" } }
      ]
    }).limit(50);

    if (terminalSessionsWithFiles.length > 0) {
      console.log(`[Media Sweeper] Found ${terminalSessionsWithFiles.length} terminal session(s) with uncleared media paths. Cleaning...`);
      for (const session of terminalSessionsWithFiles) {
        await cleanupSessionMedia(session);
      }
    }
  } catch (err) {
    console.error('[Expiry Job Error]:', err.message);
  }
}, 2 * 60 * 1000); // 2 minutes interval

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error("Express Error Handler:", err.stack);
  res.status(500).json({ error: err.message || "Internal Server Error" });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
