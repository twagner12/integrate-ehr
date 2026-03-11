import { useState, useEffect, useRef, useCallback } from 'react';
import FullCalendar from '@fullcalendar/react';
import { useSearchParams } from 'react-router-dom';
import timeGridPlugin from '@fullcalendar/timegrid';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useApi } from '../hooks/useApi.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const CLINICIAN_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

const STATUS_COLORS = {
  Show:          { bg: '#dcfce7', border: '#16a34a', text: '#15803d' },
  'No Show':     { bg: '#fee2e2', border: '#dc2626', text: '#b91c1c' },
  'Late Cancel': { bg: '#fef9c3', border: '#ca8a04', text: '#a16207' },
  Canceled:      { bg: '#f3f4f6', border: '#9ca3af', text: '#6b7280' },
};

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const inputClass = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400";
const labelClass = "block text-sm font-medium text-gray-700 mb-1";

// ─── Appointment Form Panel ────────────────────────────────────────────────────

function AppointmentPanel({ isOpen, onClose, onSaved, initialDate, initialClinician, appointmentId, clinicians, services }) {
  const api = useApi();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [clients, setClients] = useState([]);
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef(null);

  const [form, setForm] = useState({
    client_id: '',
    client_name: '',
    clinician_id: initialClinician || '',
    service_id: '',
    date: '',
    start_time: '',
    end_time: '',
    location: 'In-person',
    memo: '',
    status: 'Show',
    billing_status: 'Uninvoiced',
    is_recurring: false,
    recurrence_interval: 1,
    recurrence_days: [],
    recurrence_ends_after: 30,
  });

  // Load appointment data if editing
  useEffect(() => {
    if (!isOpen) return;
    if (appointmentId) {
      setLoading(true);
      api.get(`/appointments/${appointmentId}`).then(appt => {
        const start = new Date(appt.starts_at);
        const end = new Date(appt.ends_at);
        setForm(f => ({
          ...f,
          client_id: appt.client_id,
          client_name: appt.client_name,
          clinician_id: appt.clinician_id,
          service_id: appt.service_id,
          date: start.toISOString().slice(0, 10),
          start_time: start.toTimeString().slice(0, 5),
          end_time: end.toTimeString().slice(0, 5),
          location: appt.location,
          memo: appt.memo || '',
          status: appt.status,
          billing_status: appt.billing_status,
          is_recurring: appt.is_recurring || false,
        }));
        setClientSearch(appt.client_name);
      }).finally(() => setLoading(false));
    } else {
      // New appointment — set defaults from click
      const defaultService = services.find(s => s.is_default) || services[0];
      const startDate = initialDate || new Date();
      const dateStr = startDate instanceof Date
        ? startDate.toISOString().slice(0, 10)
        : startDate;
      const timeStr = startDate instanceof Date && startDate.getHours() > 0
        ? startDate.toTimeString().slice(0, 5)
        : '09:00';
      const [h, m] = timeStr.split(':').map(Number);
      const endDate = new Date(2000, 0, 1, h, m + 50);
      const endStr = endDate.toTimeString().slice(0, 5);

      setForm(f => ({
        ...f,
        client_id: '', client_name: '',
        clinician_id: initialClinician || (clinicians[0]?.id || ''),
        service_id: defaultService?.id || '',
        date: dateStr,
        start_time: timeStr,
        end_time: endStr,
        location: 'In-person',
        memo: '', status: 'Show', billing_status: 'Uninvoiced',
        is_recurring: false,
        recurrence_interval: 1,
        recurrence_days: [],
        recurrence_ends_after: 30,
      }));
      setClientSearch('');
      setClientResults([]);
    }
  }, [isOpen, appointmentId, initialDate, initialClinician]);

  // Client search
  const searchTimeout = useRef(null);
  useEffect(() => {
    if (clientSearch.length < 2) { setClientResults([]); return; }
    if (form.client_id && clientSearch === form.client_name) return;
    clearTimeout(searchTimeout.current);
    setSearching(true);
    searchTimeout.current = setTimeout(async () => {
      try {
        const all = await api.get('/clients');
        const q = clientSearch.toLowerCase();
        setClientResults(all.filter(c =>
          c.full_name.toLowerCase().includes(q) ||
          c.first_name.toLowerCase().includes(q) ||
          c.last_name.toLowerCase().includes(q)
        ).slice(0, 8));
      } finally { setSearching(false); }
    }, 200);
  }, [clientSearch]);

  // Auto-update end time when start time changes (maintain 50min duration)
  const handleStartTimeChange = (val) => {
    const [h, m] = val.split(':').map(Number);
    const end = new Date(2000, 0, 1, h, m + 50);
    const endStr = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
    setForm(f => ({ ...f, start_time: val, end_time: endStr }));
  };

  // Auto-update end time when service changes
  const handleServiceChange = (serviceId) => {
    const svc = services.find(s => String(s.id) === String(serviceId));
    if (svc && form.start_time) {
      const [h, m] = form.start_time.split(':').map(Number);
      const dur = svc.duration_minutes || 50;
      const end = new Date(2000, 0, 1, h, m + dur);
      const endStr = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
      setForm(f => ({ ...f, service_id: serviceId, end_time: endStr }));
    } else {
      setForm(f => ({ ...f, service_id: serviceId }));
    }
  };

  const toggleDay = (idx) => {
    setForm(f => {
      const days = f.recurrence_days.includes(idx)
        ? f.recurrence_days.filter(d => d !== idx)
        : [...f.recurrence_days, idx];
      return { ...f, recurrence_days: days };
    });
  };

  const handleSave = async () => {
    if (!form.client_id || !form.clinician_id || !form.service_id) {
      alert('Please fill in client, clinician, and service.');
      return;
    }
    setSaving(true);
    try {
      const starts_at = new Date(`${form.date}T${form.start_time}`).toISOString();
      const ends_at = new Date(`${form.date}T${form.end_time}`).toISOString();
      const payload = {
        client_id: form.client_id,
        clinician_id: form.clinician_id,
        service_id: form.service_id,
        starts_at, ends_at,
        location: form.location,
        memo: form.memo || null,
        status: form.status,
        billing_status: form.billing_status,
        is_recurring: form.is_recurring,
        recurrence_rule: form.is_recurring ? {
          frequency: 'weekly',
          interval: form.recurrence_interval,
          days_of_week: form.recurrence_days,
          ends_after: form.recurrence_ends_after,
        } : null,
      };
      if (appointmentId) {
        await api.patch(`/appointments/${appointmentId}`, payload);
      } else {
        await api.post('/appointments', payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this appointment?')) return;
    setDeleting(true);
    try {
      await api.delete(`/appointments/${appointmentId}`);
      onSaved();
      onClose();
    } finally { setDeleting(false); }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-[420px] bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">
            {appointmentId ? 'Edit appointment' : 'New appointment'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-gray-400">Loading...</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

            {/* Client */}
            <div className="relative">
              <label className={labelClass}>Client *</label>
              <input
                type="text"
                placeholder="Search client..."
                value={clientSearch}
                onChange={e => { setClientSearch(e.target.value); setForm(f => ({ ...f, client_id: '', client_name: '' })); }}
                className={inputClass}
                ref={searchRef}
              />
              {clientResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 border border-gray-200 rounded-lg bg-white shadow-lg overflow-hidden">
                  {clientResults.map(c => (
                    <button key={c.id}
                      onClick={() => { setForm(f => ({ ...f, client_id: c.id, client_name: c.full_name })); setClientSearch(c.full_name); setClientResults([]); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0">
                      {c.full_name}
                      {c.primary_clinician && <span className="text-gray-400 ml-2 text-xs">{c.primary_clinician}</span>}
                    </button>
                  ))}
                </div>
              )}
              {searching && <p className="text-xs text-gray-400 mt-1">Searching...</p>}
            </div>

            {/* Clinician */}
            <div>
              <label className={labelClass}>Clinician *</label>
              <select value={form.clinician_id} onChange={e => setForm(f => ({ ...f, clinician_id: e.target.value }))} className={inputClass}>
                <option value="">Select clinician</option>
                {clinicians.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select>
            </div>

            {/* Service */}
            <div>
              <label className={labelClass}>Service *</label>
              <select value={form.service_id} onChange={e => handleServiceChange(e.target.value)} className={inputClass}>
                <option value="">Select service</option>
                {services.map(s => (
                  <option key={s.id} value={s.id}>{s.cpt_code} — {s.description}</option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div>
              <label className={labelClass}>Date *</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className={inputClass} />
            </div>

            {/* Time */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Start time</label>
                <input type="time" value={form.start_time} onChange={e => handleStartTimeChange(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>End time</label>
                <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} className={inputClass} />
              </div>
            </div>

            {/* Location */}
            <div>
              <label className={labelClass}>Location</label>
              <select value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} className={inputClass}>
                <option value="In-person">In-person — 1167 Wilmette Ave</option>
                <option value="Zoom">Zoom</option>
              </select>
            </div>

            {/* Status (only show when editing) */}
            {appointmentId && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={inputClass}>
                    <option>Show</option>
                    <option>No Show</option>
                    <option>Late Cancel</option>
                    <option>Canceled</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Billing</label>
                  <select value={form.billing_status} onChange={e => setForm(f => ({ ...f, billing_status: e.target.value }))} className={inputClass}>
                    <option>Uninvoiced</option>
                    <option>Invoiced</option>
                    <option>Paid</option>
                  </select>
                </div>
              </div>
            )}

            {/* Recurring */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_recurring}
                  onChange={e => setForm(f => ({ ...f, is_recurring: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 text-brand-500" />
                <span className="text-sm font-medium text-gray-700">Recurring</span>
              </label>

              {form.is_recurring && (
                <div className="mt-3 pl-6 space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-600">Every</span>
                    <input type="number" min="1" max="4" value={form.recurrence_interval}
                      onChange={e => setForm(f => ({ ...f, recurrence_interval: parseInt(e.target.value) }))}
                      className="w-14 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center" />
                    <span className="text-gray-600">week(s)</span>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500 mb-2">On these days</p>
                    <div className="flex gap-1">
                      {DAYS.map((d, i) => (
                        <button key={i} onClick={() => toggleDay(i)}
                          className={`w-8 h-8 rounded-full text-xs font-medium transition-colors ${
                            form.recurrence_days.includes(i)
                              ? 'bg-brand-500 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}>
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-600">Ends after</span>
                    <input type="number" min="1" max="100" value={form.recurrence_ends_after}
                      onChange={e => setForm(f => ({ ...f, recurrence_ends_after: parseInt(e.target.value) }))}
                      className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center" />
                    <span className="text-gray-600">events</span>
                  </div>
                </div>
              )}
            </div>

            {/* Memo */}
            <div>
              <label className={labelClass}>Memo <span className="text-gray-400 font-normal">(internal)</span></label>
              <textarea value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
                rows={2} placeholder="Optional note..."
                className={inputClass + ' resize-none'} />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <div>
            {appointmentId && (
              <button onClick={handleDelete} disabled={deleting}
                className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50">
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="text-sm font-medium text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-100">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="bg-brand-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : appointmentId ? 'Save changes' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Main Calendar Page ────────────────────────────────────────────────────────

export default function Calendar() {
  const api = useApi();
  const calendarRef = useRef(null);
const [searchParams, setSearchParams] = useSearchParams();

useEffect(() => {
  if (searchParams.get('new') === '1') {
    setSelectedApptId(null);
    setInitialDate(new Date());
    setInitialClinician(null);
    setPanelOpen(true);
    setSearchParams({});
  }
}, [searchParams]);
  const [clinicians, setClinicians] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedClinicians, setSelectedClinicians] = useState([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedApptId, setSelectedApptId] = useState(null);
  const [initialDate, setInitialDate] = useState(null);
  const [initialClinician, setInitialClinician] = useState(null);
  const [events, setEvents] = useState([]);

  // Load clinicians and services on mount
  useEffect(() => {
    Promise.all([api.get('/clinicians'), api.get('/services')]).then(([cl, sv]) => {
      setClinicians(cl);
      setServices(sv);
      setSelectedClinicians(cl.map(c => c.id)); // all selected by default
    });
  }, []);

  // Fetch appointments for the visible date range
  const fetchEvents = useCallback(async (fetchInfo, successCallback) => {
    try {
      const start = fetchInfo.startStr.slice(0, 10);
      const end = fetchInfo.endStr.slice(0, 10);
      const appts = await api.get(`/appointments?start=${start}&end=${end}`);

      const mapped = appts
        .filter(a => selectedClinicians.includes(a.clinician_id))
        .map((a, idx) => {
          const clinicianIdx = clinicians.findIndex(c => c.id === a.clinician_id);
          const color = CLINICIAN_COLORS[clinicianIdx % CLINICIAN_COLORS.length];
          const statusStyle = STATUS_COLORS[a.status] || STATUS_COLORS.Show;
          const initials = `${a.clinician_first_name?.[0] || ''}${a.clinician_last_name?.[0] || ''}`;
          return {
            id: a.id,
            title: `${initials}: ${a.client_name}`,
            start: a.starts_at,
            end: a.ends_at,
            backgroundColor: statusStyle.bg,
            borderColor: statusStyle.border,
            textColor: statusStyle.text,
            extendedProps: { ...a, clinicianColor: color },
          };
        });
      successCallback(mapped);
    } catch (err) {
      console.error('Failed to fetch appointments', err);
      successCallback([]);
    }
  }, [selectedClinicians, clinicians]);

  const handleDateClick = (info) => {
    setSelectedApptId(null);
    setInitialDate(info.date);
    setInitialClinician(clinicians[0]?.id || null);
    setPanelOpen(true);
  };

  const handleEventClick = (info) => {
    setSelectedApptId(parseInt(info.event.id));
    setInitialDate(null);
    setInitialClinician(null);
    setPanelOpen(true);
  };

  const handleSaved = () => {
    calendarRef.current?.getApi().refetchEvents();
  };

  const toggleClinician = (id) => {
    setSelectedClinicians(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
    // Refetch after state update
    setTimeout(() => calendarRef.current?.getApi().refetchEvents(), 0);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          {clinicians.map((c, i) => (
            <button key={c.id}
              onClick={() => toggleClinician(c.id)}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                selectedClinicians.includes(c.id)
                  ? 'text-white border-transparent'
                  : 'bg-white text-gray-500 border-gray-300'
              }`}
              style={selectedClinicians.includes(c.id) ? { backgroundColor: CLINICIAN_COLORS[i % CLINICIAN_COLORS.length], borderColor: CLINICIAN_COLORS[i % CLINICIAN_COLORS.length] } : {}}>
              {c.full_name}
            </button>
          ))}
        </div>

        <button
          onClick={() => { setSelectedApptId(null); setInitialDate(new Date()); setInitialClinician(null); setPanelOpen(true); }}
          className="ml-auto bg-brand-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-600 transition-colors">
          + New appointment
        </button>
      </div>

      {/* Calendar */}
      <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden calendar-container">
        <FullCalendar
          ref={calendarRef}
          plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          allDaySlot={false}
          slotMinTime="07:00:00"
          slotMaxTime="20:00:00"
          slotDuration="00:30:00"
          snapDuration="00:05:00"
          height="100%"
          events={fetchEvents}
          dateClick={handleDateClick}
          eventClick={handleEventClick}
          eventContent={(info) => {
            const { client_name, clinician_first_name, clinician_last_name, status } = info.event.extendedProps;
            const initials = `${clinician_first_name?.[0] || ''}${clinician_last_name?.[0] || ''}`;
            return (
              <div className="px-1 py-0.5 overflow-hidden h-full text-xs leading-tight">
                <div className="font-semibold truncate">{initials}: {client_name}</div>
                {status !== 'Show' && <div className="truncate opacity-75">{status}</div>}
              </div>
            );
          }}
          nowIndicator={true}
          businessHours={{ daysOfWeek: [1, 2, 3, 4, 5], startTime: '08:00', endTime: '19:00' }}
        />
      </div>

      <AppointmentPanel
        isOpen={panelOpen}
        onClose={() => setPanelOpen(false)}
        onSaved={handleSaved}
        initialDate={initialDate}
        initialClinician={initialClinician}
        appointmentId={selectedApptId}
        clinicians={clinicians}
        services={services}
      />
    </div>
  );
}
