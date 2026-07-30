# Automated Video KYC Verification System - Project Walkthrough

## 1. Project Overview

This project is an automated Video KYC verification system. The goal is to simulate a real-world identity verification flow where a user uploads an Aadhaar card, the system extracts identity details from the document, verifies the face on the Aadhaar card against a live webcam selfie, and then performs a liveness challenge to reduce spoofing risk.

The application is split into two parts:

- **Frontend:** React application built with Vite. It handles the user interface, file upload, webcam capture, liveness challenge UI, and result display.
- **Backend:** Node.js and Express API. It handles upload processing, OCR, face detection, face comparison, session state, expiry, cleanup, and result retrieval.

The system follows a staged verification model:

1. Aadhaar card image is uploaded.
2. OCR extracts name and Aadhaar number.
3. Face is detected and cropped from the Aadhaar image.
4. A verification link/session is generated.
5. User opens the verification page and captures a live selfie.
6. Face comparison checks Aadhaar face vs live selfie.
7. If face match passes, a random liveness challenge is assigned.
8. Browser-side MediaPipe validates the challenge using the webcam.
9. Backend stores the final status as `VERIFIED`, `FAILED`, or `EXPIRED`.

## 2. Why This Project Was Planned This Way

The project was planned as a realistic KYC pipeline instead of just a single upload form. Real KYC systems usually need three layers:

- **Document validation:** Check that the identity document contains readable user details.
- **Biometric matching:** Check that the user in front of the camera matches the document photo.
- **Liveness verification:** Check that the user is physically present and not only uploading a static image.

That is why the app has multiple pages and session states. Each stage depends on the previous stage, which makes the flow closer to production identity systems:

- The upload page creates the verification session.
- The verification page continues the session through face match and liveness.
- The result page gives the final audit-style output.

This planning also keeps responsibilities clean. The frontend focuses on user interaction and camera-based tasks, while the backend owns validation, API calls, persistence, and cleanup.

## 3. Tech Stack and Why It Was Used

### Frontend: React

React was used because the frontend has many changing UI states:

- selected file
- upload loading state
- extracted Aadhaar result
- webcam stream
- captured selfie
- face match score
- liveness timer
- challenge status
- retry state
- final verification status

React's component model and state hooks make this kind of step-by-step interface easier to build and maintain.

### Vite

Vite was used as the frontend build tool because it is fast, lightweight, and works well for React development. It gives quick local startup and hot module reload, which is useful while building camera-based UI because the developer needs to test changes repeatedly.

### React Router

React Router was used to separate the project into pages:

- `/` for Aadhaar upload
- `/verify/:sessionId` for live verification
- `/result/:sessionId` for final output

The `sessionId` in the URL is important because it allows a specific verification session to be resumed or shared through a generated verification link.

### Axios

Axios was used on both frontend and backend for HTTP communication:

- In the frontend, Axios calls the backend API endpoints.
- In the backend, Axios calls external services such as Gemini/Google Vision and Face++.

Axios gives simple request/response handling, error handling, timeouts, and form-data support.

### Tailwind CSS

Tailwind CSS was used to build a polished UI quickly without writing large custom CSS files. The app needs consistent cards, buttons, badges, loading states, and responsive layouts. Utility classes make it easy to keep the design consistent across the upload, verification, and result screens.

Custom theme colors and reusable utilities are defined in `frontend/src/index.css`, such as:

- `glass-card`
- `btn-primary`
- `btn-secondary`
- `badge-verified`
- `badge-failed`
- `badge-expired`

### Lucide React

Lucide React was used for icons. Icons improve scanability in a workflow-heavy app: upload, copy link, camera capture, success, failure, retry, warning, and shield icons all make the UI easier to understand.

### React Webcam

`react-webcam` was used because the app needs direct webcam access for:

- capturing a selfie for face comparison
- streaming video frames for liveness challenge detection

It simplifies camera permission handling and screenshot capture in React.

### MediaPipe

MediaPipe was used for browser-side liveness detection. It provides prebuilt models for:

- hand tracking
- face mesh tracking

This avoids building computer vision logic from scratch. The app uses MediaPipe Hands for hand challenges and MediaPipe Face Mesh for head-turn challenges.

The MediaPipe scripts are loaded in `frontend/index.html` through CDN:

- `@mediapipe/camera_utils`
- `@mediapipe/hands`
- `@mediapipe/face_mesh`

This was done to avoid complex Vite bundling issues around MediaPipe assets, WASM files, and worker files.

### Backend: Node.js and Express

Node.js and Express were used because the backend is mainly an API layer. It receives files, calls external APIs, stores session state, and returns JSON responses. Express is simple, flexible, and suitable for building REST-style endpoints quickly.

### MongoDB and Mongoose

MongoDB was used to store verification session data. A document database fits this use case because each KYC session has one main record containing:

- session ID
- extracted name
- Aadhaar number
- file paths
- face match score
- liveness challenge
- attempts
- status
- timestamps

Mongoose was used to define a clear `Session` schema and helper method like `isExpired()`.

### Multer

Multer was used to handle Aadhaar image uploads from the frontend. It stores the uploaded document in the backend's `uploads/aadhaar` folder and enforces basic upload rules such as file size and file type.

### Jimp

Jimp was used for image processing. After Face++ detects the face position inside the Aadhaar image, Jimp crops that region and saves it as a separate face image. This cropped face is later compared with the live selfie.

### Face++

Face++ was used for:

- face detection in the uploaded Aadhaar image
- face comparison between Aadhaar face and live selfie

This gives the project a realistic biometric verification step. The confidence score is used to decide whether the user can continue to liveness verification. The project uses an 80% threshold.

### Gemini / Google Vision OCR

The OCR service supports two approaches:

- Gemini API for direct document understanding and JSON extraction.
- Google Vision API fallback for text detection with regex and heuristic parsing.

The purpose is to extract:

- user name
- Aadhaar number

The backend masks the Aadhaar number before returning it to the frontend, showing only the last four digits.

### Mock Mode

Mock mode was added so the project can be tested during development or interviews without paid API credentials. If API keys are missing or mock mode is enabled, the backend returns simulated OCR and face comparison results.

This is useful because external APIs can fail due to quota, keys, network, or billing, and an interview demo should still be explainable.

## 4. Folder Structure

```text
KYC/
  backend/
    server.js
    config/
      db.js
    controllers/
      kycController.js
    models/
      Session.js
    routes/
      kycRoutes.js
    services/
      ocrService.js
      faceService.js
    uploads/
      aadhaar/
      selfies/

  frontend/
    index.html
    src/
      App.jsx
      main.jsx
      index.css
      pages/
        UploadPage.jsx
        VerificationPage.jsx
        ResultPage.jsx
```

## 5. Frontend Wiring

### `frontend/src/main.jsx`

This is the React entry point. It mounts the React app into the DOM element with ID `root`.

### `frontend/src/App.jsx`

`App.jsx` defines the application shell:

- sticky header
- brand area
- route mapping
- main content area
- footer

It uses `BrowserRouter`, `Routes`, and `Route` from React Router.

Routes:

```text
/                    -> UploadPage
/verify/:sessionId   -> VerificationPage
/result/:sessionId   -> ResultPage
```

### `UploadPage.jsx`

This is the first screen of the app. It handles Aadhaar upload and session creation.

Main responsibilities:

- accept drag-and-drop or file picker upload
- validate file type: JPG, JPEG, PNG
- validate file size: max 5MB
- send the file to backend using `multipart/form-data`
- call `POST /api/upload-aadhaar`
- display extracted name and masked Aadhaar number
- generate and show a verification link
- allow copying the verification link

Important state variables:

- `file`
- `dragActive`
- `loading`
- `loadingStep`
- `error`
- `sessionResult`
- `copied`

The page creates the first backend session. Without this step, the verification page has no session to load.

### `VerificationPage.jsx`

This is the main live verification screen. It handles two phases:

1. Face verification
2. Liveness challenge verification

When the page loads, it reads the `sessionId` from the route using `useParams()`, then calls:

```text
GET /api/session/:sessionId
```

If the session is valid, the user can continue. If it is expired or invalid, an error screen is shown.

#### Phase 1: Face Verification

The user aligns their face in the webcam frame and clicks capture. The page takes a screenshot using `react-webcam` and sends it to:

```text
POST /api/verify-face
```

Payload:

```json
{
  "sessionId": "...",
  "selfie": "base64-image"
}
```

Backend compares the selfie with the cropped Aadhaar face. If the score is greater than or equal to 80, the backend sets the session status to `FACE_VERIFIED` and returns a random challenge.

#### Phase 2: Liveness Challenge

The frontend initializes MediaPipe based on the assigned challenge:

- hand challenge: MediaPipe Hands
- head-turn challenge: MediaPipe Face Mesh

Supported challenges:

```text
SHOW_LEFT_HAND
SHOW_RIGHT_HAND
TURN_HEAD_LEFT
TURN_HEAD_RIGHT
```

The browser evaluates webcam frames in real time. If the user holds the correct action for enough consecutive frames, the frontend sends:

```text
POST /api/verify-challenge
```

For success:

```json
{
  "sessionId": "...",
  "image": "base64-proof-frame",
  "success": true
}
```

For timeout/failure:

```json
{
  "sessionId": "...",
  "success": false
}
```

The backend allows two attempts. If the first challenge fails, it assigns a new challenge. If the second fails, the session becomes `FAILED`.

### `ResultPage.jsx`

This page fetches and displays the final status of a KYC session.

It calls:

```text
GET /api/result/:sessionId
```

It shows:

- status: `VERIFIED`, `FAILED`, or `EXPIRED`
- applicant name
- masked Aadhaar number
- face match score
- liveness challenge
- attempts used
- timestamp
- success or failure explanation

This page is designed like an audit summary, so the interviewer can clearly see why a session passed or failed.

## 6. Backend Wiring

### `backend/server.js`

This is the main backend entry point.

Responsibilities:

- load environment variables
- create Express app
- connect to MongoDB
- enable CORS
- configure JSON/body limits
- serve uploaded files under `/uploads`
- mount API routes under `/api`
- expose `/health`
- create upload directories
- run a cleanup job every 2 minutes
- start the server

The cleanup job searches for old sessions still stuck in `PENDING` or `FACE_VERIFIED`. If they are older than 10 minutes, it marks them as `EXPIRED` and deletes related files.

### `backend/config/db.js`

This file connects to MongoDB using Mongoose.

Default local connection:

```text
mongodb://127.0.0.1:27017/kyc-verification
```

It can also use `MONGODB_URI` from environment variables.

### `backend/models/Session.js`

This file defines the MongoDB schema for a KYC session.

Important fields:

- `sessionId`
- `name`
- `aadhaarNumber`
- `aadhaarImagePath`
- `aadhaarFacePath`
- `selfieImagePath`
- `faceMatchScore`
- `challenge`
- `attempts`
- `status`
- `createdAt`
- `completedAt`

Allowed statuses:

```text
PENDING
FACE_VERIFIED
VERIFIED
FAILED
EXPIRED
```

The model also defines `isExpired()`, which checks whether the session is older than 10 minutes.

### `backend/routes/kycRoutes.js`

This file defines the API routes and upload middleware.

Routes:

```text
POST /api/upload-aadhaar
GET  /api/session/:sessionId
POST /api/verify-face
POST /api/verify-challenge
GET  /api/result/:sessionId
```

It also configures:

- Multer disk storage
- image-only upload filter
- 5MB file size limit
- upload rate limiting
- verification rate limiting
- graceful Multer error handling

### `backend/controllers/kycController.js`

This is the main business logic file.

#### `uploadAadhaar`

Flow:

1. Validate uploaded Aadhaar image.
2. Generate a unique `sessionId`.
3. Call OCR service to extract name and Aadhaar number.
4. Call face service to detect and crop Aadhaar face.
5. Create a session in MongoDB.
6. Return the session ID, verification link, name, and masked Aadhaar number.

#### `getSession`

Flow:

1. Find session by `sessionId`.
2. Check whether it exists.
3. Check whether it has expired.
4. Return masked session data needed by the verification page.

#### `verifyFace`

Flow:

1. Receive `sessionId` and base64 selfie.
2. Validate session exists and is not expired.
3. Save selfie image to `uploads/selfies`.
4. Compare selfie with Aadhaar cropped face using Face++.
5. If score is at least 80, mark session as `FACE_VERIFIED`.
6. Assign random liveness challenge.
7. If score is below 80, mark session as `FAILED` and delete media.

#### `verifyChallenge`

Flow:

1. Receive challenge result from frontend.
2. Validate session status is `FACE_VERIFIED`.
3. Save optional proof frame.
4. Increment attempt count.
5. If success is true, mark session as `VERIFIED`.
6. If failed once, assign a new challenge.
7. If failed twice, mark session as `FAILED`.
8. Cleanup media files after terminal status.

#### `getResult`

Flow:

1. Find session by `sessionId`.
2. Return final verification details.

### `backend/services/ocrService.js`

This file handles document text extraction.

It supports:

- Gemini-based extraction when `GEMINI_API_KEY` is configured.
- Mock mode when API keys are missing or mock mode is enabled.
- Google Vision OCR fallback when `GOOGLE_VISION_API_KEY` is configured.

It returns:

```json
{
  "name": "...",
  "aadhaarNumber": "...",
  "rawText": "..."
}
```

The Google Vision fallback uses regex and heuristics to locate Aadhaar number and name from OCR text.

### `backend/services/faceService.js`

This file handles face detection, cropping, and comparison.

#### `detectAndCropFace`

Uses Face++ detect API to find the face rectangle inside the Aadhaar image. Then Jimp crops the detected face and saves it separately.

In mock mode, it crops the center area of the image so the rest of the flow can still run.

#### `compareFaces`

Uses Face++ compare API to compare:

- cropped Aadhaar face
- live selfie

It returns a confidence score. The controller uses 80% as the pass threshold.

In mock mode, it returns a successful score, usually `92.5`.

## 7. End-to-End Data Flow

```text
User uploads Aadhaar image
        |
        v
Frontend UploadPage validates file
        |
        v
POST /api/upload-aadhaar
        |
        v
Backend saves image using Multer
        |
        v
OCR extracts name and Aadhaar number
        |
        v
Face++ detects Aadhaar face
        |
        v
Jimp crops Aadhaar face
        |
        v
MongoDB session is created with PENDING status
        |
        v
Frontend receives verification link
        |
        v
User opens /verify/:sessionId
        |
        v
Frontend fetches session data
        |
        v
User captures selfie through webcam
        |
        v
POST /api/verify-face
        |
        v
Backend compares Aadhaar face with selfie
        |
        v
If score >= 80, backend returns random challenge
        |
        v
Frontend runs MediaPipe challenge detection
        |
        v
POST /api/verify-challenge
        |
        v
Backend marks session VERIFIED or FAILED
        |
        v
Frontend redirects to /result/:sessionId
```

## 8. API Summary

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/upload-aadhaar` | Upload Aadhaar image, extract data, crop face, create session |
| `GET` | `/api/session/:sessionId` | Fetch active session details |
| `POST` | `/api/verify-face` | Compare webcam selfie with Aadhaar face |
| `POST` | `/api/verify-challenge` | Submit liveness challenge result |
| `GET` | `/api/result/:sessionId` | Fetch final verification result |
| `GET` | `/health` | Check backend health |

## 9. Session State Machine

```text
PENDING
  |
  | Face match passed
  v
FACE_VERIFIED
  |
  | Liveness passed
  v
VERIFIED

PENDING
  |
  | Face match failed
  v
FAILED

FACE_VERIFIED
  |
  | Two challenge attempts failed
  v
FAILED

PENDING or FACE_VERIFIED
  |
  | Older than 10 minutes
  v
EXPIRED
```

This makes the backend predictable because every session is always in one known state.

## 10. Security and Privacy Considerations

The project includes several security-minded choices:

- Aadhaar number is masked before being returned to the frontend.
- Uploaded files are limited to image formats.
- Upload size is limited to 5MB.
- API endpoints use rate limiting.
- Sessions expire after 10 minutes.
- Uploaded media is deleted after verification, failure, or expiry.
- Liveness challenge reduces risk of static photo spoofing.
- The backend owns final status changes instead of trusting the frontend completely.

For production, additional improvements would be needed:

- Restrict CORS to the deployed frontend origin.
- Store secrets securely in environment variables.
- Use HTTPS.
- Encrypt sensitive fields in the database.
- Use cloud object storage with lifecycle rules instead of local disk.
- Add stronger document authenticity checks.
- Add audit logging.
- Add user authentication or admin review.

## 11. Why MediaPipe Runs on the Frontend

MediaPipe liveness checks run in the browser because real-time camera frame processing is faster and cheaper client-side. Sending every webcam frame to the backend would increase:

- latency
- server cost
- network usage
- privacy risk

The frontend only sends the final success/failure result and an optional proof frame. This keeps the backend lighter while still allowing it to control session state.

## 12. Why Face Comparison Runs on the Backend

Face comparison is handled on the backend because:

- API secrets should never be exposed to the browser.
- The backend can control the threshold and final decision.
- The backend has access to the cropped Aadhaar face file.
- It is easier to audit and secure biometric comparison in one place.

This separation is important: camera interaction is frontend-heavy, but sensitive API calls and final verification decisions are backend-owned.

## 13. Important Interview Talking Points

### Short project explanation

"I built an automated Video KYC verification system using React, Node.js, Express, MongoDB, OCR, face comparison, and browser-side liveness detection. The user uploads an Aadhaar card, the backend extracts identity data and crops the document face, then the user completes live selfie verification and a MediaPipe-based challenge. The final session status is stored as verified, failed, or expired."

### Why MERN-style architecture?

"The app needed a dynamic frontend for webcam and liveness interactions, plus a backend for file handling, external API integration, session state, and cleanup. MongoDB works well because each verification session is naturally document-shaped."

### Why React?

"React made it easier to manage multiple UI states: upload progress, session details, webcam capture, challenge timer, retry attempts, and final status."

### Why Express?

"Express is lightweight and suitable for REST APIs. It let me create clear endpoints for upload, session fetch, face verification, challenge verification, and result retrieval."

### Why MongoDB?

"A KYC session has flexible but related fields: document paths, extracted data, challenge, attempts, status, and timestamps. MongoDB stores that cleanly as one session document."

### Why MediaPipe?

"MediaPipe provides reliable hand and face landmark tracking in the browser. It helped me implement liveness checks without writing low-level computer vision code from scratch."

### Why Face++?

"Face++ provides face detection and comparison APIs. I used it to crop the Aadhaar face and compare it with the live selfie using a confidence threshold."

### Why mock mode?

"Mock mode makes the project demo-friendly and testable even without external API keys. This is important because interviews or local demos should not fail only because of quota, billing, or network issues."

## 14. Possible Interview Questions and Answers

### How is the app wired from frontend to backend?

The frontend calls backend APIs using Axios. `UploadPage` calls `/api/upload-aadhaar`, `VerificationPage` calls `/api/session/:sessionId`, `/api/verify-face`, and `/api/verify-challenge`, and `ResultPage` calls `/api/result/:sessionId`. The backend routes forward each request to controller functions, and controllers use services for OCR and face operations.

### What happens after Aadhaar upload?

The backend saves the uploaded file, extracts text using OCR, detects and crops the Aadhaar face, creates a MongoDB session, and returns a generated verification link.

### How does liveness detection work?

After face match passes, the backend assigns a random challenge. The frontend uses MediaPipe to track either hand landmarks or face landmarks through the webcam. If the correct action is detected for enough consecutive frames before timeout, the frontend submits success to the backend.

### How do you prevent expired links?

Each session has a `createdAt` timestamp. The backend checks expiry whenever session APIs are called, and `server.js` also runs a periodic cleanup job every 2 minutes. Sessions older than 10 minutes are marked `EXPIRED`.

### Where are files cleaned up?

The controller has cleanup helper functions. Files are deleted after verification succeeds, after face/challenge failure, or when a session expires.

### What are the limitations?

The project is a strong prototype, but production would need stronger Aadhaar authenticity checks, encryption, HTTPS, tighter CORS, authentication, audit logs, and better anti-spoofing.

## 15. How to Demo the Project

1. Start MongoDB locally.
2. Start backend:

```bash
cd backend
npm run dev
```

3. Start frontend:

```bash
cd frontend
npm run dev
```

4. Open the frontend URL from Vite.
5. Upload a clear Aadhaar image.
6. Copy or open the generated verification link.
7. Allow camera permission.
8. Capture selfie.
9. Complete the assigned liveness challenge.
10. Show the final result page.

## 16. Final Summary

This project demonstrates a complete identity verification pipeline instead of only a UI mockup. It combines document upload, OCR extraction, face detection, face comparison, browser-based liveness detection, session persistence, expiry handling, and cleanup. The architecture keeps frontend interaction and backend verification responsibilities separate, which makes the project easier to explain, test, and extend.

