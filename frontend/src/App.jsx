import React from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import UploadPage from './pages/UploadPage';
import VerificationPage from './pages/VerificationPage';
import ResultPage from './pages/ResultPage';
import AdminLoginPage from './pages/admin/AdminLoginPage';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import VerificationDetailPage from './pages/admin/VerificationDetailPage';
import { getAdminToken } from './api';
import { ShieldCheck, Home } from 'lucide-react';

// Route guard: admin pages require a stored shared-key token.
const RequireAdmin = ({ children }) => {
  return getAdminToken() ? children : <Navigate to="/admin" replace />;
};

const NotFound = () => (
  <div className="w-full max-w-md mx-auto text-center glass-card p-8 animate-fade-in">
    <div className="text-6xl font-extrabold bg-gradient-to-r from-brand-cyan to-brand-blue bg-clip-text text-transparent mb-2">404</div>
    <h2 className="text-xl font-bold text-white mb-2">Page Not Found</h2>
    <p className="text-slate-400 text-sm mb-6">The route you requested does not exist on this node.</p>
    <Link to="/" className="btn-secondary w-full flex items-center justify-center gap-2">
      <Home className="w-4 h-4" />
      <span>Return to Portal</span>
    </Link>
  </div>
);

function App() {
  return (
    <BrowserRouter>
      <div className="flex flex-col min-h-screen">
        {/* Navigation Header */}
        <header className="sticky top-0 z-50 backdrop-blur-md bg-[#0b0f19]/70 border-b border-brand-darkBorder/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2 group">
              <div className="p-2 bg-gradient-to-br from-brand-cyan to-brand-blue rounded-lg text-brand-darkBg shadow-md shadow-brand-cyan/20">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                Identity<span className="text-brand-cyan">Shield</span>
              </span>
            </Link>
            <div className="flex items-center gap-4">
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/20 animate-pulse-glow">
                SECURE KYC NODE
              </span>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-grow flex items-center justify-center p-4 md:p-8">
          <Routes>
            <Route path="/" element={<UploadPage />} />
            <Route path="/verify/:sessionId" element={<VerificationPage />} />
            <Route path="/result/:sessionId" element={<ResultPage />} />

            {/* Admin console */}
            <Route path="/admin" element={<AdminLoginPage />} />
            <Route path="/admin/dashboard" element={<RequireAdmin><AdminDashboardPage /></RequireAdmin>} />
            <Route path="/admin/verifications/:sessionId" element={<RequireAdmin><VerificationDetailPage /></RequireAdmin>} />

            {/* Catch-all 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>

        {/* Footer */}
        <footer className="py-6 border-t border-brand-darkBorder/30 text-center text-xs text-slate-500 bg-brand-darkBg">
          <p>© {new Date().getFullYear()} IdentityShield. Automated KYC Node. All data processed is securely cleared upon terminal status.</p>
        </footer>
      </div>
    </BrowserRouter>
  );
}

export default App;
