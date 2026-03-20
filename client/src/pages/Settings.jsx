import { useState, useEffect, useRef } from 'react';
import { useUser, UserProfile } from '@clerk/react';
import { useApi } from '../hooks/useApi.js';
import { formatPhone, formatPhoneInput } from '../utils/phone.js';

const inputClass = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400";
const labelClass = "block text-sm font-medium text-gray-700 mb-1";

const NAV = [
  { group: 'PRACTICE', items: [
    { id: 'practice-details', label: 'Practice details' },
    { id: 'clinicians',       label: 'Clinicians' },
  ]},
  { group: 'BILLING', items: [
    { id: 'services', label: 'Services' },
    { id: 'billing',  label: 'Billing settings' },
  ]},
  { group: 'AI', items: [
    { id: 'ai-notes', label: 'AI Notes' },
  ]},
  { group: 'MY ACCOUNT', items: [
    { id: 'profile',  label: 'Profile' },
    { id: 'security', label: 'Security' },
  ]},
];

// ── Shared card wrapper ───────────────────────────────────────────────────────
function SectionCard({ title, description, children, action }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ── Practice Details ──────────────────────────────────────────────────────────
function PracticeDetailsSection() {
  const api = useApi();
  const fileRef = useRef(null);
  const [form, setForm] = useState({
    practice_name: '', address_line1: '', address_line2: '',
    city: '', state: '', zip: '', phone: '', tax_id: '', logo_data: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/settings').then(data => {
      setForm({
        practice_name:  data.practice_name  || '',
        address_line1:  data.address_line1  || '',
        address_line2:  data.address_line2  || '',
        city:           data.city           || '',
        state:          data.state          || '',
        zip:            data.zip            || '',
        phone:          data.phone          || '',
        tax_id:         data.tax_id         || '',
        logo_data:      data.logo_data      || '',
      });
    }).finally(() => setLoading(false));
  }, []);

  const setF = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleLogo = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setF('logo_data', reader.result);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch('/settings', form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) { alert(err.message); } finally { setSaving(false); }
  };

  if (loading) return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 text-sm text-gray-400">Loading...</div>
  );

  return (
    <SectionCard title="Practice details" description="Clinic name, address, and logo used on invoices and superbills">
      <div className="px-6 py-5 space-y-5">
        {/* Logo */}
        <div>
          <label className={labelClass}>Logo</label>
          <div className="flex items-center gap-4">
            {form.logo_data ? (
              <img src={form.logo_data} alt="Logo"
                className="h-12 object-contain rounded border border-gray-200 bg-gray-50 px-2" />
            ) : (
              <div className="h-12 w-24 rounded border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-xs text-gray-400">
                No logo
              </div>
            )}
            <button onClick={() => fileRef.current?.click()}
              className="text-sm text-brand-500 hover:underline font-medium">
              {form.logo_data ? 'Replace' : 'Upload logo'}
            </button>
            {form.logo_data && (
              <button onClick={() => setF('logo_data', '')}
                className="text-sm text-gray-400 hover:text-red-500 transition-colors">
                Remove
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogo} />
          </div>
        </div>

        {/* Name, Tax ID, Phone */}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelClass}>Practice name</label>
            <input type="text" value={form.practice_name}
              onChange={e => setF('practice_name', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Tax ID</label>
            <input type="text" value={form.tax_id}
              onChange={e => setF('tax_id', e.target.value)}
              className={inputClass} placeholder="00-0000000" />
          </div>
          <div>
            <label className={labelClass}>Phone</label>
            <input type="tel" value={formatPhoneInput(form.phone)}
              onChange={e => setF('phone', formatPhoneInput(e.target.value))}
              className={inputClass} placeholder="847-555-0000" />
          </div>
        </div>

        {/* Address */}
        <div className="space-y-3">
          <div>
            <label className={labelClass}>Address line 1</label>
            <input type="text" value={form.address_line1}
              onChange={e => setF('address_line1', e.target.value)}
              className={inputClass} placeholder="1167 Wilmette Ave" />
          </div>
          <div>
            <label className={labelClass}>
              Address line 2{' '}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input type="text" value={form.address_line2}
              onChange={e => setF('address_line2', e.target.value)}
              className={inputClass} placeholder="Suite 100" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>City</label>
              <input type="text" value={form.city}
                onChange={e => setF('city', e.target.value)}
                className={inputClass} placeholder="Wilmette" />
            </div>
            <div>
              <label className={labelClass}>State</label>
              <input type="text" value={form.state}
                onChange={e => setF('state', e.target.value)}
                className={inputClass} placeholder="IL" maxLength={2} />
            </div>
            <div>
              <label className={labelClass}>ZIP</label>
              <input type="text" value={form.zip}
                onChange={e => setF('zip', e.target.value)}
                className={inputClass} placeholder="60091" />
            </div>
          </div>
        </div>

        <div className="pt-1">
          <button onClick={handleSave} disabled={saving}
            className="bg-brand-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors">
            {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save changes'}
          </button>
        </div>
      </div>
    </SectionCard>
  );
}

// ── Clinicians ────────────────────────────────────────────────────────────────
const EMPTY_CLINICIAN = {
  first_name: '', last_name: '', npi_number: '',
  license_number: '', credentials: '', phone: '',
  note_style_instructions: '',
};

function CliniciansForm({ form, setF }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className={labelClass}>First name *</label>
        <input type="text" value={form.first_name}
          onChange={e => setF('first_name', e.target.value)} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Last name *</label>
        <input type="text" value={form.last_name}
          onChange={e => setF('last_name', e.target.value)} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>NPI number</label>
        <input type="text" value={form.npi_number}
          onChange={e => setF('npi_number', e.target.value)}
          className={inputClass} placeholder="1234567890" />
      </div>
      <div>
        <label className={labelClass}>License number</label>
        <input type="text" value={form.license_number}
          onChange={e => setF('license_number', e.target.value)}
          className={inputClass} placeholder="CCC-SLP #..." />
      </div>
      <div>
        <label className={labelClass}>Credentials</label>
        <input type="text" value={form.credentials}
          onChange={e => setF('credentials', e.target.value)}
          className={inputClass} placeholder="MS, CCC-SLP" />
      </div>
      <div>
        <label className={labelClass}>Phone</label>
        <input type="tel" value={formatPhoneInput(form.phone)}
          onChange={e => setF('phone', formatPhoneInput(e.target.value))}
          className={inputClass} placeholder="847-555-0000" />
      </div>
      <div className="col-span-2">
        <label className={labelClass}>
          AI Note Style Instructions{' '}
          <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          value={form.note_style_instructions}
          onChange={e => setF('note_style_instructions', e.target.value)}
          className={`${inputClass} min-h-[80px]`}
          placeholder="e.g. Use concise bullet points. Avoid jargon. Always include specific data from the session."
          rows={3}
        />
        <p className="text-xs text-gray-400 mt-1">
          These instructions guide the AI when drafting SOAP notes for this clinician.
        </p>
      </div>
    </div>
  );
}

function CliniciansSection() {
  const api = useApi();
  const [clinicians, setClinicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_CLINICIAN);
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.get('/clinicians').then(setClinicians).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(EMPTY_CLINICIAN); setEditingId('new'); };
  const openEdit = (c) => {
    setForm({
      first_name:             c.first_name             || '',
      last_name:              c.last_name              || '',
      npi_number:             c.npi_number             || '',
      license_number:         c.license_number         || '',
      credentials:            c.credentials            || '',
      phone:                  c.phone                  || '',
      note_style_instructions: c.note_style_instructions || '',
    });
    setEditingId(c.id);
  };

  const handleSave = async () => {
    if (!form.first_name || !form.last_name) { alert('First and last name are required.'); return; }
    setSaving(true);
    try {
      if (editingId === 'new') await api.post('/clinicians', form);
      else await api.patch(`/clinicians/${editingId}`, form);
      setEditingId(null);
      load();
    } catch (err) { alert(err.message); } finally { setSaving(false); }
  };

  const handleDeactivate = async (c) => {
    const action = c.active ? 'deactivate' : 'reactivate';
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${c.full_name}?`)) return;
    await api.patch(`/clinicians/${c.id}`, { active: !c.active });
    load();
  };

  const setF = (field, value) => setForm(f => ({ ...f, [field]: value }));

  return (
    <SectionCard
      title="Clinicians"
      description="Manage clinician profiles and credentials"
      action={editingId === null && (
        <button onClick={openNew}
          className="bg-brand-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-brand-600 transition-colors">
          + Add clinician
        </button>
      )}
    >
      {editingId === 'new' && (
        <div className="px-6 py-5 border-b border-gray-100 bg-gray-50">
          <p className="text-sm font-semibold text-gray-700 mb-4">New clinician</p>
          <CliniciansForm form={form} setF={setF} />
          <div className="flex gap-2 mt-4">
            <button onClick={handleSave} disabled={saving}
              className="bg-brand-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : 'Add clinician'}
            </button>
            <button onClick={() => setEditingId(null)}
              className="text-sm font-medium text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
      {loading ? (
        <p className="text-sm text-gray-400 px-6 py-4">Loading...</p>
      ) : clinicians.length === 0 ? (
        <p className="text-sm text-gray-400 px-6 py-4">No clinicians yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {clinicians.map(c => (
            <li key={c.id} className="px-6 py-4">
              {editingId === c.id ? (
                <div>
                  <CliniciansForm form={form} setF={setF} />
                  <div className="flex gap-2 mt-4">
                    <button onClick={handleSave} disabled={saving}
                      className="bg-brand-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors">
                      {saving ? 'Saving...' : 'Save changes'}
                    </button>
                    <button onClick={() => setEditingId(null)}
                      className="text-sm font-medium text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{c.full_name}</span>
                      {c.credentials && <span className="text-xs text-gray-500">{c.credentials}</span>}
                      {!c.active && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inactive</span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                      {c.npi_number     && <span>NPI: {c.npi_number}</span>}
                      {c.license_number && <span>License: {c.license_number}</span>}
                      {c.phone          && <span>{formatPhone(c.phone)}</span>}
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs ml-4">
                    <button onClick={() => openEdit(c)} className="text-brand-500 hover:underline">Edit</button>
                    <button onClick={() => handleDeactivate(c)}
                      className="text-gray-400 hover:text-red-500 transition-colors">
                      {c.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

// ── Services ──────────────────────────────────────────────────────────────────
const EMPTY_SERVICE = {
  cpt_code: '', description: '', duration_minutes: 50,
  full_rate: '', late_cancel_rate: '', is_default: false,
};

function ServiceForm({ form, setF }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className={labelClass}>CPT code</label>
        <input type="text" value={form.cpt_code}
          onChange={e => setF('cpt_code', e.target.value)}
          className={inputClass} placeholder="92507" />
      </div>
      <div>
        <label className={labelClass}>Duration (minutes)</label>
        <input type="number" value={form.duration_minutes}
          onChange={e => setF('duration_minutes', parseInt(e.target.value) || 50)}
          className={inputClass} />
      </div>
      <div className="col-span-2">
        <label className={labelClass}>Description *</label>
        <input type="text" value={form.description}
          onChange={e => setF('description', e.target.value)}
          className={inputClass} placeholder="Treatment of speech, language..." />
      </div>
      <div>
        <label className={labelClass}>Full rate ($)</label>
        <input type="number" step="0.01" value={form.full_rate}
          onChange={e => setF('full_rate', e.target.value)}
          className={inputClass} placeholder="175.00" />
      </div>
      <div>
        <label className={labelClass}>
          Late cancel rate ($){' '}
          <span className="text-gray-400 font-normal">optional</span>
        </label>
        <input type="number" step="0.01" value={form.late_cancel_rate}
          onChange={e => setF('late_cancel_rate', e.target.value)}
          className={inputClass} placeholder="75.00" />
      </div>
      <div className="col-span-2 flex items-center gap-2">
        <input type="checkbox" id="is_default" checked={form.is_default}
          onChange={e => setF('is_default', e.target.checked)}
          className="rounded border-gray-300 text-brand-500 focus:ring-brand-400" />
        <label htmlFor="is_default" className="text-sm text-gray-700">
          Default service for new appointments
        </label>
      </div>
    </div>
  );
}

function ServicesSection() {
  const api = useApi();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_SERVICE);
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.get('/services?all=1').then(setServices).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(EMPTY_SERVICE); setEditingId('new'); };
  const openEdit = (s) => {
    setForm({
      cpt_code:         s.cpt_code         || '',
      description:      s.description      || '',
      duration_minutes: s.duration_minutes || 50,
      full_rate:        s.full_rate        || '',
      late_cancel_rate: s.late_cancel_rate || '',
      is_default:       s.is_default       || false,
    });
    setEditingId(s.id);
  };

  const handleSave = async () => {
    if (!form.description) { alert('Description is required.'); return; }
    setSaving(true);
    try {
      if (editingId === 'new') await api.post('/services', form);
      else await api.patch(`/services/${editingId}`, form);
      setEditingId(null);
      load();
    } catch (err) { alert(err.message); } finally { setSaving(false); }
  };

  const handleDeactivate = async (s) => {
    const action = s.active ? 'deactivate' : 'reactivate';
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${s.cpt_code}?`)) return;
    await api.patch(`/services/${s.id}`, { active: !s.active });
    load();
  };

  const setF = (field, value) => setForm(f => ({ ...f, [field]: value }));

  return (
    <SectionCard
      title="Services"
      description="CPT codes, rates, and billing configuration"
      action={editingId === null && (
        <button onClick={openNew}
          className="bg-brand-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-brand-600 transition-colors">
          + Add service
        </button>
      )}
    >
      {editingId === 'new' && (
        <div className="px-6 py-5 border-b border-gray-100 bg-gray-50">
          <p className="text-sm font-semibold text-gray-700 mb-4">New service</p>
          <ServiceForm form={form} setF={setF} />
          <div className="flex gap-2 mt-4">
            <button onClick={handleSave} disabled={saving}
              className="bg-brand-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : 'Add service'}
            </button>
            <button onClick={() => setEditingId(null)}
              className="text-sm font-medium text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
      {loading ? (
        <p className="text-sm text-gray-400 px-6 py-4">Loading...</p>
      ) : services.length === 0 ? (
        <p className="text-sm text-gray-400 px-6 py-4">No services yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {services.map(s => (
            <li key={s.id} className="px-6 py-4">
              {editingId === s.id ? (
                <div>
                  <ServiceForm form={form} setF={setF} />
                  <div className="flex gap-2 mt-4">
                    <button onClick={handleSave} disabled={saving}
                      className="bg-brand-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors">
                      {saving ? 'Saving...' : 'Save changes'}
                    </button>
                    <button onClick={() => setEditingId(null)}
                      className="text-sm font-medium text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-gray-900">{s.cpt_code}</span>
                      {s.is_default && (
                        <span className="text-xs bg-brand-50 text-brand-600 px-2 py-0.5 rounded-full">Default</span>
                      )}
                      {!s.active && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inactive</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 mt-0.5">{s.description}</p>
                    <div className="mt-1 flex gap-4 text-xs text-gray-500">
                      <span>{s.duration_minutes} min</span>
                      <span>${parseFloat(s.full_rate).toFixed(2)}</span>
                      {s.late_cancel_rate && (
                        <span>Late cancel: ${parseFloat(s.late_cancel_rate).toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs ml-4">
                    <button onClick={() => openEdit(s)} className="text-brand-500 hover:underline">Edit</button>
                    <button onClick={() => handleDeactivate(s)}
                      className="text-gray-400 hover:text-red-500 transition-colors">
                      {s.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

// ── Billing Settings ──────────────────────────────────────────────────────────
function BillingSettingsSection() {
  const api = useApi();
  const [form, setForm] = useState({ invoice_due_days: 15, invoice_footer: '', superbill_day: 15 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/settings').then(data => {
      setForm({
        invoice_due_days: data.invoice_due_days ?? 15,
        invoice_footer:   data.invoice_footer   || '',
        superbill_day:    data.superbill_day     ?? 15,
      });
    }).finally(() => setLoading(false));
  }, []);

  const setF = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch('/settings', form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) { alert(err.message); } finally { setSaving(false); }
  };

  if (loading) return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 text-sm text-gray-400">Loading...</div>
  );

  return (
    <div className="space-y-4">
      {/* Invoices */}
      <SectionCard title="Invoices" description="Default settings applied when generating invoices">
        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-700 shrink-0">Invoice due</label>
            <input
              type="number" min={1} max={90}
              value={form.invoice_due_days}
              onChange={e => setF('invoice_due_days', parseInt(e.target.value) || 15)}
              className="w-16 border border-gray-300 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <span className="text-sm text-gray-700">days after issue date</span>
          </div>
          <div>
            <label className={labelClass}>Invoice footer text</label>
            <input type="text" value={form.invoice_footer}
              onChange={e => setF('invoice_footer', e.target.value)}
              className={inputClass} placeholder="Make Payments to: Anna Wagner Inc." />
          </div>
        </div>
      </SectionCard>

      {/* Superbills */}
      <SectionCard title="Superbills" description="Choose on which day of the following month superbills are generated. This gives you time to close out the accounting for a month.">
        <div className="px-6 py-5">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-gray-700">Generate monthly superbills on day</span>
            <select
              value={form.superbill_day}
              onChange={e => setF('superbill_day', parseInt(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <span className="text-sm text-gray-700">of the following month.</span>
          </div>
        </div>
      </SectionCard>

      <button onClick={handleSave} disabled={saving}
        className="bg-brand-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors">
        {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save changes'}
      </button>
    </div>
  );
}

// ── Profile ───────────────────────────────────────────────────────────────────
function ProfileSection() {
  const { user } = useUser();
  const api = useApi();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/profile').then(data => setPhone(data.phone || '')).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch('/profile', { phone });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) { alert(err.message); } finally { setSaving(false); }
  };

  return (
    <SectionCard title="Profile" description="Your personal information">
      <div className="px-6 py-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>First name</label>
            <input type="text" value={user?.firstName || ''} disabled
              className={`${inputClass} bg-gray-50 text-gray-500`} />
          </div>
          <div>
            <label className={labelClass}>Last name</label>
            <input type="text" value={user?.lastName || ''} disabled
              className={`${inputClass} bg-gray-50 text-gray-500`} />
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Email</label>
            <input type="email" value={user?.primaryEmailAddress?.emailAddress || ''} disabled
              className={`${inputClass} bg-gray-50 text-gray-500`} />
            <p className="text-xs text-gray-400 mt-1">To change your name or email, use Security settings.</p>
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Personal phone</label>
            {loading ? (
              <div className="h-9 bg-gray-100 rounded-lg animate-pulse" />
            ) : (
              <input type="tel" value={formatPhoneInput(phone)} onChange={e => setPhone(formatPhoneInput(e.target.value))}
                className={inputClass} placeholder="847-555-0000" />
            )}
          </div>
        </div>
        <button onClick={handleSave} disabled={saving || loading}
          className="bg-brand-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors">
          {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save changes'}
        </button>
      </div>
    </SectionCard>
  );
}

// ── Security ──────────────────────────────────────────────────────────────────
function SecuritySection() {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-gray-900">Security</h2>
        <p className="text-xs text-gray-500 mt-0.5">Manage your password and login settings</p>
      </div>
      <UserProfile routing="hash" />
    </div>
  );
}

// ── AI Notes ──────────────────────────────────────────────────────────────────
const EMPTY_EXAMPLE = {
  label: '', service_type: '', subjective: '', objective: '', assessment: '', plan: '',
};

function ExampleNotesTab() {
  const api = useApi();
  const [examples, setExamples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_EXAMPLE);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const load = () => {
    api.get('/notes/examples').then(setExamples).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const setF = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSave = async () => {
    if (!form.label) { alert('Label is required.'); return; }
    setSaving(true);
    try {
      await api.post('/notes/examples', form);
      setForm(EMPTY_EXAMPLE);
      setShowForm(false);
      load();
    } catch (err) { alert(err.message); } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this example note? This cannot be undone.')) return;
    setDeleting(id);
    try {
      await api.delete(`/notes/examples/${id}`);
      load();
    } catch (err) { alert(err.message); } finally { setDeleting(null); }
  };

  const truncate = (text, max = 80) => {
    if (!text) return '—';
    return text.length > max ? text.slice(0, max) + '...' : text;
  };

  return (
    <SectionCard
      title="Example Notes"
      description="Few-shot examples that train the AI to write notes in your style"
      action={!showForm && (
        <button onClick={() => { setForm(EMPTY_EXAMPLE); setShowForm(true); }}
          className="bg-brand-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-brand-600 transition-colors">
          + Add example
        </button>
      )}
    >
      {showForm && (
        <div className="px-6 py-5 border-b border-gray-100 bg-gray-50">
          <p className="text-sm font-semibold text-gray-700 mb-4">New example note</p>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Label *</label>
                <input type="text" value={form.label}
                  onChange={e => setF('label', e.target.value)}
                  className={inputClass} placeholder="Articulation session - typical" />
              </div>
              <div>
                <label className={labelClass}>
                  Service type{' '}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input type="text" value={form.service_type}
                  onChange={e => setF('service_type', e.target.value)}
                  className={inputClass} placeholder="92507" />
              </div>
            </div>
            {['subjective', 'objective', 'assessment', 'plan'].map(field => (
              <div key={field}>
                <label className={labelClass}>{field.charAt(0).toUpperCase() + field.slice(1)}</label>
                <textarea value={form[field]}
                  onChange={e => setF(field, e.target.value)}
                  className={`${inputClass} min-h-[60px]`} rows={3} />
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleSave} disabled={saving}
              className="bg-brand-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : 'Save example'}
            </button>
            <button onClick={() => setShowForm(false)}
              className="text-sm font-medium text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
      {loading ? (
        <p className="text-sm text-gray-400 px-6 py-4">Loading...</p>
      ) : examples.length === 0 ? (
        <p className="text-sm text-gray-400 px-6 py-4">No example notes yet. Add one to help the AI learn your style.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {examples.map(ex => (
            <li key={ex.id} className="px-6 py-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{ex.label}</span>
                    {ex.service_type && (
                      <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{ex.service_type}</span>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
                    <div><span className="font-semibold text-gray-600">S:</span> {truncate(ex.subjective)}</div>
                    <div><span className="font-semibold text-gray-600">O:</span> {truncate(ex.objective)}</div>
                    <div><span className="font-semibold text-gray-600">A:</span> {truncate(ex.assessment)}</div>
                    <div><span className="font-semibold text-gray-600">P:</span> {truncate(ex.plan)}</div>
                  </div>
                </div>
                <button onClick={() => handleDelete(ex.id)} disabled={deleting === ex.id}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors ml-4 shrink-0">
                  {deleting === ex.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function AIFeedbackTab() {
  const api = useApi();
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/notes/ai-feedback').then(setFeedback).finally(() => setLoading(false));
  }, []);

  const SECTIONS = ['subjective', 'objective', 'assessment', 'plan'];

  // Calculate summary stats
  const totalSections = feedback.length * SECTIONS.length;
  const unchangedSections = feedback.reduce((count, entry) => {
    return count + SECTIONS.filter(s => entry[`ai_draft_${s}`] === entry[s]).length;
  }, 0);
  const unchangedPct = totalSections > 0 ? Math.round((unchangedSections / totalSections) * 100) : 0;

  if (loading) return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 text-sm text-gray-400">Loading...</div>
  );

  return (
    <div className="space-y-4">
      {/* Summary stat */}
      {feedback.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-4 flex items-center gap-3">
          <div className={`text-2xl font-bold ${unchangedPct >= 80 ? 'text-green-600' : unchangedPct >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
            {unchangedPct}%
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">of sections unchanged</p>
            <p className="text-xs text-gray-500">{unchangedSections} of {totalSections} SOAP sections accepted as-is across {feedback.length} notes</p>
          </div>
        </div>
      )}

      {feedback.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-400">No finalized notes with AI drafts yet.</p>
        </div>
      ) : (
        feedback.map(entry => {
          const date = entry.session_date ? new Date(entry.session_date).toLocaleDateString() : '—';
          return (
            <div key={entry.id} className="bg-white rounded-xl border border-gray-200">
              <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-gray-900">{entry.client_name || '—'}</span>
                  <span className="text-gray-400">&middot;</span>
                  <span className="text-gray-600">{entry.clinician_name || '—'}</span>
                  <span className="text-gray-400">&middot;</span>
                  <span className="text-gray-500">{date}</span>
                </div>
                {entry.prompt_version && (
                  <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    Prompt v{entry.prompt_version}
                  </span>
                )}
              </div>
              <div className="divide-y divide-gray-100">
                {SECTIONS.map(s => {
                  const aiText = entry[`ai_draft_${s}`] || '';
                  const finalText = entry[s] || '';
                  const changed = aiText !== finalText;
                  return (
                    <div key={s} className="grid grid-cols-2 divide-x divide-gray-100">
                      <div className={`px-4 py-3 ${changed ? 'border-l-2 border-l-amber-400' : 'border-l-2 border-l-green-400'}`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-xs font-semibold text-gray-500 uppercase">{s.charAt(0)}</span>
                          <span className="text-[10px] text-gray-400">AI Draft</span>
                          {!changed && <span className="text-green-500 text-xs" title="Unchanged">&#10003;</span>}
                          {changed && <span className="text-amber-500 text-xs" title="Edited">&#9998;</span>}
                        </div>
                        <p className="text-xs text-gray-700 whitespace-pre-wrap">{aiText || '—'}</p>
                      </div>
                      <div className={`px-4 py-3 ${changed ? 'border-l-2 border-l-amber-400' : 'border-l-2 border-l-green-400'}`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-xs font-semibold text-gray-500 uppercase">{s.charAt(0)}</span>
                          <span className="text-[10px] text-gray-400">Final</span>
                        </div>
                        <p className="text-xs text-gray-700 whitespace-pre-wrap">{finalText || '—'}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function AINotesSection() {
  const [tab, setTab] = useState('examples');

  return (
    <div>
      {/* Tab switcher */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('examples')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'examples'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}>
          Example Notes
        </button>
        <button
          onClick={() => setTab('feedback')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'feedback'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}>
          AI Feedback
        </button>
      </div>

      {tab === 'examples' && <ExampleNotesTab />}
      {tab === 'feedback' && <AIFeedbackTab />}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Settings() {
  const [section, setSection] = useState('practice-details');

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage clinic configuration, clinicians, and services</p>
      </div>
      <div className="flex gap-8">
        {/* Sidebar */}
        <aside className="w-44 shrink-0">
          {NAV.map(({ group, items }) => (
            <div key={group} className="mb-5">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1">
                {group}
              </p>
              {items.map(item => (
                <button key={item.id} onClick={() => setSection(item.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    section === item.id
                      ? 'bg-brand-50 text-brand-600'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}>
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </aside>

        {/* Content */}
        <div className="flex-1 max-w-2xl">
          {section === 'practice-details' && <PracticeDetailsSection />}
          {section === 'clinicians'        && <CliniciansSection />}
          {section === 'services'          && <ServicesSection />}
          {section === 'billing'           && <BillingSettingsSection />}
          {section === 'ai-notes'          && <AINotesSection />}
          {section === 'profile'           && <ProfileSection />}
          {section === 'security'          && <SecuritySection />}
        </div>
      </div>
    </div>
  );
}
