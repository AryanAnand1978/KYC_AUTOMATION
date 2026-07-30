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
      <div className="text-center py-12 animate-pulse-glow">
        <RefreshCw className="animate-spin h-10 w-10 text-brand-cyan mx-auto mb-4" />
        <span className="text-slate-300 font-semibold">Retrieving secure KYC verification records...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-md mx-auto text-center glass-card p-8 border-rose-500/20 animate-fade-in">
        <div className="p-4 bg-rose-500/10 text-rose-400 rounded-full w-fit mx-auto mb-4">
          <ShieldAlert className="w-12 h-12" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Error Retrieving Data</h2>
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
      return `Face verification biometric comparison failed. Score was ${result.faceMatchScore}%, which is below the required 80% threshold.`;
    }
    return `Liveness challenge verification failed. Maximum number of attempts (2) were exhausted without completing the assigned movements.`;
  };

  return (
    <div className="w-full max-w-lg mx-auto animate-fade-in">
      <div className="glass-card overflow-hidden">
        
        {/* Dynamic Card Header */}
        <div className={`p-6 border-b border-brand-darkBorder/40 text-center ${
          isSuccess 
            ? 'bg-gradient-to-b from-emerald-500/10 to-transparent' 
            : isExpired 
              ? 'bg-gradient-to-b from-slate-500/10 to-transparent' 
              : 'bg-gradient-to-b from-rose-500/10 to-transparent'
        }`}>
          {isSuccess ? (
            <div className="p-4 bg-emerald-500/20 text-emerald-400 rounded-full w-fit mx-auto mb-3 shadow-lg shadow-emerald-500/10">
              <CheckCircle2 className="w-12 h-12" />
            </div>
          ) : isExpired ? (
            <div className="p-4 bg-slate-500/20 text-slate-400 rounded-full w-fit mx-auto mb-3 shadow-lg shadow-slate-500/10">
              <Clock className="w-12 h-12" />
            </div>
          ) : (
            <div className="p-4 bg-rose-500/20 text-rose-400 rounded-full w-fit mx-auto mb-3 shadow-lg shadow-rose-500/10">
              <XCircle className="w-12 h-12" />
            </div>
          )}

          <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">
            {isSuccess && 'Verification Successful'}
            {isExpired && 'Verification Session Expired'}
            {!isSuccess && !isExpired && 'Verification Failed'}
          </h1>
          
          <div className="inline-block mt-1">
            {isSuccess && <span className="badge-verified">Status: VERIFIED</span>}
            {isExpired && <span className="badge-expired">Status: EXPIRED</span>}
            {!isSuccess && !isExpired && <span className="badge-failed">Status: FAILED</span>}
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 md:p-8 space-y-6">
          <div className="space-y-4">
            
            {/* Applicant metadata */}
            <div className="grid grid-cols-2 gap-4 bg-brand-darkBg/60 p-4 rounded-xl border border-brand-darkBorder/50 text-xs">
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-semibold block mb-0.5">Applicant</span>
                <span className="font-bold text-white tracking-wide">{result?.name || 'NOT DETECTED'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-semibold block mb-0.5">Aadhaar Map</span>
                <span className="font-bold text-white tracking-widest">{result?.aadhaarNumber || 'NOT DETECTED'}</span>
              </div>
            </div>

            {/* Verification diagnostics */}
            <div className="space-y-3.5 pt-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-medium">Face Match Score</span>
                <span className={`font-bold ${result?.faceMatchScore >= 80 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {result?.faceMatchScore}% Match
                </span>
              </div>

              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-medium">Liveness Challenge</span>
                <span className="font-bold text-slate-200">
                  {result?.challenge === 'SHOW_LEFT_HAND' && 'Show LEFT HAND'}
                  {result?.challenge === 'SHOW_RIGHT_HAND' && 'Show RIGHT HAND'}
                  {result?.challenge === 'TURN_HEAD_LEFT' && 'Turn Head LEFT'}
                  {result?.challenge === 'TURN_HEAD_RIGHT' && 'Turn Head RIGHT'}
                  {!result?.challenge && 'NONE'}
                </span>
              </div>

              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-medium">Attempts Expended</span>
                <span className="font-bold text-slate-200">{result?.attempts} / 2</span>
              </div>

              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-medium">Processed Node Timestamp</span>
                <span className="font-mono text-[11px] text-slate-300">
                  {result?.completedAt ? new Date(result.completedAt).toLocaleString() : new Date(result?.createdAt).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Error or expiration descriptions if failed */}
            {!isSuccess && (
              <div className={`p-4 rounded-xl text-xs leading-relaxed border ${
                isExpired 
                  ? 'bg-slate-500/10 border-slate-500/20 text-slate-400' 
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
              }`}>
                <span className="font-bold uppercase tracking-wider block mb-1">
                  {isExpired ? 'Link Timeout Description' : 'Audit Failure Diagnostics'}
                </span>
                {isExpired 
                  ? 'Verification session expired. The security tunnel automatically cleared files and terminated this session after the 10-minute validity threshold.' 
                  : getFailReason()
                }
              </div>
            )}

            {isSuccess && (
              <div className="p-4 rounded-xl text-xs leading-relaxed border bg-emerald-500/10 border-emerald-500/20 text-emerald-400">
                <span className="font-bold uppercase tracking-wider block mb-1">
                  Biometric Match Details
                </span>
                Face comparison and challenge verification successfully completed. All raw biometric image copies have been permanently cleared from disk.
              </div>
            )}

          </div>

          <div className="pt-2">
            <Link
              to="/"
              className="btn-secondary w-full flex items-center justify-center gap-2 group"
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
