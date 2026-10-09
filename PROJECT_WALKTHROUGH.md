# Automated Video KYC Verification System - Project Walkthrough

## 1. Project Overview

This project is an automated Video KYC verification system featuring two tightly integrated subsystems:
1. **Applicant Verification Pipeline**: Simulates a production identity verification flow where a user uploads an Aadhaar card, the system extracts identity details via OCR, verifies the document face against a live webcam selfie, and executes a real-time browser-side liveness challenge to eliminate static spoofing risks.
2. **Admin Intelligence & Audit Dashboard**: A secured administrative portal where compliance operators can inspect high-level verification analytics (status distribution, pass rates, 30-day volume trends, challenge breakdown), search and filter historical records, and inspect append-only audit event timelines for every verification session.

The application is architected across two tiers:
- **Frontend**: React application built with Vite and Tailwind CSS. It handles the applicant UI, camera streams, MediaPipe liveness challenges, Recharts analytics, admin login, and the verification audit explorer.
- **Backend**: Node.js and Express API backed by MongoDB. It manages file uploads, OCR, face detection/comparison, session state machines, salted SHA-256 PII protection, append-only `AuditEvent` logging, timing-safe admin bearer authentication, and aggregation-driven analytics pipelines.

The applicant workflow follows a staged verification model:
1. Aadhaar card image is uploaded.
2. OCR extracts name and Aadhaar number.
3. Face is detected and cropped from the Aadhaar image.
4. A verification session is initialized with a unique UUID, and a verification link is returned.
5. User opens the verification page and captures a live selfie.
6. Biometric comparison matches the Aadhaar face against the live selfie.
7. If the face match passes (>= 80%), a random liveness challenge is assigned.
8. Browser-side MediaPipe validates the physical challenge in real time.
9. Backend stores final status (`VERIFIED`, `FAILED`, or `EXPIRED`), unlinks temporary media files, and logs terminal audit events.
10. The compliance admin can log into `/admin` to review the verification record, audit events, and system-wide analytics.

---

## 2. Why This Project Was Planned This Way

Real-world KYC and identity platforms require more than a basic upload form or disposable verification script. They require:
- **Document Validation**: Confirming identity credentials with OCR.
- **Biometric Matching**: Verifying that the person in front of the lens matches the document photo.
- **Liveness Proof**: Proving physical presence in real-time to defeat presentation attacks.
- **Privacy-Preserving Database Persistence**: The database is a first-class citizen. Rather than storing sensitive plaintext Aadhaar numbers, the database stores display-masked values (`XXXX XXXX 1234`) and salted SHA-256 hashes (`sha256(PEPPER:digits)`) to identify distinct applicants safely.
- **Auditability & Observability**: Every lifecycle milestone (`SESSION_CREATED`, `FACE_COMPARED`, `CHALLENGE_ATTEMPTED`, `SESSION_VERIFIED`, etc.) is recorded to an append-only `AuditEvent` collection, allowing operators to investigate drop-offs and compliance issues.
- **Administrative Intelligence**: Operators need high-level oversight into pass rates, face scores, daily throughput, and challenge failure rates through aggregation pipelines and responsive charts.

This planning maintains clean separation of concerns:
- Frontend owns camera interaction, landmark detection, and rich data visualization.
- Backend owns business logic, security barriers, rate limiting, and database integrity.

---

## 3. Tech Stack and Why It Was Used

### Frontend

- **React 19 & Vite 8**: Fast development, minimal bundle overhead, and declarative state management for step-by-step verification flows.
- **React Router 7**: Handles client routing between applicant screens (`/`, `/verify/:sessionId`, `/result/:sessionId`) and protected admin screens (`/admin`, `/admin/dashboard`, `/admin/verifications/:sessionId`) with route guards.
- **Tailwind CSS 4**: Rapid, consistent UI styling with dark-mode aesthetic and custom glassmorphism components (`glass-card`, `btn-primary`, status badges).
- **Lucide React**: Clean iconography for status indicators, camera controls, security badges, and dashboard metrics.
- **React Webcam**: Native browser camera capture for live selfie acquisition and liveness video streaming.
- **MediaPipe (Hands & Face Mesh)**: Loaded via CDN to run browser-side machine learning for real-time gesture and head rotation tracking without heavy WASM build headaches.
- **Recharts**: Flexible, responsive React charting library powering the admin dashboard (30-day verification trends, status distributions, and challenge success ratios).
- **Axios**: Dual HTTP client architecture—a public instance for applicant flows and an authenticated `adminApi` instance with bearer token request interceptors.

### Backend

- **Node.js & Express 4**: Lightweight REST API server managing multipart uploads, image manipulation, external API communications, and administrative queries.
- **MongoDB & Mongoose 8**: Document database storing persistent verification records (`sessions`) and append-only lifecycle event logs (`auditevents`).
- **Node `crypto`**: Generates cryptographically secure session UUIDs, computes salted SHA-256 Aadhaar hashes with server pepper, and executes timing-safe admin bearer token verification (`crypto.timingSafeEqual`).
- **Multer**: Handles file uploads with strict format validation (JPG/PNG) and size limits (5MB).
- **Jimp**: Handles image cropping with bounding box padding around faces detected in document images.
- **Face++ API**: Provides face detection, coordinate extraction, and biometric comparison confidence scores.
- **Google Gemini 2.5 Flash / Vision OCR**: High-accuracy text extraction from Aadhaar cards, with built-in Mock Mode for offline demonstrations.
- **Express Rate Limit**: Prevents brute-forcing on upload endpoints, verification APIs, and administrative routes.

---

## 4. Folder Structure

```text
KYC/
  backend/
    config/
      db.js                     # MongoDB connection logic
    controllers/
      kycController.js          # Applicant verification logic & lifecycle
      adminController.js        # Admin query, search & aggregation analytics
    middleware/
      adminAuth.js              # Timing-safe Bearer token guard
    models/
      Session.js                # Core session schema (salted hash, masked PII, status)
      AuditEvent.js             # Append-only audit logging schema
    routes/
      kycRoutes.js              # Public KYC endpoints & rate limiting
      adminRoutes.js            # Protected admin endpoints & rate limiting
    services/
      ocrService.js             # Gemini / Vision / Mock OCR extraction
      faceService.js            # Face++ detect & compare, Jimp face cropping
      auditService.js           # Asynchronous fire-and-forget audit event logger
    scripts/
      migratePII.js             # Migration script for backfilling salted hashes
    uploads/                    # Ephemeral biometric storage (purged on completion)
      aadhaar/
      selfies/
    server.js                   # Main application driver & cleanup worker

  frontend/
    src/
      api.js                    # Public and authenticated Axios clients
      App.jsx                   # Main layout, route definitions & RequireAdmin guard
      main.jsx                  # React application entry point
      index.css                 # Tailwind directives and custom component styles
      pages/
        UploadPage.jsx          # Drag-and-drop Aadhaar upload & session creation
        VerificationPage.jsx    # Live webcam selfie & MediaPipe liveness challenge
        ResultPage.jsx          # Non-destructive result summary & diagnostics
        admin/
          AdminLoginPage.jsx        # Admin token login screen
          AdminDashboardPage.jsx    # KPI metrics, Recharts trends & filterable table
          VerificationDetailPage.jsx # Session deep-dive with chronological audit timeline
```

---

## 5. Frontend Walkthrough & Pages

### 1. `UploadPage.jsx` (`/`)
- Accepts drag-and-drop or file picker upload of Aadhaar document.
- Validates file type (JPG/PNG) and file size (< 5MB).
- Calls `POST /api/upload-aadhaar`.
- Displays extracted applicant name and masked Aadhaar number (`XXXX XXXX 9012`).
- Renders the generated verification link with a one-click copy button.

### 2. `VerificationPage.jsx` (`/verify/:sessionId`)
- Reads `sessionId` from URL parameters and fetches session status from `GET /api/session/:sessionId`.
- **Phase 1 (Face Match)**: Streams webcam video, captures selfie frame, and posts to `POST /api/verify-face`. Receives biometric match confidence and assigns a dynamic challenge upon success.
- **Phase 2 (Liveness Challenge)**: Initializes client-side MediaPipe models (Hands for hand gestures; Face Mesh for head turns). Displays visual guides, progress counter, and a 20-second countdown timer.
- Submits challenge outcome to `POST /api/verify-challenge`. Handles 1 retry attempt upon failure, or transitions to the result screen on terminal completion.

### 3. `ResultPage.jsx` (`/result/:sessionId`)
- Fetches final state from `GET /api/result/:sessionId`.
- Displays clear status badges (`VERIFIED`, `FAILED`, `EXPIRED`).
- Renders detailed audit diagnostics: Match Score, Challenge Type, Attempts Count, and Timestamps.

### 4. `AdminLoginPage.jsx` (`/admin`)
- Form interface where compliance operators submit the shared admin access key.
- Validates key against `GET /api/admin/verify`.
- Caches token in `localStorage` and redirects to `/admin/dashboard`.

### 5. `AdminDashboardPage.jsx` (`/admin/dashboard`)
- Guarded by `RequireAdmin`.
- **Top KPI Cards**: Total Verifications, Distinct Applicants (by salted hash), Verification Pass Rate, Average Face Match Score, Challenge Success Rate, and Today's Volume.
- **Analytics Visualizations (Recharts)**:
  - 30-Day verification throughput AreaChart (Total, Verified, Failed).
  - Status breakdown BarChart across all lifecycle states.
  - Challenge variant performance BarChart comparing attempts vs passes.
- **Verifications Explorer**:
  - Regex search input (by name or masked Aadhaar).
  - Status filter dropdown (`ALL`, `PENDING`, `FACE_VERIFIED`, `VERIFIED`, `FAILED`, `EXPIRED`).
  - Date range filters (`from` and `to`).
  - Sorting options (`newest`, `oldest`, `score`).
  - Paginated table showing session IDs, applicants, match scores, statuses, and quick links to detail views.

### 6. `VerificationDetailPage.jsx` (`/admin/verifications/:sessionId`)
- Displays complete session record details: Session ID, Masked Aadhaar, Salted SHA-256 Hash, Biometric Score, Client IP Address, User Agent, and Completion Dates.
- Renders an interactive chronological timeline of every `AuditEvent` recorded for this verification.

---

## 6. Backend Walkthrough & Core Mechanics

### 1. Ephemeral Media Cleanup
- Temporary biometric images on disk are automatically deleted when a session reaches a terminal state (`VERIFIED`, `FAILED`, `EXPIRED`).
- A background worker runs every 2 minutes in `server.js`, finding sessions older than 10 minutes and purging their media files.

### 2. Privacy-First PII Handling
- Zero plaintext Aadhaar numbers are stored in MongoDB.
- Display numbers are masked: `XXXX XXXX 1234`.
- For duplicate detection and distinct applicant metrics, the backend computes a salted SHA-256 digest: `crypto.createHash('sha256').update(PEPPER + ':' + digits).digest('hex')`.

### 3. Append-Only Audit Trail
- Every critical event triggers `auditService.logEvent(sessionId, type, message, meta)`.
- Logged types: `SESSION_CREATED`, `FACE_COMPARED`, `CHALLENGE_ATTEMPTED`, `SESSION_VERIFIED`, `SESSION_FAILED`, `SESSION_EXPIRED`.
- Runs asynchronously without blocking client responses.

### 4. MongoDB Aggregation Analytics
- Admin statistics (`GET /api/admin/stats`) run in parallel via native MongoDB aggregation pipelines:
  - `$group` by `$status` for status counts.
  - `$match` on non-zero scores with `$avg` for face match accuracy.
  - `$group` on `$aadhaarHash` with `$count` for distinct applicants.
  - `$dateToString` grouping on `$createdAt` for 30-day volume trends.
  - Aggregation on `AuditEvent` collection to evaluate challenge-specific pass/fail rates.

### 5. Timing-Safe Admin Authentication
- Admin endpoints require an `Authorization: Bearer <ADMIN_TOKEN>` header.
- `adminAuth.js` compares the bearer token using `crypto.timingSafeEqual` with buffer padding to prevent timing analysis attacks.

---

## 7. End-to-End Data Flow

```text
[ APPLICANT FLOW ]
User uploads Aadhaar Image
       |
       v
POST /api/upload-aadhaar ----> OCR & Face Crop ----> Store Session (Salted Hash + Masked)
                                               ----> Log SESSION_CREATED in auditevents
       |
       v
Frontend opens /verify/:sessionId
       |
       v
POST /api/verify-face   ----> Biometric Comparison (Face++) ----> If score >= 80, assign Challenge
                                                            ----> Log FACE_COMPARED in auditevents
       |
       v
POST /api/verify-challenge -> Evaluate MediaPipe Action     ----> If passed, set VERIFIED
                                                            ----> Log CHALLENGE_ATTEMPTED & SESSION_VERIFIED
                                                            ----> Delete biometric media from disk
       |
       v
Redirect to /result/:sessionId

-------------------------------------------------------------------------------------------------

[ ADMIN COMPLIANCE FLOW ]
Operator enters Admin Key at /admin
       |
       v
GET /api/admin/verify   ----> Timing-safe token comparison (200 OK)
       |
       v
Open /admin/dashboard
       |
       +---> GET /api/admin/stats ---------> MongoDB Aggregation Pipelines -> Recharts KPI Visuals
       |
       +---> GET /api/admin/verifications -> Filter & Paginate Sessions    -> Records Table
       |
       v
Click Record -> Open /admin/verifications/:sessionId
       |
       v
GET /api/admin/verifications/:sessionId ----> Fetch Session Record + Chronological AuditEvent Trail
```

---

## 8. API Summary

### Public Applicant Endpoints

| Method | Endpoint | Rate Limit | Purpose |
| :--- | :--- | :---: | :--- |
| `POST` | `/api/upload-aadhaar` | 15 / 15 min | Upload Aadhaar, extract data, crop face, initialize session |
| `GET` | `/api/session/:sessionId` | None | Fetch active session details and validate 10-min window |
| `POST` | `/api/verify-face` | 30 / 5 min | Compare webcam selfie with Aadhaar crop, assign challenge |
| `POST` | `/api/verify-challenge` | 30 / 5 min | Verify liveness action, manage retry loops, clean media |
| `GET` | `/api/result/:sessionId` | None | Fetch final verification result and diagnostics |
| `GET` | `/health` | None | Health check endpoint |

### Administrative Endpoints (`/api/admin/*`)

| Method | Endpoint | Rate Limit | Purpose |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/admin/verify` | 200 / 5 min | Validate admin bearer token on login |
| `GET` | `/api/admin/verifications` | 200 / 5 min | Search, filter, sort, and paginate verification records |
| `GET` | `/api/admin/verifications/:sessionId` | 200 / 5 min | Fetch single verification record with full audit timeline |
| `GET` | `/api/admin/stats` | 200 / 5 min | Fetch MongoDB-aggregated metrics, trends, and challenge stats |

---

## 9. Interview Talking Points & Demonstration Guide

### Short Project Pitch
> "I built an automated Video KYC verification system with an administrative intelligence and audit portal. On the user side, applicants upload an Aadhaar card, undergo OCR extraction, capture a live selfie for biometric face matching, and complete real-time browser-side liveness challenges powered by MediaPipe. On the backend, we treat the database as a first-class citizen: PII is protected with salted SHA-256 hashing, media files are purged upon terminal states, every action is tracked in an append-only audit event collection, and an admin dashboard surfaces system health through MongoDB aggregation pipelines and interactive Recharts visualizations."

### How to Demo the Complete System
1. **Start Services**:
   ```bash
   # Terminal 1: Backend
   cd backend && npm run dev
   # Terminal 2: Frontend
   cd frontend && npm run dev
   ```
2. **Execute Applicant Journey**:
   - Open `http://localhost:5173`.
   - Upload `sample_aadhaar.png` or a test Aadhaar image.
   - Observe extracted name and masked Aadhaar number.
   - Click the verification link to navigate to `/verify/:sessionId`.
   - Grant camera access, align face, and click **Capture & Compare**.
   - Follow the assigned MediaPipe challenge (e.g. show left hand or turn head).
   - Observe the redirection to the `/result/:sessionId` diagnostic screen.
3. **Execute Admin Journey**:
   - Navigate to `http://localhost:5173/admin`.
   - Enter the admin secret key (from `ADMIN_TOKEN` in `backend/.env`).
   - Explore the **Admin Dashboard**:
     - Review KPI summary cards (Pass rate, total verifications, distinct applicants).
     - Review Recharts graphs (30-day trends, status distribution, challenge outcomes).
   - Use the **Verifications Explorer** to search for the applicant you just verified.
   - Click into the record to inspect the **Verification Detail Page**:
     - Point out the masked Aadhaar, the salted hash, and the client IP address.
     - Walk through the chronological **Audit Event Timeline** demonstrating `SESSION_CREATED`, `FACE_COMPARED`, `CHALLENGE_ATTEMPTED`, and `SESSION_VERIFIED`.
