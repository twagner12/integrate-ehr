import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import NotesTab from '../components/NotesTab.jsx';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function statusBadge(status) {
  const styles = { Show: 'bg-green-100 text-green-700', 'No Show': 'bg-red-100 text-red-700', 'Late Cancel': 'bg-yellow-100 text-yellow-700', Canceled: 'bg-gray-100 text-gray-500' };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status] || 'bg-gray-100 text-gray-500'}`}>{status}</span>;
}

function billingBadge(status) {
  const styles = { Uninvoiced: 'bg-orange-100 text-orange-700', Invoiced: 'bg-blue-100 text-blue-700', Paid: 'bg-green-100 text-green-700' };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status] || 'bg-gray-100 text-gray-500'}`}>{status}</span>;
}

const TABS = ['Overview', 'Notes'];

export default function ClientProfile() {
  const { id } = useParams();
  const api = useApi();
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('Overview');

  useEffect(() => {
    api.get(`/clients/${id}`).then(setClient).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="text-sm text-gray-400">Loading...</p>;
  if (error) return <p className="text-sm text-red-500">{error}</p>;
  if (!client) return null;

  const uninvoicedAppts = client.appointments?.filter(a => a.billing_status === 'Uninvoiced' && a.status !== 'Canceled') || [];
  const uninvoicedAmount = uninvoicedAppts.reduce((sum, a) => sum + parseFloat(a.fee || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link to="/clients" className="text-sm text-gray-400 hover:text-gray-600">← Clients</Link>
          <h1 className="text-2xl font-semibold text-gray-900">{client.full_name}</h1>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${client.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{client.status}</span>
        </div>
        <Link to={`/clients/${id}/edit`} className="text-sm font-medium text-gray-600 px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors">Edit</Link>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">

          <div className="flex gap-1 border-b border-gray-200">
            {TABS.map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === tab ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {tab}
              </button>
            ))}
          </div>

          {activeTab === 'Overview' && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">Client info</h2>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-gray-400">Date of birth</p><p className="font-medium">{formatDate(client.date_of_birth)}</p></div>
                  <div><p className="text-gray-400">Age</p><p className="font-medium">{client.age ?? '—'}</p></div>
                  <div><p className="text-gray-400">Primary clinician</p><p className="font-medium">{client.primary_clinician_name || '—'}</p></div>
                  <div><p className="text-gray-400">Client since</p><p className="font-medium">{formatDate(client.created_at)}</p></div>
                </div>
                {client.admin_notes && <div className="mt-3 pt-3 border-t border-gray-100"><p className="text-gray-400 text-xs mb-1">Admin notes</p><p className="text-sm text-gray-700">{client.admin_notes}</p></div>}
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">Diagnosis</h2>
                {client.diagnosis ? (
                  <div className="text-sm">
                    <p className="font-medium">{client.diagnosis.icd10_code} — {client.diagnosis.description}</p>
                    {client.diagnosis.notes && <p className="text-gray-500 mt-1">{client.diagnosis.notes}</p>}
                    <p className="text-gray-400 text-xs mt-1">{formatDate(client.diagnosis.diagnosed_at)}</p>
                  </div>
                ) : <p className="text-sm text-gray-400">No diagnosis on file.</p>}
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-gray-700">Appointments</h2>
                  <Link to={`/calendar?client=${id}`} className="text-xs text-brand-500 hover:underline">View calendar →</Link>
                </div>
                {!client.appointments?.length ? <p className="text-sm text-gray-400">No appointments yet.</p> : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-2 text-gray-500 font-medium">Date</th>
                        <th className="text-left py-2 text-gray-500 font-medium">Service</th>
                        <th className="text-left py-2 text-gray-500 font-medium">Clinician</th>
                        <th className="text-left py-2 text-gray-500 font-medium">Status</th>
                        <th className="text-left py-2 text-gray-500 font-medium">Billing</th>
                        <th className="text-right py-2 text-gray-500 font-medium">Fee</th>
                      </tr>
                    </thead>
                    <tbody>
                      {client.appointments.map(appt => (
                        <tr key={appt.id} className="border-b border-gray-50">
                          <td className="py-2 text-gray-600">{formatDateTime(appt.starts_at)}</td>
                          <td className="py-2 text-gray-600">{appt.cpt_code}</td>
                          <td className="py-2 text-gray-600">{appt.clinician_name}</td>
                          <td className="py-2">{statusBadge(appt.status)}</td>
                          <td className="py-2">{billingBadge(appt.billing_status)}</td>
                          <td className="py-2 text-right text-gray-600">${parseFloat(appt.fee || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {activeTab === 'Notes' && <NotesTab clientId={id} />}

        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700">Contacts</h2>
              <Link to={`/clients/${id}/contacts/new`} className="text-xs text-brand-500 hover:underline">+ Add</Link>
            </div>
            {!client.contacts?.length ? <p className="text-sm text-gray-400">No contacts yet.</p> : (
              <div className="space-y-3">
                {client.contacts.map(contact => (
                  <div key={contact.id} className="text-sm border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{contact.full_name}</p>
                      {contact.is_responsible_party && <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">Billing</span>}
                    </div>
                    <p className="text-gray-400 text-xs">{contact.relationship}</p>
                    {contact.phone_primary && <p className="text-gray-600">{contact.phone_primary}</p>}
                    {contact.email && <p className="text-gray-600">{contact.email}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Billing summary</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Uninvoiced sessions</span><span className="font-medium">{uninvoicedAppts.length}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Uninvoiced amount</span><span className="font-medium">${uninvoicedAmount.toFixed(2)}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
