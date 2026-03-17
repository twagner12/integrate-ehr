import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { formatPhoneInput } from '../utils/phone.js';

const inputClass = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400";
const labelClass = "block text-sm font-medium text-gray-700 mb-1";

function SectionHeader({ title, subtitle }) {
  return (
    <div className="border-b border-gray-200 pb-3 mb-4">
      <h2 className="text-base font-semibold text-gray-800">{title}</h2>
      {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <div
        onClick={() => onChange(!checked)}
        className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${checked ? 'bg-brand-500' : 'bg-gray-300'}`}
      >
        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
      <span className="text-sm text-gray-600">{label}</span>
    </label>
  );
}

export default function ClientForm() {
  const { id } = useParams();
  const isEditing = !!id;
  const api = useApi();
  const navigate = useNavigate();

  const [client, setClient] = useState({
    first_name: '',
    last_name: '',
    preferred_name: '',
    date_of_birth: '',
    status: 'Active',
    primary_clinician_id: '',
    location: 'In-person',
    admin_notes: '',
  });

  const [contact, setContact] = useState({
    full_name: '',
    relationship: 'Mother',
    phone_primary: '',
    phone_secondary: '',
    email: '',
    is_responsible_party: true,
    reminder_appointment_email: true,
    reminder_appointment_text: false,
    reminder_cancellation_email: true,
    reminder_cancellation_text: false,
  });

  const [clinicians, setClinicians] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/clinicians').then(setClinicians).catch(() => {});
    if (isEditing) {
      api.get(`/clients/${id}`).then(data => {
        setClient({
          first_name: data.first_name || '',
          last_name: data.last_name || '',
          preferred_name: data.preferred_name || '',
          date_of_birth: data.date_of_birth ? data.date_of_birth.split('T')[0] : '',
          status: data.status || 'Active',
          primary_clinician_id: data.primary_clinician_id || '',
          location: data.location || 'In-person',
          admin_notes: data.admin_notes || '',
        });
        if (data.contacts?.[0]) {
          const c = data.contacts[0];
          setContact({
            full_name: c.full_name || '',
            relationship: c.relationship || 'Mother',
            phone_primary: c.phone_primary || '',
            phone_secondary: c.phone_secondary || '',
            email: c.email || '',
            is_responsible_party: c.is_responsible_party ?? true,
            reminder_appointment_email: c.reminder_appointment_email ?? true,
            reminder_appointment_text: c.reminder_appointment_text ?? false,
            reminder_cancellation_email: c.reminder_cancellation_email ?? true,
            reminder_cancellation_text: c.reminder_cancellation_text ?? false,
          });
        }
      }).catch(e => setError(e.message));
    }
  }, [id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const clientPayload = {
        ...client,
        full_name: `${client.first_name} ${client.last_name}`.trim(),
        primary_clinician_id: client.primary_clinician_id || null,
        date_of_birth: client.date_of_birth || null,
      };

      let clientId = id;
      if (isEditing) {
        await api.patch(`/clients/${id}`, clientPayload);
      } else {
        const created = await api.post('/clients', clientPayload);
        clientId = created.id;
      }

      if (contact.full_name.trim()) {
        if (isEditing) {
          const existing = await api.get(`/clients/${id}/contacts`);
          if (existing[0]) {
            await api.patch(`/clients/${id}/contacts/${existing[0].id}`, contact);
          } else {
            await api.post(`/clients/${clientId}/contacts`, contact);
          }
        } else {
          await api.post(`/clients/${clientId}/contacts`, contact);
        }
      }

      navigate(`/clients/${clientId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const setC = (field, value) => setClient(f => ({ ...f, [field]: value }));
  const setK = (field, value) => setContact(f => ({ ...f, [field]: value }));

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">
          {isEditing ? 'Edit client' : 'Add client'}
        </h1>
      </div>

      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

      <form onSubmit={handleSubmit} className="space-y-6">

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <SectionHeader title="Client info" />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Legal first name *</label>
              <input type="text" required value={client.first_name}
                onChange={e => setC('first_name', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Legal last name *</label>
              <input type="text" required value={client.last_name}
                onChange={e => setC('last_name', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Preferred name <span className="text-gray-400 font-normal">(goes by)</span></label>
              <input type="text" value={client.preferred_name}
                onChange={e => setC('preferred_name', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Date of birth</label>
              <input type="date" value={client.date_of_birth}
                onChange={e => setC('date_of_birth', e.target.value)} className={inputClass} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <SectionHeader title="Clinician & scheduling" />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Primary clinician</label>
              <select value={client.primary_clinician_id}
                onChange={e => setC('primary_clinician_id', e.target.value)} className={inputClass}>
                <option value="">— Unassigned —</option>
                {clinicians.map(c => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Location</label>
              <select value={client.location}
                onChange={e => setC('location', e.target.value)} className={inputClass}>
                <option value="In-person">In-person (1167 Wilmette Ave)</option>
                <option value="Zoom">Zoom (telehealth)</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select value={client.status}
                onChange={e => setC('status', e.target.value)} className={inputClass}>
                <option value="Prospective">Prospective</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <SectionHeader
            title="Parent / guardian contact"
            subtitle="Primary contact for reminders, invoices, and portal access"
          />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Full name</label>
              <input type="text" value={contact.full_name}
                onChange={e => setK('full_name', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Relationship</label>
              <select value={contact.relationship}
                onChange={e => setK('relationship', e.target.value)} className={inputClass}>
                <option>Mother</option>
                <option>Father</option>
                <option>Guardian</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Mobile phone</label>
              <input type="tel" value={formatPhoneInput(contact.phone_primary)}
                onChange={e => setK('phone_primary', formatPhoneInput(e.target.value))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Secondary phone</label>
              <input type="tel" value={formatPhoneInput(contact.phone_secondary)}
                onChange={e => setK('phone_secondary', formatPhoneInput(e.target.value))} className={inputClass} />
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Email</label>
              <input type="email" value={contact.email}
                onChange={e => setK('email', e.target.value)} className={inputClass} />
            </div>
          </div>
          <div className="mt-5 pt-4 border-t border-gray-100">
            <p className="text-sm font-medium text-gray-700 mb-3">Reminder preferences</p>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-gray-500 mb-2">Upcoming appointments</p>
                <div className="flex gap-6">
                  <Toggle label="Email" checked={contact.reminder_appointment_email}
                    onChange={v => setK('reminder_appointment_email', v)} />
                  <Toggle label="Text" checked={contact.reminder_appointment_text}
                    onChange={v => setK('reminder_appointment_text', v)} />
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-2">Cancellations</p>
                <div className="flex gap-6">
                  <Toggle label="Email" checked={contact.reminder_cancellation_email}
                    onChange={v => setK('reminder_cancellation_email', v)} />
                  <Toggle label="Text" checked={contact.reminder_cancellation_text}
                    onChange={v => setK('reminder_cancellation_text', v)} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <SectionHeader title="Admin notes" subtitle="Internal only — not visible to parents" />
          <textarea value={client.admin_notes}
            onChange={e => setC('admin_notes', e.target.value)}
            rows={3} className={inputClass} />
        </div>

        <div className="flex gap-3 pb-8">
          <button type="submit" disabled={saving}
            className="bg-brand-500 text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors">
            {saving ? 'Saving...' : isEditing ? 'Save changes' : 'Add client'}
          </button>
          <button type="button"
            onClick={() => navigate(isEditing ? `/clients/${id}` : '/clients')}
            className="text-sm font-medium text-gray-600 px-5 py-2.5 rounded-lg hover:bg-gray-100 transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
