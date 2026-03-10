import { useState, useEffect, useRef } from 'react';
import { useApi } from '../hooks/useApi.js';

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <div onClick={() => onChange(!checked)}
        className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${checked ? 'bg-brand-500' : 'bg-gray-300'}`}>
        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
      <span className="text-sm text-gray-600">{label}</span>
    </label>
  );
}

const inputClass = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400";
const labelClass = "block text-sm font-medium text-gray-700 mb-1";

function ContactCard({ contact, clientId, onRefresh, isOnlyBillingParty }) {
  const api = useApi();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [person, setPerson] = useState({
    first_name: contact.first_name,
    last_name: contact.last_name,
    phone_primary: contact.phone_primary || '',
    phone_secondary: contact.phone_secondary || '',
    email: contact.email || '',
  });

  const [link, setLink] = useState({
    relationship: contact.relationship || '',
    is_responsible_party: contact.is_responsible_party,
    reminder_appointment_email: contact.reminder_appointment_email,
    reminder_appointment_text: contact.reminder_appointment_text,
    reminder_cancellation_email: contact.reminder_cancellation_email,
    reminder_cancellation_text: contact.reminder_cancellation_text,
  });

  const setL = (field, value) => setLink(f => ({ ...f, [field]: value }));
  const setP = (field, value) => setPerson(f => ({ ...f, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch(`/people/${contact.id}`, person);
      await api.patch(`/clients/${clientId}/contacts/${contact.link_id}`, link);
      setEditing(false);
      onRefresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUnlink = async () => {
    if (!confirm('Remove this contact from the client?')) return;
    await api.delete(`/clients/${clientId}/contacts/${contact.link_id}`);
    onRefresh();
  };

  if (!editing) {
    return (
      <div className="py-3 border-b border-gray-100 last:border-0">
        <div className="flex items-start justify-between">
          <div className="text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium">{contact.first_name} {contact.last_name}</span>
              {contact.is_responsible_party && (
                <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">Billing</span>
              )}
            </div>
            <p className="text-gray-400 text-xs">{contact.relationship}</p>
            {contact.phone_primary && <p className="text-gray-600">{contact.phone_primary}</p>}
            {contact.email && <p className="text-gray-600">{contact.email}</p>}
          </div>
          <div className="flex gap-2 text-xs">
            <button onClick={() => setEditing(true)}
              className="text-brand-500 hover:underline">Edit</button>
            <button onClick={handleUnlink}
              className="text-gray-400 hover:text-red-500 transition-colors">Remove</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-3 border-b border-gray-100 last:border-0">
      <p className="text-sm font-semibold text-gray-700 mb-3">Edit contact</p>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className={labelClass}>First name</label>
          <input type="text" value={person.first_name}
            onChange={e => setP('first_name', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Last name</label>
          <input type="text" value={person.last_name}
            onChange={e => setP('last_name', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Mobile phone</label>
          <input type="tel" value={person.phone_primary}
            onChange={e => setP('phone_primary', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Secondary phone</label>
          <input type="tel" value={person.phone_secondary}
            onChange={e => setP('phone_secondary', e.target.value)} className={inputClass} />
        </div>
        <div className="col-span-2">
          <label className={labelClass}>Email</label>
          <input type="email" value={person.email}
            onChange={e => setP('email', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Relationship</label>
          <select value={link.relationship}
            onChange={e => setL('relationship', e.target.value)} className={inputClass}>
            <option>Mother</option>
            <option>Father</option>
            <option>Guardian</option>
            <option>Grandparent</option>
            <option>Other</option>
          </select>
        </div>
        <div className="flex items-end pb-2">
          <Toggle
            label="Responsible for billing"
            checked={link.is_responsible_party}
            onChange={v => {
              // If trying to uncheck and they're the only billing party, block it
              if (!v && isOnlyBillingParty) {
                alert('At least one contact must be responsible for billing. Assign billing to another contact first.');
                return;
              }
              setL('is_responsible_party', v);
            }}
          />
        </div>
      </div>

      <div className="mb-3">
        <p className="text-sm font-medium text-gray-700 mb-2">Reminder preferences</p>
        <div className="space-y-2">
          <div>
            <p className="text-xs text-gray-500 mb-1.5">Upcoming appointments</p>
            <div className="flex gap-6">
              <Toggle label="Email" checked={link.reminder_appointment_email} onChange={v => setL('reminder_appointment_email', v)} />
              <Toggle label="Text" checked={link.reminder_appointment_text} onChange={v => setL('reminder_appointment_text', v)} />
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1.5">Cancellations</p>
            <div className="flex gap-6">
              <Toggle label="Email" checked={link.reminder_cancellation_email} onChange={v => setL('reminder_cancellation_email', v)} />
              <Toggle label="Text" checked={link.reminder_cancellation_text} onChange={v => setL('reminder_cancellation_text', v)} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving}
          className="bg-brand-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors">
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button onClick={() => setEditing(false)}
          className="text-sm font-medium text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

function AddContactForm({ clientId, onAdded, onCancel, existingContacts }) {
  const api = useApi();
  const [mode, setMode] = useState('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [saving, setSaving] = useState(false);
  const searchTimeout = useRef(null);

  const hasBillingParty = existingContacts.some(c => c.is_responsible_party);

  const [newPerson, setNewPerson] = useState({
    first_name: '', last_name: '', phone_primary: '', phone_secondary: '', email: ''
  });

  const [link, setLink] = useState({
    relationship: 'Mother',
    is_responsible_party: !hasBillingParty, // auto-assign billing if none set
    reminder_appointment_email: true,
    reminder_appointment_text: false,
    reminder_cancellation_email: true,
    reminder_cancellation_text: false,
  });

  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return; }
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await api.get(`/people/search?q=${encodeURIComponent(searchQuery)}`);
        setSearchResults(results);
      } finally { setSearching(false); }
    }, 300);
  }, [searchQuery]);

  const handleSave = async () => {
    setSaving(true);
    try {
      let personId;
      if (mode === 'new') {
        const person = await api.post('/people', newPerson);
        personId = person.id;
      } else {
        personId = selectedPerson.id;
      }

      // If setting as billing party, we need to unset the existing one first
      if (link.is_responsible_party && hasBillingParty) {
        const current = existingContacts.find(c => c.is_responsible_party);
        if (current) {
          await api.patch(`/clients/${clientId}/contacts/${current.link_id}`, { is_responsible_party: false });
        }
      }

      await api.post(`/clients/${clientId}/contacts`, { ...link, person_id: personId });
      onAdded();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const setL = (field, value) => setLink(f => ({ ...f, [field]: value }));

  return (
    <div className="mt-4 pt-4 border-t border-gray-200">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Add contact</h3>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setMode('search')}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${mode === 'search' ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
          Search existing
        </button>
        <button onClick={() => setMode('new')}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${mode === 'new' ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
          Add new person
        </button>
      </div>

      {mode === 'search' ? (
        <div className="mb-4">
          <input type="text" placeholder="Search by name or email..."
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className={inputClass} />
          {searching && <p className="text-xs text-gray-400 mt-1">Searching...</p>}
          {searchResults.length > 0 && (
            <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
              {searchResults.map(p => (
                <button key={p.id} onClick={() => { setSelectedPerson(p); setSearchQuery(`${p.first_name} ${p.last_name}`); setSearchResults([]); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0">
                  <span className="font-medium">{p.first_name} {p.last_name}</span>
                  {p.email && <span className="text-gray-400 ml-2">{p.email}</span>}
                </button>
              ))}
            </div>
          )}
          {selectedPerson && (
            <p className="text-xs text-green-600 mt-1">✓ Selected: {selectedPerson.first_name} {selectedPerson.last_name}</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className={labelClass}>First name *</label>
            <input type="text" value={newPerson.first_name}
              onChange={e => setNewPerson(f => ({ ...f, first_name: e.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Last name *</label>
            <input type="text" value={newPerson.last_name}
              onChange={e => setNewPerson(f => ({ ...f, last_name: e.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Mobile phone</label>
            <input type="tel" value={newPerson.phone_primary}
              onChange={e => setNewPerson(f => ({ ...f, phone_primary: e.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Secondary phone</label>
            <input type="tel" value={newPerson.phone_secondary}
              onChange={e => setNewPerson(f => ({ ...f, phone_secondary: e.target.value }))} className={inputClass} />
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Email</label>
            <input type="email" value={newPerson.email}
              onChange={e => setNewPerson(f => ({ ...f, email: e.target.value }))} className={inputClass} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className={labelClass}>Relationship</label>
          <select value={link.relationship} onChange={e => setL('relationship', e.target.value)} className={inputClass}>
            <option>Mother</option>
            <option>Father</option>
            <option>Guardian</option>
            <option>Grandparent</option>
            <option>Other</option>
          </select>
        </div>
        <div className="flex items-end pb-2">
          <Toggle label="Responsible for billing"
            checked={link.is_responsible_party}
            onChange={v => setL('is_responsible_party', v)} />
        </div>
      </div>
      {link.is_responsible_party && hasBillingParty && (
        <p className="text-xs text-amber-600 mb-3">⚠ This will replace the current billing contact.</p>
      )}

      <div className="mb-4">
        <p className="text-sm font-medium text-gray-700 mb-2">Reminder preferences</p>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-gray-500 mb-1.5">Upcoming appointments</p>
            <div className="flex gap-6">
              <Toggle label="Email" checked={link.reminder_appointment_email} onChange={v => setL('reminder_appointment_email', v)} />
              <Toggle label="Text" checked={link.reminder_appointment_text} onChange={v => setL('reminder_appointment_text', v)} />
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1.5">Cancellations</p>
            <div className="flex gap-6">
              <Toggle label="Email" checked={link.reminder_cancellation_email} onChange={v => setL('reminder_cancellation_email', v)} />
              <Toggle label="Text" checked={link.reminder_cancellation_text} onChange={v => setL('reminder_cancellation_text', v)} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving || (mode === 'search' && !selectedPerson)}
          className="bg-brand-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors">
          {saving ? 'Saving...' : 'Add contact'}
        </button>
        <button onClick={onCancel}
          className="text-sm font-medium text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function ContactsPanel({ clientId }) {
  const api = useApi();
  const [contacts, setContacts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = () => {
    api.get(`/clients/${clientId}/contacts`)
      .then(setContacts)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [clientId]);

  const billingContacts = contacts.filter(c => c.is_responsible_party);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700">Contacts</h2>
        {!showForm && (
          <button onClick={() => setShowForm(true)}
            className="text-xs text-brand-500 hover:underline">+ Add</button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : contacts.length === 0 && !showForm ? (
        <p className="text-sm text-gray-400">No contacts yet.</p>
      ) : (
        contacts.map(c => (
          <ContactCard
            key={c.link_id}
            contact={c}
            clientId={clientId}
            onRefresh={load}
            isOnlyBillingParty={c.is_responsible_party && billingContacts.length === 1}
          />
        ))
      )}

      {showForm && (
        <AddContactForm
          clientId={clientId}
          existingContacts={contacts}
          onAdded={() => { setShowForm(false); load(); }}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
