import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, ShieldCheck, AlertTriangle, ArrowRight } from 'lucide-react';
import { adminApi, setAdminToken, clearAdminToken, getAdminToken } from '../../api';

const AdminLoginPage = () => {
  const navigate = useNavigate();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // If a valid-looking token is already stored, skip straight to the dashboard.
  useEffect(() => {
    if (getAdminToken()) {
      navigate('/admin/dashboard', { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token.trim()) return;

    setLoading(true);
    setError('');

    // Store optimistically so the request interceptor attaches the Bearer token,
    // then validate it against the server. Clear it again if the key is wrong.
    setAdminToken(token.trim());
    try {
      await adminApi.get('/verify');
      navigate('/admin/dashboard', { replace: true });
    } catch (err) {
      clearAdminToken();
      if (err.response?.status === 401) {
        setError('Invalid admin key. Access denied.');
      } else if (err.response?.status === 500) {
        setError('Admin access is not configured on the server (ADMIN_TOKEN unset).');
      } else {
        setError(err.response?.data?.error || 'Unable to reach the admin service.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto animate-fade-in">
      <div className="glass-card p-6 md:p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="p-3 bg-gradient-to-br from-brand-cyan to-brand-blue rounded-2xl text-brand-darkBg shadow-lg shadow-brand-cyan/20 mb-4">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white mb-1">Admin Console</h1>
          <p className="text-slate-400 text-sm max-w-xs">
            Enter the shared admin key to access verification records and analytics.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="admin-key" className="text-xs font-semibold text-slate-400 block mb-2 uppercase tracking-wider">
              Admin Key
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="admin-key"
                type="password"
                autoFocus
                autoComplete="current-password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-[#080b12] border border-brand-darkBorder rounded-xl pl-10 pr-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-cyan/60 focus:ring-1 focus:ring-brand-cyan/40 transition-colors font-mono"
              />
            </div>
          </div>

          {error && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl flex items-start gap-2.5 text-sm">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={!token.trim() || loading}
            className={`btn-primary w-full flex items-center justify-center gap-2 ${
              (!token.trim() || loading) ? 'opacity-50 cursor-not-allowed shadow-none' : ''
            }`}
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-brand-darkBg" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <span>Unlock Console</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <p className="text-[10px] text-slate-600 text-center mt-6">
          Authorized personnel only. All access is scoped to the shared admin credential.
        </p>
      </div>
    </div>
  );
};

export default AdminLoginPage;
