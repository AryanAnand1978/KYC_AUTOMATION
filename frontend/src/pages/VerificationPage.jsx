import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Webcam from 'react-webcam';
import axios from 'axios';
import { Camera, ShieldAlert, CheckCircle2, RotateCcw, AlertTriangle, ArrowRight, UserCheck, Eye } from 'lucide-react';

const API_BASE_URL = 'http://localhost:5000/api';

const VerificationPage = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  // Session details
  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');

  // UI state flow
  // Steps: 'FACE_VERIFICATION' -> 'CHALLENGE_VERIFICATION'
  const [currentStep, setCurrentStep] = useState('FACE_VERIFICATION');
  
  // Verification progress states
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [faceScore, setFaceScore] = useState(null);
  const [capturedSelfie, setCapturedSelfie] = useState('');

  // MediaPipe tracking states
  const [mediaPipeLoading, setMediaPipeLoading] = useState(false);
  const [challengeStatus, setChallengeStatus] = useState('Position your camera...');
  const [timeLeft, setTimeLeft] = useState(20);
  const [consecutiveSuccessFrames, setConsecutiveSuccessFrames] = useState(0);
  const [webcamKey, setWebcamKey] = useState(0);

  // Webcam reference
  const webcamRef = useRef(null);
  
  // MediaPipe references
  const detectorRef = useRef(null);
  const cameraRef = useRef(null);
  const timerRef = useRef(null);
  const timeLeftRef = useRef(20);

  // Load Session on Mount
  useEffect(() => {
    fetchSession();
    return () => {
      stopCameraAndTracking();
    };
  }, [sessionId]);

  const fetchSession = async () => {
    setSessionLoading(true);
    setSessionError('');
    try {
      const res = await axios.get(`${API_BASE_URL}/session/${sessionId}`);
      setSession(res.data);
      
      // If already verified or failed, redirect immediately
      if (res.data.status === 'VERIFIED' || res.data.status === 'FAILED') {
        navigate(`/result/${sessionId}`);
      } else if (res.data.status === 'FACE_VERIFIED') {
        // Direct resume at challenge if they already passed face-match
        setCurrentStep('CHALLENGE_VERIFICATION');
        initializeChallengeTracking(res.data.challenge);
      }
    } catch (err) {
      console.error(err);
      setSessionError(err.response?.data?.error || 'Invalid or Expired Verification Session');
    } finally {
      setSessionLoading(false);
    }
  };

  const stopCameraAndTracking = () => {
    // Stop MediaPipe camera loop
    if (cameraRef.current) {
      try {
        cameraRef.current.stop();
      } catch (e) {
        console.error('Error stopping MediaPipe camera:', e);
      }
      cameraRef.current = null;
    }
    
    // Clear detectors
    detectorRef.current = null;

    // Clear challenge countdown timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Stop webcam tracks explicitly to shut off camera light
    if (webcamRef.current && webcamRef.current.video) {
      const stream = webcamRef.current.video.srcObject;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    }
  };

  // Phase 1: Capture & Verify Face (Face++)
  const handleFaceVerify = async () => {
    if (!webcamRef.current) return;
    
    const screenshot = webcamRef.current.getScreenshot();
    if (!screenshot) {
      setActionError('Failed to capture webcam frame. Ensure camera permission is granted.');
      return;
    }

    setCapturedSelfie(screenshot);
    setActionLoading(true);
    setActionError('');

    try {
      const response = await axios.post(`${API_BASE_URL}/verify-face`, {
        sessionId,
        selfie: screenshot
      });

      const data = response.data;
      if (data.status === 'FACE_VERIFIED') {
        setFaceScore(data.faceMatchScore);
        setSession(prev => ({ ...prev, status: 'FACE_VERIFIED', challenge: data.challenge }));
        
        // Move to challenge page
        setTimeout(() => {
          setCurrentStep('CHALLENGE_VERIFICATION');
          initializeChallengeTracking(data.challenge);
        }, 1500);
      } else {
        // Face comparison failed (score < 80)
        setFaceScore(data.faceMatchScore);
        stopCameraAndTracking();
        setTimeout(() => {
          navigate(`/result/${sessionId}`);
        }, 2000);
      }
    } catch (err) {
      console.error(err);
      setActionError(err.response?.data?.error || 'Face comparison service failed.');
      setActionLoading(false);
    }
  };

  // Phase 2: MediaPipe Challenge Initialization
  const initializeChallengeTracking = (challenge) => {
    stopCameraAndTracking();
    setWebcamKey(prev => prev + 1);
    setActionLoading(false); // Clear API loading spinner/blur overlay
    setChallengeStatus('Loading models...');
    setMediaPipeLoading(true);
    timeLeftRef.current = 20;
    setTimeLeft(20);
    setConsecutiveSuccessFrames(0);

    // Initialize Countdown Timer
    timerRef.current = setInterval(() => {
      timeLeftRef.current -= 1;
      setTimeLeft(timeLeftRef.current);
      if (timeLeftRef.current <= 0) {
        clearInterval(timerRef.current);
        timerRef.current = null;
        handleChallengeTimeout();
      }
    }, 1000);

    // Dynamic loading of MediaPipe models depending on challenge
    try {
      if (challenge.includes('HAND')) {
        // Load Hands Model
        if (!window.Hands) {
          throw new Error('MediaPipe Hands library is not loaded. Refreshing...');
        }

        const hands = new window.Hands({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.55,
          minTrackingConfidence: 0.55
        });

        hands.onResults((results) => {
          setMediaPipeLoading(false);
          evaluateHandResults(results, challenge);
        });

        detectorRef.current = hands;
      } else {
        // Load Face Mesh Model
        if (!window.FaceMesh) {
          throw new Error('MediaPipe FaceMesh library is not loaded. Refreshing...');
        }

        const faceMesh = new window.FaceMesh({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });

        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: false,
          minDetectionConfidence: 0.55,
          minTrackingConfidence: 0.55
        });

        faceMesh.onResults((results) => {
          setMediaPipeLoading(false);
          evaluateFaceResults(results, challenge);
        });

        detectorRef.current = faceMesh;
      }

      // Initialize Camera Loop
      startMediaPipeCamera();

    } catch (e) {
      console.error(e);
      setChallengeStatus('Failed to load tracking models.');
      setMediaPipeLoading(false);
    }
  };

  const startMediaPipeCamera = () => {
    if (!webcamRef.current || !webcamRef.current.video) {
      // Retry in 200ms
      setTimeout(startMediaPipeCamera, 200);
      return;
    }

    const videoElement = webcamRef.current.video;
    const stream = videoElement.srcObject;
    const hasActiveTracks = stream && 
                            typeof stream.getTracks === 'function' && 
                            stream.getTracks().some(track => track.readyState === 'live');

    if (!hasActiveTracks) {
      // Retry in 200ms if stream is not loaded or has been stopped
      setTimeout(startMediaPipeCamera, 200);
      return;
    }

    const camera = new window.Camera(videoElement, {
      onFrame: async () => {
        if (detectorRef.current && videoElement.readyState === 4) {
          await detectorRef.current.send({ image: videoElement });
        }
      },
      width: 640,
      height: 480
    });

    cameraRef.current = camera;
    camera.start();
    setChallengeStatus('Show gesture to camera...');
  };

  // Evaluate Hand Challenge
  const evaluateHandResults = (results, challenge) => {
    // Check if hands detected
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      setChallengeStatus('No hand detected in camera frame.');
      setConsecutiveSuccessFrames(0);
      return;
    }

    // MediaPipe Hands multiHandedness contains classification labels: "Left" or "Right"
    // Since camera feeds are usually mirrored horizontally, we should inspect both actual classification
    // and layout coordinates.
    const handedness = results.multiHandedness[0].label; // "Left" or "Right"
    const wrist = results.multiHandLandmarks[0][0]; // Wrist landmark

    // In a standard (unmirrored) camera stream:
    // - User's Left Hand is classified by MediaPipe as "Right" and appears on the right side of the screen (wrist.x > 0.45)
    // - User's Right Hand is classified by MediaPipe as "Left" and appears on the left side of the screen (wrist.x < 0.55)
    const isLeftHand = handedness === 'Right' && wrist.x > 0.45;
    const isRightHand = handedness === 'Left' && wrist.x < 0.55;

    let matched = false;
    if (challenge === 'SHOW_LEFT_HAND' && isLeftHand) {
      setChallengeStatus('Left hand detected. Hold position...');
      matched = true;
    } else if (challenge === 'SHOW_RIGHT_HAND' && isRightHand) {
      setChallengeStatus('Right hand detected. Hold position...');
      matched = true;
    } else {
      const expectedHand = challenge === 'SHOW_LEFT_HAND' ? 'Left' : 'Right';
      setChallengeStatus(`Show your ${expectedHand.toUpperCase()} Hand...`);
    }

    if (matched) {
      setConsecutiveSuccessFrames(prev => {
        const next = prev + 1;
        if (next >= 6) {
          // Passed 6 consecutive frames (~0.5s of stable gesture) -> Trigger success
          handleChallengeSuccess();
        }
        return next;
      });
    } else {
      setConsecutiveSuccessFrames(0);
    }
  };

  // Evaluate Head Rotation Challenge
  const evaluateFaceResults = (results, challenge) => {
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      setChallengeStatus('No face detected.');
      setConsecutiveSuccessFrames(0);
      return;
    }

    const landmarks = results.multiFaceLandmarks[0];
    
    // Key landmarks indices:
    // Nose tip: 4
    // Left cheek boundary: 234
    // Right cheek boundary: 454
    const nose = landmarks[4];
    const leftCheek = landmarks[234];
    const rightCheek = landmarks[454];

    if (!nose || !leftCheek || !rightCheek) return;

    // Calculate relative horizontal distance ratio
    // nose.x is normalized 0-1
    const dxLeft = Math.abs(nose.x - leftCheek.x);
    const dxRight = Math.abs(rightCheek.x - nose.x);
    const ratio = dxLeft / dxRight;

    // In a standard (unmirrored) camera stream:
    // - Turning head Left moves nose closer to right cheek (landmark 454), increasing dxLeft/dxRight ratio (ratio > 1.8)
    // - Turning head Right moves nose closer to left cheek (landmark 234), decreasing dxLeft/dxRight ratio (ratio < 0.55)
    const isTurnedLeft = ratio > 1.8;
    const isTurnedRight = ratio < 0.55;

    let matched = false;
    if (challenge === 'TURN_HEAD_LEFT' && isTurnedLeft) {
      setChallengeStatus('Head turned Left detected. Hold position...');
      matched = true;
    } else if (challenge === 'TURN_HEAD_RIGHT' && isTurnedRight) {
      setChallengeStatus('Head turned Right detected. Hold position...');
      matched = true;
    } else {
      const expectedDir = challenge === 'TURN_HEAD_LEFT' ? 'Left' : 'Right';
      setChallengeStatus(`Turn your head ${expectedDir.toUpperCase()}...`);
    }

    if (matched) {
      setConsecutiveSuccessFrames(prev => {
        const next = prev + 1;
        if (next >= 6) handleChallengeSuccess();
        return next;
      });
    } else {
      setConsecutiveSuccessFrames(0);
    }
  };

  // Handle Challenge Success
  const handleChallengeSuccess = async () => {
    stopCameraAndTracking();
    setActionLoading(true);
    setChallengeStatus('Verification successful! Submitting...');

    // Take screenshot as proof
    const screenshot = webcamRef.current?.getScreenshot() || '';

    try {
      const res = await axios.post(`${API_BASE_URL}/verify-challenge`, {
        sessionId,
        image: screenshot,
        success: true
      });
      
      if (res.data.status === 'VERIFIED') {
        navigate(`/result/${sessionId}`);
      }
    } catch (err) {
      console.error(err);
      setActionError('Failed to record challenge success.');
      setActionLoading(false);
    }
  };

  // Handle Challenge Timeout (Failed Attempt)
  const handleChallengeTimeout = async () => {
    stopCameraAndTracking();
    setActionLoading(true);
    setChallengeStatus('Timeout reached.');

    try {
      const res = await axios.post(`${API_BASE_URL}/verify-challenge`, {
        sessionId,
        success: false
      });

      const data = res.data;
      if (data.retry) {
        // Attempt 1 failed. Set new challenge, prompt retry button
        setSession(prev => ({
          ...prev,
          attempts: data.attempts,
          challenge: data.nextChallenge
        }));
        setActionLoading(false);
        setActionError(`Challenge failed! Attempt 1 failed. Please prepare for next challenge: ${data.nextChallenge}`);
      } else {
        // Attempt 2 failed. Entire KYC fails.
        navigate(`/result/${sessionId}`);
      }
    } catch (err) {
      console.error(err);
      setActionError('Failed to record challenge timeout.');
      setActionLoading(false);
    }
  };

  // Trigger Retry Challenge
  const handleRetryChallenge = () => {
    setActionError('');
    initializeChallengeTracking(session.challenge);
  };

  if (sessionLoading) {
    return (
      <div className="text-center py-12 animate-pulse-glow">
        <svg className="animate-spin h-10 w-10 text-brand-cyan mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span className="text-slate-300 font-semibold">Configuring secure KYC node tunnel...</span>
      </div>
    );
  }

  if (sessionError) {
    return (
      <div className="w-full max-w-md mx-auto text-center glass-card p-8 border-rose-500/20 animate-fade-in">
        <div className="p-4 bg-rose-500/10 text-rose-400 rounded-full w-fit mx-auto mb-4">
          <ShieldAlert className="w-12 h-12" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
        <p className="text-slate-400 text-sm mb-6">{sessionError}</p>
        <a href="/" className="btn-secondary w-full block">
          Return to Portal
        </a>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-6 items-start animate-fade-in">
      
      {/* LEFT COLUMN: Instructions and Status Card */}
      <div className="lg:col-span-2 space-y-6">
        <div className="glass-card p-6">
          <span className="badge-pending mb-4 inline-block">Active Verification Node</span>
          
          <h2 className="text-2xl font-extrabold text-white mb-2 tracking-tight">
            Biometric Check
          </h2>
          
          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            Ensure you are in a well-lit room, remove glasses/hats, and face the webcam directly. Follow standard instructions carefully.
          </p>

          <div className="space-y-4 border-t border-brand-darkBorder/40 pt-4 text-xs text-slate-300">
            <div className="flex justify-between">
              <span className="text-slate-500">Applicant:</span>
              <span className="font-bold text-white tracking-wide">{session?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Aadhaar Map:</span>
              <span className="font-bold text-white tracking-widest">{session?.aadhaarNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Session Status:</span>
              <span className="text-brand-cyan font-semibold uppercase">{session?.status}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Attempts Count:</span>
              <span className="text-slate-200 font-bold">{session?.attempts} / 2</span>
            </div>
          </div>
        </div>

        {/* Dynamic Instruction Card */}
        {currentStep === 'FACE_VERIFICATION' ? (
          <div className="glass-card p-6 border-brand-blue/30 bg-brand-blue/5">
            <div className="flex items-center gap-3 mb-3 text-brand-blue">
              <UserCheck className="w-5 h-5" />
              <h3 className="font-bold text-white">Biometric Face Matching</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Align your face inside the overlay guide on the camera screen and click <strong className="text-white">"Capture & Verify"</strong>. The system will compare your selfie with the Aadhaar record (Requires confidence &ge; 80%).
            </p>
          </div>
        ) : (
          <div className="glass-card p-6 border-brand-glow/30 bg-brand-glow/5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-brand-glow">
                <Eye className="w-5 h-5 animate-pulse" />
                <h3 className="font-bold text-white">Liveness Challenge</h3>
              </div>
              <span className="px-2.5 py-1 bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-full font-mono text-xs font-bold">
                {timeLeft}s
              </span>
            </div>

            <div className="p-3 bg-[#080b12] border border-brand-darkBorder rounded-xl text-center">
              <span className="text-[10px] text-slate-500 uppercase block font-semibold mb-1">Assigned Challenge</span>
              <span className="text-base font-extrabold text-white tracking-wide uppercase">
                {session?.challenge === 'SHOW_LEFT_HAND' && 'Show LEFT HAND'}
                {session?.challenge === 'SHOW_RIGHT_HAND' && 'Show RIGHT HAND'}
                {session?.challenge === 'TURN_HEAD_LEFT' && 'Turn Head LEFT'}
                {session?.challenge === 'TURN_HEAD_RIGHT' && 'Turn Head RIGHT'}
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Hold the gesture in front of your camera. Real-time MediaPipe AI models are analyzing coordinates. Timer resets on retry.
            </p>
          </div>
        )}
      </div>

      {/* RIGHT COLUMN: Webcam Stream and Interactive Capture Screen */}
      <div className="lg:col-span-3">
        <div className="glass-card overflow-hidden relative">
          
          {/* Header overlay for camera info */}
          <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-4 z-10 flex justify-between items-center">
            <span className="flex items-center gap-2 text-xs font-semibold text-slate-200">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
              Live Feed
            </span>
            {currentStep === 'CHALLENGE_VERIFICATION' && (
              <span className="text-xs font-mono text-brand-glow bg-brand-darkBg/60 px-3 py-1 rounded-md border border-brand-darkBorder">
                {challengeStatus}
              </span>
            )}
          </div>

          {/* Web Cam frame with guidelines */}
          <div className="relative aspect-video bg-black flex items-center justify-center">
            
            {/* Show Webcam if camera isn't halted */}
            {!capturedSelfie || currentStep === 'CHALLENGE_VERIFICATION' ? (
              <Webcam
                key={webcamKey}
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                videoConstraints={{ width: 1280, height: 720, facingMode: 'user' }}
                className="w-full h-full object-cover scale-x-[-1]" // mirror webcam
              />
            ) : (
              <img 
                src={capturedSelfie} 
                alt="Captured Face Match selfie" 
                className="w-full h-full object-cover scale-x-[-1]" 
              />
            )}

            {/* Silhouette Overlay for Face Match alignment */}
            {currentStep === 'FACE_VERIFICATION' && !capturedSelfie && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-[180px] h-[240px] md:w-[220px] md:h-[290px] border-2 border-brand-cyan/40 border-dashed rounded-[100px] bg-brand-cyan/5 shadow-2xl flex items-center justify-center">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-brand-cyan/60 text-center px-4">
                    Align Profile Here
                  </span>
                </div>
              </div>
            )}

            {/* Overlay feedback screens */}
            {actionLoading && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-20">
                <svg className="animate-spin h-8 w-8 text-brand-cyan mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-sm font-semibold text-white">{challengeStatus || 'Comparing biometrics...'}</p>
              </div>
            )}

            {mediaPipeLoading && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-20">
                <svg className="animate-spin h-8 w-8 text-brand-glow mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-sm font-semibold text-white">Initializing MediaPipe tracker node...</p>
              </div>
            )}
          </div>

          {/* Action footer */}
          <div className="p-4 bg-brand-darkCard border-t border-brand-darkBorder/50 flex flex-col gap-4">
            {actionError && (
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl flex items-start gap-2.5 text-xs">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Match Failed: </span>
                  {actionError}
                </div>
              </div>
            )}

            <div className="flex justify-between items-center gap-4">
              {currentStep === 'FACE_VERIFICATION' ? (
                <>
                  {faceScore !== null && faceScore < 80 ? (
                    <div className="text-rose-400 text-xs font-semibold uppercase flex items-center gap-1.5 animate-pulse">
                      <ShieldAlert className="w-4 h-4" />
                      Face match failed ({faceScore}% confidence)
                    </div>
                  ) : faceScore !== null && faceScore >= 80 ? (
                    <div className="text-emerald-400 text-xs font-semibold uppercase flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      Face matched ({faceScore}% confidence)
                    </div>
                  ) : (
                    <div className="text-slate-400 text-xs">
                      Webcam aligned
                    </div>
                  )}

                  {!capturedSelfie ? (
                    <button
                      onClick={handleFaceVerify}
                      disabled={actionLoading}
                      className="btn-primary flex items-center gap-2"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Capture & Verify</span>
                    </button>
                  ) : (
                    <button
                      disabled
                      className="btn-primary opacity-60 flex items-center gap-2 cursor-wait"
                    >
                      <span>Processing biometric...</span>
                    </button>
                  )}
                </>
              ) : (
                /* Challenge Action display */
                <>
                  <div className="text-xs text-slate-400">
                    Challenge remaining: {timeLeft}s
                  </div>
                  {actionError && (
                    <button
                      onClick={handleRetryChallenge}
                      className="btn-primary bg-gradient-to-r from-amber-500 to-orange-500 shadow-amber-500/20 flex items-center gap-2"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Retry Next Challenge</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

        </div>
      </div>

    </div>
  );
};

export default VerificationPage;
