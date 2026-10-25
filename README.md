# Automated Video KYC Verification System

[![React](https://img.shields.io/badge/React-19.2-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.0-646CFF?style=flat&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.3-38B2AC?style=flat&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.19-000000?style=flat&logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas_%26_Local-47A248?style=flat&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-Hands_%26_FaceMesh-0078D4?style=flat&logo=google&logoColor=white)](https://developers.google.com/mediapipe)
[![Recharts](https://img.shields.io/badge/Recharts-2.15-22b5bf?style=flat)](https://recharts.org/)

An enterprise-grade, automated **Video KYC (Know Your Customer) Verification Platform** architected with a full-stack applicant verification pipeline, first-class MongoDB database engineering, multi-document ACID transactions, cryptographic tamper-evident audit trails, and a real-time compliance administration portal.

---

## 📑 Table of Contents

- [Overview & Architecture](#-overview--architecture)
- [Key Features](#-key-features)
  - [1. Applicant Verification Pipeline](#1-applicant-verification-pipeline)
  - [2. Database as a First-Class Citizen](#2-database-as-a-first-class-citizen)
  - [3. Cryptographic Tamper-Evident Audit Trail](#3-cryptographic-tamper-evident-audit-trail)
  - [4. PII Protection & Ephemeral Biometric Security](#4-pii-protection--ephemeral-biometric-security)
  - [5. Admin Intelligence Portal](#5-admin-intelligence-portal)
  - [6. High-Performance Benchmarking Suite](#6-high-performance-benchmarking-suite)
- [System Architecture & Flow](#-system-architecture--flow)
- [Tech Stack](#-tech-stack)
- [Repository Structure](#-repository-structure)
- [Quickstart & Setup](#-quickstart--setup)
  - [Prerequisites](#prerequisites)
  - [1. Backend Setup](#1-backend-setup)
  - [2. Frontend Setup](#2-frontend-setup)
  - [3. Running the System](#3-running-the-system)
- [API Reference](#-api-reference)
- [Developer & Demonstration Scripts](#-developer--demonstration-scripts)
- [Documentation Index](#-documentation-index)
- [License & Security Disclaimer](#-license--security-disclaimer)

---

## 🌟 Overview & Architecture

Modern identity verification requires rigorous document validation, biometric comparison, anti-spoofing liveness checks, and airtight compliance auditing. This project delivers an automated end-to-end platform divided into two integrated subsystems:

1. **Applicant Verification Pipeline**: A streamlined, browser-based flow where applicants upload an Aadhaar card (OCR extracts identity details and crops the portrait), capture a live selfie (biometrically matched with Face++ algorithms at $\ge 80\%$ confidence), and satisfy interactive, client-side MediaPipe liveness challenges (gestures/head movements) to foil static image or replay spoofing.
2. **Compliance Admin Intelligence Portal**: A secured management dashboard for compliance officers providing real-time aggregation metrics (verification throughput, pass rates, liveness challenge efficacy), searchable and filterable session records, and an immutable, hash-chained audit event timeline for forensic review.

---

## ⚡ Key Features

### 1. Applicant Verification Pipeline
- **Document Ingestion & OCR**: Drag-and-drop Aadhaar image upload (JPG/PNG, $\le 5\text{MB}$) with automatic text extraction (via Google Gemini 2.5 Flash with Google Cloud Vision fallback) and bounding-box face cropping via Jimp.
- **Biometric Face Matching**: Compares live selfie captures against cropped document portraits using Face++ facial recognition. Verification passes at confidence scores $\ge 80\%$.
- **Real-Time Client-Side Liveness Detection**: Employs Google MediaPipe (`@mediapipe/hands` and `@mediapipe/face_mesh`) directly in the browser to detect dynamic user responses (e.g., thumbs up, peace sign, open palm, head turn left/right) within a 20-second window.
- **State Machine Resilience**: Enforces deterministic state transitions (`PENDING` $\rightarrow$ `FACE_VERIFIED` $\rightarrow$ `VERIFIED` / `FAILED` / `EXPIRED`) with rate-limited endpoints and atomic concurrency controls.

### 2. Database as a First-Class Citizen
- **Multi-Document ACID Transactions**: Dynamic detection of MongoDB Atlas / Replica Set environments via administrative `hello` commands (`isReplicaSet()`). When active, state changes and audit events are committed atomically inside `mongoose.startSession()` and `withTransaction(...)` blocks.
- **Graceful Non-Transactional Fallback**: Gracefully falls back to atomic conditional operations (`findOneAndUpdate`) on standalone local MongoDB instances without crashing.
- **Optimized Compound Indexing**: High-performance indexes on `sessionId` (unique), compound `{ status: 1, createdAt: 1 }`, `{ faceMatchScore: -1 }`, normalized `{ nameLower: 1 }`, and `{ aadhaarMasked: 1 }`.
- **Atomic Concurrency & Race Condition Elimination**: Prevents concurrent request overwrites and double-challenge submissions using strict conditional status filters.

### 3. Cryptographic Tamper-Evident Audit Trail
- **Append-Only Event Ledger**: Dedicated `AuditEvent` collection recording every lifecycle transition (`SESSION_CREATED`, `FACE_COMPARED`, `CHALLENGE_ATTEMPTED`, `SESSION_VERIFIED`, etc.).
- **SHA-256 Hash Chaining**: Every audit entry computes a deterministic cryptographic hash incorporating its sequence index, session ID, action, timestamp, metadata payload, and the preceding record's hash (`prevHash`):
  $$\text{hash} = \text{SHA256}(\text{sequence} \parallel \text{sessionId} \parallel \text{action} \parallel \text{prevHash} \parallel \text{timestamp})$$
- **Database-Level Immutability**: Mongoose pre-hooks block `updateOne`, `updateMany`, `deleteOne`, and `deleteMany` operations on the `auditevents` collection, preventing historical tampering.
- **Chain Verification**: The admin verification detail endpoint verifies the entire cryptographic chain on-the-fly and alerts operators if any record has been modified out-of-band.

### 4. PII Protection & Ephemeral Biometric Security
- **Salted Peppered Aadhaar Hashing**: Aadhaar numbers are never stored in recoverable plaintext. The backend hashes numbers using SHA-256 combined with a secret server-side pepper (`sha256(PEPPER:digits)`), enabling duplicate applicant detection without exposing sensitive PII.
- **Display Masking**: Only masked representations (`XXXX XXXX 1234`) are retained in the database and returned to clients.
- **Ephemeral Media Sweeping**: Uploaded Aadhaar cards, cropped face portraits, and live selfie captures are strictly ephemeral. Upon terminal session states (`VERIFIED`, `FAILED`, `EXPIRED`), all media files are permanently unlinked from disk by the cleanup worker, while preserving the non-PII compliance record and audit chain.
- **Automated Expiry Worker**: A background cron runs every 2 minutes in `server.js` to expire stale sessions older than 10 minutes and sweep orphaned media files.

### 5. Admin Intelligence Portal
- **Timing-Safe Authentication**: Protected by a shared administrative bearer token validated via `crypto.timingSafeEqual` to eliminate timing-attack vulnerabilities.
- **Aggregation Analytics**: Native MongoDB aggregation pipelines compute aggregate statistics:
  - Total verifications, distinct applicant count, overall pass rate, and challenge success ratios.
  - 30-day historical verification volume trends.
  - Verification status distribution (`VERIFIED`, `FAILED`, `EXPIRED`, `PENDING`).
  - Liveness challenge type breakdown and attempt outcomes.
- **Interactive Visualizations**: Dynamic charts rendered using **Recharts** (Area charts, Bar charts, Pie charts).
- **Searchable Verification Explorer**: Paginated record explorer supporting regex search over applicant names and masked Aadhaar numbers, with status filtering and audit timeline inspection.

### 6. High-Performance Benchmarking Suite
- **Stress-Tested at Scale**: Comprehensive benchmark harness capable of seeding 10,000 to 500,000+ synthetic verification records using native driver batch insertions.
- **Index Performance Validation**: Rigorous statistical benchmarking (median execution time, $P_{95}$, $P_{99}$) validating exponential performance gains of indexed queries (`IXSCAN`) versus unindexed scans (`COLLSCAN`).
- **Hard Database Isolation**: Built-in guardrails in `benchDb.js` enforce dedicated benchmark database connections (`kyc-benchmark`), strictly preventing accidental contamination of production data.

---

## 🔄 System Architecture & Flow

```text
       +-------------------------------------------------------------+
       |                  APPLICANT BROWSER (React)                  |
       +-------------------------------------------------------------+
              |                                            |
   1. Upload Aadhaar Image                     4. Live Selfie Capture &
              |                                   MediaPipe Liveness
              v                                            v
+--------------------------------------------------------------------+
|                         KYC BACKEND (Express)                      |
|                                                                    |
|  [Rate Limiter] ---> [Multer / Jimp] ---> [OCR / Face Detection]   |
|                                                                    |
|  * Mask Aadhaar: "XXXX XXXX 1234"                                  |
|  * Salted Hash:  SHA256(PEPPER:digits)                             |
|  * Face Match:   Face++ Biometric Score >= 80%                     |
|  * Audit Logger: Cryptographic SHA-256 Hash Chaining               |
|  * Media Purge:  Unlink temporary files on terminal states        |
+--------------------------------------------------------------------+
              |                                            ^
   2. Multi-Document ACID                      5. Query & Aggregation
      Transactions (Atlas)                        Pipelines
              v                                            |
+--------------------------------------------------------------------+
|                       MONGODB / MONGODB ATLAS                      |
|                                                                    |
|   Collections:                                                     |
|     * `sessions`     -> Salted hash, masked PII, status, indexes   |
|     * `auditevents`  -> Immutable, sequential cryptographic chain  |
+--------------------------------------------------------------------+
                                                           ^
                                                           |
                                               6. Bearer Token Auth
                                                           |
       +-------------------------------------------------------------+
       |             COMPLIANCE ADMIN PORTAL (Recharts UI)           |
       +-------------------------------------------------------------+
```

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: React 19 + Vite 8
- **Routing**: React Router 7 (`react-router-dom`)
- **Styling**: Tailwind CSS 4 + Custom Glassmorphism UI tokens
- **Data Visualization**: Recharts 2.15
- **Computer Vision & ML**: Google MediaPipe (`@mediapipe/hands`, `@mediapipe/face_mesh`), `react-webcam`
- **HTTP Client**: Axios (Public API client + Authenticated `adminApi` interceptor)
- **Icons**: Lucide React

### Backend
- **Runtime**: Node.js 18+ & Express 4.19
- **Database**: MongoDB 6.0+ & Mongoose 8.3 (MongoDB Atlas Replica Set or local MongoDB)
- **OCR Engine**: Google Gemini 2.5 Flash (`@google/genai`) / Google Cloud Vision API with Mock fallback
- **Biometric Face Service**: Face++ Cognitive Services (Detection, Cropping, Biometric Comparison)
- **Image Processing**: Jimp (bounding box cropping & padding)
- **Security & Cryptography**: Node `crypto` (SHA-256 peppered hashing, timing-safe equality, UUIDs)
- **File Uploads**: Multer with strict MIME and size limits
- **Traffic Control**: Express Rate Limit

---

## 📁 Repository Structure

```text
KYC/
├── README.md                           # Master Project Documentation (You are here)
├── BACKEND_DOCUMENTATION.md            # In-depth Backend Architectural Guide
├── PRODUCT_REQUIREMENTS_DOCUMENT.md    # Product Requirements & User Stories
├── TECHNICAL_REQUIREMENTS_DOCUMENT.md  # Detailed Technical & Security Specifications
├── PROJECT_WALKTHROUGH.md              # Step-by-Step Functional Walkthrough
├── db.md                               # MongoDB Architecture, Indexes & Transaction Specs
├── summary.md                          # Executive System Summary
│
├── backend/                            # Express REST API & Database Services
│   ├── config/
│   │   └── db.js                       # MongoDB Atlas & Replica Set Connection Manager
│   ├── controllers/
│   │   ├── kycController.js            # Applicant Verification Lifecycle & ACID Handlers
│   │   └── adminController.js          # Admin Dashboard & Aggregation Analytics
│   ├── middleware/
│   │   └── adminAuth.js                # Timing-Safe Bearer Token Guard
│   ├── models/
│   │   ├── Session.js                  # Verification Session Schema & Atlas Indexes
│   │   └── AuditEvent.js               # Immutable Tamper-Evident Audit Trail Schema
│   ├── routes/
│   │   ├── kycRoutes.js                # Public KYC Endpoints & Rate Limits
│   │   └── adminRoutes.js              # Protected Admin Endpoints & Rate Limits
│   ├── services/
│   │   ├── ocrService.js               # Gemini / Vision / Mock OCR Extraction
│   │   ├── faceService.js              # Face++ Detection, Jimp Crop & Face Match
│   │   └── auditService.js             # Cryptographic Hash Chaining Audit Logger
│   ├── scripts/                        # Database, Testing & Benchmark CLI Tools
│   │   ├── acidDemo.js                 # Multi-Document ACID Transaction Demo
│   │   ├── demoRollback.js             # Transaction Rollback (abortTransaction) Demo
│   │   ├── tamperDemo.js               # Mongoose Immutability & Tamper Detection Demo
│   │   ├── raceDemo.js                 # High-Concurrency Race Condition Stress Test
│   │   ├── seedBenchmark.js            # Batch Synthetic Data Seeding (10k-500k records)
│   │   ├── benchmark.js                # Query Optimization & Index Benchmark Suite
│   │   ├── backup.js                   # Direct Native Driver MongoDB BSON Backup Tool
│   │   ├── migratePII.js               # Salted Hash & PII Backfill Migration
│   │   ├── migrateAuditChain.js        # Retroactive Audit Hash Chaining Migration
│   │   └── lib/benchDb.js              # Hard DB Isolation Helper for Benchmarks
│   ├── uploads/                        # Ephemeral Storage (Auto-cleared on completion)
│   ├── server.js                       # Express App Entry & Expiry/Cleanup Cron
│   ├── package.json                    # Backend Dependencies & Scripts
│   └── .env.example                    # Backend Environment Template
│
└── frontend/                           # React 19 + Vite Application
    ├── src/
    │   ├── api.js                      # Axios Instances (Public & Authenticated)
    │   ├── App.jsx                     # Route Definitions & RequireAdmin Guard
    │   ├── index.css                   # Glassmorphism Design Tokens & Tailwind Directives
    │   ├── pages/
    │   │   ├── UploadPage.jsx          # Page 1: Drag-and-Drop Aadhaar Upload
    │   │   ├── VerificationPage.jsx    # Page 2: Webcam Selfie & MediaPipe Liveness
    │   │   ├── ResultPage.jsx          # Page 3: Verification Outcome & Diagnostics
    │   │   └── admin/
    │   │       ├── AdminLoginPage.jsx        # Admin Token Authentication
    │   │       ├── AdminDashboardPage.jsx    # KPI Cards, Recharts & Verification Table
    │   │       └── VerificationDetailPage.jsx # Session Inspection & Audit Chain Viewer
    │   └── components/                 # Reusable UI & Layout Components
    ├── package.json                    # Frontend Dependencies & Scripts
    ├── README.md                       # Frontend-Specific Readme
    └── .env.example                    # Frontend Environment Template
```

---

## 🚀 Quickstart & Setup

### Prerequisites
- **Node.js**: `v18.0.0` or higher
- **npm**: `v9.0.0` or higher
- **MongoDB**: Local MongoDB instance (`mongodb://localhost:27017`) OR a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster connection string.

---

### 1. Backend Setup

1. Open your terminal and navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install backend dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env
   ```

4. Edit `backend/.env` with your settings:
   ```env
   PORT=5000
   DB_NAME=kyc-verification
   MONGODB_URI=mongodb://localhost:27017/kyc-verification
   
   # Enable Mock Mode for full testing without external API keys
   MOCK_MODE=true

   # Shared Admin Secret for /admin portal login
   ADMIN_TOKEN=your-secure-admin-token-here

   # Server-side Pepper for salted Aadhaar hashing
   AADHAAR_HASH_PEPPER=your-secure-pepper-secret-here

   # External APIs (Optional when MOCK_MODE=true)
   GEMINI_API_KEY=
   GOOGLE_VISION_API_KEY=
   FACEPLUSPLUS_API_KEY=
   FACEPLUSPLUS_API_SECRET=
   ```

---

### 2. Frontend Setup

1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install frontend dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables (optional for local development, defaults to `http://localhost:5000`):
   ```bash
   cp .env.example .env
   ```

---

### 3. Running the System

#### Start Backend
In the `backend` directory:
```bash
npm run dev
# Server running on port 5000
# [MongoDB]: Connected to MongoDB at localhost / kyc-verification
```

#### Start Frontend
In the `frontend` directory:
```bash
npm run dev
# Local: http://localhost:5173/
```

Open `http://localhost:5173` in a modern browser (Google Chrome or Microsoft Edge recommended for webcam and MediaPipe support).

---

## 📡 API Reference

### Public Applicant Endpoints

| Method | Endpoint | Description | Key Parameters / Payload |
|---|---|---|---|
| `POST` | `/api/upload-aadhaar` | Uploads Aadhaar card, runs OCR, crops face, creates session | Multipart file (`aadhaar`, $\le 5\text{MB}$) |
| `GET` | `/api/session/:sessionId` | Fetches active verification session details | URL parameter: `sessionId` |
| `POST` | `/api/verify-face` | Compares live selfie against cropped document face | JSON: `{ sessionId, selfieImage: "<base64>" }` |
| `POST` | `/api/verify-challenge` | Validates completion of liveness gesture challenge | JSON: `{ sessionId, challengeType, status }` |
| `GET` | `/api/result/:sessionId` | Retrieves final verification outcome and diagnostic metrics | URL parameter: `sessionId` |
| `GET` | `/health` | Backend health check | None |

### Protected Admin Endpoints

All admin endpoints require the header `Authorization: Bearer <ADMIN_TOKEN>`.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/admin/verify` | Validates admin bearer token for portal login |
| `GET` | `/api/admin/stats` | Aggregated metrics: throughput, distinct applicants, pass rate, Recharts data |
| `GET` | `/api/admin/verifications` | Filterable, paginated session explorer (`?page=1&limit=10&status=...&search=...`) |
| `GET` | `/api/admin/verifications/:sessionId` | Deep inspection of single session + cryptographic audit event chain |

---

## 💻 Developer & Demonstration Scripts

The `backend/scripts/` directory provides interactive demonstration and benchmark utilities:

```bash
# 1. Demonstrate MongoDB Multi-Document ACID Transactions
node scripts/acidDemo.js

# 2. Demonstrate Transaction Rollback (abortTransaction) on failures
node scripts/demoRollback.js

# 3. Verify Mongoose Pre-Hook Immutability and Audit Tamper Detection
node scripts/tamperDemo.js

# 4. Stress-Test Concurrency and Atomic Status Locking
node scripts/raceDemo.js

# 5. Seed Synthetic Verification Records for Performance Testing
node scripts/seedBenchmark.js --count=50000

# 6. Run the MongoDB Indexing & Query Benchmarking Suite
node scripts/benchmark.js

# 7. Perform Native Driver BSON/EJSON Database Backup
node scripts/backup.js

# 8. Migrate Legacy Sessions to Salted Hashed PII
npm run migrate:pii
```

---

## 📚 Documentation Index

For comprehensive architectural specifications and implementation walkthroughs, explore the project documentation:

- 📖 **[Database Architecture & Workflow (`db.md`)](file:///c:/Users/Aryan%20Anand/OneDrive/Desktop/KYC/db.md)**: Deep dive into MongoDB Atlas replica set detection, schema indexes, ACID transactions, and audit chaining.
- ⚙️ **[Backend Documentation (`BACKEND_DOCUMENTATION.md`)](file:///c:/Users/Aryan%20Anand/OneDrive/Desktop/KYC/BACKEND_DOCUMENTATION.md)**: Exhaustive guide to controllers, services, error handling, rate limiting, and security implementations.
- 📋 **[Product Requirements Document (`PRODUCT_REQUIREMENTS_DOCUMENT.md`)](file:///c:/Users/Aryan%20Anand/OneDrive/Desktop/KYC/PRODUCT_REQUIREMENTS_DOCUMENT.md)**: Functional and non-functional requirements, user personas, and acceptance criteria.
- 📐 **[Technical Requirements Document (`TECHNICAL_REQUIREMENTS_DOCUMENT.md`)](file:///c:/Users/Aryan%20Anand/OneDrive/Desktop/KYC/TECHNICAL_REQUIREMENTS_DOCUMENT.md)**: Engineering constraints, data integrity contracts, and compliance controls.
- 🚶 **[Project Walkthrough (`PROJECT_WALKTHROUGH.md`)](file:///c:/Users/Aryan%20Anand/OneDrive/Desktop/KYC/PROJECT_WALKTHROUGH.md)**: Complete step-by-step feature walkthrough covering UI flows, MediaPipe integration, and admin portal screens.

---

## ⚖️ License & Security Disclaimer

This project is created for demonstration, educational, and technical evaluation purposes. 

> [!IMPORTANT]
> - Aadhaar identity numbers are processed exclusively for OCR extraction and masked verification demonstration; this prototype does not connect directly to the UIDAI CIDR or government Aadhaar verification APIs.
> - In production environments, replace the single shared `ADMIN_TOKEN` with enterprise Identity Provider (IdP) authentication (e.g., OAuth 2.0 / OIDC / SAML), enforce role-based access control (RBAC), enable encrypted persistent storage (AWS S3 with KMS), and conduct formal regulatory compliance assessments.
