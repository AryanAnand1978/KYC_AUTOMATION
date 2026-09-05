import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, RefreshCw, ShieldAlert, FilePlus2, ScanText, Crop, ScanFace,
  CheckCircle2, XCircle, Dices, Hand, ShieldCheck, Clock, Trash2, Activity
} from 'lucide-react';
import { adminApi, clearAdminToken } from '../../api';

const STATUS_STYLES = {
  PENDING: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  FACE_VERIFIED: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  VERIFIED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  FAILED: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  EXPIRED: 'bg-gray-500/10 text-gray-400 border-gray-500/20'
};

// Each audit event type gets an icon + colour so the timeline reads at a glance.
const TYPE_META = {
  SESSION_CREATED:    { icon: FilePlus2,   cls: 'bg-brand-cyan/10 text-brand-cyan' },
  OCR_EXTRACTED:      { icon: ScanText,    cls: 'bg-sky-500/10 text-sky-400' },
  FACE_CROPPED:       { icon: Crop,        cls: 'bg-sky-500/10 text-sky-400' },
  FACE_COMPARED:      { icon: ScanFace,    cls: 'bg-brand-blue/10 text-brand-blue' },
  FACE_PASSED:        { icon: CheckCircle2,cls: 'bg-emerald-500/10 text-emerald-400' },
  FACE_FAILED:        { icon: XCircle,     cls: 'bg-rose-500/10 text-rose-400' },
  CHALLENGE_ASSIGNED: { icon: Dices,       cls: 'bg-amber-500/10 text-amber-400' },
  CHALLENGE_ATTEMPTED:{ icon: Hand,        cls: 'bg-amber-500/10 text-amber-400' },
  CHALLENGE_PASSED:   { icon: CheckCircle2,cls: 'bg-emerald-500/10 text-emerald-400' },
  CHALLENGE_FAILED:   { icon: XCircle,     cls: 'bg-rose-500/10 text-rose-400' },
  SESSION_VERIFIED:   { icon: ShieldCheck, cls: 'bg-emerald-500/10 text-emerald-400' },
  SESSION_FAILED:     { icon: ShieldAlert, cls: 'bg-rose-500/10 text-rose-400' },
  SESSION_EXPIRED:    { icon: Clock,       cls: 'bg-gray-500/10 text-gray-400' },
  MEDIA_CLEANED:      { icon: Trash2,      cls: 'bg-slate-500/10 text-slate-400' }
};

const CHALLENGE_LABELS = {
  SHOW_LEFT_HAND: 'Show Left Hand',
  SHOW_RIGHT_HAND: 'Show Right Hand',
  TURN_HEAD_LEFT: 'Turn Head Left',
  TURN_HEAD_RIGHT: 'Turn Head Right'
};

const humanType = (t) =>
  (t || '').split('_').map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');

const fmtFull = (d) => (d ? new Date(d).toLocaleString() : '—');

const fmtMetaValue = (v) => {
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v === null || v === undefined) return '—';
  return String(v);
};

const Field = ({ label, value, mono = false }) => (
  <div>
    <span className="text-[10px] text-slate-500 uppercase font-semibold block mb-0.5 tracking-wider">{label}</span>
    <span className={`text-slate-200 text-sm font-semibold break-all ${mono ? 'font-mono tracking-wide' : ''}`}>{value}</span>
  </div>
);

const VerificationDetailPage = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminApi.get(`/verifications/${sessionId}`);
      setData(res.data);
    } catch (err) {
      if (err.response?.status === 401) {
        clearAdminToken();
        navigate('/admin', { replace: true });
        return;
      }
      setError(err.response?.data?.error || 'Failed to load verification record.');
    } finally {
      setLoading(false);
    }
  }, [sessionId, navigate]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  if (loading) {
    return (
      <div className="w-full max-w-3xl mx-auto text-center py-16">
        <RefreshCw className="animate-spin h-8 w-8 text-brand-cyan mx-auto mb-3" />
        <span className="text-slate-400 text-sm">Loading verification record...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-md mx-auto text-center glass-card p-8 border-rose-500/20 animate-fade-in">
        <div className="p-4 bg-rose-500/10 text-rose-400 rounded-full w-fit mx-auto mb-4">
          <ShieldAlert className="w-10 h-10" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Unable to Load Record</h2>
        <p className="text-slate-400 text-sm mb-6">{error}</p>
        <Link to="/admin/dashboard" className="btn-secondary w-full flex items-center justify-center gap-2">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </Link>
      </div>
    );
  }

  const v = data.verification;
  const events = data.events || [];

  return (
    <div className="w-full max-w-4xl mx-auto animate-fade-in py-2">
      {/* Back link */}
      <Link to="/admin/dashboard" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-brand-cyan transition-colors mb-6 group">
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        <span>Back to Dashboard</span>
      </Link>

      {/* Record summary */}
      <div className="glass-card p-6 md:p-8 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-brand-darkBorder/40 pb-5 mb-5">
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">{v.name || 'Applicant Not Detected'}</h1>
            <p className="text-xs text-slate-500 font-mono mt-1">{v.sessionId}</p>
          </div>
          <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border ${STATUS_STYLES[v.status] || STATUS_STYLES.PENDING}`}>
            {(v.status || '').replace('_', ' ')}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-5">
          <Field label="Aadhaar (Masked)" value={v.aadhaarMasked || '—'} mono />
          <Field
            label="Face Match Score"
            value={<span className={v.faceMatchScore >= 80 ? 'text-emerald-400' : v.faceMatchScore > 0 ? 'text-rose-400' : 'text-slate-500'}>
              {v.faceMatchScore > 0 ? `${v.faceMatchScore}%` : '—'}
            </span>}
          />
          <Field label="Challenge" value={CHALLENGE_LABELS[v.challenge] || '—'} />
          <Field label="Attempts" value={`${v.attempts ?? 0} / 2`} />
          <Field label="Created" value={fmtFull(v.createdAt)} />
          <Field label="Completed" value={fmtFull(v.completedAt)} />
          <Field label="IP Address" value={v.ipAddress || '—'} mono />
          <Field label="User Agent" value={v.userAgent || '—'} />
          <Field label="Aadhaar Hash" value={v.aadhaarHash ? `${v.aadhaarHash.slice(0, 24)}…` : '—'} mono />
        </div>
      </div>

      {/* Audit timeline */}
      <div className="glass-card p-6 md:p-8">
        <div className="flex items-center gap-2 mb-6">
          <Activity className="w-5 h-5 text-brand-cyan" />
          <h2 className="text-lg font-bold text-white">Audit Timeline</h2>
          <span className="text-xs text-slate-500">({events.length} events)</span>
        </div>

        {events.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">No audit events recorded for this session.</p>
        ) : (
          <ol className="relative border-l border-brand-darkBorder/70 ml-3">
            {events.map((ev, i) => {
              const meta = TYPE_META[ev.type] || { icon: Activity, cls: 'bg-slate-500/10 text-slate-400' };
              const Icon = meta.icon;
              const metaEntries = ev.meta && typeof ev.meta === 'object' ? Object.entries(ev.meta) : [];
              return (
                <li key={ev._id || i} className="mb-7 ml-8 last:mb-0">
                  <span className={`absolute -left-[15px] flex items-center justify-center w-7 h-7 rounded-full ring-4 ring-brand-darkBg ${meta.cls}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold text-sm text-slate-200">{humanType(ev.type)}</span>
                    <time className="text-xs text-slate-500 font-mono">{fmtFull(ev.createdAt)}</time>
                  </div>
                  {ev.message && <p className="text-xs text-slate-400 mt-1">{ev.message}</p>}
                  {metaEntries.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {metaEntries.map(([k, val]) => (
                        <span key={k} className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-brand-darkBg/70 border border-brand-darkBorder/60 text-slate-400">
                          <span className="text-slate-500">{k}:</span> {fmtMetaValue(val)}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
};

export default VerificationDetailPage;
