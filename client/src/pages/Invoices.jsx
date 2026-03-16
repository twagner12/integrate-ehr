import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';

function fmt(amount) { return `$${parseFloat(amount || 0).toFixed(2)}`; }
function toISO(d) { return d.toISOString().split('T')[0]; }
function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function StatusBadge({ status }) {
  const styles = { Paid: 'bg-green-50 text-green-700', Sent: 'bg-yellow-50 text-yellow-700', Draft: 'bg-gray-100 text-gray-500' };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status] || styles.Draft}`}>{status}</span>;
}

// ── Invoice List ──────────────────────────────────────────────────────────────
function InvoiceList({ onSelect, onGenerate, refresh }) {
  const api = useApi();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const load = useCallback(() => {
    setLoading(true);
    const params = filter !== 'all' ? `?status=${filter}` : '';
    api.get(`/invoices${params}`).then(setInvoices).finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load, refresh]);

  const filters = [{ key: 'all', label: 'All' }, { key: 'Sent', label: 'Unpaid' }, { key: 'Paid', label: 'Paid' }];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Invoices</h1>
          <p className="text-sm text-gray-500 mt-1">Manage and track client invoices</p>
        </div>
        <button onClick={onGenerate} className="bg-brand-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-600 transition-colors">
          + Generate invoices
        </button>
      </div>
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {filters.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${filter === f.key ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? <p className="text-sm text-gray-400 p-6">Loading...</p>
        : invoices.length === 0 ? <p className="text-sm text-gray-400 p-6">No invoices yet.</p>
        : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                {['Invoice','Client','Issued','Due','Amount','Balance','Status'].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.map(inv => (
                <tr key={inv.id} onClick={() => onSelect(inv.id)} className="hover:bg-gray-50 cursor-pointer transition-colors">
                  <td className="px-5 py-3.5 font-medium text-brand-600">#{inv.invoice_number}</td>
                  <td className="px-5 py-3.5 text-gray-900">{inv.client_name}</td>
                  <td className="px-5 py-3.5 text-gray-500">{fmtDate(inv.issued_date)}</td>
                  <td className="px-5 py-3.5 text-gray-500">{fmtDate(inv.due_date)}</td>
                  <td className="px-5 py-3.5 text-gray-900">{fmt(inv.total)}</td>
                  <td className="px-5 py-3.5 text-gray-900">{fmt(inv.balance)}</td>
                  <td className="px-5 py-3.5"><StatusBadge status={inv.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Invoice Detail ─────────────────────────────────────────────────────────────
function InvoiceDetail({ invoiceId, onBack, onRefresh }) {
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

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/invoices/${invoiceId}`).then(inv => {
      setInvoice(inv);
      setIssuedDate(inv.issued_date?.split('T')[0] || '');
      setDueDate(inv.due_date?.split('T')[0] || '');
      setLineItems((inv.items || []).map(i => ({
        id: i.id,
        service_date: i.service_date?.split('T')[0] || '',
        description: i.description,
        amount: String(parseFloat(i.amount || 0)),
        appointment_id: i.appointment_id || null,
      })));
      setNotes(inv.notes || '');
    }).finally(() => setLoading(false));
  }, [invoiceId]);

  useEffect(() => { load(); }, [load]);

  const subtotal = lineItems.reduce((s, i) => s + parseFloat(i.amount || 0), 0);
  const addLine = () => setLineItems(prev => [...prev, { id: null, service_date: toISO(new Date()), description: '', amount: '0', appointment_id: null }]);
  const removeLine = idx => setLineItems(prev => prev.filter((_, i) => i !== idx));
  const updateLine = (idx, field, val) => setLineItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item));

  const handleSave = async () => {
    if (!lineItems.length) { alert('Add at least one line item.'); return; }
    setSaving(true);
    try {
      await api.patch(`/invoices/${invoiceId}`, {
        issued_date: issuedDate, due_date: dueDate, notes,
        line_items: lineItems.map(i => ({ id: i.id, service_date: i.service_date, description: i.description, amount: parseFloat(i.amount) || 0, appointment_id: i.appointment_id })),
      });
      await load();
      setEditing(false);
      onRefresh();
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  };

  const handleMarkPaid = async () => {
    if (!confirm('Mark this invoice as paid in full?')) return;
    setSaving(true);
    try {
      await api.patch(`/invoices/${invoiceId}`, { status: 'Paid', amount_paid: invoice.total });
      await load(); onRefresh();
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete invoice #${invoice.invoice_number}? Sessions will be marked uninvoiced.`)) return;
    setDeleting(true);
    try {
      await api.delete(`/invoices/${invoiceId}`);
      onRefresh(); onBack();
    } catch (err) { alert(err.message); setDeleting(false); }
  };

  if (loading) return <div className="text-sm text-gray-400 p-6">Loading...</div>;
  if (!invoice) return null;
  const isPaid = invoice.status === 'Paid';

  if (editing) return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => setEditing(false)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Cancel
        </button>
        <div className="flex items-center gap-3">
          <button onClick={handleDelete} disabled={deleting}
            className="text-sm font-medium text-red-500 hover:text-red-700 px-3 py-2 rounded-lg hover:bg-red-50 disabled:opacity-50">
            {deleting ? 'Deleting...' : 'Delete invoice'}
          </button>
          <button onClick={handleSave} disabled={saving}
            className="bg-brand-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-600 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 max-w-3xl p-8 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Client</p>
            <p className="text-sm text-gray-900">{invoice.client_name}</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Issued date</label>
            <input type="date" value={issuedDate} onChange={e => setIssuedDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Due date</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>
        </div>
        <div>
          <div className="grid grid-cols-[120px_1fr_90px_32px] gap-2 mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Amount</span>
            <span />
          </div>
          <div className="space-y-2">
            {lineItems.map((item, idx) => (
              <div key={idx} className="grid grid-cols-[120px_1fr_90px_32px] gap-2 items-center">
                <input type="date" value={item.service_date} onChange={e => updateLine(idx, 'service_date', e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                <input type="text" value={item.description} onChange={e => updateLine(idx, 'description', e.target.value)}
                  placeholder="Description"
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                <input type="number" value={item.amount} onChange={e => updateLine(idx, 'amount', e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand-400" />
                <button onClick={() => removeLine(idx)} className="text-gray-400 hover:text-red-500 flex items-center justify-center">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
          </div>
          <button onClick={addLine} className="mt-3 text-sm text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Add Line Item
          </button>
        </div>
        <div className="border-t border-gray-100 pt-4">
          <div className="ml-auto w-48 space-y-1 text-sm">
            <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
            <div className="flex justify-between font-semibold text-gray-900 border-t border-gray-200 pt-1"><span>Total</span><span>{fmt(subtotal)}</span></div>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          All invoices
        </button>
        <div className="flex items-center gap-3">
          <StatusBadge status={invoice.status} />
          {!isPaid && (
            <button onClick={handleMarkPaid} disabled={saving}
              className="bg-green-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : 'Mark as paid'}
            </button>
          )}
          <button onClick={() => setEditing(true)}
            className="border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
            Edit
          </button>
          <button onClick={handleDelete} disabled={deleting}
            className="border border-red-200 text-red-500 text-sm font-medium px-4 py-2 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50">
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 max-w-3xl">
        <div className="px-8 pt-8 pb-6 border-b border-gray-100">
          <div className="flex justify-between items-start">
            <div>
              {invoice.logo_data && <img src={invoice.logo_data} alt="Logo" className="h-10 object-contain mb-3" />}
              <p className="text-sm font-semibold text-gray-900">{invoice.practice_name}</p>
              <p className="text-sm text-gray-500">{invoice.address_line1}</p>
              {invoice.address_line2 && <p className="text-sm text-gray-500">{invoice.address_line2}</p>}
              <p className="text-sm text-gray-500">{invoice.city}, {invoice.state} {invoice.zip}</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-semibold text-gray-900">Invoice</p>
              <p className="text-sm text-gray-600 mt-1">#{invoice.invoice_number}</p>
              <p className="text-sm text-gray-500">Issued: {fmtDate(invoice.issued_date)}</p>
              <p className="text-sm text-gray-500">Due: {fmtDate(invoice.due_date)}</p>
            </div>
          </div>
        </div>

        <div className="px-8 py-6 grid grid-cols-3 gap-6 border-b border-gray-100">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Bill To</p>
            <p className="text-sm text-gray-900">{invoice.responsible_party_name || invoice.client_name}</p>
            {invoice.responsible_party_phone && <p className="text-sm text-gray-500">{invoice.responsible_party_phone}</p>}
            {invoice.responsible_party_email && <p className="text-sm text-gray-500">{invoice.responsible_party_email}</p>}
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Client</p>
            <p className="text-sm text-gray-900">{invoice.client_name}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Provider</p>
            <p className="text-sm text-gray-900">{invoice.clinician_name}</p>
            {invoice.tax_id && <p className="text-sm text-gray-500">Tax ID: {invoice.tax_id}</p>}
            {invoice.npi_number && <p className="text-sm text-gray-500">NPI: #{invoice.npi_number}</p>}
            {invoice.clinician_phone && <p className="text-sm text-gray-500">{invoice.clinician_phone}</p>}
          </div>
        </div>

        <div className="px-8 py-4">
          <table className="w-full text-sm">
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
                  <td className="py-3 text-gray-500 w-28 align-top">{fmtDate(item.service_date)}</td>
                  <td className="py-3 text-gray-700 align-top">{item.description}</td>
                  <td className="py-3 text-gray-900 text-right align-top font-medium">{fmt(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-8 pb-6 border-t border-gray-100">
          <div className="ml-auto w-56 space-y-1.5 pt-4 text-sm">
            <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{fmt(invoice.subtotal)}</span></div>
            <div className="flex justify-between font-semibold text-gray-900 border-t border-gray-200 pt-1.5"><span>Total</span><span>{fmt(invoice.total)}</span></div>
            <div className="flex justify-between text-gray-600"><span>Amount paid</span><span>{fmt(invoice.amount_paid)}</span></div>
            <div className={`flex justify-between font-bold text-base pt-1.5 border-t border-gray-200 ${parseFloat(invoice.balance) > 0 ? 'text-gray-900' : 'text-green-600'}`}>
              <span>Balance</span><span>{fmt(invoice.balance)}</span>
            </div>
          </div>
        </div>

        {(invoice.footer_text || invoice.notes) && (
          <div className="px-8 py-4 border-t border-gray-100 space-y-1">
            {invoice.notes && <p className="text-sm text-gray-600">{invoice.notes}</p>}
            {invoice.footer_text && <p className="text-xs text-gray-400">{invoice.footer_text}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Generate Flow ─────────────────────────────────────────────────────────────
function GenerateFlow({ onClose, onDone }) {
  const api = useApi();
  const today = new Date();
  const [step, setStep] = useState(1);
  const [start, setStart] = useState(toISO(new Date(today.getFullYear(), today.getMonth() - 1, 1)));
  const [end, setEnd] = useState(toISO(new Date(today.getFullYear(), today.getMonth(), 0)));
  const [sessions, setSessions] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const loadPreview = async () => {
    setLoading(true);
    try {
      const rows = await api.get(`/invoices/preview?start=${start}&end=${end}`);
      setSessions(rows); setSelected(new Set(rows.map(r => r.id))); setStep(2);
    } catch (err) { alert(err.message); }
    finally { setLoading(false); }
  };

  const toggleSession = id => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleClient = clientId => {
    const ids = sessions.filter(s => s.client_id === clientId).map(s => s.id);
    const allSel = ids.every(id => selected.has(id));
    setSelected(prev => { const n = new Set(prev); ids.forEach(id => allSel ? n.delete(id) : n.add(id)); return n; });
  };

  const handleGenerate = async () => {
    const ids = Array.from(selected);
    if (!ids.length) { alert('No sessions selected.'); return; }
    setGenerating(true);
    try { await api.post('/invoices/generate', { appointment_ids: ids }); onDone(); }
    catch (err) { alert(err.message); }
    finally { setGenerating(false); }
  };

  const byClient = sessions.reduce((acc, s) => { if (!acc[s.client_id]) acc[s.client_id] = { name: s.client_name, sessions: [] }; acc[s.client_id].sessions.push(s); return acc; }, {});
  const selSessions = sessions.filter(s => selected.has(s.id));
  const totalAmount = selSessions.reduce((sum, s) => sum + parseFloat(s.fee || 0), 0);
  const clientCount = new Set(selSessions.map(s => s.client_id)).size;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Generate invoices</h2>
            <p className="text-xs text-gray-500 mt-0.5">{step === 1 ? 'Select a date range' : 'Review and select sessions'}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-auto px-6 py-5">
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">All uninvoiced sessions in this date range will be listed for review.</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start date</label>
                  <input type="date" value={start} onChange={e => setStart(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End date</label>
                  <input type="date" value={end} onChange={e => setEnd(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                </div>
              </div>
            </div>
          )}
          {step === 2 && (
            sessions.length === 0
              ? <p className="text-sm text-gray-500 text-center py-8">No uninvoiced sessions found in this date range.</p>
              : <div className="space-y-4">
                  {Object.entries(byClient).map(([clientId, { name, sessions: cs }]) => {
                    const clientTotal = cs.reduce((sum, s) => sum + parseFloat(s.fee || 0), 0);
                    const allChecked = cs.every(s => selected.has(s.id));
                    const someChecked = cs.some(s => selected.has(s.id));
                    return (
                      <div key={clientId} className="border border-gray-200 rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                          <div className="flex items-center gap-3">
                            <input type="checkbox" checked={allChecked}
                              ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }}
                              onChange={() => toggleClient(parseInt(clientId))}
                              className="rounded border-gray-300 text-brand-500 focus:ring-brand-400" />
                            <span className="text-sm font-semibold text-gray-900">{name}</span>
                          </div>
                          <span className="text-sm font-medium text-gray-700">{fmt(clientTotal)}</span>
                        </div>
                        <ul className="divide-y divide-gray-100">
                          {cs.map(s => (
                            <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                              <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSession(s.id)} className="rounded border-gray-300 text-brand-500 focus:ring-brand-400" />
                              <span className="text-sm text-gray-500 w-20 shrink-0">{fmtDate(s.starts_at)}</span>
                              <span className="text-sm text-gray-700 flex-1">
                                {s.cpt_code} — {s.service_description}
                                {s.status === 'No Show' && <span className="ml-2 text-xs text-red-500 font-medium">No Show</span>}
                                {s.status === 'Late Cancel' && <span className="ml-2 text-xs text-orange-500 font-medium">Late Cancel</span>}
                              </span>
                              <span className="text-sm font-medium text-gray-900 shrink-0">{fmt(s.fee)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-200 shrink-0">
          {step === 2 && selected.size > 0 && (
            <div className="flex items-center gap-4 mb-3 text-sm text-gray-600">
              <span>{clientCount} client{clientCount !== 1 ? 's' : ''}</span><span>·</span>
              <span>{selected.size} session{selected.size !== 1 ? 's' : ''}</span><span>·</span>
              <span className="font-semibold text-gray-900">{fmt(totalAmount)} total</span>
            </div>
          )}
          <div className="flex gap-3 justify-end">
            {step > 1 && <button onClick={() => setStep(s => s - 1)} className="text-sm font-medium text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-100">Back</button>}
            <button onClick={onClose} className="text-sm font-medium text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-100">Cancel</button>
            {step === 1 && <button onClick={loadPreview} disabled={loading} className="bg-brand-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-600 disabled:opacity-50">{loading ? 'Loading...' : 'Preview sessions →'}</button>}
            {step === 2 && sessions.length > 0 && (
              <button onClick={handleGenerate} disabled={generating || selected.size === 0} className="bg-brand-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-600 disabled:opacity-50">
                {generating ? 'Generating...' : `Generate ${clientCount} invoice${clientCount !== 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Invoices() {
  const { id: urlId } = useParams();
  const navigate = useNavigate();
  const [view, setView] = useState(urlId ? 'detail' : 'list');
  const [selectedId, setSelectedId] = useState(urlId ? parseInt(urlId) : null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (urlId) { setSelectedId(parseInt(urlId)); setView('detail'); }
    else { setView('list'); setSelectedId(null); }
  }, [urlId]);

  const refresh = () => setRefreshKey(k => k + 1);

  const handleSelect = id => {
    setSelectedId(id); setView('detail');
    navigate(`/invoices/${id}`);
  };

  const handleBack = () => {
    setView('list'); setSelectedId(null);
    navigate('/invoices');
  };

  return (
    <div>
      {view === 'list' && <InvoiceList onSelect={handleSelect} onGenerate={() => setShowGenerate(true)} refresh={refreshKey} />}
      {view === 'detail' && <InvoiceDetail invoiceId={selectedId} onBack={handleBack} onRefresh={refresh} />}
      {showGenerate && <GenerateFlow onClose={() => setShowGenerate(false)} onDone={() => { setShowGenerate(false); refresh(); }} />}
    </div>
  );
}
