import React, { useState } from 'react';
import axios from 'axios';
import { Upload, FileText, CheckCircle2, Copy, ArrowRight, AlertTriangle, ShieldCheck } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:5000/api';

const UploadPage = () => {
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState('');
  const [sessionResult, setSessionResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (selectedFile) => {
    setError('');
    const validExtensions = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!validExtensions.includes(selectedFile.type)) {
      setError('Invalid file format. Only JPG, JPEG, and PNG images are allowed.');
      setFile(null);
      return;
    }
    // Limit to 5MB
    if (selectedFile.size > 5 * 1024 * 1024) {
      setError('File size too large. Maximum allowed size is 5MB.');
      setFile(null);
      return;
    }
    setFile(selectedFile);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError('');
    
    // Simulate steps in UI for a production-like experience
    setLoadingStep('Uploading Aadhaar Image...');
    
    const formData = new FormData();
    formData.append('aadhaar', file);

    try {
      // Step 1: Uploading
      setTimeout(() => setLoadingStep('Analyzing image structure...'), 800);
      
      // Step 2: Extracting OCR (Google Vision)
      setTimeout(() => setLoadingStep('Calling Google Vision API for text extraction...'), 1800);

      // Step 3: Face Detection (Face++)
      setTimeout(() => setLoadingStep('Performing Face++ biometric profile isolation...'), 3000);

      const response = await axios.post(`${API_BASE_URL}/upload-aadhaar`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      // Finish loading after response received
      setSessionResult(response.data);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || 'An error occurred during verification session creation. Ensure your image has a visible face.');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  const copyToClipboard = () => {
    if (!sessionResult) return;
    const fullLink = `${window.location.origin}${sessionResult.verificationLink}`;
    navigator.clipboard.writeText(fullLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full max-w-xl mx-auto animate-fade-in">
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#00E5A3]/10 border border-[#00E5A3]/25 text-[#00E5A3] text-[10px] font-bold uppercase tracking-wider mb-3">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>IDENTITY INGESTION PIPELINE</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-2">
          Verify Aadhaar Document
        </h1>
        <p className="text-slate-400 text-xs sm:text-sm max-w-md mx-auto leading-relaxed">
          Upload a clear photograph or scan of the front face of the government-issued card to start biometric authentication.
        </p>
      </div>

      {!sessionResult ? (
        <div className="glass-card p-6 md:p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* Drag & Drop Zone */}
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`relative border-2 border-dashed rounded-xl p-8 text-center flex flex-col items-center justify-center cursor-pointer transition-all duration-200 min-h-[220px] ${
                dragActive 
                  ? 'border-[#00E5A3] bg-[#00E5A3]/5 scale-[1.01]' 
                  : file 
                    ? 'border-[#00E5A3]/50 bg-[#00E5A3]/5' 
                    : 'border-[#323a4e] hover:border-[#00E5A3]/50 bg-[#1c202d] hover:bg-[#202534]'
              }`}
            >
              <input
                type="file"
                id="file-upload"
                multiple={false}
                onChange={handleChange}
                accept=".jpg,.jpeg,.png"
                className="hidden"
              />
              <label htmlFor="file-upload" className="w-full cursor-pointer h-full flex flex-col items-center justify-center">
                {file ? (
                  <>
                    <div className="p-3 bg-[#00E5A3]/15 text-[#00E5A3] border border-[#00E5A3]/30 rounded-xl mb-3">
                      <FileText className="w-7 h-7" />
                    </div>
                    <span className="text-slate-100 font-bold mb-1 block text-sm">
                      {file.name}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB • Ready for ingestion
                    </span>
                  </>
                ) : (
                  <>
                    <div className="p-3.5 bg-[#00E5A3]/10 text-[#00E5A3] border border-[#00E5A3]/25 rounded-2xl mb-3 shadow-md shadow-[#00E5A3]/5">
                      <Upload className="w-7 h-7" />
                    </div>
                    <span className="text-slate-100 font-bold mb-1 block text-sm">
                      Drop Aadhaar card photograph here
                    </span>
                    <span className="text-xs text-slate-400 block mb-3">
                      or click to select from local storage
                    </span>
                    <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                      Supported extensions: JPG, JPEG, PNG (Max 5MB)
                    </span>
                  </>
                )}
              </label>
            </div>

            {error && (
              <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl flex items-start gap-3 text-sm">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Verification Alert: </span>
                  {error}
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!file || loading}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3.5"
            >
              {loading ? (
                <div className="flex items-center gap-2 text-slate-900">
                  <svg className="animate-spin h-4 w-4 text-slate-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="font-bold">{loadingStep || 'Processing Document...'}</span>
                </div>
              ) : (
                <>
                  <span>Initialize KYC Session</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

          </form>
        </div>
      ) : (
        /* Success Screen showing Generated Verification Link with Pure White Cards */
        <div className="glass-card p-6 md:p-8 animate-slide-up space-y-6">
          <div className="flex items-center justify-between border-b border-[#323a4e] pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-[#00E5A3]/15 text-[#00E5A3] border border-[#00E5A3]/30 rounded-xl">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white leading-tight">Document Ingestion Complete</h2>
                <p className="text-xs text-slate-400">OCR credentials mapped & biometric profile isolated</p>
              </div>
            </div>
            <span className="badge-verified">PARSED</span>
          </div>

          {/* Pure White Highlight Cards from reference design */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="surface-white-card">
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block mb-1">Applicant Name</span>
              <span className="text-slate-900 font-extrabold text-base tracking-tight block">{sessionResult.extractedData.name || 'N/A'}</span>
              <span className="text-[11px] text-[#00cca0] font-semibold flex items-center gap-1 mt-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Name Verified
              </span>
            </div>
            
            <div className="surface-white-card">
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block mb-1">Aadhaar Identifier</span>
              <span className="text-slate-900 font-mono font-bold text-base tracking-wider block">{sessionResult.extractedData.aadhaarNumber || 'N/A'}</span>
              <span className="text-[11px] text-slate-500 font-medium block mt-1">12-Digit Government ID</span>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 block">Biometric Session URL</span>
            <div className="flex items-center gap-2 bg-[#1c202d] border border-[#323a4e] rounded-xl p-2.5">
              <span className="text-xs text-[#00E5A3] truncate flex-grow px-2 font-mono select-all">
                {`${window.location.origin}${sessionResult.verificationLink}`}
              </span>
              <button
                type="button"
                onClick={copyToClipboard}
                className="px-3 py-1.5 text-slate-300 hover:text-white bg-[#2a3142] hover:bg-[#343c50] border border-[#363e52] rounded-lg transition-colors flex items-center gap-1.5 text-xs font-bold cursor-pointer"
                title="Copy Link"
              >
                {copied ? <span className="text-[#00E5A3]">Copied!</span> : <><Copy className="w-3.5 h-3.5" /><span>Copy</span></>}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 leading-normal">
              Session expires in 10 minutes. Biometric verification requires active webcam access.
            </p>
          </div>

          <div className="pt-2">
            <a
              href={sessionResult.verificationLink}
              className="btn-primary w-full flex items-center justify-center gap-2 group py-3.5"
            >
              <span>Launch Verification Terminal</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

export default UploadPage;
