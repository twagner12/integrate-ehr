import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';

export default function Dashboard() {
  const api = useApi();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/reports/dashboard')
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const dollar = (amount) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  if (loading || !stats) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">Dashboard</h1>
        <p className="text-sm text-gray-500">{today}</p>
        <div className="mt-8 text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Dashboard</h1>
      <p className="text-sm text-gray-500">{today}</p>

      <div className="grid grid-cols-4 gap-4 mt-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Today's Appointments</p>
          <p className="text-3xl font-semibold text-gray-900 mt-2">{stats.appointments_today}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Active Clients</p>
          <p className="text-3xl font-semibold text-gray-900 mt-2">{stats.active_clients}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Unpaid Invoices</p>
          <p className="text-3xl font-semibold text-gray-900 mt-2">{stats.unpaid_invoices.count}</p>
          <p className="text-sm text-gray-400 mt-1">{dollar(stats.unpaid_invoices.total)} outstanding</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Monthly Revenue</p>
          <p className="text-3xl font-semibold text-gray-900 mt-2">{dollar(stats.monthly_revenue)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Upcoming Appointments</p>
          <p className="text-3xl font-semibold text-gray-900 mt-2">{stats.upcoming_appointments}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Uninvoiced Sessions</p>
          <p className="text-3xl font-semibold text-gray-900 mt-2">{stats.uninvoiced_sessions}</p>
          <button
            onClick={() => navigate('/invoices')}
            className="text-sm text-blue-600 hover:text-blue-800 mt-1"
          >
            Generate invoices &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}
