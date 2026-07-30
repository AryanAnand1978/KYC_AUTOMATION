# Product Requirements Document (PRD)

# Automated Video KYC Verification System

## 1. Purpose

The purpose of this product is to provide an automated KYC verification flow where a user can upload an Aadhaar card, verify their identity through a live selfie, and complete a liveness challenge through the browser camera.

The product is designed as an interview/demo-ready prototype that shows how a real identity verification pipeline can be planned and built using document OCR, face comparison, session management, and live challenge validation.

## 2. Problem Statement

Manual KYC verification is slow, repetitive, and dependent on human review. A basic upload-only system is also not enough because a user may upload someone else's document or use a static photo. The system needs to confirm:

- the document contains readable identity information
- the person in front of the camera matches the document photo
- the person is physically present during verification

This product solves the problem by creating a guided multi-step verification flow with automated checks.

## 3. Product Goals

- Allow users to upload an Aadhaar card image.
- Extract the user's name and Aadhaar number from the uploaded document.
- Mask sensitive Aadhaar data before displaying it.
- Generate a unique verification session link.
- Capture a live webcam selfie.
- Compare the live selfie against the Aadhaar face image.
- Perform a browser-based liveness challenge.
- Show a clear final result: verified, failed, or expired.
- Automatically expire old sessions and clean uploaded media.
- Support mock mode for demos without external API credentials.

## 4. Target Users

### Primary User

An applicant who needs to complete online identity verification.

### Secondary User

An evaluator, interviewer, or reviewer who wants to see how the KYC pipeline works end to end.

### Admin/Operator Future User

In a production version, an admin could review sessions, audit failures, and inspect verification records.

## 5. Scope

### In Scope

- Aadhaar image upload.
- JPG, JPEG, and PNG validation.
- 5MB upload size limit.
- OCR extraction for name and Aadhaar number.
- Aadhaar number masking.
- Face detection and face crop from Aadhaar card.
- Live webcam selfie capture.
- Face comparison with threshold-based decision.
- Random liveness challenge assignment.
- Hand and head-turn challenge support.
- Result page with verification diagnostics.
- Session persistence in MongoDB.
- Session expiry after 10 minutes.
- File cleanup after terminal session status.
- Mock mode support.

### Out of Scope

- Real Aadhaar database validation.
- Government API integration.
- Admin dashboard.
- User authentication.
- Payment or billing flows.
- Manual review workflow.
- Production-grade fraud detection.
- Full audit log export.
- Cloud deployment automation.

## 6. User Journey

### Step 1: Upload Aadhaar

The user lands on the upload page and uploads a clear image of the Aadhaar card. The UI validates file type and size before sending it to the backend.

### Step 2: Document Processing

The backend extracts identity details and crops the face from the uploaded Aadhaar image. A verification session is created.

### Step 3: Verification Link

The user receives a unique verification link. The link contains a session ID and is valid for 10 minutes.

### Step 4: Face Match

The user opens the verification page, grants camera permission, aligns their face, and captures a selfie. The backend compares the selfie with the Aadhaar face.

### Step 5: Liveness Challenge

If face matching passes, the system assigns a random challenge such as showing a hand or turning the head. The browser uses MediaPipe to detect completion.

### Step 6: Final Result

The user is redirected to a result page showing whether verification succeeded, failed, or expired.

## 7. Functional Requirements

### FR1: Aadhaar Upload

The system must allow the user to upload one Aadhaar card image.

Acceptance criteria:

- User can select an image using file picker.
- User can drag and drop an image.
- System rejects unsupported file formats.
- System rejects files larger than 5MB.
- System shows upload and processing feedback.

### FR2: OCR Extraction

The system must extract the applicant name and Aadhaar number from the uploaded image.

Acceptance criteria:

- Backend calls OCR service.
- Extracted name is returned to frontend.
- Aadhaar number is masked before display.
- If OCR fails, the user receives a clear error.

### FR3: Face Detection and Crop

The system must detect a face inside the Aadhaar image and crop it for later comparison.

Acceptance criteria:

- Backend detects face using configured face service.
- Cropped face image is saved for the active session.
- If no face is detected, session creation fails with an error.

### FR4: Session Creation

The system must create a unique verification session.

Acceptance criteria:

- Each session has a unique `sessionId`.
- Initial session status is `PENDING`.
- Session stores extracted data and file paths.
- Frontend receives a verification link.

### FR5: Session Fetch

The verification page must fetch session details before allowing verification.

Acceptance criteria:

- Invalid sessions show an error.
- Expired sessions show an expiry message.
- Existing terminal sessions redirect to result.

### FR6: Face Verification

The system must capture a live selfie and compare it with the Aadhaar face.

Acceptance criteria:

- User can capture a webcam selfie.
- Frontend sends the selfie to backend as base64.
- Backend saves the selfie temporarily.
- Backend compares both faces.
- Score greater than or equal to 80 passes.
- Score below 80 fails the session.

### FR7: Liveness Challenge

The system must assign and verify a random liveness challenge after face match.

Acceptance criteria:

- Challenge is assigned only after face verification passes.
- Supported challenges include left hand, right hand, head left, and head right.
- Browser validates challenge using webcam frames.
- Challenge must be completed within the timer.
- User gets one retry after first failed challenge.
- Session fails after two failed challenge attempts.

### FR8: Result Display

The system must display final verification details.

Acceptance criteria:

- Result page displays status.
- Result page displays applicant name and masked Aadhaar.
- Result page displays face match score.
- Result page displays attempts used.
- Result page gives failure or expiry reason.

### FR9: Session Expiry

The system must expire incomplete sessions after 10 minutes.

Acceptance criteria:

- Expired sessions are marked `EXPIRED`.
- Expired session media is deleted.
- User cannot continue an expired session.

### FR10: Cleanup

The system must delete uploaded biometric/media files after terminal status.

Acceptance criteria:

- Files are deleted after success.
- Files are deleted after failure.
- Files are deleted after expiry.

## 8. Non-Functional Requirements

### Security

- Do not expose API keys to the frontend.
- Mask Aadhaar number in API responses.
- Restrict upload format and size.
- Rate limit sensitive endpoints.
- Delete temporary media files.

### Performance

- Frontend should give immediate loading feedback.
- MediaPipe should run in the browser for real-time response.
- Backend should avoid processing unnecessary requests after expiry.

### Reliability

- System should handle missing API keys through mock mode.
- API errors should return readable messages.
- Cleanup should run even if a user abandons the flow.

### Usability

- User should always know the current verification step.
- Errors should be visible and actionable.
- Final status should be easy to understand.

## 9. Success Metrics

For this prototype, success is measured by:

- Aadhaar upload creates a session successfully.
- Verification link opens the correct session.
- Face verification transitions session from `PENDING` to `FACE_VERIFIED`.
- Liveness challenge transitions session to `VERIFIED`.
- Failed face match or challenge correctly transitions session to `FAILED`.
- Old incomplete sessions become `EXPIRED`.
- Uploaded files are cleaned after terminal status.

## 10. Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| External OCR or face API fails | Mock mode allows local demo and development |
| User denies camera permission | UI shows capture error |
| Uploaded image has no clear face | Backend returns clear face detection error |
| User abandons verification | Session expiry and cleanup job handle stale sessions |
| Aadhaar data exposure | Aadhaar number is masked in frontend responses |
| Spoofing using static photo | Liveness challenge adds physical presence check |

## 11. Future Enhancements

- Admin dashboard for session review.
- Authentication and role-based access.
- Cloud storage for media with lifecycle rules.
- Stronger document authenticity checks.
- Video recording for audit trails.
- Better anti-spoofing with blink/smile/depth checks.
- Deployment with HTTPS and secure CORS.
- Encrypted storage for sensitive fields.
- CI/CD and automated end-to-end tests.

