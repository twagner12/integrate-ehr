import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n) => `$${parseFloat(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
const fmtDate = (d) => {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'UTC' });
};
const toISO = (d) => d.toISOString().split('T')[0];

function downloadCsv(filename, headers, rows) {
  const csv = [
    headers.join(','),
    ...rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function datePresets() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  return [
    { label: 'This month',    start: toISO(new Date(y, m, 1)),     end: toISO(new Date(y, m + 1, 0)) },
    { label: 'Last month',    start: toISO(new Date(y, m - 1, 1)), end: toISO(new Date(y, m, 0)) },
    { label: 'This quarter',  start: toISO(new Date(y, Math.floor(m / 3) * 3, 1)), end: toISO(new Date(y, Math.floor(m / 3) * 3 + 3, 0)) },
    { label: 'Last quarter',  start: toISO(new Date(y, Math.floor(m / 3) * 3 - 3, 1)), end: toISO(new Date(y, Math.floor(m / 3) * 3, 0)) },
    { label: 'This year',     start: toISO(new Date(y, 0, 1)),     end: toISO(new Date(y, 11, 31)) },
    { label: 'Last year',     start: toISO(new Date(y - 1, 0, 1)), end: toISO(new Date(y - 1, 11, 31)) },
    { label: 'Last 30 days',  start: toISO(new Date(now.getTime() - 30 * 86400000)), end: toISO(now) },
    { label: 'Last 90 days',  start: toISO(new Date(now.getTime() - 90 * 86400000)), end: toISO(now) },
  ];
}

function monthRange() {
  const p = datePresets()[0];
  return { start: p.start, end: p.end };
}

// ── Shared UI ────────────────────────────────────────────────────────────────

function ExportButton({ onClick }) {
  return (
    <button onClick={onClick} className="text-sm font-medium text-brand-600 hover:text-brand-700 border border-brand-300 px-3 py-1.5 rounded-lg transition-colors">
      Export CSV
    </button>
  );
}

function FilterSelect({ label, value, onChange, options, allLabel = 'All' }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-600">
      {label}
      <select value={value} onChange={e => onChange(e.target.value)} className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500">
        <option value="">{allLabel}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function DateInput({ label, value, onChange }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-600">
      {label}
      <input type="date" value={value} onChange={e => onChange(e.target.value)} className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500" />
    </label>
  );
}

function DateRangeFilter({ start, end, onStartChange, onEndChange }) {
  const presets = datePresets();
  const handlePreset = (e) => {
    const preset = presets.find(p => p.label === e.target.value);
    if (preset) { onStartChange(preset.start); onEndChange(preset.end); }
  };
  // Determine if current range matches a preset
  const activePreset = presets.find(p => p.start === start && p.end === end)?.label || '';

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <select
        value={activePreset}
        onChange={handlePreset}
        className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
      >
        <option value="" disabled>Quick range...</option>
        {presets.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
      </select>
      <DateInput label="From" value={start} onChange={onStartChange} />
      <DateInput label="To" value={end} onChange={onEndChange} />
    </div>
  );
}

// ── Aging Report ─────────────────────────────────────────────────────────────

function AgingReport() {
  const api = useApi();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clinicians, setClinicians] = useState([]);
  const [clinicianId, setClinicianId] = useState('');

  useEffect(() => {
    api.get('/clinicians').then(setClinicians).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = clinicianId ? `?clinician_id=${clinicianId}` : '';
    api.get(`/reports/aging${params}`).then(setData).catch(() => setData([])).finally(() => setLoading(false));
  }, [clinicianId]);

  const totals = data.reduce(
    (acc, r) => ({
      current: acc.current + parseFloat(r.current || 0),
      days_1_30: acc.days_1_30 + parseFloat(r.days_1_30 || 0),
      days_31_60: acc.days_31_60 + parseFloat(r.days_31_60 || 0),
      days_61_plus: acc.days_61_plus + parseFloat(r.days_61_plus || 0),
      total: acc.total + parseFloat(r.total || 0),
    }),
    { current: 0, days_1_30: 0, days_31_60: 0, days_61_plus: 0, total: 0 }
  );

  const handleExport = () => {
    const headers = ['Client', 'Primary Clinician', 'Current', '1-30 Days', '31-60 Days', '61+ Days', 'Total Balance'];
    const rows = data.map(r => [r.client_name, r.clinician_name, r.current, r.days_1_30, r.days_31_60, r.days_61_plus, r.total]);
    rows.push(['TOTAL', '', totals.current.toFixed(2), totals.days_1_30.toFixed(2), totals.days_31_60.toFixed(2), totals.days_61_plus.toFixed(2), totals.total.toFixed(2)]);
    downloadCsv('aging-report.csv', headers, rows);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <FilterSelect label="Clinician" value={clinicianId} onChange={setClinicianId} options={clinicians.map(c => ({ value: c.id, label: c.full_name }))} />
        </div>
        <ExportButton onClick={handleExport} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <p className="text-sm text-gray-400 p-6">Loading...</p>
        ) : data.length === 0 ? (
          <p className="text-sm text-gray-400 p-6">No aging data found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Primary Clinician</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Current</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">1-30 Days</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">31-60 Days</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">61+ Days</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5 text-gray-900">{r.client_name}</td>
                  <td className="px-5 py-3.5 text-gray-500">{r.clinician_name}</td>
                  <td className="px-5 py-3.5 text-right text-green-600">{fmt(r.current)}</td>
                  <td className="px-5 py-3.5 text-right text-yellow-600">{fmt(r.days_1_30)}</td>
                  <td className="px-5 py-3.5 text-right text-orange-600">{fmt(r.days_31_60)}</td>
                  <td className="px-5 py-3.5 text-right text-red-600">{fmt(r.days_61_plus)}</td>
                  <td className="px-5 py-3.5 text-right font-semibold text-gray-900">{fmt(r.total)}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 border-t border-gray-300">
                <td className="px-5 py-3.5 font-semibold text-gray-900">Total</td>
                <td className="px-5 py-3.5" />
                <td className="px-5 py-3.5 text-right font-semibold text-green-600">{fmt(totals.current)}</td>
                <td className="px-5 py-3.5 text-right font-semibold text-yellow-600">{fmt(totals.days_1_30)}</td>
                <td className="px-5 py-3.5 text-right font-semibold text-orange-600">{fmt(totals.days_31_60)}</td>
                <td className="px-5 py-3.5 text-right font-semibold text-red-600">{fmt(totals.days_61_plus)}</td>
                <td className="px-5 py-3.5 text-right font-bold text-gray-900">{fmt(totals.total)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Clinician Report ─────────────────────────────────────────────────────────

function ClinicianReport() {
  const api = useApi();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clinicians, setClinicians] = useState([]);
  const [clinicianId, setClinicianId] = useState('');
  const { start: defaultStart, end: defaultEnd } = monthRange();
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);

  useEffect(() => {
    api.get('/clinicians').then(setClinicians).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    let params = `?start=${start}&end=${end}`;
    if (clinicianId) params += `&clinician_id=${clinicianId}`;
    api.get(`/reports/clinician-invoicing${params}`).then(setData).catch(() => setData([])).finally(() => setLoading(false));
  }, [start, end, clinicianId]);

  const totals = data.reduce(
    (acc, r) => ({
      appointments: acc.appointments + (parseInt(r.appointments) || 0),
      total_fees: acc.total_fees + parseFloat(r.total_fees || 0),
      invoiced: acc.invoiced + parseFloat(r.invoiced || 0),
      uninvoiced: acc.uninvoiced + parseFloat(r.uninvoiced || 0),
    }),
    { appointments: 0, total_fees: 0, invoiced: 0, uninvoiced: 0 }
  );

  const handleExport = () => {
    const headers = ['Clinician', 'Appointments', 'Total Fees', 'Invoiced', 'Uninvoiced'];
    const rows = data.map(r => [r.clinician_name, r.appointments, r.total_fees, r.invoiced, r.uninvoiced]);
    rows.push(['TOTAL', totals.appointments, totals.total_fees.toFixed(2), totals.invoiced.toFixed(2), totals.uninvoiced.toFixed(2)]);
    downloadCsv('clinician-report.csv', headers, rows);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-4 flex-wrap">
          <DateRangeFilter start={start} end={end} onStartChange={setStart} onEndChange={setEnd} />
          <FilterSelect label="Clinician" value={clinicianId} onChange={setClinicianId} options={clinicians.map(c => ({ value: c.id, label: c.full_name }))} />
        </div>
        <ExportButton onClick={handleExport} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <p className="text-sm text-gray-400 p-6">Loading...</p>
        ) : data.length === 0 ? (
          <p className="text-sm text-gray-400 p-6">No clinician invoicing data found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Clinician</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Appointments</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Fees</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Invoiced</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Uninvoiced</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5 text-gray-900">{r.clinician_name}</td>
                  <td className="px-5 py-3.5 text-right text-gray-900">{r.appointments}</td>
                  <td className="px-5 py-3.5 text-right text-gray-900">{fmt(r.total_fees)}</td>
                  <td className="px-5 py-3.5 text-right text-green-600">{fmt(r.invoiced)}</td>
                  <td className="px-5 py-3.5 text-right text-orange-600">{fmt(r.uninvoiced)}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 border-t border-gray-300">
                <td className="px-5 py-3.5 font-semibold text-gray-900">Total</td>
                <td className="px-5 py-3.5 text-right font-semibold text-gray-900">{totals.appointments}</td>
                <td className="px-5 py-3.5 text-right font-semibold text-gray-900">{fmt(totals.total_fees)}</td>
                <td className="px-5 py-3.5 text-right font-semibold text-green-600">{fmt(totals.invoiced)}</td>
                <td className="px-5 py-3.5 text-right font-semibold text-orange-600">{fmt(totals.uninvoiced)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Attendance Report ────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'Show', label: 'Show' },
  { value: 'No Show', label: 'No Show' },
  { value: 'Late Cancel', label: 'Late Cancel' },
  { value: 'Canceled', label: 'Canceled' },
];

const STATUS_STYLES = {
  Show: 'bg-green-50 text-green-700',
  'No Show': 'bg-red-50 text-red-700',
  'Late Cancel': 'bg-orange-50 text-orange-700',
  Canceled: 'bg-gray-100 text-gray-500',
};

function StatusBadge({ status }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[status] || 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  );
}

function AttendanceReport() {
  const api = useApi();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clinicians, setClinicians] = useState([]);
  const [clients, setClients] = useState([]);
  const [clinicianId, setClinicianId] = useState('');
  const [clientId, setClientId] = useState('');
  const [status, setStatus] = useState('');
  const { start: defaultStart, end: defaultEnd } = monthRange();
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);

  useEffect(() => {
    api.get('/clinicians').then(setClinicians).catch(() => {});
    api.get('/clients').then(setClients).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    let params = `?start=${start}&end=${end}`;
    if (clinicianId) params += `&clinician_id=${clinicianId}`;
    if (clientId) params += `&client_id=${clientId}`;
    if (status) params += `&status=${encodeURIComponent(status)}`;
    api.get(`/reports/attendance${params}`).then(res => setData(res.rows || [])).catch(() => setData([])).finally(() => setLoading(false));
  }, [start, end, clinicianId, clientId, status]);

  const uniqueClients = new Set(data.map(r => r.client_name));
  const uniqueClinicians = new Set(data.map(r => r.clinician_name));
  const statusBreakdown = data.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  const handleExport = () => {
    const headers = ['Client', 'Clinician', 'Date of Service', 'Location', 'Status'];
    const rows = data.map(r => [r.client_name, r.clinician_name, fmtDate(r.starts_at), r.location || '', r.status]);
    downloadCsv('attendance-report.csv', headers, rows);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-4 flex-wrap">
          <DateRangeFilter start={start} end={end} onStartChange={setStart} onEndChange={setEnd} />
          <FilterSelect label="Client" value={clientId} onChange={setClientId} options={clients.map(c => ({ value: c.id, label: c.full_name }))} />
          <FilterSelect label="Clinician" value={clinicianId} onChange={setClinicianId} options={clinicians.map(c => ({ value: c.id, label: c.full_name }))} />
          <FilterSelect label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        </div>
        <ExportButton onClick={handleExport} />
      </div>

      {!loading && data.length > 0 && (
        <div className="flex items-center gap-4 mb-4 flex-wrap text-sm">
          <span className="text-gray-600"><span className="font-semibold text-gray-900">{uniqueClients.size}</span> clients</span>
          <span className="text-gray-300">|</span>
          <span className="text-gray-600"><span className="font-semibold text-gray-900">{uniqueClinicians.size}</span> clinicians</span>
          <span className="text-gray-300">|</span>
          <span className="text-gray-600"><span className="font-semibold text-gray-900">{data.length}</span> appointments</span>
          {Object.entries(statusBreakdown).map(([s, count]) => (
            <span key={s}><StatusBadge status={s} /> <span className="text-gray-600 text-sm">{count}</span></span>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <p className="text-sm text-gray-400 p-6">Loading...</p>
        ) : data.length === 0 ? (
          <p className="text-sm text-gray-400 p-6">No attendance data found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Clinician</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date of Service</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Location</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5 text-gray-900">{r.client_name}</td>
                  <td className="px-5 py-3.5 text-gray-500">{r.clinician_name}</td>
                  <td className="px-5 py-3.5 text-gray-500">{fmtDate(r.starts_at)}</td>
                  <td className="px-5 py-3.5 text-gray-500">{r.location || '\u2014'}</td>
                  <td className="px-5 py-3.5"><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Payouts Report (placeholder) ─────────────────────────────────────────────

function PayoutsReport() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center max-w-sm">
        <div className="mx-auto w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Stripe Payouts</h3>
        <p className="text-sm text-gray-500">Stripe payout reporting will be available once connected to your Stripe account.</p>
      </div>
    </div>
  );
}

// ── Main Reports Page ────────────────────────────────────────────────────────

const TABS = [
  { key: 'aging', label: 'Aging' },
  { key: 'clinician', label: 'Clinician Invoicing' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'payouts', label: 'Payouts' },
];

export default function Reports() {
  const [tab, setTab] = useState('aging');

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Reports</h1>
      <p className="text-sm text-gray-500">View and export practice reports</p>

      <div className="flex gap-6 mt-4">
        <nav className="w-48 flex-shrink-0">
          <div className="space-y-1">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.key
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </nav>

        <div className="flex-1 min-w-0">
          {tab === 'aging' && <AgingReport />}
          {tab === 'clinician' && <ClinicianReport />}
          {tab === 'attendance' && <AttendanceReport />}
          {tab === 'payouts' && <PayoutsReport />}
        </div>
      </div>
    </div>
  );
}
