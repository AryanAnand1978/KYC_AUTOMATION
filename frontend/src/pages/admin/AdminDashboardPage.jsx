import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer, PieChart, Pie, Cell,
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';
import {
  Users, CheckCircle2, TrendingUp, Gauge, Fingerprint, CalendarDays,
  LogOut, Search, RefreshCw, ChevronLeft, ChevronRight, Inbox, ArrowUpRight
} from 'lucide-react';
import { adminApi, clearAdminToken } from '../../api';

const STATUS_COLORS = {
  PENDING: '#fbbf24',
  FACE_VERIFIED: '#38bdf8',
  VERIFIED: '#34d399',
  FAILED: '#fb7185',
  EXPIRED: '#9ca3af'
};

const STATUS_STYLES = {
  PENDING: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  FACE_VERIFIED: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  VERIFIED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  FAILED: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  EXPIRED: 'bg-gray-500/10 text-gray-400 border-gray-500/20'
};

const CHALLENGE_LABELS = {
  SHOW_LEFT_HAND: 'Left Hand',
  SHOW_RIGHT_HAND: 'Right Hand',
  TURN_HEAD_LEFT: 'Head Left',
  TURN_HEAD_RIGHT: 'Head Right',
  UNKNOWN: 'Unknown'
};

const tooltipStyle = {
  backgroundColor: '#151c2c',
  border: '1px solid #232d42',
  borderRadius: '0.75rem',
  fontSize: '12px'
};

const StatusBadge = ({ status }) => (
  <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border whitespace-nowrap ${STATUS_STYLES[status] || STATUS_STYLES.PENDING}`}>
    {(status || '').replace('_', ' ')}
  </span>
);

const StatCard = ({ icon: Icon, label, value, suffix = '', accent }) => (
  <div className="glass-card glass-card-hover p-5">
    <div className="flex items-center justify-between mb-3">
      <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{label}</span>
      <div className={`p-2 rounded-lg ${accent}`}>
        <Icon className="w-4 h-4" />
      </div>
    </div>
    <div className="text-3xl font-extrabold text-white tracking-tight">
      {value}
      {suffix && <span className="text-lg text-slate-400 font-bold ml-0.5">{suffix}</span>}
    </div>
  </div>
);

const ChartCard = ({ title, children }) => (
  <div className="glass-card p-5">
    <h3 className="text-sm font-bold text-slate-200 mb-4 font-heading">{title}</h3>
    <div className="h-64 relative">{children}</div>
  </div>
);

const EmptyChart = ({ message }) => (
  <div className="h-full w-full flex flex-col items-center justify-center text-slate-600 gap-2">
    <Inbox className="w-8 h-8" />
    <span className="text-xs">{message}</span>
  </div>
);

const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const AdminDashboardPage = () => {
  const navigate = useNavigate();

  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');

  // Filters
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState('newest');

  const handleAuthError = useCallback((err) => {
    if (err.response?.status === 401) {
      clearAdminToken();
      navigate('/admin', { replace: true });
      return true;
    }
    return false;
  }, [navigate]);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await adminApi.get('/stats');
      setStats(res.data);
    } catch (err) {
      if (!handleAuthError(err)) console.error('Failed to load stats:', err);
    } finally {
      setStatsLoading(false);
    }
  }, [handleAuthError]);

  const fetchList = useCallback(async () => {
    setListLoading(true);
    setListError('');
    try {
      const params = { page, limit: 10, sort };
      if (statusFilter) params.status = statusFilter;
      if (debouncedQ) params.q = debouncedQ;
      if (from) params.from = from;
      if (to) params.to = to;

      const res = await adminApi.get('/verifications', { params });
      setItems(res.data.items || []);
      setTotal(res.data.total || 0);
      setPages(res.data.pages || 1);
    } catch (err) {
      if (!handleAuthError(err)) {
        setListError(err.response?.data?.error || 'Failed to load verifications.');
      }
    } finally {
      setListLoading(false);
    }
  }, [page, sort, statusFilter, debouncedQ, from, to, handleAuthError]);

  // Debounce the search box; reset to page 1 whenever the query text changes.
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedQ(q.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchList(); }, [fetchList]);

  const handleLogout = () => {
    clearAdminToken();
    navigate('/admin', { replace: true });
  };

  const handleRefresh = () => {
    fetchStats();
    fetchList();
  };

  const resetPageThen = (setter) => (value) => {
    setPage(1);
    setter(value);
  };

  const statusPieData = (stats?.statusBreakdown || []).filter((s) => s.count > 0);
  const overTimeData = stats?.verificationsOverTime || [];
  const challengeData = (stats?.challengeBreakdown || []).map((c) => ({
    ...c,
    label: CHALLENGE_LABELS[c.challenge] || c.challenge
  }));

  return (
    <div className="w-full max-w-7xl mx-auto animate-fade-in py-2">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Verification Analytics</h1>
          <p className="text-slate-400 text-sm mt-1">Live operational view of the KYC pipeline, backed by MongoDB aggregation.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh} className="btn-secondary flex items-center gap-2 !py-2.5">
            <RefreshCw className={`w-4 h-4 ${(statsLoading || listLoading) ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button onClick={handleLogout} className="btn-secondary flex items-center gap-2 !py-2.5">
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        <StatCard icon={Users} label="Total Sessions" value={statsLoading ? '—' : stats?.totals.total ?? 0} accent="bg-brand-cyan/10 text-brand-cyan" />
        <StatCard icon={CheckCircle2} label="Verified" value={statsLoading ? '—' : stats?.totals.verified ?? 0} accent="bg-emerald-500/10 text-emerald-400" />
        <StatCard icon={TrendingUp} label="Pass Rate" value={statsLoading ? '—' : stats?.rates.passRate ?? 0} suffix="%" accent="bg-brand-blue/10 text-brand-blue" />
        <StatCard icon={Gauge} label="Avg Face Score" value={statsLoading ? '—' : stats?.rates.avgFaceMatchScore ?? 0} suffix="%" accent="bg-violet-500/10 text-violet-400" />
        <StatCard icon={Fingerprint} label="Distinct Applicants" value={statsLoading ? '—' : stats?.totals.distinctApplicants ?? 0} accent="bg-amber-500/10 text-amber-400" />
        <StatCard icon={CalendarDays} label="Today" value={statsLoading ? '—' : stats?.totals.today ?? 0} accent="bg-sky-500/10 text-sky-400" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <ChartCard title="Status Distribution">
          {statusPieData.length === 0 ? (
            <EmptyChart message="No sessions yet" />
          ) : (
            <>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusPieData}
                    dataKey="count"
                    nameKey="status"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {statusPieData.map((entry) => (
                      <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || '#64748b'} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: '#e2e8f0' }} />
                  <Legend
                    iconType="circle"
                    formatter={(value) => <span className="text-xs text-slate-400">{value.replace('_', ' ')}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none -mt-6">
                <span className="text-2xl font-extrabold text-white">{stats?.totals.total ?? 0}</span>
                <span className="text-[10px] uppercase tracking-wider text-slate-500">Total</span>
              </div>
            </>
          )}
        </ChartCard>

        <div className="lg:col-span-2">
          <ChartCard title="Verifications Over Time (30d)">
            {overTimeData.length === 0 ? (
              <EmptyChart message="No activity in the last 30 days" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={overTimeData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00F2FE" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#00F2FE" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gVerified" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#232d42" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={(d) => d.slice(5)} tickLine={false} axisLine={{ stroke: '#232d42' }} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} allowDecimals={false} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: '#e2e8f0' }} labelStyle={{ color: '#94a3b8' }} />
                  <Legend formatter={(value) => <span className="text-xs text-slate-400 capitalize">{value}</span>} />
                  <Area type="monotone" dataKey="total" stroke="#00F2FE" strokeWidth={2} fill="url(#gTotal)" />
                  <Area type="monotone" dataKey="verified" stroke="#34d399" strokeWidth={2} fill="url(#gVerified)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <div className="lg:col-span-3">
          <ChartCard title="Liveness Challenge Outcomes">
            {challengeData.length === 0 ? (
              <EmptyChart message="No challenge attempts recorded yet" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={challengeData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }} barGap={6}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#232d42" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#232d42' }} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} allowDecimals={false} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: '#e2e8f0' }} labelStyle={{ color: '#94a3b8' }} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Legend formatter={(value) => <span className="text-xs text-slate-400 capitalize">{value}</span>} />
                  <Bar dataKey="passed" fill="#34d399" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="failed" fill="#fb7185" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      </div>

      {/* Verifications table */}
      <div className="glass-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <h3 className="text-sm font-bold text-slate-200 font-heading">
            Verification Records
            <span className="ml-2 text-xs font-normal text-slate-500">({total} total)</span>
          </h3>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="relative flex-grow min-w-[200px]">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name or last 4 digits..."
              className="w-full bg-[#080b12] border border-brand-darkBorder rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-cyan/50 transition-colors"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => resetPageThen(setStatusFilter)(e.target.value)}
            className="bg-[#080b12] border border-brand-darkBorder rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-brand-cyan/50 cursor-pointer"
          >
            <option value="">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="FACE_VERIFIED">Face Verified</option>
            <option value="VERIFIED">Verified</option>
            <option value="FAILED">Failed</option>
            <option value="EXPIRED">Expired</option>
          </select>
          <input
            type="date"
            value={from}
            onChange={(e) => resetPageThen(setFrom)(e.target.value)}
            className="bg-[#080b12] border border-brand-darkBorder rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-brand-cyan/50 [color-scheme:dark]"
            title="From date"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => resetPageThen(setTo)(e.target.value)}
            className="bg-[#080b12] border border-brand-darkBorder rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-brand-cyan/50 [color-scheme:dark]"
            title="To date"
          />
          <select
            value={sort}
            onChange={(e) => resetPageThen(setSort)(e.target.value)}
            className="bg-[#080b12] border border-brand-darkBorder rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-brand-cyan/50 cursor-pointer"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="score">Highest score</option>
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-brand-darkBorder/60">
                <th className="py-3 px-3 font-semibold">Applicant</th>
                <th className="py-3 px-3 font-semibold">Aadhaar</th>
                <th className="py-3 px-3 font-semibold">Status</th>
                <th className="py-3 px-3 font-semibold">Score</th>
                <th className="py-3 px-3 font-semibold">Challenge</th>
                <th className="py-3 px-3 font-semibold">Created</th>
                <th className="py-3 px-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {listLoading ? (
                <tr><td colSpan={7} className="py-12 text-center text-slate-500">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-brand-cyan" />
                  Loading records...
                </td></tr>
              ) : listError ? (
                <tr><td colSpan={7} className="py-12 text-center text-rose-400">{listError}</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-slate-500">
                  <Inbox className="w-8 h-8 mx-auto mb-2" />
                  No verifications match your filters.
                </td></tr>
              ) : (
                items.map((row) => (
                  <tr
                    key={row.sessionId}
                    onClick={() => navigate(`/admin/verifications/${row.sessionId}`)}
                    className="border-b border-brand-darkBorder/30 hover:bg-brand-darkBorder/20 cursor-pointer transition-colors group"
                  >
                    <td className="py-3 px-3 font-semibold text-slate-200">{row.name || <span className="text-slate-600 italic">Not detected</span>}</td>
                    <td className="py-3 px-3 font-mono text-slate-400 tracking-wide">{row.aadhaarMasked || '—'}</td>
                    <td className="py-3 px-3"><StatusBadge status={row.status} /></td>
                    <td className="py-3 px-3">
                      <span className={`font-bold ${row.faceMatchScore >= 80 ? 'text-emerald-400' : row.faceMatchScore > 0 ? 'text-rose-400' : 'text-slate-600'}`}>
                        {row.faceMatchScore > 0 ? `${row.faceMatchScore}%` : '—'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400 text-xs">{CHALLENGE_LABELS[row.challenge] || '—'}</td>
                    <td className="py-3 px-3 text-slate-400 text-xs whitespace-nowrap">{fmtDateTime(row.createdAt)}</td>
                    <td className="py-3 px-3 text-right">
                      <ArrowUpRight className="w-4 h-4 text-slate-600 group-hover:text-brand-cyan transition-colors inline" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-5 pt-4 border-t border-brand-darkBorder/40">
          <span className="text-xs text-slate-500">Page {page} of {pages}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || listLoading}
              className="btn-secondary !px-3 !py-2 flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Prev</span>
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page >= pages || listLoading}
              className="btn-secondary !px-3 !py-2 flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboardPage;
