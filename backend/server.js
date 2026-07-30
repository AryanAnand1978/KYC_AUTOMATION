require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const connectDB = require('./config/db');
const kycRoutes = require('./routes/kycRoutes');
const Session = require('./models/Session');

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
app.use('/api', kycRoutes);

// Simple Status Route
app.get('/health', (req, res) => {
  res.status(200).json({ status: "OK", message: "KYC backend is running." });
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
    
    // Find sessions that are PENDING or FACE_VERIFIED but created more than 10 minutes ago
    const expiredSessions = await Session.find({
      status: { $in: ["PENDING", "FACE_VERIFIED"] },
      createdAt: { $lt: tenMinutesAgo }
    });

    if (expiredSessions.length > 0) {
      console.log(`[Expiry Job] Found ${expiredSessions.length} expired session(s). Initializing cleanup...`);
      
      for (const session of expiredSessions) {
        session.status = "EXPIRED";
        session.completedAt = new Date();
        await session.save();

        // Delete associated files
        if (session.aadhaarImagePath && fs.existsSync(session.aadhaarImagePath)) {
          fs.unlinkSync(session.aadhaarImagePath);
        }
        if (session.aadhaarFacePath && fs.existsSync(session.aadhaarFacePath)) {
          fs.unlinkSync(session.aadhaarFacePath);
        }
        if (session.selfieImagePath && fs.existsSync(session.selfieImagePath)) {
          fs.unlinkSync(session.selfieImagePath);
        }

        // Delete possible challenge image
        const challengeFramePath = path.join(__dirname, 'uploads', 'selfies', `challenge_${session.sessionId}.jpg`);
        if (fs.existsSync(challengeFramePath)) {
          fs.unlinkSync(challengeFramePath);
        }

        console.log(`[Expiry Job] Cleaned up media and expired session: ${session.sessionId}`);
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
