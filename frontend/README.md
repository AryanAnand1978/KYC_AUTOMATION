# Video KYC Verification - Frontend Application

Modern React 19 single-page application built with Vite, Tailwind CSS, Lucide Icons, Recharts, and MediaPipe for automated identity verification and administrative compliance oversight.

---

## 🚀 Features

- **Aadhaar Document Upload**: Drag-and-drop file upload with client-side format and file size validation.
- **Biometric Webcam Capture**: High-resolution webcam capture via `react-webcam` with facial alignment guidelines.
- **Client-Side Liveness Detection**: Real-time physical action detection (hand gestures and head turns) powered by Google MediaPipe (`@mediapipe/hands`, `@mediapipe/face_mesh`).
- **Audit Diagnostic Results**: Clear visual feedback on verification status with detailed score and timestamp breakdowns.
- **Secured Admin Intelligence Portal**:
  - Bearer token authentication with local session caching.
  - Interactive KPI cards for throughput, distinct applicants, pass rate, and challenge success ratios.
  - Dynamic data visualizations powered by **Recharts** (30-day volume trends, status breakdown, and challenge outcome charts).
  - Searchable, filterable, and paginated Verifications Explorer.
  - Per-verification detail page rendering session metadata and append-only audit event timelines.

---

## 🧭 Application Routes

| Path | Component | Access | Description |
| :--- | :--- | :---: | :--- |
| `/` | `UploadPage` | Public | Upload Aadhaar card and initialize verification session |
| `/verify/:sessionId` | `VerificationPage` | Public | Capture selfie, run face match, and execute liveness challenge |
| `/result/:sessionId` | `ResultPage` | Public | View final verification outcome and diagnostic metrics |
| `/admin` | `AdminLoginPage` | Public | Submit shared admin access key to log into dashboard |
| `/admin/dashboard` | `AdminDashboardPage` | Protected | KPI summary cards, Recharts visualizations, and filterable table |
| `/admin/verifications/:sessionId` | `VerificationDetailPage` | Protected | Detailed session inspection and full chronological audit timeline |

---

## 🛠️ Tech Stack

- **Framework**: React 19 + Vite 8
- **Routing**: React Router 7 (`react-router-dom`)
- **Styling**: Tailwind CSS 4 + Custom Glassmorphism UI tokens
- **Data Visualization**: Recharts 2
- **Camera & ML**: `react-webcam`, `@mediapipe/camera_utils`, `@mediapipe/hands`, `@mediapipe/face_mesh`
- **Networking**: Axios (dual public and authenticated `adminApi` instances)
- **Icons**: Lucide React

---

## ⚙️ Configuration & Setup

Create a `.env` file in the `frontend` root:

```env
VITE_API_URL=http://localhost:5000
```

### Installation & Run

```bash
# Install dependencies
npm install

# Start Vite dev server
npm run dev

# Build production bundle
npm run build
```
