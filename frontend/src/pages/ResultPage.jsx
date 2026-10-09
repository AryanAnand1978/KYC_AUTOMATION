import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { CheckCircle2, XCircle, Clock, ShieldCheck, ShieldAlert, ArrowLeft, RefreshCw } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:5000/api';

const ResultPage = () => {
  const { sessionId } = useParams();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchResult();
  }, [sessionId]);

  const fetchResult = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API_BASE_URL}/result/${sessionId}`);
      setResult(res.data);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to retrieve verification result.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <RefreshCw className="animate-spin h-8 w-8 text-blue-500 mx-auto mb-3" />
        <span className="text-slate-300 font-semibold text-sm">Retrieving verification audit record...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-md mx-auto text-center glass-card p-8 border-rose-500/20 animate-fade-in">
        <div className="p-3 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-xl w-fit mx-auto mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Record Unavailable</h2>
        <p className="text-slate-400 text-sm mb-6">{error}</p>
        <Link to="/" className="btn-secondary w-full flex items-center justify-center gap-2">
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Portal</span>
        </Link>
      </div>
    );
  }

  const isSuccess = result?.status === 'VERIFIED';
  const isExpired = result?.status === 'EXPIRED';

  // Extract fail reasoning
  const getFailReason = () => {
    if (result?.faceMatchScore < 80 && result?.faceMatchScore > 0) {
      return `Biometric facial comparison failed. Score was ${result.faceMatchScore}%, which is below the mandatory 80% threshold.`;
    }
    return `Liveness challenge verification failed. Maximum attempts (2) were exhausted without completing assigned motion.`;
  };

  const score = result?.faceMatchScore || 0;
  // Circumference for r=32 is 201.06
  const strokeDashoffset = 201.06 - (201.06 * Math.min(score, 100)) / 100;

  return (
    <div className="w-full max-w-xl mx-auto animate-fade-in">
      <div className="glass-card overflow-hidden">
        
        {/* Dynamic Card Header with Status */}
        <div className="p-6 border-b border-[#323a4e] text-center bg-[#1c202d]">
          {isSuccess ? (
            <div className="p-3 bg-[#00E5A3]/15 text-[#00E5A3] border border-[#00E5A3]/30 rounded-2xl w-fit mx-auto mb-3 shadow-lg shadow-[#00E5A3]/10">
              <CheckCircle2 className="w-8 h-8" />
            </div>
          ) : isExpired ? (
            <div className="p-3 bg-slate-500/15 text-slate-400 border border-slate-500/25 rounded-2xl w-fit mx-auto mb-3">
              <Clock className="w-8 h-8" />
            </div>
          ) : (
            <div className="p-3 bg-rose-500/15 text-rose-400 border border-rose-500/25 rounded-2xl w-fit mx-auto mb-3">
              <XCircle className="w-8 h-8" />
            </div>
          )}

          <h1 className="text-2xl font-extrabold tracking-tight text-white mb-2">
            {isSuccess && 'Verification Approved'}
            {isExpired && 'Verification Session Expired'}
            {!isSuccess && !isExpired && 'Verification Unsuccessful'}
          </h1>
          
          <div className="inline-block">
            {isSuccess && <span className="badge-verified">STATUS: VERIFIED</span>}
            {isExpired && <span className="badge-expired">STATUS: EXPIRED</span>}
            {!isSuccess && !isExpired && <span className="badge-failed">STATUS: FAILED</span>}
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 md:p-8 space-y-6">
          
          {/* Circular Percentage Ring + Applicant White Card Grid (From Reference Design) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            
            {/* Circular Ring Gauge Tile */}
            <div className="surface-white-card flex items-center gap-4">
              <div className="relative w-16 h-16 flex-shrink-0 flex items-center justify-center">
                <svg className="w-16 h-16 transform -rotate-90">
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    stroke="#e2e8f0"
                    strokeWidth="6"
                    fill="transparent"
                  />
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    stroke={score >= 80 ? '#00E5A3' : '#f43f5e'}
                    strokeWidth="6"
                    strokeDasharray="175.9"
                    strokeDashoffset={175.9 - (175.9 * Math.min(score, 100)) / 100}
                    strokeLinecap="round"
                    fill="transparent"
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-extrabold text-sm text-slate-900 font-mono">
                    {score}%
                  </span>
                </div>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Biometrics</span>
                <span className="text-slate-900 font-extrabold text-sm block">Match Score</span>
                <span className={`text-[10px] font-bold ${score >= 80 ? 'text-[#00cca0]' : 'text-rose-500'}`}>
                  {score >= 80 ? 'Threshold Met' : 'Below 80%'}
                </span>
              </div>
            </div>

            {/* Applicant Summary Tile */}
            <div className="surface-white-card">
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block mb-0.5">Applicant</span>
              <span className="font-extrabold text-slate-900 text-sm tracking-tight truncate block">{result?.name || 'NOT DETECTED'}</span>
              <span className="text-[11px] font-mono text-slate-500 block mt-1">{result?.aadhaarNumber || 'NOT DETECTED'}</span>
            </div>

          </div>

          {/* Verification Diagnostics Table */}
          <div className="space-y-2.5 bg-[#1c202d] border border-[#323a4e] p-4 rounded-xl text-xs">
            <div className="flex justify-between items-center pb-2 border-b border-[#323a4e]/60">
              <span className="text-slate-400 font-medium">Assigned Liveness Motion</span>
              <span className="font-bold text-white uppercase text-[11px]">
                {result?.challenge === 'SHOW_LEFT_HAND' && 'Show Left Hand'}
                {result?.challenge === 'SHOW_RIGHT_HAND' && 'Show Right Hand'}
                {result?.challenge === 'TURN_HEAD_LEFT' && 'Turn Head Left'}
                {result?.challenge === 'TURN_HEAD_RIGHT' && 'Turn Head Right'}
                {!result?.challenge && 'None'}
              </span>
            </div>

            <div className="flex justify-between items-center pb-2 border-b border-[#323a4e]/60">
              <span className="text-slate-400 font-medium">Attempts Used</span>
              <span className="font-bold text-slate-200">{result?.attempts || 0} / 2</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-400 font-medium">Completed Timestamp</span>
              <span className="font-mono text-[10px] text-slate-300">
                {result?.completedAt ? new Date(result.completedAt).toLocaleString() : new Date(result?.createdAt || Date.now()).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Result Outcome Feedback Box */}
          {!isSuccess && (
            <div className={`p-4 rounded-xl text-xs leading-relaxed border ${
              isExpired 
                ? 'bg-slate-500/10 border-slate-500/20 text-slate-300' 
                : 'bg-rose-500/10 border-rose-500/25 text-rose-300'
            }`}>
              <span className="font-bold uppercase tracking-wider block mb-1 text-[10px]">
                {isExpired ? 'Session Timeout' : 'Failure Audit Diagnostics'}
              </span>
              {isExpired 
                ? 'Verification session expired. All temporary upload files have been cleared from disk.' 
                : getFailReason()
              }
            </div>
          )}

          {isSuccess && (
            <div className="p-4 rounded-xl text-xs leading-relaxed border bg-[#00E5A3]/10 border-[#00E5A3]/25 text-[#00E5A3]">
              <span className="font-bold uppercase tracking-wider block mb-1 text-[10px]">
                Verification Confirmed
              </span>
              Face comparison and liveness check completed successfully. Credentials passed compliance audit.
            </div>
          )}

          <div className="pt-2">
            <Link
              to="/"
              className="btn-secondary w-full flex items-center justify-center gap-2 group py-3"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              <span>Return to Ingestion Portal</span>
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ResultPage;
