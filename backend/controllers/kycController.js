const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Session = require('../models/Session');
const ocrService = require('../services/ocrService');
const faceService = require('../services/faceService');
const { logEvent } = require('../services/auditService');

// Helper to mask Aadhaar number (e.g., "1234 5678 9012" -> "XXXX XXXX 9012")
const maskAadhaar = (num) => {
  if (!num) return '';
  const cleaned = num.replace(/\s/g, '');
  if (cleaned.length < 4) return 'XXXX';
  const lastFour = cleaned.slice(-4);
  return `XXXX XXXX ${lastFour}`;
};

// Helper to hash Aadhaar number into a non-reversible, salted digest.
// Stored instead of plaintext so distinct applicants can be counted for
// analytics without the DB ever holding a recoverable Aadhaar number.
const hashAadhaar = (num) => {
  if (!num) return '';
  const cleaned = num.replace(/\D/g, '');
  if (!cleaned) return '';
  const pepper = process.env.AADHAAR_HASH_PEPPER || '';
  return crypto.createHash('sha256').update(`${pepper}:${cleaned}`).digest('hex');
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

  await logEvent(session.sessionId, 'MEDIA_CLEANED', 'Biometric media files removed from disk.');
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

    // Secure the extracted Aadhaar number: store a masked value for display
    // and a salted, non-reversible hash for analytics — never the raw number.
    const aadhaarMasked = maskAadhaar(ocrData.aadhaarNumber);
    const aadhaarHash = hashAadhaar(ocrData.aadhaarNumber);

    // Create session in database
    const session = new Session({
      sessionId,
      name: ocrData.name,
      aadhaarHash,
      aadhaarMasked,
      aadhaarImagePath: originalImagePath,
      aadhaarFacePath: croppedFacePath,
      status: "PENDING",
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || ''
    });

    await session.save();

    // Record the lifecycle so the verification is fully auditable.
    await logEvent(sessionId, 'SESSION_CREATED', 'Verification session created from Aadhaar upload.', {
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || ''
    });
    await logEvent(sessionId, 'OCR_EXTRACTED', 'Identity fields extracted from Aadhaar via OCR.', {
      name: session.name,
      aadhaarMasked
    });
    await logEvent(sessionId, 'FACE_CROPPED', 'Face region detected and cropped from Aadhaar image.');

    // Relative verification link; the frontend resolves it against its own origin.
    const verificationLink = `/verify/${sessionId}`;

    return res.status(201).json({
      sessionId,
      verificationLink,
      extractedData: {
        name: session.name,
        aadhaarNumber: session.aadhaarMasked
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
        session.completedAt = new Date();
        await session.save();
        await logEvent(session.sessionId, 'SESSION_EXPIRED', 'Session expired after the 10-minute limit.');
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
      aadhaarNumber: session.aadhaarMasked,
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
      session.completedAt = new Date();
      await session.save();
      await logEvent(session.sessionId, 'SESSION_EXPIRED', 'Session expired after the 10-minute limit.');
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
    await logEvent(session.sessionId, 'FACE_COMPARED', 'Selfie compared against Aadhaar face.', {
      score: session.faceMatchScore,
      threshold: 80
    });

    if (confidence >= 80) {
      // Choose random challenge
      const challenges = ["SHOW_LEFT_HAND", "SHOW_RIGHT_HAND", "TURN_HEAD_LEFT", "TURN_HEAD_RIGHT"];
      const randomChallenge = challenges[Math.floor(Math.random() * challenges.length)];

      if (req.body.useLegacy) {
        // LEGACY (check-then-save, vulnerable to race conditions)
        session.challenge = randomChallenge;
        session.status = "FACE_VERIFIED";
        await session.save();
      } else {
        // ATOMIC CONDITIONAL UPDATE: only update if status is still PENDING
        const updated = await Session.findOneAndUpdate(
          { sessionId, status: 'PENDING' },
          {
            $set: {
              status: "FACE_VERIFIED",
              challenge: randomChallenge,
              faceMatchScore: session.faceMatchScore,
              selfieImagePath: selfieImagePath
            }
          },
          { new: true }
        );

        if (!updated) {
          deleteFile(selfieImagePath);
          return res.status(409).json({
            error: "Conflict: Session state was modified concurrently or is no longer PENDING."
          });
        }
      }

      await logEvent(session.sessionId, 'FACE_PASSED', 'Face match passed the 80% threshold.', {
        score: session.faceMatchScore
      });
      await logEvent(session.sessionId, 'CHALLENGE_ASSIGNED', `Liveness challenge assigned: ${randomChallenge}.`, {
        challenge: randomChallenge
      });

      return res.status(200).json({
        message: "Face Verification Passed!",
        status: "FACE_VERIFIED",
        faceMatchScore: session.faceMatchScore,
        challenge: randomChallenge
      });
    } else {
      // Fail Session & Cleanup files
      if (req.body.useLegacy) {
        // LEGACY (check-then-save)
        session.status = "FAILED";
        session.completedAt = new Date();
        await session.save();
      } else {
        // ATOMIC CONDITIONAL UPDATE: only update if status is still PENDING
        const updated = await Session.findOneAndUpdate(
          { sessionId, status: 'PENDING' },
          {
            $set: {
              status: "FAILED",
              completedAt: new Date(),
              faceMatchScore: session.faceMatchScore,
              selfieImagePath: selfieImagePath
            }
          },
          { new: true }
        );

        if (!updated) {
          deleteFile(selfieImagePath);
          return res.status(409).json({
            error: "Conflict: Session state was modified concurrently or is no longer PENDING."
          });
        }
      }

      await logEvent(session.sessionId, 'FACE_FAILED', 'Face match fell below the 80% threshold.', {
        score: session.faceMatchScore
      });
      await logEvent(session.sessionId, 'SESSION_FAILED', 'Session failed at face verification.');

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

    // Check expiration atomically
    if (session.isExpired()) {
      const expiredSession = await Session.findOneAndUpdate(
        { sessionId, status: { $in: ['PENDING', 'FACE_VERIFIED'] } },
        { $set: { status: 'EXPIRED', completedAt: new Date() } },
        { new: true }
      );
      if (expiredSession) {
        await logEvent(session.sessionId, 'SESSION_EXPIRED', 'Session expired after the 10-minute limit.');
        await cleanupSessionMedia(session);
      }
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

    const attemptedChallenge = session.challenge;

    // Support legacy check-then-save branch for demonstration/benchmarking
    if (req.body.useLegacy) {
      session.attempts += 1;
      await logEvent(session.sessionId, 'CHALLENGE_ATTEMPTED', `Liveness challenge attempted: ${attemptedChallenge || 'unknown'}.`, {
        challenge: attemptedChallenge,
        attempt: session.attempts,
        success: !!success
      });

      if (success) {
        // Small async pause simulating thread concurrency window
        await new Promise(r => setTimeout(r, 40));
        session.status = "VERIFIED";
        session.completedAt = new Date();
        await session.save();

        await logEvent(session.sessionId, 'CHALLENGE_PASSED', 'Liveness challenge passed.', {
          challenge: attemptedChallenge,
          attempt: session.attempts
        });
        await logEvent(session.sessionId, 'SESSION_VERIFIED', 'Session fully verified.', {
          attempts: session.attempts,
          faceMatchScore: session.faceMatchScore
        });

        await cleanupSessionMedia(session);

        return res.status(200).json({
          message: "Verification Successful!",
          status: "VERIFIED",
          attempts: session.attempts
        });
      } else {
        if (session.attempts < 2) {
          const challenges = ["SHOW_LEFT_HAND", "SHOW_RIGHT_HAND", "TURN_HEAD_LEFT", "TURN_HEAD_RIGHT"];
          const remainingChallenges = challenges.filter(c => c !== session.challenge);
          const newChallenge = remainingChallenges[Math.floor(Math.random() * remainingChallenges.length)];
          session.challenge = newChallenge;
          await session.save();

          return res.status(200).json({
            message: "Challenge failed. 1 attempt remaining.",
            status: "FACE_VERIFIED",
            attempts: session.attempts,
            retry: true,
            nextChallenge: newChallenge
          });
        } else {
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
    }

    // ATOMIC CONDITIONAL UPDATE (Fixed logic)
    if (success) {
      const updated = await Session.findOneAndUpdate(
        { sessionId, status: 'FACE_VERIFIED' },
        {
          $inc: { attempts: 1 },
          $set: {
            status: "VERIFIED",
            completedAt: new Date()
          }
        },
        { new: true }
      );

      if (!updated) {
        return res.status(409).json({
          error: "Conflict: Session state was modified concurrently or is no longer in FACE_VERIFIED state."
        });
      }

      await logEvent(session.sessionId, 'CHALLENGE_ATTEMPTED', `Liveness challenge attempted: ${attemptedChallenge || 'unknown'}.`, {
        challenge: attemptedChallenge,
        attempt: updated.attempts,
        success: true
      });
      await logEvent(session.sessionId, 'CHALLENGE_PASSED', 'Liveness challenge passed.', {
        challenge: attemptedChallenge,
        attempt: updated.attempts
      });
      await logEvent(session.sessionId, 'SESSION_VERIFIED', 'Session fully verified.', {
        attempts: updated.attempts,
        faceMatchScore: updated.faceMatchScore
      });

      await cleanupSessionMedia(updated);

      return res.status(200).json({
        message: "Verification Successful!",
        status: "VERIFIED",
        attempts: updated.attempts
      });
    } else {
      // Challenge failed in this attempt
      const challenges = ["SHOW_LEFT_HAND", "SHOW_RIGHT_HAND", "TURN_HEAD_LEFT", "TURN_HEAD_RIGHT"];
      const remainingChallenges = challenges.filter(c => c !== session.challenge);
      const newChallenge = remainingChallenges[Math.floor(Math.random() * remainingChallenges.length)];

      // Attempt 1 Failure conditional update (attempts: 0 -> 1)
      const attempt1Updated = await Session.findOneAndUpdate(
        { sessionId, status: 'FACE_VERIFIED', attempts: 0 },
        {
          $inc: { attempts: 1 },
          $set: { challenge: newChallenge }
        },
        { new: true }
      );

      if (attempt1Updated) {
        await logEvent(session.sessionId, 'CHALLENGE_ATTEMPTED', `Liveness challenge attempted: ${attemptedChallenge || 'unknown'}.`, {
          challenge: attemptedChallenge,
          attempt: attempt1Updated.attempts,
          success: false
        });
        await logEvent(session.sessionId, 'CHALLENGE_FAILED', 'Liveness challenge failed; one attempt remaining.', {
          challenge: attemptedChallenge,
          attempt: attempt1Updated.attempts
        });
        await logEvent(session.sessionId, 'CHALLENGE_ASSIGNED', `New liveness challenge assigned for retry: ${newChallenge}.`, {
          challenge: newChallenge
        });

        return res.status(200).json({
          message: "Challenge failed. 1 attempt remaining.",
          status: "FACE_VERIFIED",
          attempts: attempt1Updated.attempts,
          retry: true,
          nextChallenge: newChallenge
        });
      }

      // Attempt 2 Failure conditional update (attempts >= 1 -> terminal FAILED)
      const attempt2Updated = await Session.findOneAndUpdate(
        { sessionId, status: 'FACE_VERIFIED', attempts: { $gte: 1 } },
        {
          $inc: { attempts: 1 },
          $set: {
            status: "FAILED",
            completedAt: new Date()
          }
        },
        { new: true }
      );

      if (attempt2Updated) {
        await logEvent(session.sessionId, 'CHALLENGE_ATTEMPTED', `Liveness challenge attempted: ${attemptedChallenge || 'unknown'}.`, {
          challenge: attemptedChallenge,
          attempt: attempt2Updated.attempts,
          success: false
        });
        await logEvent(session.sessionId, 'CHALLENGE_FAILED', 'Liveness challenge failed; no attempts remaining.', {
          challenge: attemptedChallenge,
          attempt: attempt2Updated.attempts
        });
        await logEvent(session.sessionId, 'SESSION_FAILED', 'Session failed after exhausting challenge attempts.', {
          attempts: attempt2Updated.attempts
        });

        await cleanupSessionMedia(attempt2Updated);

        return res.status(200).json({
          message: "Challenge failed. All attempts used.",
          status: "FAILED",
          attempts: attempt2Updated.attempts,
          retry: false
        });
      }

      // Neither matched: session already transitioned or conflict
      return res.status(409).json({
        error: "Conflict: Session state was modified concurrently or is no longer in FACE_VERIFIED state."
      });
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
      aadhaarNumber: session.aadhaarMasked,
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
  getResult,
  cleanupSessionMedia
};
