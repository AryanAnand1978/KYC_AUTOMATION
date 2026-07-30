# Technical Requirements Document (TRD)

# Automated Video KYC Verification System

## 1. Technical Overview

The system is a full-stack KYC verification prototype with a React frontend and an Express/MongoDB backend. The frontend manages user interaction, webcam capture, and browser-side liveness detection. The backend manages file uploads, OCR, face detection, face comparison, session state, expiry, and cleanup.

High-level architecture:

```text
React + Vite Frontend
        |
        | HTTP / Axios
        v
Express Backend API
        |
        | Mongoose
        v
MongoDB
        |
        | External APIs
        v
Gemini / Google Vision OCR + Face++
```

## 2. Technology Stack

### Frontend

- React
- Vite
- React Router
- Axios
- Tailwind CSS
- Lucide React
- React Webcam
- MediaPipe Hands
- MediaPipe Face Mesh

### Backend

- Node.js
- Express
- MongoDB
- Mongoose
- Multer
- Axios
- Jimp
- FormData
- Express Rate Limit
- dotenv
- CORS

## 3. Runtime Requirements

### Frontend Runtime

- Node.js environment capable of running Vite.
- Browser with camera access.
- Browser support for webcam APIs.
- Network access to MediaPipe CDN scripts during normal liveness mode.

### Backend Runtime

- Node.js environment.
- MongoDB running locally or reachable through `MONGODB_URI`.
- Environment variables for real OCR/face services, or mock mode enabled.

### Environment Variables

Expected backend environment variables:

```text
PORT
MONGODB_URI
MOCK_MODE
GEMINI_API_KEY
GOOGLE_VISION_API_KEY
FACEPLUSPLUS_API_KEY
FACEPLUSPLUS_API_SECRET
```

## 4. System Components

### Frontend Components

#### `frontend/src/App.jsx`

Responsibilities:

- Defines application layout.
- Configures React Router.
- Maps pages to routes.
- Renders common header and footer.

Routes:

```text
/                    -> UploadPage
/verify/:sessionId   -> VerificationPage
/result/:sessionId   -> ResultPage
```

#### `frontend/src/pages/UploadPage.jsx`

Responsibilities:

- File selection and drag-and-drop.
- Frontend file validation.
- Multipart upload to backend.
- Display extracted Aadhaar details.
- Generate full verification URL.
- Copy link to clipboard.

Backend endpoint used:

```text
POST /api/upload-aadhaar
```

#### `frontend/src/pages/VerificationPage.jsx`

Responsibilities:

- Read `sessionId` from route params.
- Fetch session from backend.
- Capture webcam selfie.
- Submit selfie for face comparison.
- Initialize MediaPipe challenge.
- Evaluate hand/head movement.
- Submit challenge result.
- Redirect to result page.

Backend endpoints used:

```text
GET  /api/session/:sessionId
POST /api/verify-face
POST /api/verify-challenge
```

#### `frontend/src/pages/ResultPage.jsx`

Responsibilities:

- Fetch final session result.
- Display verification status.
- Display applicant data and diagnostics.
- Explain success, failure, or expiry.

Backend endpoint used:

```text
GET /api/result/:sessionId
```

#### `frontend/index.html`

Responsibilities:

- Loads React root.
- Loads fonts.
- Loads MediaPipe scripts from CDN:

```text
@mediapipe/camera_utils
@mediapipe/hands
@mediapipe/face_mesh
```

### Backend Components

#### `backend/server.js`

Responsibilities:

- Load environment variables.
- Connect to MongoDB.
- Configure Express.
- Enable CORS.
- Configure JSON body limits.
- Serve upload directory statically.
- Mount KYC routes under `/api`.
- Expose `/health`.
- Create upload directories.
- Start cleanup interval for expired sessions.
- Start HTTP server.

#### `backend/config/db.js`

Responsibilities:

- Connect to MongoDB with Mongoose.
- Use `MONGODB_URI` if available.
- Use local database fallback:

```text
mongodb://127.0.0.1:27017/kyc-verification
```

#### `backend/models/Session.js`

Responsibilities:

- Define KYC session schema.
- Enforce allowed status values.
- Store verification metadata.
- Provide `isExpired()` helper.

#### `backend/routes/kycRoutes.js`

Responsibilities:

- Define REST API endpoints.
- Configure Multer upload storage.
- Validate upload file type.
- Limit upload size.
- Apply rate limits.
- Forward requests to controller.
- Handle Multer errors.

#### `backend/controllers/kycController.js`

Responsibilities:

- Implement KYC business logic.
- Create sessions.
- Fetch sessions.
- Verify face match.
- Verify liveness challenge.
- Fetch result.
- Mask Aadhaar number.
- Cleanup media files.

#### `backend/services/ocrService.js`

Responsibilities:

- Extract name and Aadhaar number.
- Use Gemini API when configured.
- Use Google Vision OCR fallback when configured.
- Use mock response when mock mode is active.

#### `backend/services/faceService.js`

Responsibilities:

- Detect face in Aadhaar image.
- Crop Aadhaar face using Jimp.
- Compare Aadhaar face and selfie using Face++.
- Provide mock detection/comparison behavior.

## 5. API Requirements

### `POST /api/upload-aadhaar`

Purpose:

Create a KYC session from an uploaded Aadhaar image.

Request:

```text
Content-Type: multipart/form-data
Field: aadhaar
```

Success response:

```json
{
  "sessionId": "uuid",
  "verificationLink": "/verify/session-id",
  "extractedData": {
    "name": "USER NAME",
    "aadhaarNumber": "XXXX XXXX 1234"
  }
}
```

Failure cases:

- missing file
- invalid file type
- file too large
- OCR failure
- face detection failure
- server/database error

### `GET /api/session/:sessionId`

Purpose:

Fetch active session details for the verification screen.

Success response:

```json
{
  "sessionId": "uuid",
  "name": "USER NAME",
  "aadhaarNumber": "XXXX XXXX 1234",
  "status": "PENDING",
  "challenge": "",
  "attempts": 0,
  "createdAt": "date"
}
```

Failure cases:

- session not found
- session expired
- server/database error

### `POST /api/verify-face`

Purpose:

Compare the live selfie against the Aadhaar face.

Request:

```json
{
  "sessionId": "uuid",
  "selfie": "data:image/jpeg;base64,..."
}
```

Success response for pass:

```json
{
  "message": "Face Verification Passed!",
  "status": "FACE_VERIFIED",
  "faceMatchScore": 93,
  "challenge": "SHOW_LEFT_HAND"
}
```

Success response for face failure:

```json
{
  "message": "Face Verification Failed. Match score below threshold (80%).",
  "status": "FAILED",
  "faceMatchScore": 45
}
```

Failure cases:

- missing session ID
- missing selfie
- invalid session
- expired session
- invalid session status
- face comparison API error

### `POST /api/verify-challenge`

Purpose:

Submit liveness challenge result.

Request for success:

```json
{
  "sessionId": "uuid",
  "image": "data:image/jpeg;base64,...",
  "success": true
}
```

Request for failure:

```json
{
  "sessionId": "uuid",
  "success": false
}
```

Success response for verified:

```json
{
  "message": "Verification Successful!",
  "status": "VERIFIED",
  "attempts": 1
}
```

Response for retry:

```json
{
  "message": "Challenge failed. 1 attempt remaining.",
  "status": "FACE_VERIFIED",
  "attempts": 1,
  "retry": true,
  "nextChallenge": "TURN_HEAD_LEFT"
}
```

Response for final failure:

```json
{
  "message": "Challenge failed. All attempts used.",
  "status": "FAILED",
  "attempts": 2,
  "retry": false
}
```

Failure cases:

- missing session ID
- missing success flag
- invalid session
- expired session
- face verification not completed

### `GET /api/result/:sessionId`

Purpose:

Fetch final verification result.

Success response:

```json
{
  "sessionId": "uuid",
  "name": "USER NAME",
  "aadhaarNumber": "XXXX XXXX 1234",
  "status": "VERIFIED",
  "faceMatchScore": 93,
  "challenge": "SHOW_LEFT_HAND",
  "attempts": 1,
  "createdAt": "date",
  "completedAt": "date"
}
```

Failure cases:

- session not found
- server/database error

### `GET /health`

Purpose:

Backend health check.

Success response:

```json
{
  "status": "OK",
  "message": "KYC backend is running."
}
```

## 6. Data Model

### Session Schema

```text
sessionId: String, required, unique
name: String
aadhaarNumber: String
aadhaarImagePath: String
aadhaarFacePath: String
selfieImagePath: String
faceMatchScore: Number
challenge: String
attempts: Number
status: String
createdAt: Date
completedAt: Date
```

Allowed challenge values:

```text
SHOW_LEFT_HAND
SHOW_RIGHT_HAND
TURN_HEAD_LEFT
TURN_HEAD_RIGHT
""
```

Allowed status values:

```text
PENDING
FACE_VERIFIED
VERIFIED
FAILED
EXPIRED
```

## 7. Session Lifecycle

```text
PENDING
  -> FACE_VERIFIED when face score >= 80
  -> FAILED when face score < 80
  -> EXPIRED when older than 10 minutes

FACE_VERIFIED
  -> VERIFIED when liveness challenge passes
  -> FACE_VERIFIED when first challenge attempt fails and retry is allowed
  -> FAILED when second challenge attempt fails
  -> EXPIRED when older than 10 minutes

VERIFIED, FAILED, EXPIRED
  -> terminal states
```

## 8. File Storage Requirements

Upload directories:

```text
backend/uploads/aadhaar
backend/uploads/selfies
```

Stored files:

- original Aadhaar image
- cropped Aadhaar face image
- selfie image
- optional challenge proof frame

Cleanup requirements:

- Delete files when session becomes `VERIFIED`.
- Delete files when session becomes `FAILED`.
- Delete files when session becomes `EXPIRED`.
- Periodic cleanup job should run every 2 minutes.

## 9. Validation Requirements

### Upload Validation

- Allowed extensions: `.jpg`, `.jpeg`, `.png`
- Allowed MIME types: JPEG, JPG, PNG
- Max file size: 5MB

### Face Match Validation

- Session must exist.
- Session must not be expired.
- Session status must be `PENDING`.
- Selfie must be present.
- Passing threshold is confidence score >= 80.

### Challenge Validation

- Session must exist.
- Session must not be expired.
- Session status must be `FACE_VERIFIED`.
- `success` flag must be provided.
- Maximum attempts: 2.

## 10. Liveness Detection Requirements

### Hand Challenge

Used for:

```text
SHOW_LEFT_HAND
SHOW_RIGHT_HAND
```

Implementation:

- Use MediaPipe Hands.
- Detect hand landmarks from webcam frames.
- Read handedness classification.
- Accept stable detection for consecutive frames.
- Accept mirrored interpretation to reduce user frustration.

### Head Turn Challenge

Used for:

```text
TURN_HEAD_LEFT
TURN_HEAD_RIGHT
```

Implementation:

- Use MediaPipe Face Mesh.
- Track nose and cheek landmarks.
- Calculate horizontal ratio from landmarks.
- Detect clear side rotation.
- Require stable detection for consecutive frames.

### Timer

- Challenge duration: 20 seconds.
- Timeout counts as failed attempt.
- First timeout assigns a new challenge.
- Second timeout fails the session.

## 11. Rate Limiting Requirements

Upload endpoint:

```text
15 requests per 15 minutes per IP
```

Verification endpoints:

```text
30 requests per 5 minutes per IP
```

Purpose:

- Reduce abuse.
- Prevent repeated brute-force verification attempts.
- Protect API usage costs.

## 12. Security Requirements

- API keys must stay in backend environment variables.
- Aadhaar number must be masked in frontend responses.
- Uploaded media must not remain after terminal status.
- CORS should be restricted in production.
- HTTPS should be used in production.
- Sensitive database fields should be encrypted in production.
- Rate limiting must be applied to upload and verification endpoints.

## 13. Error Handling Requirements

Frontend must show readable errors for:

- invalid file type
- file too large
- upload failure
- invalid session
- expired session
- camera capture failure
- face verification failure
- challenge timeout
- result fetch failure

Backend must return clear errors for:

- missing upload
- invalid upload
- OCR failure
- face detection failure
- missing request fields
- invalid session status
- expired session
- external API failure

## 14. Build and Run Requirements

### Backend

```bash
cd backend
npm install
npm run dev
```

Default backend URL:

```text
http://localhost:5000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Default Vite URL:

```text
http://localhost:5173
```

## 15. Testing Requirements

Recommended test scenarios:

- Upload valid Aadhaar image.
- Upload invalid file type.
- Upload file larger than 5MB.
- Create session in mock mode.
- Open generated verification link.
- Complete successful face match.
- Complete successful liveness challenge.
- Fail face match.
- Fail first challenge and retry.
- Fail second challenge and verify final `FAILED` status.
- Wait past 10 minutes and verify expiry.
- Confirm media files are cleaned after terminal status.

## 16. Production Readiness Gaps

The current system is a prototype. Before production, add:

- authentication and authorization
- HTTPS
- restricted CORS
- encrypted sensitive data
- audit logs
- structured logging
- cloud file storage
- malware scanning for uploaded files
- stronger OCR validation
- stronger spoof detection
- queue-based background jobs
- automated unit and integration tests
- deployment pipeline
