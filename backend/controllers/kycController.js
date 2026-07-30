const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Session = require('../models/Session');
const ocrService = require('../services/ocrService');
const faceService = require('../services/faceService');

// Helper to mask Aadhaar number (e.g., "1234 5678 9012" -> "XXXX XXXX 9012")
const maskAadhaar = (num) => {
  if (!num) return '';
  const cleaned = num.replace(/\s/g, '');
  if (cleaned.length < 4) return 'XXXX';
  const lastFour = cleaned.slice(-4);
  return `XXXX XXXX ${lastFour}`;
};

// Helper to delete a file if it exists
const deleteFile = (filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      console.log(`Successfully deleted file: ${filePath}`);
    } catch (err) {
      console.error(`Error deleting file ${filePath}:`, err.message);
    }
  }
};

// Helper to clean up all media files for a session
const cleanupSessionMedia = async (session) => {
  console.log(`Cleaning up media for session: ${session.sessionId}`);
  deleteFile(session.aadhaarImagePath);
  deleteFile(session.aadhaarFacePath);
  deleteFile(session.selfieImagePath);

  // Also delete any potential challenge verification frame
  const challengeFramePath = path.join(__dirname, '..', 'uploads', 'selfies', `challenge_${session.sessionId}.jpg`);
  deleteFile(challengeFramePath);
};

// 1. Upload Aadhaar & Create Session
const uploadAadhaar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Please upload an Aadhaar card image (.png, .jpg, .jpeg)." });
    }

    const originalImagePath = req.file.path;
    const sessionId = crypto.randomUUID();
    
    // Define paths for cropped face
    const extension = path.extname(req.file.originalname);
    const croppedFaceName = `face_${sessionId}${extension}`;
    const croppedFacePath = path.join(__dirname, '..', 'uploads', 'aadhaar', croppedFaceName);

    // Make sure directories exist
    fs.mkdirSync(path.join(__dirname, '..', 'uploads', 'aadhaar'), { recursive: true });
    fs.mkdirSync(path.join(__dirname, '..', 'uploads', 'selfies'), { recursive: true });

    // Step 2: Trigger Google Vision OCR
    let ocrData;
    try {
      ocrData = await ocrService.extractAadhaarData(originalImagePath);
    } catch (ocrErr) {
      deleteFile(originalImagePath);
      return res.status(500).json({ error: `OCR Processing Failed: ${ocrErr.message}` });
    }

    // Step 3: Trigger Face++ Detection & Cropping
    try {
      await faceService.detectAndCropFace(originalImagePath, croppedFacePath);
    } catch (faceErr) {
      deleteFile(originalImagePath);
      return res.status(422).json({ 
        error: `Face Detection Failed: ${faceErr.message}. Ensure the Aadhaar card contains a clear face photo.` 
      });
    }

    // Create session in database
    const session = new Session({
      sessionId,
      name: ocrData.name,
      aadhaarNumber: ocrData.aadhaarNumber,
      aadhaarImagePath: originalImagePath,
      aadhaarFacePath: croppedFacePath,
      status: "PENDING",
      createdAt: new Date()
    });

    await session.save();

    // Construct verification URL
    // Use host header to dynamically point to the server or frontend.
    const protocol = req.secure ? 'https' : 'http';
    const host = req.get('host');
    const verificationLink = `/verify/${sessionId}`;

    return res.status(201).json({
      sessionId,
      verificationLink,
      extractedData: {
        name: session.name,
        aadhaarNumber: maskAadhaar(session.aadhaarNumber)
      }
    });

  } catch (error) {
    console.error("Upload Aadhaar Controller Error:", error);
    return res.status(500).json({ error: `Internal Server Error: ${error.message}` });
  }
};

// 2. Get Session State
const getSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await Session.findOne({ sessionId });

    if (!session) {
      return res.status(404).json({ error: "Verification session not found." });
    }

    // Check expiration (10 minutes)
    if (session.isExpired()) {
      if (session.status !== 'EXPIRED' && session.status !== 'VERIFIED' && session.status !== 'FAILED') {
        session.status = 'EXPIRED';
        await session.save();
        await cleanupSessionMedia(session);
      }
      return res.status(400).json({ 
        error: "Verification Session has expired", 
        status: "EXPIRED" 
      });
    }

    // Respond with masked details
    return res.status(200).json({
      sessionId: session.sessionId,
      name: session.name,
      aadhaarNumber: maskAadhaar(session.aadhaarNumber),
      status: session.status,
      challenge: session.challenge,
      attempts: session.attempts,
      createdAt: session.createdAt
    });

  } catch (error) {
    console.error("Get Session Error:", error);
    return res.status(500).json({ error: `Internal Server Error: ${error.message}` });
  }
};

// 3. Face Verification (Selfie Match)
const verifyFace = async (req, res) => {
  try {
    const { sessionId, selfie } = req.body;

    if (!sessionId || !selfie) {
      return res.status(400).json({ error: "Missing sessionId or selfie image data." });
    }

    const session = await Session.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ error: "Verification session not found." });
    }

    // Check expiration
    if (session.isExpired()) {
      session.status = 'EXPIRED';
      await session.save();
      await cleanupSessionMedia(session);
      return res.status(400).json({ error: "Session has expired.", status: "EXPIRED" });
    }

    if (session.status !== 'PENDING') {
      return res.status(400).json({ error: `Invalid action. Session status is ${session.status}.` });
    }

    // Save base64 selfie image to file system
    // Base64 format usually: "data:image/jpeg;base64,..." or just raw base64
    const base64Data = selfie.replace(/^data:image\/\w+;base64,/, "");
    const selfieBuffer = Buffer.from(base64Data, 'base64');
    
    const selfieName = `selfie_${sessionId}.jpg`;
    const selfieImagePath = path.join(__dirname, '..', 'uploads', 'selfies', selfieName);
    
    fs.writeFileSync(selfieImagePath, selfieBuffer);
    session.selfieImagePath = selfieImagePath;

    // Call Face Comparison
    let confidence;
    try {
      confidence = await faceService.compareFaces(session.aadhaarFacePath, selfieImagePath);
    } catch (faceErr) {
      deleteFile(selfieImagePath);
      return res.status(500).json({ error: `Face verification api error: ${faceErr.message}` });
    }

    session.faceMatchScore = Math.round(confidence);

    if (confidence >= 80) {
      // Choose random challenge
      const challenges = ["SHOW_LEFT_HAND", "SHOW_RIGHT_HAND", "TURN_HEAD_LEFT", "TURN_HEAD_RIGHT"];
      const randomChallenge = challenges[Math.floor(Math.random() * challenges.length)];
      
      session.challenge = randomChallenge;
      session.status = "FACE_VERIFIED";
      await session.save();

      return res.status(200).json({
        message: "Face Verification Passed!",
        status: "FACE_VERIFIED",
        faceMatchScore: session.faceMatchScore,
        challenge: randomChallenge
      });
    } else {
      // Fail Session & Cleanup files instantly
      session.status = "FAILED";
      await session.save();
      await cleanupSessionMedia(session);

      return res.status(200).json({
        message: "Face Verification Failed. Match score below threshold (80%).",
        status: "FAILED",
        faceMatchScore: session.faceMatchScore
      });
    }

  } catch (error) {
    console.error("Verify Face Error:", error);
    return res.status(500).json({ error: `Internal Server Error: ${error.message}` });
  }
};

// 4. Challenge Verification (MediaPipe feedback)
const verifyChallenge = async (req, res) => {
  try {
    const { sessionId, image, success } = req.body;

    if (!sessionId || typeof success === 'undefined') {
      return res.status(400).json({ error: "Missing sessionId or success flag." });
    }

    const session = await Session.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ error: "Verification session not found." });
    }

    // Check expiration
    if (session.isExpired()) {
      session.status = 'EXPIRED';
      await session.save();
      await cleanupSessionMedia(session);
      return res.status(400).json({ error: "Session has expired.", status: "EXPIRED" });
    }

    if (session.status !== 'FACE_VERIFIED') {
      return res.status(400).json({ error: "Must pass Face Verification before verification challenge." });
    }

    // Save proof image if provided (optional frame snapshot for audit)
    if (image) {
      try {
        const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
        const imageBuffer = Buffer.from(base64Data, 'base64');
        const framePath = path.join(__dirname, '..', 'uploads', 'selfies', `challenge_${sessionId}.jpg`);
        fs.writeFileSync(framePath, imageBuffer);
      } catch (e) {
        console.error("Failed to save challenge frame:", e.message);
      }
    }

    // Increment attempts count
    session.attempts += 1;

    if (success) {
      // Challenge passed! Session is now fully VERIFIED
      session.status = "VERIFIED";
      session.completedAt = new Date();
      await session.save();

      // Clean up files now that the verification is completed!
      await cleanupSessionMedia(session);

      return res.status(200).json({
        message: "Verification Successful!",
        status: "VERIFIED",
        attempts: session.attempts
      });
    } else {
      // Challenge failed in this attempt
      if (session.attempts < 2) {
        // Attempt 1 Failure -> Choose a NEW random challenge for retry
        const challenges = ["SHOW_LEFT_HAND", "SHOW_RIGHT_HAND", "TURN_HEAD_LEFT", "TURN_HEAD_RIGHT"];
        // Pick a different challenge if possible
        const remainingChallenges = challenges.filter(c => c !== session.challenge);
        const newChallenge = remainingChallenges[Math.floor(Math.random() * remainingChallenges.length)];
        
        session.challenge = newChallenge;
        // Keep status as FACE_VERIFIED, wait for retry
        await session.save();

        return res.status(200).json({
          message: "Challenge failed. 1 attempt remaining.",
          status: "FACE_VERIFIED",
          attempts: session.attempts,
          retry: true,
          nextChallenge: newChallenge
        });
      } else {
        // Attempt 2 Failure -> Mark session as FAILED & cleanup files
        session.status = "FAILED";
        session.completedAt = new Date();
        await session.save();

        await cleanupSessionMedia(session);

        return res.status(200).json({
          message: "Challenge failed. All attempts used.",
          status: "FAILED",
          attempts: session.attempts,
          retry: false
        });
      }
    }

  } catch (error) {
    console.error("Verify Challenge Error:", error);
    return res.status(500).json({ error: `Internal Server Error: ${error.message}` });
  }
};

// 5. Fetch Session Results
const getResult = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await Session.findOne({ sessionId });

    if (!session) {
      return res.status(404).json({ error: "Verification session not found." });
    }

    return res.status(200).json({
      sessionId: session.sessionId,
      name: session.name,
      aadhaarNumber: maskAadhaar(session.aadhaarNumber),
      status: session.status,
      faceMatchScore: session.faceMatchScore,
      challenge: session.challenge,
      attempts: session.attempts,
      createdAt: session.createdAt,
      completedAt: session.completedAt
    });

  } catch (error) {
    console.error("Get Result Error:", error);
    return res.status(500).json({ error: `Internal Server Error: ${error.message}` });
  }
};

module.exports = {
  uploadAadhaar,
  getSession,
  verifyFace,
  verifyChallenge,
  getResult
};
