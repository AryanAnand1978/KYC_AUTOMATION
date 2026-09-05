# Automated Video KYC Verification System

## Overview

This project is a full-stack KYC verification prototype that verifies a user's identity through an Aadhaar document, a live selfie, and a browser-based liveness challenge. It is designed for demonstrations and interview walkthroughs, while following the main stages of a production identity-verification pipeline.

Beyond running a single verification, the system treats its database as a first-class part of the product: every verification becomes a **persistent, secured record** with a full **audit trail** of its lifecycle, and an **admin dashboard** surfaces those records with search, filtering, and MongoDB-aggregation-driven analytics (status distribution, pass rate, verifications over time, liveness-challenge outcomes). Aadhaar identity is stored **metadata-only** — a salted SHA-256 hash plus a masked value — never as recoverable plaintext.

## Verification Flow

1. The applicant uploads an Aadhaar image from the React frontend.
2. The backend validates the file, extracts the applicant name and Aadhaar number through OCR, and masks the Aadhaar number in responses.
3. Face detection extracts the applicant's face from the Aadhaar image.
4. The backend creates a unique verification session and returns a verification link.
5. The applicant opens the link, grants camera access, and captures a live selfie.
6. The backend compares the selfie with the Aadhaar face. A score of 80 or higher passes face verification.
7. After a successful face match, the frontend assigns and checks a liveness challenge using MediaPipe hand or face tracking.
8. The result page displays the final status, masked identity details, face score, and challenge attempts.

## Technology Stack

### Frontend

- React 19 with Vite
- React Router for page navigation
- Axios for API requests
- Tailwind CSS and Lucide React for the interface
- React Webcam for camera access and selfie capture
- MediaPipe Hands and Face Mesh for browser-side liveness checks
- Recharts for the admin dashboard analytics charts

### Backend

- Node.js and Express
- MongoDB with Mongoose
- Multer for Aadhaar uploads
- Jimp for face-image cropping
- Axios and FormData for external service requests
- Express Rate Limit for upload and verification endpoints
- Gemini or Google Vision for OCR
- Face++ for face detection and face comparison
- Node `crypto` for salted SHA-256 Aadhaar hashing and constant-time admin-token comparison
- MongoDB aggregation pipelines for dashboard analytics
- A separate `AuditEvent` collection for the per-session audit trail

## Application Structure

```text
KYC/
  backend/
    server.js
    config/db.js
    controllers/kycController.js
    controllers/adminController.js
    middleware/adminAuth.js
    models/Session.js
    models/AuditEvent.js
    routes/kycRoutes.js
    routes/adminRoutes.js
    services/ocrService.js
    services/faceService.js
    services/auditService.js
    scripts/migratePII.js
    uploads/aadhaar/
    uploads/selfies/
  frontend/
    src/api.js
    src/App.jsx
    src/pages/UploadPage.jsx
    src/pages/VerificationPage.jsx
    src/pages/ResultPage.jsx
    src/pages/admin/AdminLoginPage.jsx
    src/pages/admin/AdminDashboardPage.jsx
    src/pages/admin/VerificationDetailPage.jsx
```

## Frontend Routes

| Route | Purpose |
| --- | --- |
| `/` | Upload an Aadhaar image and create a session |
| `/verify/:sessionId` | Capture a selfie and complete liveness verification |
| `/result/:sessionId` | View the final verification result |
| `/admin` | Admin login (shared key) |
| `/admin/dashboard` | Analytics + searchable/paginated verification records (guarded) |
| `/admin/verifications/:sessionId` | Single record with its full audit timeline (guarded) |

## Backend API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/upload-aadhaar` | Upload and process an Aadhaar image |
| `GET` | `/api/session/:sessionId` | Retrieve the active session |
| `POST` | `/api/verify-face` | Compare the live selfie with the Aadhaar face |
| `POST` | `/api/verify-challenge` | Submit a liveness challenge result |
| `GET` | `/api/result/:sessionId` | Retrieve the final session result |
| `GET` | `/api/admin/verify` | Validate the shared admin key (login) |
| `GET` | `/api/admin/verifications` | Paginated, filterable list of records |
| `GET` | `/api/admin/verifications/:sessionId` | One record plus its audit timeline |
| `GET` | `/api/admin/stats` | Aggregation-driven dashboard analytics |

All `/api/admin/*` routes sit behind a shared-key `Authorization: Bearer` guard and a rate limiter.

## Session Lifecycle

Sessions are stored as MongoDB documents in the `sessions` collection. The normal lifecycle is:

```text
PENDING -> FACE_VERIFIED -> VERIFIED
                    \-> FAILED
PENDING or FACE_VERIFIED -> EXPIRED
```

Each session tracks the session ID, extracted name, secured Aadhaar identity (salted hash + masked value), image paths, face-match score, liveness challenge, attempt count, status, request metadata (IP, user agent), and timestamps. Every lifecycle event is also written to a separate `AuditEvent` collection. Sessions expire after 10 minutes. Terminal sessions trigger cleanup of stored Aadhaar, face, selfie, and challenge **images** — but the secured record and its audit trail are retained for the admin dashboard.

## Privacy and Validation

- Only JPG, JPEG, and PNG Aadhaar images are accepted.
- Uploads are limited to 5 MB.
- Aadhaar numbers are never stored as plaintext: only a salted SHA-256 hash and a masked value are persisted, and responses return the masked value.
- Uploaded biometric files are removed after success, failure, or expiry.
- Upload and verification routes use rate limiting.
- Expiry is checked during requests and by a periodic backend cleanup job.

## Configuration

The backend can use real external services or mock mode for demonstrations. Typical environment variables are:

```text
PORT
MONGODB_URI
MOCK_MODE
GEMINI_API_KEY
GOOGLE_VISION_API_KEY
FACEPLUSPLUS_API_KEY
FACEPLUSPLUS_API_SECRET
ADMIN_TOKEN
AADHAAR_HASH_PEPPER
```

`ADMIN_TOKEN` is the shared key for the admin console; `AADHAAR_HASH_PEPPER` is mixed into the Aadhaar hash. The frontend reads `VITE_API_URL` (see `frontend/.env.example`).

MongoDB must be available locally or through `MONGODB_URI`. The frontend also requires a browser with camera permission for the live verification flow.

## Scope and Limitations

This prototype does not perform government Aadhaar database validation or replace production-grade fraud detection. Its admin console uses a single shared key rather than per-operator accounts, so it has no individual operator identity or role-based access. Real deployments would require stronger identity-provider integration, secure cloud storage, per-operator authentication, consent management, monitoring, and formal security and compliance reviews.
