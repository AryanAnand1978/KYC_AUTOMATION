# Technical Requirements Document (TRD)

# Automated Video KYC Verification System with Admin Intelligence & Audit Trail

## 1. Technical Overview

The system is a full-stack, automated Video KYC verification and compliance management application consisting of a React frontend and an Express/MongoDB backend. The architecture supports two operational workflows:
1. **Applicant Verification Pipeline**: File upload validation, OCR identity extraction, face detection/cropping, biometric facial comparison, client-side MediaPipe liveness challenges, and ephemeral media cleanup.
2. **Admin Intelligence & Audit Engine**: Persistent verification session records, salted SHA-256 Aadhaar hashing with server-side pepper, append-only `AuditEvent` lifecycle logging, shared-secret Bearer authentication, and aggregation-driven analytics visualized with Recharts.

High-level architecture:

```text
+---------------------------------------------------------------------------------------+
|                                    REACT FRONTEND                                     |
|                                                                                       |
|   +-----------------------+     +------------------------+     +------------------+   |
|   | Applicant Experience  |     |   Admin Intelligence   |     | Recharts Visuals |   |
|   |  Upload / Live Selfie |     |  Dashboard / Filtered  |     | Status, Trends,  |   |
|   |  MediaPipe Liveness   |     |    Explorer & Audit    |     |  Challenge Rates |   |
|   +-----------------------+     +------------------------+     +------------------+   |
+---------------------------------------------------------------------------------------+
                                    |                   |
                     Public Client  |                   | Admin Client (Bearer Token)
                     (api instance) |                   | (adminApi instance)
                                    v                   v
+---------------------------------------------------------------------------------------+
|                                  EXPRESS BACKEND API                                  |
|                                                                                       |
|   +-----------------------+     +------------------------+     +------------------+   |
|   |  kycRoutes & Limiter  |     |  adminRoutes & Limiter |     | adminAuth Guard  |   |
|   |   Upload / Compare /  |     |    List / Detail /     |     | Timing-Safe Bearer|  |
|   |        Challenge      |     |     Stats Endpoints    |     | Token Comparison |   |
|   +-----------------------+     +------------------------+     +------------------+   |
|               |                             |                             |           |
|               +-----------------------------+-----------------------------+           |
|                                             v                                         |
|                                      CONTROLLERS                                      |
|                                 kycController / adminController                       |
+---------------------------------------------------------------------------------------+
                |                                             |
                v                                             v
+------------------------------------+      +-------------------------------------------+
|          EXTERNAL SERVICES         |      |             MONGODB DATABASE              |
|                                    |      |                                           |
|  - Gemini 2.5 Flash / Vision OCR   |      |  - sessions collection                    |
|  - Face++ Detect & Compare         |      |    (Salted hash, masked display, indexes) |
|  - Local Jimp fallback / Mock Mode |      |  - auditevents collection                 |
+------------------------------------+      |    (Append-only chronological trail)      |
                                            +-------------------------------------------+
```

## 2. Technology Stack

### Frontend

- **Core**: React 19, Vite 8
- **Routing**: React Router 7 (`react-router-dom`)
- **Networking**: Axios (dual configured instances: `api` and `adminApi`)
- **Styling**: Tailwind CSS 4, PostCSS, Custom glassmorphism design tokens
- **Icons**: Lucide React
- **Camera Capture**: React Webcam
- **Real-Time Client ML**: MediaPipe Hands (`@mediapipe/hands`), MediaPipe Face Mesh (`@mediapipe/face_mesh`), Camera Utils (`@mediapipe/camera_utils`)
- **Data Visualization**: Recharts 2 (BarChart, AreaChart, PieChart, Tooltips, ResponsiveContainer)

### Backend

- **Runtime**: Node.js
- **Server Framework**: Express 4
- **Database**: MongoDB via Mongoose 8
- **File Uploads**: Multer (disk storage, regex mime filters, 5MB ceiling)
- **Image Processing**: Jimp (biometric face cropping with 10% bounding box padding)
- **Security & Crypto**: Node.js built-in `crypto` (salted SHA-256 Aadhaar hashing, UUID generation, timing-safe token checks via `crypto.timingSafeEqual`)
- **Rate Limiting**: Express Rate Limit (upload, verification, and admin routes)
- **External Communications**: Axios, Form-Data
- **Environment Management**: Dotenv, CORS

## 3. Runtime Requirements

### Frontend Runtime

- Node.js (v18+) capable of executing Vite dev/build pipelines.
- Modern desktop/mobile web browser supporting WebRTC `navigator.mediaDevices.getUserMedia`.
- Network connectivity to CDN endpoints (`cdn.jsdelivr.net`) to stream MediaPipe model binaries.
- LocalStorage access for persistent admin session token caching.

### Backend Runtime

- Node.js (v18+) execution environment.
- MongoDB instance (v5.0+) accessible via connection URI.
- File system read/write permissions for temporary upload directories (`uploads/aadhaar/`, `uploads/selfies/`).

### Environment Variables

Backend environment configuration (`backend/.env`):

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/kyc-verification
MOCK_MODE=true

# OCR & Biometric APIs
GEMINI_API_KEY=your_gemini_api_key
GOOGLE_VISION_API_KEY=your_vision_api_key
FACEPLUSPLUS_API_KEY=your_facepp_api_key
FACEPLUSPLUS_API_SECRET=your_facepp_api_secret

# Security & Admin Intelligence
ADMIN_TOKEN=your_secure_admin_shared_key
AADHAAR_HASH_PEPPER=your_secret_pii_hash_pepper
```

Frontend environment configuration (`frontend/.env`):

```env
VITE_API_URL=http://localhost:5000
```

## 4. System Components

### Frontend Components

#### `frontend/src/App.jsx`
- Configures client routing and navigation layout.
- Renders responsive header with live node connectivity badge.
- Enforces route guard (`RequireAdmin`) redirecting unauthenticated users to `/admin`.
- Catch-all 404 handler for invalid routes.

Routes configured:
```text
/                               -> UploadPage
/verify/:sessionId              -> VerificationPage
/result/:sessionId              -> ResultPage
/admin                          -> AdminLoginPage
/admin/dashboard                -> RequireAdmin(AdminDashboardPage)
/admin/verifications/:sessionId -> RequireAdmin(VerificationDetailPage)
*                               -> NotFound
```

#### `frontend/src/api.js`
- Exports `api`: Public Axios instance configured with `baseURL: VITE_API_URL`.
- Exports `adminApi`: Authenticated Axios instance with dynamic request interceptor attaching `Authorization: Bearer <token>`.
- Manages `getAdminToken()`, `setAdminToken()`, and `clearAdminToken()` via `localStorage`.

#### `frontend/src/pages/UploadPage.jsx`
- Drag-and-drop / file picker interface for Aadhaar documents.
- Client-side size (< 5MB) and format (`image/jpeg`, `image/png`) validation.
- Submits multipart form to `POST /api/upload-aadhaar`.
- Displays extracted applicant name and masked Aadhaar.
- Generates dynamic verification link with one-click clipboard copying.

#### `frontend/src/pages/VerificationPage.jsx`
- Fetches session details via `GET /api/session/:sessionId`.
- Manages webcam video stream with alignment guide overlay.
- Captures selfie snapshot and submits to `POST /api/verify-face`.
- Dynamically activates MediaPipe Hands or Face Mesh based on assigned challenge.
- Displays interactive landmark tracking canvas and 20-second countdown timer.
- Submits challenge evaluation to `POST /api/verify-challenge`.
- Automatically transitions to `/result/:sessionId` upon terminal completion.

#### `frontend/src/pages/ResultPage.jsx`
- Fetches non-destructive final outcome from `GET /api/result/:sessionId`.
- Displays status badge (`VERIFIED`, `FAILED`, `EXPIRED`).
- Displays diagnostic breakdown: match score, challenge variant, attempts used, timestamps.

#### `frontend/src/pages/admin/AdminLoginPage.jsx`
- Secured access form for operators to enter the shared admin key.
- Validates token against `GET /api/admin/verify`.
- Stores valid token in `localStorage` and redirects to `/admin/dashboard`.

#### `frontend/src/pages/admin/AdminDashboardPage.jsx`
- Administrative command center.
- Top KPI stat cards: Total Verifications, Distinct Applicants, Pass Rate, Avg Match Score, Challenge Success Rate, Today's Volume.
- Interactive Recharts visualizers:
  - 30-Day verification trends (Total vs. Verified vs. Failed AreaChart).
  - Status distribution breakdown (BarChart).
  - Liveness challenge performance by type (Horizontal BarChart).
- Filterable and paginated Verifications Explorer:
  - Regex search input (by applicant name or masked Aadhaar).
  - Status dropdown selector (`ALL`, `PENDING`, `FACE_VERIFIED`, `VERIFIED`, `FAILED`, `EXPIRED`).
  - Creation date range pickers (`from`, `to`).
  - Sorting criteria (`newest`, `oldest`, `score`).
  - Pagination controls with total count indicators.

#### `frontend/src/pages/admin/VerificationDetailPage.jsx`
- Comprehensive audit view for an individual verification record.
- Displays full session attributes: Session UUID, Name, Masked Aadhaar, Salted SHA-256 Hash, Match Score, IP Address, User Agent, and Completion Timestamps.
- Renders an interactive chronological timeline of all associated `AuditEvent` entries with metadata tags.

### Backend Components

#### `backend/server.js`
- Initializes Express application, CORS rules, and 10MB JSON body limit (for base64 webcam selfies).
- Connects to MongoDB via `config/db.js`.
- Mounts public KYC endpoints under `/api`.
- Mounts administrative endpoints under `/api/admin`.
- Exposes health probe route `GET /health`.
- Manages automated 2-minute interval job expiring stale sessions (> 10 minutes) and unlinking orphan biometric files.

#### `backend/config/db.js`
- Connects Mongoose to MongoDB host specified in `MONGODB_URI` with fallback to local replica.

#### `backend/models/Session.js`
- MongoDB schema representing the verification session.
- Fields: `sessionId`, `name`, `aadhaarHash` (salted SHA-256, indexed), `aadhaarMasked`, `aadhaarImagePath`, `aadhaarFacePath`, `selfieImagePath`, `faceMatchScore`, `challenge`, `attempts`, `status`, `ipAddress`, `userAgent`, `createdAt`, `updatedAt`, `completedAt`.
- Schema instance method `isExpired()` evaluates 10-minute expiry window.

#### `backend/models/AuditEvent.js`
- Append-only schema recording per-session audit events.
- Fields: `sessionId` (indexed), `type` (indexed enum), `message`, `meta` (arbitrary JSON schema), `createdAt` (indexed).
- Event types: `SESSION_CREATED`, `FACE_COMPARED`, `CHALLENGE_ATTEMPTED`, `SESSION_VERIFIED`, `SESSION_FAILED`, `SESSION_EXPIRED`.

#### `backend/services/auditService.js`
- Exports non-blocking `logEvent(sessionId, type, message, meta)` helper.
- Fire-and-forget execution ensures logging failures do not interrupt applicant onboarding flows.

#### `backend/middleware/adminAuth.js`
- Express authorization middleware guarding administrative routes.
- Extracts `Bearer <token>` from the HTTP `Authorization` header.
- Compares supplied token against `process.env.ADMIN_TOKEN` using `crypto.timingSafeEqual` over fixed-length UTF-8 buffers.
- Rejects missing, malformed, or invalid tokens with HTTP 401 Unauthorized.

#### `backend/controllers/adminController.js`
- `verifyToken`: Validates admin bearer token.
- `listVerifications`: Paginated query engine with regex search, status filter, date ranges, and sorting.
- `getVerificationDetail`: Fetches individual session alongside its chronological `AuditEvent` trail.
- `getStats`: High-performance analytics engine powered by parallel MongoDB aggregation pipelines ($group, $match, $dateToString, $cond, $count).

#### `backend/controllers/kycController.js`
- Business logic for applicant verification.
- Manages upload handling, OCR coordination, biometric comparison, dynamic challenge assignment, and terminal file deletion.
- Emits audit events via `auditService` at each lifecycle milestone.

#### `backend/scripts/migratePII.js`
- Migration script to backfill salted SHA-256 hashes and masked Aadhaar strings for legacy un-hashed records.

## 5. API Specifications

### Public Applicant Endpoints

#### `POST /api/upload-aadhaar`
- **Rate Limit**: 15 requests / 15 minutes / IP
- **Payload**: `multipart/form-data` with file field `aadhaar`
- **Output**: `201 Created`
  ```json
  {
    "sessionId": "4a737f10-1845-4df3-bc32-75d1f5e27a6c",
    "verificationLink": "/verify/4a737f10-1845-4df3-bc32-75d1f5e27a6c",
    "extractedData": {
      "name": "AARAV SHARMA",
      "aadhaarNumber": "XXXX XXXX 9012"
    }
  }
  ```

#### `GET /api/session/:sessionId`
- **Output**: `200 OK`
  ```json
  {
    "sessionId": "4a737f10-1845-4df3-bc32-75d1f5e27a6c",
    "name": "AARAV SHARMA",
    "aadhaarNumber": "XXXX XXXX 9012",
    "status": "PENDING",
    "challenge": "",
    "attempts": 0,
    "createdAt": "2026-10-09T12:00:00.000Z"
  }
  ```

#### `POST /api/verify-face`
- **Rate Limit**: 30 requests / 5 minutes / IP
- **Payload**: `{ "sessionId": "...", "selfie": "data:image/jpeg;base64,..." }`
- **Pass Output**: `200 OK`
  ```json
  {
    "message": "Face Verification Passed!",
    "status": "FACE_VERIFIED",
    "faceMatchScore": 92.5,
    "challenge": "SHOW_LEFT_HAND"
  }
  ```
- **Fail Output**: `200 OK` (`status: "FAILED"`, `faceMatchScore: 45.0`)

#### `POST /api/verify-challenge`
- **Rate Limit**: 30 requests / 5 minutes / IP
- **Payload**: `{ "sessionId": "...", "success": true, "image": "data:image/jpeg;base64,..." }`
- **Success Output**: `200 OK`
  ```json
  {
    "message": "Verification Successful!",
    "status": "VERIFIED",
    "attempts": 1
  }
  ```
- **Retry Output**: `200 OK` (`status: "FACE_VERIFIED"`, `retry: true`, `challenge: "TURN_HEAD_RIGHT"`)
- **Terminal Fail Output**: `200 OK` (`status: "FAILED"`, `attempts": 2`)

#### `GET /api/result/:sessionId`
- Non-destructive query returning terminal status, scores, masked Aadhaar, and completed timestamp.

---

### Administrative Endpoints (`/api/admin/*`)

*All administrative routes require header `Authorization: Bearer <ADMIN_TOKEN>` and are rate-limited to 200 req / 5 min.*

#### `GET /api/admin/verify`
- Validates the admin bearer token. Returns `{ "ok": true }`.

#### `GET /api/admin/verifications`
- Query Params: `page` (default 1), `limit` (default 20), `status`, `q`, `from`, `to`, `sort` (`newest`, `oldest`, `score`).
- **Output**: `200 OK`
  ```json
  {
    "items": [
      {
        "sessionId": "4a737f10-1845-4df3-bc32-75d1f5e27a6c",
        "name": "AARAV SHARMA",
        "aadhaarMasked": "XXXX XXXX 9012",
        "status": "VERIFIED",
        "faceMatchScore": 92.5,
        "challenge": "SHOW_LEFT_HAND",
        "attempts": 1,
        "createdAt": "2026-10-09T12:00:00.000Z",
        "completedAt": "2026-10-09T12:01:15.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "pages": 1,
    "limit": 20
  }
  ```

#### `GET /api/admin/verifications/:sessionId`
- **Output**: `200 OK`
  ```json
  {
    "verification": {
      "sessionId": "...",
      "name": "AARAV SHARMA",
      "aadhaarMasked": "XXXX XXXX 9012",
      "aadhaarHash": "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
      "status": "VERIFIED",
      "faceMatchScore": 92.5,
      "challenge": "SHOW_LEFT_HAND",
      "attempts": 1,
      "ipAddress": "127.0.0.1",
      "userAgent": "Mozilla/5.0 ...",
      "createdAt": "...",
      "completedAt": "..."
    },
    "events": [
      {
        "type": "SESSION_CREATED",
        "message": "Aadhaar uploaded and session initialized.",
        "meta": { "ip": "127.0.0.1" },
        "createdAt": "2026-10-09T12:00:00.000Z"
      },
      {
        "type": "FACE_COMPARED",
        "message": "Face verification succeeded.",
        "meta": { "score": 92.5, "passed": true },
        "createdAt": "2026-10-09T12:00:30.000Z"
      },
      {
        "type": "SESSION_VERIFIED",
        "message": "KYC verification completed successfully.",
        "meta": { "attempts": 1 },
        "createdAt": "2026-10-09T12:01:15.000Z"
      }
    ]
  }
  ```

#### `GET /api/admin/stats`
- Aggregates multi-dimensional metrics via MongoDB aggregation pipelines.
- **Output**: `200 OK`
  ```json
  {
    "totals": {
      "total": 142,
      "pending": 5,
      "faceVerified": 3,
      "verified": 118,
      "failed": 12,
      "expired": 4,
      "today": 18,
      "distinctApplicants": 130
    },
    "rates": {
      "passRate": 83.1,
      "avgFaceMatchScore": 89.4,
      "challengeSuccessRate": 91.2
    },
    "statusBreakdown": [
      { "status": "VERIFIED", "count": 118 },
      { "status": "FAILED", "count": 12 },
      { "status": "EXPIRED", "count": 4 }
    ],
    "verificationsOverTime": [
      { "date": "2026-10-08", "total": 24, "verified": 20, "failed": 4 }
    ],
    "challengeBreakdown": [
      { "challenge": "SHOW_LEFT_HAND", "total": 45, "passed": 42, "failed": 3 }
    ]
  }
  ```

## 6. Database Schema & Index Specifications

### Collection: `sessions`
```javascript
{
  sessionId: { type: String, required: true, unique: true, index: true },
  name: { type: String, default: "" },
  aadhaarHash: { type: String, default: "", index: true },
  aadhaarMasked: { type: String, default: "" },
  aadhaarImagePath: { type: String, default: "" },
  aadhaarFacePath: { type: String, default: "" },
  selfieImagePath: { type: String, default: "" },
  faceMatchScore: { type: Number, default: 0 },
  challenge: { 
    type: String, 
    enum: ["SHOW_LEFT_HAND", "SHOW_RIGHT_HAND", "TURN_HEAD_LEFT", "TURN_HEAD_RIGHT", ""], 
    default: "" 
  },
  attempts: { type: Number, default: 0 },
  status: { 
    type: String, 
    enum: ["PENDING", "FACE_VERIFIED", "VERIFIED", "FAILED", "EXPIRED"], 
    default: "PENDING",
    index: true 
  },
  ipAddress: { type: String, default: "" },
  userAgent: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null }
}
```

### Collection: `auditevents`
```javascript
{
  sessionId: { type: String, required: true, index: true },
  type: { 
    type: String, 
    required: true, 
    enum: [
      "SESSION_CREATED", 
      "FACE_COMPARED", 
      "CHALLENGE_ATTEMPTED", 
      "SESSION_VERIFIED", 
      "SESSION_FAILED", 
      "SESSION_EXPIRED"
    ],
    index: true 
  },
  message: { type: String, default: "" },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now, index: true }
}
```

## 7. Security & Compliance Architecture

1. **Aadhaar Privacy (Zero Plaintext Policy)**:
   - Plaintext 12-digit Aadhaar numbers are never written to disk or database records.
   - Distinct applicant detection uses salted cryptographic hashing: `crypto.createHash('sha256').update(PEPPER + ':' + digits).digest('hex')`.
   - Display fields strictly enforce masking: `XXXX XXXX [last 4 digits]`.

2. **Timing-Safe Admin Authentication**:
   - The admin token is verified via `crypto.timingSafeEqual` comparing equalized buffer lengths, mitigating timing attack vectors.

3. **Rate Limiting**:
   - `uploadLimiter`: 15 requests per 15 min per IP.
   - `verificationLimiter`: 30 requests per 5 min per IP.
   - `adminLimiter`: 200 requests per 5 min per IP.

4. **Ephemeral Media Storage**:
   - Biometric files are immediately deleted via `fs.unlinkSync` when a session transitions to `VERIFIED`, `FAILED`, or `EXPIRED`.
   - Periodic cron worker removes abandoned session files older than 10 minutes.

## 8. Build and Deployment Instructions

### Backend Setup
```bash
cd backend
npm install
npm run dev
# Optional PII migration script:
npm run migrate:pii
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
# Build production bundle:
npm run build
```
