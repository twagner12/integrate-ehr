import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi.js';

const inputClass = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400";
const labelClass = "block text-sm font-medium text-gray-700 mb-1";

const EMPTY_FORM = {
  first_name: '', last_name: '', npi_number: '',
  license_number: '', credentials: '', phone: '',
};

function CliniciansSection() {
  const api = useApi();
  const [clinicians, setClinicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null); // null = closed, 'new' = add form, number = edit
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.get('/clinicians').then(setClinicians).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setForm(EMPTY_FORM);
    setEditingId('new');
  };

  const openEdit = (c) => {
    setForm({
      first_name: c.first_name || '',
      last_name: c.last_name || '',
      npi_number: c.npi_number || '',
      license_number: c.license_number || '',
      credentials: c.credentials || '',
      phone: c.phone || '',
    });
    setEditingId(c.id);
  };

  const handleSave = async () => {
    if (!form.first_name || !form.last_name) {
      alert('First and last name are required.');
      return;
    }
    setSaving(true);
    try {
      if (editingId === 'new') {
        await api.post('/clinicians', form);
      } else {
        await api.patch(`/clinicians/${editingId}`, form);
      }
      setEditingId(null);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (c) => {
    const action = c.active ? 'deactivate' : 'reactivate';
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${c.full_name}?`)) return;
    await api.patch(`/clinicians/${c.id}`, { active: !c.active });
    load();
  };

  const setF = (field, value) => setForm(f => ({ ...f, [field]: value }));

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      {/* Section header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Clinicians</h2>
          <p className="text-xs text-gray-500 mt-0.5">Manage clinician profiles and credentials</p>
        </div>
        {editingId === null && (
          <button onClick={openNew}
            className="bg-brand-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-brand-600 transition-colors">
            + Add clinician
          </button>
        )}
      </div>

      {/* Add form */}
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

      {/* Clinician list */}
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
                      {c.credentials && (
                        <span className="text-xs text-gray-500">{c.credentials}</span>
                      )}
                      {!c.active && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inactive</span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                      {c.npi_number && <span>NPI: {c.npi_number}</span>}
                      {c.license_number && <span>License: {c.license_number}</span>}
                      {c.phone && <span>{c.phone}</span>}
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs ml-4">
                    <button onClick={() => openEdit(c)}
                      className="text-brand-500 hover:underline">Edit</button>
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
    </div>
  );
}

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
          onChange={e => setF('npi_number', e.target.value)} className={inputClass} placeholder="1234567890" />
      </div>
      <div>
        <label className={labelClass}>License number</label>
        <input type="text" value={form.license_number}
          onChange={e => setF('license_number', e.target.value)} className={inputClass} placeholder="CCC-SLP #..." />
      </div>
      <div>
        <label className={labelClass}>Credentials</label>
        <input type="text" value={form.credentials}
          onChange={e => setF('credentials', e.target.value)} className={inputClass} placeholder="MS, CCC-SLP" />
      </div>
      <div>
        <label className={labelClass}>Phone</label>
        <input type="tel" value={form.phone}
          onChange={e => setF('phone', e.target.value)} className={inputClass} placeholder="(847) 555-0000" />
      </div>
    </div>
  );
}

export default function Settings() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage clinicians, services, and clinic configuration</p>
      </div>
      <div className="space-y-8 max-w-3xl">
        <CliniciansSection />
      </div>
    </div>
  );
}
