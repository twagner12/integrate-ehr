import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import AINoteTaker from '../components/AINoteTaker.jsx';

const STATUS_COLORS = {
  Show: 'bg-green-100 text-green-700',
  'No Show': 'bg-red-100 text-red-700',
  'Late Cancel': 'bg-orange-100 text-orange-700',
  Canceled: 'bg-gray-100 text-gray-600',
};

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

// ─── Success Screen ───────────────────────────────────────────────

function RecordSuccess({ clientId, clientName }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Note saved as draft</h2>
      <p className="text-sm text-gray-500 mb-6">Review and finalize from the client profile</p>
      <div className="space-y-3 w-full max-w-xs">
        <Link
          to={`/clients/${clientId}`}
          className="block w-full bg-brand-500 text-white text-center py-3 rounded-xl font-medium hover:bg-brand-600"
        >
          Review note
        </Link>
        <Link
          to="/record"
          className="block w-full border border-gray-300 text-center py-3 rounded-xl font-medium text-gray-700 hover:bg-gray-50"
        >
          Back to sessions
        </Link>
      </div>
    </div>
  );
}

// ─── Recording Screen ─────────────────────────────────────────────

function RecordSession({ appointmentId }) {
  const api = useApi();
  const [appointment, setAppointment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api.get(`/appointments/${appointmentId}`);
        if (!cancelled) setAppointment(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [appointmentId]);

  const handleGenerated = async (soapData) => {
    try {
      await api.post('/notes', {
        appointment_id: appointmentId,
        client_id: appointment.client_id,
        subjective: soapData.subjective,
        objective: soapData.objective,
        assessment: soapData.assessment,
        plan: soapData.plan,
      });
      setSaved(true);
    } catch (err) {
      alert('Failed to save note: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 pt-8">
        <div className="max-w-lg mx-auto px-4">
          <div className="animate-pulse space-y-4 pt-12">
            <div className="h-6 bg-gray-200 rounded w-3/4" />
            <div className="h-4 bg-gray-200 rounded w-1/2" />
            <div className="h-48 bg-gray-200 rounded-xl mt-8" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 pt-8">
        <div className="max-w-lg mx-auto px-4 pt-12 text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Link to="/record" className="text-brand-600 font-medium hover:text-brand-700">
            Back to sessions
          </Link>
        </div>
      </div>
    );
  }

  if (saved) {
    return (
      <div className="min-h-screen bg-gray-50 pt-8">
        <div className="max-w-lg mx-auto px-4">
          <RecordSuccess clientId={appointment.client_id} clientName={appointment.client_name} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-8">
      <div className="max-w-lg mx-auto px-4 pb-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            to="/record"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to sessions
          </Link>
          <h1 className="text-xl font-bold text-gray-900">{appointment.client_name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {formatTime(appointment.starts_at)} &middot; {appointment.service_description}
          </p>
        </div>

        {/* AI Note Taker */}
        <AINoteTaker
          appointmentId={appointmentId}
          clientId={appointment.client_id}
          onGenerated={handleGenerated}
          onCancel={() => window.history.back()}
        />
      </div>
    </div>
  );
}

// ─── Today's Sessions List ────────────────────────────────────────

function TodaySessions() {
  const api = useApi();
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api.get(`/appointments?start=${today}&end=${today}`);
        if (!cancelled) setAppointments(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [today]);

  return (
    <div className="min-h-screen bg-gray-50 pt-8">
      <div className="max-w-lg mx-auto px-4 pb-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Today's Sessions</h1>
          <p className="text-sm text-gray-500 mt-1">{formatDate(today + 'T12:00:00')}</p>
        </div>

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse bg-white rounded-xl p-4 border border-gray-200">
                <div className="h-5 bg-gray-200 rounded w-2/3 mb-2" />
                <div className="h-4 bg-gray-200 rounded w-full mb-2" />
                <div className="h-5 bg-gray-200 rounded w-20" />
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && appointments.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-900 mb-1">No sessions scheduled for today</p>
            <p className="text-xs text-gray-500">Check back when you have appointments</p>
          </div>
        )}

        {/* Appointment cards */}
        {!loading && !error && appointments.length > 0 && (
          <div className="space-y-3">
            {appointments.map((appt) => (
              <button
                key={appt.id}
                onClick={() => navigate(`/record/${appt.id}`)}
                className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 min-h-[56px] hover:border-gray-300 hover:shadow-sm active:bg-gray-50 transition-all"
              >
                <p className="text-lg font-semibold text-gray-900">{appt.client_name}</p>
                <p className="text-sm text-gray-500 mt-1">
                  {formatTime(appt.starts_at)} &middot; {appt.clinician_name} &middot; {appt.service_description}
                </p>
                <span
                  className={`inline-block mt-2 text-xs font-medium px-2.5 py-0.5 rounded-full ${
                    STATUS_COLORS[appt.status] || 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {appt.status}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Router Component ────────────────────────────────────────

export default function Record() {
  const { appointmentId } = useParams();

  if (appointmentId) {
    return <RecordSession appointmentId={parseInt(appointmentId)} />;
  }
  return <TodaySessions />;
}
