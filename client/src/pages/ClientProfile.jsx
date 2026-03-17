import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '@clerk/react';
import { formatPhone } from '../utils/phone.js';
import { pdf } from '@react-pdf/renderer';
import InvoicePdf from '../components/pdf/InvoicePdf.jsx';
import SuperbillPdf from '../components/pdf/SuperbillPdf.jsx';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function fmt(amount) {
  return `$${parseFloat(amount || 0).toFixed(2)}`;
}

function statusBadge(status) {
  const styles = { Show: 'bg-green-100 text-green-700', 'No Show': 'bg-red-100 text-red-700', 'Late Cancel': 'bg-yellow-100 text-yellow-700', Canceled: 'bg-gray-100 text-gray-500' };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status] || 'bg-gray-100 text-gray-500'}`}>{status}</span>;
}

function billingBadge(status) {
  const styles = { Uninvoiced: 'bg-orange-100 text-orange-700', Invoiced: 'bg-blue-100 text-blue-700', Paid: 'bg-green-100 text-green-700' };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status] || 'bg-gray-100 text-gray-500'}`}>{status}</span>;
}

// ── New Invoice Modal ─────────────────────────────────────────────────────────
function CreateInvoiceModal({ client, onClose, onCreated }) {
  const api = useApi();
  const today = new Date();
  const toISO = d => d.toISOString().split('T')[0];
  // Default: last 30 days
  const defaultStart = toISO(new Date(today.getFullYear(), today.getMonth() - 1, 1));
  const defaultEnd   = toISO(new Date(today.getFullYear(), today.getMonth(), 0));

  const [step, setStep] = useState(1);
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd]     = useState(defaultEnd);
  const [sessions, setSessions] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Step 2 — editable invoice state
  const [clinicians, setClinicians] = useState([]);
  const [issuedDate, setIssuedDate] = useState(toISO(today));
  const [dueDate, setDueDate]       = useState('');
  const [providerId, setProviderId] = useState('');
  const [lineItems, setLineItems]   = useState([]);
  const [notes, setNotes]           = useState('');
  const [saving, setSaving]         = useState(false);

  // Load clinicians for provider selector
  useEffect(() => {
    api.get('/clinicians').then(rows => {
      setClinicians(rows);
    });
    // Load due days from settings to prefill due date
    api.get('/settings').then(s => {
      const days = s.invoice_due_days || 15;
      const d = new Date(today);
      d.setDate(d.getDate() + days);
      setDueDate(toISO(d));
    });
  }, []);

  const loadSessions = async () => {
    setLoadingPreview(true);
    try {
      const rows = await api.get(`/invoices/preview?start=${start}&end=${end}&client_id=${client.id}`);
      setSessions(rows);
      setSelected(new Set(rows.map(r => r.id)));
      setStep(2);
      // Pre-populate line items and provider from sessions
      if (rows.length > 0) {
        setProviderId(String(rows[0].clinician_id));
        setLineItems(rows.map(r => ({
          appointment_id: r.id,
          service_date:   r.starts_at.split('T')[0],
          description:    `${r.service_description} (${r.cpt_code}) with ${r.clinician_name}${r.status === 'No Show' ? ' — No Show' : ''}`,
          amount:         parseFloat(r.fee || 0),
          is_no_show:     r.status === 'No Show',
          _key:           r.id,
        })));
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setLoadingPreview(false);
    }
  };

  const toggleSession = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setLineItems(li => li.filter(i => i.appointment_id !== id));
      } else {
        next.add(id);
        const s = sessions.find(s => s.id === id);
        if (s) {
          setLineItems(li => [...li, {
            appointment_id: s.id,
            service_date:   s.starts_at.split('T')[0],
            description:    `${s.service_description} (${s.cpt_code}) with ${s.clinician_name}${s.status === 'No Show' ? ' — No Show' : ''}`,
            amount:         parseFloat(s.fee || 0),
            is_no_show:     s.status === 'No Show',
            _key:           s.id,
          }].sort((a, b) => a.service_date.localeCompare(b.service_date)));
        }
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === sessions.length) {
      setSelected(new Set());
      setLineItems([]);
    } else {
      setSelected(new Set(sessions.map(s => s.id)));
      setLineItems(sessions.map(r => ({
        appointment_id: r.id,
        service_date:   r.starts_at.split('T')[0],
        description:    `${r.service_description} (${r.cpt_code}) with ${r.clinician_name}${r.status === 'No Show' ? ' — No Show' : ''}`,
        amount:         parseFloat(r.fee || 0),
        is_no_show:     r.status === 'No Show',
        _key:           r.id,
      })).sort((a, b) => a.service_date.localeCompare(b.service_date)));
    }
  };

  const removeLineItem = (key) => {
    setLineItems(li => li.filter(i => i._key !== key));
    setSelected(prev => { const next = new Set(prev); next.delete(key); return next; });
  };

  const updateLineItem = (key, field, value) => {
    setLineItems(li => li.map(i => i._key === key ? { ...i, [field]: value } : i));
  };

  const addLineItem = () => {
    const key = `manual_${Date.now()}`;
    setLineItems(li => [...li, {
      appointment_id: null,
      service_date:   toISO(today),
      description:    '',
      amount:         0,
      is_no_show:     false,
      _key:           key,
    }]);
  };

  const subtotal = lineItems.reduce((sum, i) => sum + parseFloat(i.amount || 0), 0);

  const handleSave = async () => {
    if (!lineItems.length) { alert('No line items on this invoice.'); return; }
    setSaving(true);
    try {
      await api.post('/invoices/generate', {
        client_id:        client.id,
        clinician_id:     providerId ? parseInt(providerId) : null,
        issued_date:      issuedDate,
        due_date:         dueDate,
        notes,
        line_items:       lineItems.map(i => ({
          appointment_id: i.appointment_id,
          service_date:   i.service_date,
          description:    i.description,
          amount:         parseFloat(i.amount || 0),
          is_no_show:     i.is_no_show || false,
        })),
      });
      onCreated();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const allChecked = sessions.length > 0 && selected.size === sessions.length;
  const someChecked = selected.size > 0 && selected.size < sessions.length;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 overflow-y-auto py-8 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">
            {step === 1 ? `Create Invoice for ${client.full_name}` : `Invoice for ${client.full_name}`}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step 1 — Select appointments */}
        {step === 1 && (
          <>
            <div className="px-6 py-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-gray-700">Select Appointments to Invoice</p>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500">Adjust Date Range</label>
                  <div className="flex items-center gap-1">
                    <input type="date" value={start} onChange={e => setStart(e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400" />
                    <span className="text-gray-400 text-xs">–</span>
                    <input type="date" value={end} onChange={e => setEnd(e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400" />
                    <button onClick={loadSessions} disabled={loadingPreview}
                      className="text-xs text-brand-500 hover:underline ml-1">
                      {loadingPreview ? 'Loading...' : 'Refresh'}
                    </button>
                  </div>
                </div>
              </div>

              <p className="text-sm text-gray-500 mb-4">
                {sessions.length} uninvoiced appointment{sessions.length !== 1 ? 's' : ''} for {fmtDate(start)} – {fmtDate(end)}
              </p>

              {sessions.length > 0 && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="pb-2 w-8">
                        <input type="checkbox" checked={allChecked}
                          ref={el => { if (el) el.indeterminate = someChecked; }}
                          onChange={toggleAll}
                          className="rounded border-gray-300 text-brand-500 focus:ring-brand-400" />
                      </th>
                      <th className="text-left pb-2 text-xs font-semibold text-gray-500">Date</th>
                      <th className="text-left pb-2 text-xs font-semibold text-gray-500">Details</th>
                      <th className="text-left pb-2 text-xs font-semibold text-gray-500">Type</th>
                      <th className="text-right pb-2 text-xs font-semibold text-gray-500">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sessions.map(s => (
                      <tr key={s.id}>
                        <td className="py-3">
                          <input type="checkbox" checked={selected.has(s.id)}
                            onChange={() => toggleSession(s.id)}
                            className="rounded border-gray-300 text-brand-500 focus:ring-brand-400" />
                        </td>
                        <td className="py-3 text-gray-500 whitespace-nowrap">
                          {new Date(s.starts_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
                        </td>
                        <td className="py-3 text-gray-700">{s.service_description} ({s.cpt_code}) with {s.clinician_name}</td>
                        <td className="py-3 text-gray-500">Self-pay</td>
                        <td className="py-3 text-right font-medium text-gray-900">{fmt(s.fee)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {sessions.length === 0 && (
                <p className="text-sm text-gray-400 py-8 text-center">
                  No uninvoiced appointments in this date range.
                </p>
              )}
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
              <button onClick={onClose}
                className="text-sm font-medium text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">
                Cancel
              </button>
              <button
                onClick={sessions.length === 0 ? loadSessions : () => setStep(2)}
                disabled={loadingPreview}
                className="bg-brand-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors">
                {loadingPreview ? 'Loading...' : sessions.length === 0 ? 'Load sessions' : 'Create Invoice →'}
              </button>
            </div>
          </>
        )}

        {/* Step 2 — Editable invoice preview */}
        {step === 2 && (
          <>
            <div className="px-8 py-6 space-y-6">
              {/* Invoice meta */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Bill To</p>
                  <p className="text-sm font-medium text-gray-900">
                    {client.contacts?.find(c => c.is_responsible_party)?.full_name || client.full_name}
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Issued</span>
                    <input type="date" value={issuedDate} onChange={e => setIssuedDate(e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Due</span>
                    <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Client</p>
                  <p className="text-sm text-gray-900">{client.full_name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Provider</p>
                  <select value={providerId} onChange={e => setProviderId(e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400">
                    <option value="">Select provider</option>
                    {clinicians.map(c => (
                      <option key={c.id} value={c.id}>{c.full_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Line items */}
              <div>
                <table className="w-full text-sm mb-2">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left pb-2 text-xs font-semibold text-gray-500 w-28">Date</th>
                      <th className="text-left pb-2 text-xs font-semibold text-gray-500">Description</th>
                      <th className="text-right pb-2 text-xs font-semibold text-gray-500 w-24">Amount</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {lineItems.map(item => (
                      <tr key={item._key}>
                        <td className="py-2.5 pr-3">
                          <input type="date" value={item.service_date}
                            onChange={e => updateLineItem(item._key, 'service_date', e.target.value)}
                            className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400" />
                        </td>
                        <td className="py-2.5 pr-3">
                          <input type="text" value={item.description}
                            onChange={e => updateLineItem(item._key, 'description', e.target.value)}
                            className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400" />
                        </td>
                        <td className="py-2.5 pr-3">
                          <input type="number" step="0.01" value={item.amount}
                            onChange={e => updateLineItem(item._key, 'amount', e.target.value)}
                            className="w-full border border-gray-200 rounded px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-brand-400" />
                        </td>
                        <td className="py-2.5 text-center">
                          <button onClick={() => removeLineItem(item._key)}
                            className="text-gray-300 hover:text-red-400 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <button onClick={addLineItem}
                  className="text-sm text-brand-500 hover:underline font-medium">
                  + Add Line Item
                </button>
              </div>

              {/* Totals */}
              <div className="ml-auto w-56 space-y-1.5 text-sm border-t border-gray-200 pt-3">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span><span>{fmt(subtotal)}</span>
                </div>
                <div className="flex justify-between font-semibold text-gray-900">
                  <span>Total</span><span>{fmt(subtotal)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Amount Paid</span><span>0.00</span>
                </div>
                <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-1.5 text-gray-900">
                  <span>Balance</span><span>{fmt(subtotal)}</span>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none" />
              </div>
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
              <button onClick={() => setStep(1)}
                className="text-sm font-medium text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">
                ← Back
              </button>
              <button onClick={handleSave} disabled={saving}
                className="bg-brand-500 text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors">
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Invoice list for sidebar ──────────────────────────────────────────────────
function DiagnosisForm({ diag, clientId, onSaved, onCancel }) {
  const api = useApi();
  const [codeInput, setCodeInput] = useState(diag?.icd10_code || '');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const searchTimeout = useRef(null);
  const dropdownRef = useRef(null);

  const [form, setForm] = useState({
    icd10_code: diag?.icd10_code || '',
    description: diag?.description || '',
    diagnosed_at: diag?.diagnosed_at ? new Date(diag.diagnosed_at).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16),
    notes: diag?.notes || '',
  });

  useEffect(() => {
    if (codeInput.length < 2) { setResults([]); setShowDropdown(false); return; }
    clearTimeout(searchTimeout.current);
    setSearching(true);
    searchTimeout.current = setTimeout(async () => {
      try {
        const rows = await api.get(`/clients/icd10?q=${encodeURIComponent(codeInput)}`);
        setResults(rows);
        setShowDropdown(rows.length > 0);
        setHighlightIdx(-1);
      } finally { setSearching(false); }
    }, 200);
  }, [codeInput]);

  useEffect(() => {
    const handler = (e) => { if (!dropdownRef.current?.contains(e.target)) setShowDropdown(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectCode = (code) => {
    setForm(f => ({ ...f, icd10_code: code.code, description: code.description }));
    setCodeInput(code.code);
    setShowDropdown(false);
    setResults([]);
    setHighlightIdx(-1);
  };

  const handleKeyDown = (e) => {
    if (!showDropdown || results.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => (i + 1) % results.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => (i - 1 + results.length) % results.length); }
    else if (e.key === 'Enter' && highlightIdx >= 0) { e.preventDefault(); selectCode(results[highlightIdx]); }
    else if (e.key === 'Escape') { setShowDropdown(false); }
  };

  const handleSave = async () => {
    if (!form.icd10_code || !form.description) { alert('Select a diagnosis code.'); return; }
    setSaving(true);
    try {
      if (diag?.id) {
        await api.patch(`/clients/${clientId}/diagnosis/${diag.id}`, form);
      } else {
        await api.post(`/clients/${clientId}/diagnosis`, form);
      }
      onSaved();
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-3 pt-3 border-t border-gray-100">
      <div className="relative" ref={dropdownRef}>
        <label className="block text-xs font-medium text-gray-500 mb-1">Diagnosis code</label>
        <input type="text" placeholder="Search ICD-10 codes..." value={codeInput}
          onChange={e => { setCodeInput(e.target.value); if (!e.target.value) setForm(f => ({ ...f, icd10_code: '', description: '' })); }}
          onKeyDown={handleKeyDown}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
        {searching && <p className="text-xs text-gray-400 mt-1">Searching...</p>}
        {showDropdown && (
          <div className="absolute z-10 w-full mt-1 border border-gray-200 rounded-lg bg-white shadow-lg max-h-48 overflow-y-auto">
            {results.map((c, i) => (
              <button key={c.code} onMouseDown={() => selectCode(c)}
                className={`w-full text-left px-3 py-2 text-sm border-b border-gray-50 last:border-0 ${i === highlightIdx ? 'bg-brand-50 text-brand-700' : 'hover:bg-gray-50'}`}>
                <span className="font-medium">{c.code}</span>
                <span className={`ml-2 ${i === highlightIdx ? 'text-brand-500' : 'text-gray-500'}`}>{c.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
        <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" placeholder="Diagnosis description" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Date and time of diagnosis</label>
        <input type="datetime-local" value={form.diagnosed_at} onChange={e => setForm(f => ({ ...f, diagnosed_at: e.target.value }))}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Treatment plan notes</label>
        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Optional"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none" />
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={handleSave} disabled={saving}
          className="bg-brand-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors">
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button onClick={onCancel} className="text-sm font-medium text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">Cancel</button>
      </div>
    </div>
  );
}

function DiagnosisCard({ client, clientId, onRefresh }) {
  const api = useApi();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const diagnoses = client.diagnoses || [];

  const handleRemove = async (d) => {
    if (!confirm(`Remove diagnosis ${d.icd10_code} — ${d.description}?`)) return;
    await api.delete(`/clients/${clientId}/diagnosis/${d.id}`);
    onRefresh();
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700">Diagnosis</h2>
        {!adding && !editingId && (
          <button onClick={() => setAdding(true)} className="text-xs text-brand-500 hover:underline">+ Add</button>
        )}
      </div>

      {diagnoses.length === 0 && !adding && (
        <p className="text-sm text-gray-400">No diagnosis on file.</p>
      )}

      {diagnoses.map(d => (
        editingId === d.id ? (
          <DiagnosisForm key={d.id} diag={d} clientId={clientId}
            onSaved={() => { setEditingId(null); onRefresh(); }}
            onCancel={() => setEditingId(null)} />
        ) : (
          <div key={d.id} className="text-sm py-2 border-b border-gray-50 last:border-0">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium">{d.icd10_code} — {d.description}</p>
                <p className="text-gray-400 text-xs mt-0.5">{formatDate(d.diagnosed_at)}</p>
                {d.notes && <p className="text-gray-500 text-xs mt-0.5">{d.notes}</p>}
              </div>
              <div className="flex gap-2 shrink-0 ml-2">
                <button onClick={() => setEditingId(d.id)} className="text-xs text-brand-500 hover:underline">Edit</button>
                <button onClick={() => handleRemove(d)} className="text-xs text-gray-400 hover:text-red-500 transition-colors">Remove</button>
              </div>
            </div>
          </div>
        )
      ))}

      {adding && (
        <DiagnosisForm clientId={clientId}
          onSaved={() => { setAdding(false); onRefresh(); }}
          onCancel={() => setAdding(false)} />
      )}
    </div>
  );
}

function BillingCard({ clientId, uninvoicedAppts, uninvoicedAmount, unpaidInvoiced, onNewInvoice }) {
  const api = useApi();
  const [card, setCard] = useState(null);
  const [loadingCard, setLoadingCard] = useState(true);

  useEffect(() => {
    api.get(`/payments/card/${clientId}`)
      .then(setCard)
      .catch(() => setCard({ has_card: false }))
      .finally(() => setLoadingCard(false));
  }, [clientId]);

  const handleSetupCard = async () => {
    try {
      const { url } = await api.post(`/payments/setup/${clientId}`);
      await navigator.clipboard.writeText(url);
      alert('Card setup link copied to clipboard. Send it to the parent to save their card.');
    } catch (err) { alert(err.message); }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Client billing</h2>
      <div className="space-y-2 text-sm mb-4">
        <div className="flex justify-between">
          <span className="text-gray-500">Uninvoiced ({uninvoicedAppts.length})</span>
          <span className="font-medium">${uninvoicedAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Unpaid invoices ({unpaidInvoiced.length})</span>
          <span className="font-medium text-orange-600">
            ${unpaidInvoiced.reduce((s, a) => s + parseFloat(a.fee || 0), 0).toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between items-center pt-2 border-t border-gray-100">
          <span className="text-gray-500">Card on file</span>
          {loadingCard ? (
            <span className="text-gray-400 text-xs">Loading...</span>
          ) : card?.has_card ? (
            <span className="text-xs font-medium text-gray-700">
              {card.brand?.toUpperCase()} •••• {card.last4}
              <span className="text-gray-400 ml-1">{card.exp_month}/{card.exp_year}</span>
            </span>
          ) : (
            <button onClick={handleSetupCard} className="text-xs text-brand-500 hover:underline">
              + Setup card
            </button>
          )}
        </div>
      </div>
      <button onClick={onNewInvoice}
        className="w-full bg-brand-500 text-white text-sm font-medium py-2 rounded-lg hover:bg-brand-600 transition-colors">
        + New Invoice
      </button>
    </div>
  );
}

function InvoicesSidebar({ clientId, refresh, onSelect }) {
  const api = useApi();
  const [invoices, setInvoices] = useState([]);

  useEffect(() => {
    api.get(`/invoices?client_id=${clientId}`).then(setInvoices).catch(() => {});
  }, [clientId, refresh]);

  if (!invoices.length) return <p className="text-sm text-gray-400">No invoices yet.</p>;

  return (
    <div className="space-y-1.5">
      {invoices.map(inv => (
        <div key={inv.id} className="flex items-center justify-between text-sm">
          <button onClick={() => onSelect(inv.id)}
            className="text-brand-600 hover:underline font-medium text-left">
            INV #{inv.invoice_number}
          </button>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
              inv.status === 'Paid' ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'
            }`}>{inv.status}</span>
            <span className="text-xs text-gray-400">{new Date(inv.issued_date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit', timeZone: 'UTC' })}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── New dropdown menu ─────────────────────────────────────────────────────────
function NewMenu({ onInvoice }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 bg-brand-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-brand-600 transition-colors">
        New
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden z-20">
          <button onClick={() => { onInvoice(); setOpen(false); }}
            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
            Invoice
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
const SOAP_FIELDS = [
  { key: 'subjective', label: 'S — Subjective' },
  { key: 'objective', label: 'O — Objective' },
  { key: 'assessment', label: 'A — Assessment' },
  { key: 'note_plan', label: 'P — Plan' },
];

const sectionClass = "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none min-h-[100px]";

function NoteEditor({ note, clientId, onSaved, onCancel }) {
  const api = useApi();
  const [form, setForm] = useState({
    subjective: note?.subjective || '',
    objective: note?.objective || '',
    assessment: note?.assessment || '',
    plan: note?.note_plan || '',
  });
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const setF = (field, val) => setForm(f => ({ ...f, [field]: val }));

  const handleSave = async () => {
    setSaving(true);
    try {
      if (note?.note_id) {
        await api.patch(`/notes/${note.note_id}`, form);
      } else {
        await api.post('/notes', { ...form, appointment_id: note.id, client_id: clientId });
      }
      onSaved();
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  };

  const handleFinalize = async () => {
    if (!confirm('Finalize this note? It will be locked for editing.')) return;
    setFinalizing(true);
    try {
      if (!note?.note_id) {
        const saved = await api.post('/notes', { ...form, appointment_id: note.id, client_id: clientId });
        await api.post(`/notes/${saved.id}/finalize`);
      } else {
        await api.patch(`/notes/${note.note_id}`, form);
        await api.post(`/notes/${note.note_id}/finalize`);
      }
      onSaved();
    } catch (err) { alert(err.message); }
    finally { setFinalizing(false); }
  };

  return (
    <div className="mt-4 space-y-3">
      {[
        { key: 'subjective', label: 'S — Subjective' },
        { key: 'objective', label: 'O — Objective' },
        { key: 'assessment', label: 'A — Assessment' },
        { key: 'plan', label: 'P — Plan' },
      ].map(({ key, label }) => (
        <div key={key}>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
          <textarea value={form[key]} onChange={e => setF(key, e.target.value)}
            className={sectionClass} placeholder={`Enter ${label.split('—')[1].trim().toLowerCase()}...`} />
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <button onClick={handleFinalize} disabled={finalizing}
          className="bg-brand-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors">
          {finalizing ? 'Finalizing...' : 'Finalize note'}
        </button>
        <button onClick={handleSave} disabled={saving}
          className="border border-gray-300 text-sm font-medium text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
          {saving ? 'Saving...' : 'Save draft'}
        </button>
        <button onClick={onCancel} className="text-sm text-gray-400 hover:text-gray-600 px-2 py-2">Cancel</button>
      </div>
    </div>
  );
}

function TimelineEntry({ appt, clientId, isAdmin, onRefresh }) {
  const api = useApi();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  const hasNote = !!appt.note_id;
  const startDate = new Date(appt.starts_at);
  const endDate = new Date(appt.ends_at);
  const month = startDate.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const day = startDate.getDate();
  const timeRange = `${startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – ${endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;

  const handleUnlock = async () => {
    if (!confirm('Unlock this note for editing?')) return;
    setUnlocking(true);
    try {
      await api.post(`/notes/${appt.note_id}/unlock`);
      onRefresh();
    } catch (err) { alert(err.message); }
    finally { setUnlocking(false); }
  };

  const notePreview = appt.subjective
    ? (appt.subjective.length > 200 ? appt.subjective.slice(0, 200) + '...' : appt.subjective)
    : null;

  return (
    <div className="flex gap-4">
      {/* Date marker */}
      <div className="w-12 shrink-0 text-center pt-1">
        <p className="text-xs font-semibold text-gray-400">{month}</p>
        <p className="text-lg font-bold text-gray-700 leading-tight">{day}</p>
      </div>

      {/* Card */}
      <div className="flex-1 border border-gray-200 rounded-xl bg-white p-4 mb-1">
        {/* Appointment header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">
              APPOINTMENT
              <span className="text-gray-400 font-normal ml-2">#{appt.id}</span>
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              WITH: {appt.clinician_name.toUpperCase()}
              <span className="ml-3">BILLING CODE: {appt.cpt_code}</span>
            </p>
          </div>
          <div className="text-right shrink-0 ml-4">
            <p className="text-sm text-gray-500">{timeRange}</p>
            <div className="flex items-center gap-1.5 justify-end mt-1">
              {statusBadge(appt.status)}
              {billingBadge(appt.billing_status)}
            </div>
          </div>
        </div>

        {/* Note section */}
        {hasNote && !editing ? (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs font-semibold text-gray-700">PROGRESS NOTE</p>
              {appt.is_finalized ? (
                <>
                  <svg className="w-3 h-3 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-xs bg-green-50 text-green-700 font-medium px-1.5 py-0.5 rounded">Finalized</span>
                  {isAdmin && (
                    <button onClick={handleUnlock} disabled={unlocking}
                      className="text-xs text-gray-400 hover:text-amber-600 disabled:opacity-50 ml-1">
                      {unlocking ? 'Unlocking...' : 'Unlock'}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <span className="text-xs bg-yellow-50 text-yellow-700 font-medium px-1.5 py-0.5 rounded">Draft</span>
                  <button onClick={() => setEditing(true)} className="text-xs text-brand-500 hover:underline ml-1">Edit</button>
                </>
              )}
            </div>
            {!expanded && notePreview && (
              <p className="text-sm text-gray-600 mt-1">{notePreview}</p>
            )}
            {expanded && (
              <div className="mt-2 space-y-3">
                {SOAP_FIELDS.map(({ key, label }) => (
                  appt[key] ? (
                    <div key={key}>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{appt[key]}</p>
                    </div>
                  ) : null
                ))}
                <p className="text-xs text-gray-400 pt-1 border-t border-gray-100">
                  Created {formatDateTime(appt.note_created_at)}
                  {appt.finalized_at && ` · Finalized ${formatDateTime(appt.finalized_at)}`}
                  {appt.unlocked_at && ` · Unlocked ${formatDateTime(appt.unlocked_at)}`}
                </p>
              </div>
            )}
            <button onClick={() => setExpanded(e => !e)}
              className="text-sm text-brand-500 hover:underline mt-1.5 font-medium">
              {expanded ? 'Collapse' : 'Read More'}
            </button>
          </div>
        ) : editing ? (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <NoteEditor
              note={appt}
              clientId={clientId}
              onSaved={() => { setEditing(false); onRefresh(); }}
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : appt.status !== 'Canceled' && appt.cpt_code && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <button onClick={() => setEditing(true)}
              className="text-sm text-brand-500 hover:underline font-medium">
              + Progress Note
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ClientProfile() {
  const { id } = useParams();
  const api = useApi();
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { sessionClaims } = useAuth();
  const isAdmin = sessionClaims?.metadata?.role === 'admin';
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceRefresh, setInvoiceRefresh] = useState(0);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);

  const loadClient = () => {
    api.get(`/clients/${id}`).then(setClient).catch(e => setError(e.message)).finally(() => setLoading(false));
  };

  useEffect(() => { loadClient(); }, [id]);

  if (loading) return <p className="text-sm text-gray-400">Loading...</p>;
  if (error)   return <p className="text-sm text-red-500">{error}</p>;
  if (!client) return null;

  const uninvoicedAppts  = client.appointments?.filter(a => a.billing_status === 'Uninvoiced' && a.status !== 'Canceled') || [];
  const uninvoicedAmount = uninvoicedAppts.reduce((sum, a) => sum + parseFloat(a.fee || 0), 0);
  const unpaidInvoiced   = client.appointments?.filter(a => a.billing_status === 'Invoiced') || [];

  const nextAppt = client.appointments?.find(a => a.status !== 'Canceled' && new Date(a.starts_at) > new Date());
  const dobDisplay = client.date_of_birth
    ? new Date(client.date_of_birth).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'UTC' })
    : null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <Link to="/clients" className="text-sm text-gray-400 hover:text-gray-600">← Clients</Link>
          <h1 className="text-2xl font-semibold text-gray-900">{client.full_name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <NewMenu onInvoice={() => setShowInvoiceModal(true)} />
          <Link to={`/clients/${id}/edit`}
            className="text-sm font-medium text-gray-600 px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors">
            Edit
          </Link>
        </div>
      </div>

      {/* Info line under name */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6 flex-wrap">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${client.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {client.status}
        </span>
        {dobDisplay && (
          <>
            <span className="text-gray-300">|</span>
            <span>DOB {dobDisplay} ({client.age} y/o)</span>
          </>
        )}
        {nextAppt && (
          <>
            <span className="text-gray-300">|</span>
            <span>Next Appt: <span className="font-medium text-gray-700">{fmtDate(nextAppt.starts_at)}</span></span>
          </>
        )}
        <span className="text-gray-300">|</span>
        <Link to={`/clients/${id}/edit`} className="text-brand-500 hover:underline">Edit</Link>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">

          {/* Activity timeline */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Activity</h2>
              <Link to={`/calendar?client=${id}`} className="text-xs text-brand-500 hover:underline">View calendar →</Link>
            </div>
            {!client.appointments?.length ? (
              <p className="text-sm text-gray-400">No appointments yet.</p>
            ) : (
              <div className="space-y-3">
                {client.appointments.map(appt => (
                  <TimelineEntry
                    key={appt.id}
                    appt={appt}
                    clientId={id}
                    isAdmin={isAdmin}
                    onRefresh={loadClient}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700">Contacts</h2>
            </div>
            {!client.contacts?.length ? <p className="text-sm text-gray-400">No contacts yet.</p> : (
              <div className="space-y-3">
                {client.contacts.map(contact => (
                  <div key={contact.id} className="text-sm border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{contact.full_name}</p>
                      {contact.is_responsible_party && (
                        <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">Billing</span>
                      )}
                    </div>
                    <p className="text-gray-400 text-xs">{contact.relationship}</p>
                    {contact.phone_primary && <p className="text-gray-600">{formatPhone(contact.phone_primary)}</p>}
                    {contact.email && <p className="text-gray-600">{contact.email}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <DiagnosisCard client={client} clientId={id} onRefresh={loadClient} />

          <BillingCard
            clientId={id}
            uninvoicedAppts={uninvoicedAppts}
            uninvoicedAmount={uninvoicedAmount}
            unpaidInvoiced={unpaidInvoiced}
            onNewInvoice={() => setShowInvoiceModal(true)}
          />

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700">Invoices</h2>
            </div>
            <InvoicesSidebar clientId={id} refresh={invoiceRefresh} onSelect={setSelectedInvoiceId} />
          </div>
        </div>
      </div>

      {showInvoiceModal && (
        <CreateInvoiceModal
          client={client}
          onClose={() => setShowInvoiceModal(false)}
          onCreated={() => {
            setShowInvoiceModal(false);
            setInvoiceRefresh(k => k + 1);
            loadClient();
          }}
        />
      )}

      {selectedInvoiceId && (
        <InvoiceDetailModal
          invoiceId={selectedInvoiceId}
          onClose={() => setSelectedInvoiceId(null)}
          onRefresh={() => {
            setInvoiceRefresh(k => k + 1);
            loadClient();
            setSelectedInvoiceId(null);
          }}
        />
      )}
    </div>
  );
}

// ── Invoice Detail Modal ───────────────────────────────────────────────────────
function InvoiceStatusBadge({ status }) {
  const s = { Paid: 'bg-green-50 text-green-700', Sent: 'bg-yellow-50 text-yellow-700', Draft: 'bg-gray-100 text-gray-500' };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s[status] || s.Draft}`}>{status}</span>;
}

function InvoiceDetailModal({ invoiceId, onClose, onRefresh }) {
  const api = useApi();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [issuedDate, setIssuedDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [lineItems, setLineItems] = useState([]);
  const [notes, setNotes] = useState('');

  const subtotal = lineItems.reduce((s, i) => s + parseFloat(i.amount || 0), 0);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/invoices/${invoiceId}`).then(inv => {
      setInvoice(inv);
      setIssuedDate(inv.issued_date?.split('T')[0] || '');
      setDueDate(inv.due_date?.split('T')[0] || '');
      setLineItems((inv.items || []).map(i => ({
        id: i.id, service_date: i.service_date?.split('T')[0] || '',
        description: i.description, amount: String(parseFloat(i.amount || 0)),
        appointment_id: i.appointment_id || null,
      })));
      setNotes(inv.notes || '');
    }).finally(() => setLoading(false));
  }, [invoiceId]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch(`/invoices/${invoiceId}`, {
        issued_date: issuedDate, due_date: dueDate, notes,
        line_items: lineItems.map(i => ({ id: i.id, service_date: i.service_date, description: i.description, amount: parseFloat(i.amount) || 0, appointment_id: i.appointment_id })),
      });
      await load(); setEditing(false);
      onRefresh();
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  };

  const handleMarkPaid = async () => {
    if (!confirm('Mark this invoice as paid in full?')) return;
    setSaving(true);
    try {
      await api.patch(`/invoices/${invoiceId}`, { status: 'Paid', amount_paid: invoice.total });
      await load();
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  };

  const handlePaymentLink = async () => {
    try {
      const { url } = await api.post(`/payments/checkout/${invoiceId}`);
      await navigator.clipboard.writeText(url);
      alert('Payment link copied to clipboard.');
    } catch (err) { alert(err.message); }
  };

  const handleDownloadPdf = async () => {
    const blob = await pdf(<InvoicePdf invoice={invoice} />).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Invoice-${invoice.invoice_number}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadSuperbill = async () => {
    const client = await api.get(`/clients/${invoice.client_id}`);
    const blob = await pdf(<SuperbillPdf invoice={invoice} diagnoses={client.diagnoses || []} />).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Superbill-${invoice.invoice_number}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete invoice #${invoice.invoice_number}? Sessions will be marked uninvoiced.`)) return;
    setDeleting(true);
    try { await api.delete(`/invoices/${invoiceId}`); onRefresh(); }
    catch (err) { alert(err.message); setDeleting(false); }
  };

  const handleChargeCard = async () => {
    if (!confirm('Charge the card on file for this invoice?')) return;
    setSaving(true);
    try {
      await api.post(`/payments/charge/${invoiceId}`);
      await load();
      onRefresh();
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  };

  const addLine = () => setLineItems(p => [...p, { id: null, service_date: new Date().toISOString().split('T')[0], description: '', amount: '0', appointment_id: null }]);
  const removeLine = idx => setLineItems(p => p.filter((_, i) => i !== idx));
  const updateLine = (idx, f, v) => setLineItems(p => p.map((item, i) => i === idx ? { ...item, [f]: v } : item));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">
            {loading ? 'Invoice' : `Invoice #${invoice?.invoice_number}`}
          </h2>
          <div className="flex items-center gap-3">
            {!loading && !editing && (
              <>
                {invoice?.status !== 'Paid' && (
                  <>
                    <button onClick={handleChargeCard} disabled={saving}
                      className="bg-brand-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-brand-600 disabled:opacity-50">
                      {saving ? 'Charging...' : 'Charge card'}
                    </button>
                    <button onClick={handlePaymentLink}
                      className="border border-brand-300 text-brand-600 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-brand-50">
                      Payment link
                    </button>
                    <button onClick={handleMarkPaid} disabled={saving}
                      className="bg-green-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-green-600 disabled:opacity-50">
                      {saving ? 'Saving...' : 'Mark paid'}
                    </button>
                  </>
                )}
                <button onClick={handleDownloadPdf}
                  className="border border-gray-300 text-gray-700 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-gray-50">
                  Invoice PDF
                </button>
                <button onClick={handleDownloadSuperbill}
                  className="border border-gray-300 text-gray-700 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-gray-50">
                  Superbill
                </button>
                <button onClick={() => setEditing(true)}
                  className="border border-gray-300 text-gray-700 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-gray-50">
                  Edit
                </button>
                <button onClick={handleDelete} disabled={deleting}
                  className="border border-red-200 text-red-500 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50">
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </>
            )}
            {editing && (
              <>
                <button onClick={() => setEditing(false)} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5">Cancel</button>
                <button onClick={handleSave} disabled={saving}
                  className="bg-brand-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-brand-600 disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto max-h-[75vh]">
          {loading ? <p className="text-sm text-gray-400">Loading...</p> : editing ? (
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Client</p>
                  <p className="text-sm text-gray-900">{invoice.client_name}</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Issued</label>
                  <input type="date" value={issuedDate} onChange={e => setIssuedDate(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Due</label>
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                </div>
              </div>
              <div>
                <div className="grid grid-cols-[110px_1fr_80px_28px] gap-2 mb-1.5">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</span>
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</span>
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Amount</span>
                  <span />
                </div>
                <div className="space-y-2">
                  {lineItems.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-[110px_1fr_80px_28px] gap-2 items-center">
                      <input type="date" value={item.service_date} onChange={e => updateLine(idx, 'service_date', e.target.value)}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                      <input type="text" value={item.description} onChange={e => updateLine(idx, 'description', e.target.value)}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                      <input type="number" value={item.amount} onChange={e => updateLine(idx, 'amount', e.target.value)}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand-400" />
                      <button onClick={() => removeLine(idx)} className="text-gray-400 hover:text-red-500">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
                <button onClick={addLine} className="mt-2 text-sm text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Add Line Item
                </button>
              </div>
              <div className="border-t pt-3">
                <div className="ml-auto w-44 space-y-1 text-sm">
                  <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
                  <div className="flex justify-between font-semibold border-t pt-1"><span>Total</span><span>{fmt(subtotal)}</span></div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
              </div>
            </div>
          ) : (
            // View mode
            <div>
              {/* Invoice doc header */}
              <div className="flex justify-between items-start mb-6">
                <div>
                  {invoice.logo_data && <img src={invoice.logo_data} alt="Logo" className="h-8 object-contain mb-2" />}
                  <p className="text-sm font-semibold text-gray-900">{invoice.practice_name}</p>
                  <p className="text-xs text-gray-500">{invoice.address_line1}{invoice.city ? `, ${invoice.city}, ${invoice.state} ${invoice.zip}` : ''}</p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-2 justify-end mb-1">
                    <InvoiceStatusBadge status={invoice.status} />
                  </div>
                  <p className="text-xs text-gray-500">Issued: {fmtDate(invoice.issued_date)}</p>
                  <p className="text-xs text-gray-500">Due: {fmtDate(invoice.due_date)}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-5 text-sm">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Bill To</p>
                  <p className="text-gray-900">{invoice.responsible_party_name || invoice.client_name}</p>
                  {invoice.responsible_party_phone && <p className="text-gray-500 text-xs">{formatPhone(invoice.responsible_party_phone)}</p>}
                  {invoice.responsible_party_email && <p className="text-gray-500 text-xs">{invoice.responsible_party_email}</p>}
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Client</p>
                  <p className="text-gray-900">{invoice.client_name}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Provider</p>
                  <p className="text-gray-900">{invoice.clinician_name}</p>
                  {invoice.npi_number && <p className="text-gray-500 text-xs">NPI: #{invoice.npi_number}</p>}
                  {invoice.tax_id && <p className="text-gray-500 text-xs">Tax ID: {invoice.tax_id}</p>}
                </div>
              </div>

              <table className="w-full text-sm mb-4">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                    <th className="text-left py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</th>
                    <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {invoice.items?.map(item => (
                    <tr key={item.id}>
                      <td className="py-2.5 text-gray-500 w-24">{fmtDate(item.service_date)}</td>
                      <td className="py-2.5 text-gray-700">{item.description}</td>
                      <td className="py-2.5 text-gray-900 text-right font-medium">{fmt(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="border-t border-gray-100 pt-3">
                <div className="ml-auto w-52 space-y-1.5 text-sm">
                  <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{fmt(invoice.subtotal)}</span></div>
                  <div className="flex justify-between font-semibold text-gray-900 border-t border-gray-200 pt-1.5"><span>Total</span><span>{fmt(invoice.total)}</span></div>
                  <div className="flex justify-between text-gray-600"><span>Amount paid</span><span>{fmt(invoice.amount_paid)}</span></div>
                  <div className={`flex justify-between font-bold pt-1.5 border-t border-gray-200 ${parseFloat(invoice.balance) > 0 ? 'text-gray-900' : 'text-green-600'}`}>
                    <span>Balance</span><span>{fmt(invoice.balance)}</span>
                  </div>
                </div>
              </div>

              {invoice.notes && <p className="mt-4 text-sm text-gray-600">{invoice.notes}</p>}
              {invoice.footer_text && <p className="mt-1 text-xs text-gray-400">{invoice.footer_text}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
