import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import UploadPage from './pages/UploadPage';
import VerificationPage from './pages/VerificationPage';
import ResultPage from './pages/ResultPage';
import { ShieldCheck } from 'lucide-react';

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
