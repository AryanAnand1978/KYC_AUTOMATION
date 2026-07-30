import React, { useState } from 'react';
import axios from 'axios';
import { Upload, FileText, CheckCircle2, Copy, ArrowRight, AlertTriangle, ShieldCheck } from 'lucide-react';

const API_BASE_URL = 'http://localhost:5000/api';

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
    <div className="w-full max-w-2xl mx-auto animate-fade-in">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2">
          Verify Aadhaar Card
        </h1>
        <p className="text-slate-400 text-sm max-w-md mx-auto">
          Upload a clear photograph of the front-side of your Aadhaar card to initialize the automated KYC verification pipeline.
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
                  ? 'border-brand-cyan bg-brand-cyan/5 scale-[1.01]' 
                  : file 
                    ? 'border-emerald-500/50 bg-emerald-500/5' 
                    : 'border-brand-darkBorder hover:border-brand-blue/50 hover:bg-brand-darkBorder/20'
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
                    <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-full mb-3">
                      <FileText className="w-8 h-8" />
                    </div>
                    <span className="text-slate-200 font-semibold mb-1 block">
                      {file.name}
                    </span>
                    <span className="text-xs text-slate-400">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB • Ready for ingestion
                    </span>
                  </>
                ) : (
                  <>
                    <div className="p-3 bg-brand-cyan/10 text-brand-cyan rounded-full mb-3">
                      <Upload className="w-8 h-8" />
                    </div>
                    <span className="text-slate-200 font-semibold mb-1 block">
                      Drag & drop Aadhaar photo here
                    </span>
                    <span className="text-xs text-slate-400 block mb-2">
                      or click to browse local files
                    </span>
                    <span className="text-[10px] text-slate-500">
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
                  <span className="font-semibold">Process Error: </span>
                  {error}
                </div>
              </div>
            )}

            {/* Submit Button */}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!file || loading}
                className={`btn-primary w-full flex items-center justify-center gap-2 ${
                  (!file || loading) ? 'opacity-50 cursor-not-allowed shadow-none' : ''
                }`}
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-brand-darkBg" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>{loadingStep}</span>
                  </div>
                ) : (
                  <>
                    <span>Initialize KYC Session</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>

          </form>
        </div>
      ) : (
        /* Success Screen showing Generated Verification Link */
        <div className="glass-card p-6 md:p-8 animate-slide-up space-y-6">
          <div className="flex items-center gap-3 border-b border-brand-darkBorder/40 pb-4">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Ingestion Successful</h2>
              <p className="text-xs text-slate-400">Biometrics and OCR keys mapped</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-brand-darkBg/60 p-4 rounded-xl border border-brand-darkBorder/50">
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">Parsed Name</span>
              <span className="text-slate-200 font-bold text-sm tracking-wide">{sessionResult.extractedData.name}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">Aadhaar Number</span>
              <span className="text-slate-200 font-bold text-sm tracking-widest">{sessionResult.extractedData.aadhaarNumber}</span>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-400 block">Verification Session URL</span>
            <div className="flex items-center gap-2 bg-[#080b12] border border-brand-darkBorder rounded-xl p-2.5">
              <span className="text-xs text-brand-cyan truncate flex-grow px-2 font-mono select-all">
                {`${window.location.origin}${sessionResult.verificationLink}`}
              </span>
              <button
                onClick={copyToClipboard}
                className="p-2 text-slate-400 hover:text-white hover:bg-brand-darkBorder rounded-lg transition-colors flex-shrink-0"
                title="Copy Link"
              >
                {copied ? <span className="text-xs text-emerald-400 font-semibold px-1">Copied!</span> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10px] text-slate-500">
              * The verification URL is valid for 10 minutes. Files are automatically destroyed after verification.
            </p>
          </div>

          <div className="pt-2">
            <a
              href={sessionResult.verificationLink}
              className="btn-primary w-full flex items-center justify-center gap-2 group"
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
