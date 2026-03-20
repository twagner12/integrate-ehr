import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useApi } from '../../hooks/useApi.js';

export default function PortalAppointments() {
  const { clientId } = useParams();
  const api = useApi();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/portal/clients/${clientId}/appointments`)
      .then(setAppointments)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [clientId]);

  const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' });
  const fmtTime = (d) => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });

  return (
    <div>
      <h2 className="text-2xl font-light text-gray-800 mb-6">Appointments</h2>

      <div className="mb-6">
        <span className="text-sm font-medium text-gray-800 border-b-2 border-gray-800 pb-2">UPCOMING</span>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : appointments.length === 0 ? (
        <p className="text-center text-gray-500 py-12">No appointments.</p>
      ) : (
        <div className="space-y-4">
          {appointments.map(apt => (
            <div key={apt.id} className="border border-gray-200 rounded-lg p-5">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-gray-900">{fmtDate(apt.starts_at)}</p>
                  <p className="text-sm text-gray-600 mt-1">
                    {fmtTime(apt.starts_at)} — {fmtTime(apt.ends_at)}
                  </p>
                  <p className="text-sm text-gray-500 mt-2">{apt.service_description}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">{apt.clinician_name}</p>
                  {apt.location && <p className="text-xs text-gray-400 mt-1">{apt.location}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
