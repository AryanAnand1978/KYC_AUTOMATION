const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const kycController = require('../controllers/kycController');

// Ensure upload directories exist
const uploadDir = path.join(__dirname, '..', 'uploads', 'aadhaar');
fs.mkdirSync(uploadDir, { recursive: true });

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `aadhaar-${uniqueSuffix}${ext}`);
  }
});

// Multer File Type Validation: jpg, jpeg, png only
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    return cb(new Error('Invalid file format. Only JPG, JPEG, and PNG images are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Rate Limiters to secure endpoints
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // limit each IP to 15 Aadhaar uploads per 15 minutes
  message: { error: "Too many upload attempts. Please try again in 15 minutes." }
});

const verificationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // limit each IP to 30 verification steps (face/challenge) per 5 minutes
  message: { error: "Too many attempts from this IP. Please try again in 5 minutes." }
});

// API Routes
router.post('/upload-aadhaar', uploadLimiter, upload.single('aadhaar'), kycController.uploadAadhaar);
router.get('/session/:sessionId', kycController.getSession);
router.post('/verify-face', verificationLimiter, kycController.verifyFace);
router.post('/verify-challenge', verificationLimiter, kycController.verifyChallenge);
router.get('/result/:sessionId', kycController.getResult);

// Handle Multer upload errors gracefully in Express
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  } else if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

module.exports = router;
