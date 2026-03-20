import { useState, useEffect, useRef } from 'react';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '@clerk/react';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

const sectionClass = "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none min-h-[100px]";

function NoteEditor({ note, onSaved, onCancel, isAdmin }) {
  const api = useApi();
  const [form, setForm] = useState({
    subjective: note?.subjective || '',
    objective: note?.objective || '',
    assessment: note?.assessment || '',
    plan: note?.plan || '',
  });
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  // AI Assist state
  const [aiState, setAiState] = useState('idle'); // idle, recording, transcribing, transcript, generating
  const [transcript, setTranscript] = useState('');
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const timerRef = useRef(null);
  const fileInputRef = useRef(null);

  const fmtTimer = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const handleAudioBlob = async (blob, filename) => {
    setAiState('transcribing');
    try {
      const token = await window.Clerk?.session?.getToken();
      const formData = new FormData();
      formData.append('audio', blob, filename);
      const res = await fetch('/api/notes/transcribe', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Transcription failed');
      const data = await res.json();
      setTranscript(data.transcript);
      setAiState('transcript');
    } catch (err) {
      alert(err.message);
      setAiState('idle');
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      const chunks = [];
      recorder.ondataavailable = e => chunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: 'audio/webm' });
        await handleAudioBlob(blob, 'recording.webm');
      };
      recorder.start();
      setMediaRecorder(recorder);
      setAiState('recording');
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch (err) {
      alert('Could not access microphone: ' + err.message);
    }
  };

  const stopRecording = () => {
    mediaRecorder?.stop();
    clearInterval(timerRef.current);
    setAiState('transcribing');
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) handleAudioBlob(file, file.name);
  };

  const handleGenerate = async () => {
    if (!transcript.trim()) return;
    setAiState('generating');
    try {
      const data = await api.post('/notes/generate-soap', {
        transcript,
        appointment_id: note.appointment_id,
      });
      const hasContent = form.subjective || form.objective || form.assessment || form.plan;
      if (hasContent && !confirm('Replace existing note content with AI-generated draft?')) {
        setAiState('transcript');
        return;
      }
      setForm({
        subjective: data.subjective || '',
        objective: data.objective || '',
        assessment: data.assessment || '',
        plan: data.plan || '',
      });
      setAiState('transcript');
    } catch (err) {
      alert(err.message);
      setAiState('transcript');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (note?.id) {
        await api.patch(`/notes/${note.id}`, form);
      } else {
        await api.post('/notes', { ...form, appointment_id: note.appointment_id, client_id: note.client_id });
      }
      onSaved();
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  };

  const handleFinalize = async () => {
    if (!confirm('Finalize this note? It will be locked for editing.')) return;
    setFinalizing(true);
    try {
      if (!note?.id) {
        // Save first, then finalize
        const saved = await api.post('/notes', { ...form, appointment_id: note.appointment_id, client_id: note.client_id });
        await api.post(`/notes/${saved.id}/finalize`);
      } else {
        await api.patch(`/notes/${note.id}`, form);
        await api.post(`/notes/${note.id}/finalize`);
      }
      onSaved();
    } catch (err) { alert(err.message); }
    finally { setFinalizing(false); }
  };

  const setF = (field, val) => setForm(f => ({ ...f, [field]: val }));

  return (
    <div className="space-y-4">
      {/* AI Assist */}
      <div className="border border-dashed border-gray-300 rounded-xl p-4 bg-gray-50/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-brand-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2z"/></svg>
            <span className="text-sm font-semibold text-gray-700">AI Assist</span>
          </div>
        </div>

        {aiState === 'idle' && (
          <div className="flex items-center gap-2">
            <button onClick={startRecording}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-white transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-14 0m7 7v4m-4 0h8M12 1a3 3 0 00-3 3v7a3 3 0 006 0V4a3 3 0 00-3-3z" /></svg>
              Record session
            </button>
            <button onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-white transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              Upload audio
            </button>
            <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleFileUpload} />
          </div>
        )}

        {aiState === 'recording' && (
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm font-medium text-gray-700">{fmtTimer(recordingTime)}</span>
            <button onClick={stopRecording} className="text-sm font-medium text-red-600 hover:text-red-700">Stop recording</button>
          </div>
        )}

        {aiState === 'transcribing' && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            Transcribing audio...
          </div>
        )}

        {aiState === 'transcript' && (
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Transcript</label>
            <textarea
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none min-h-[80px]"
              placeholder="Edit transcript..."
            />
            <div className="flex items-center gap-2">
              <button onClick={handleGenerate}
                className="inline-flex items-center gap-1.5 bg-brand-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-brand-600 transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2z"/></svg>
                Generate SOAP note
              </button>
              <button onClick={() => setAiState('idle')} className="text-sm text-gray-400 hover:text-gray-600 px-2 py-1.5">Reset</button>
            </div>
          </div>
        )}

        {aiState === 'generating' && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            Generating SOAP note...
          </div>
        )}
      </div>

      {[
        { key: 'subjective', label: 'S — Subjective' },
        { key: 'objective', label: 'O — Objective' },
        { key: 'assessment', label: 'A — Assessment' },
        { key: 'plan', label: 'P — Plan' },
      ].map(({ key, label }) => (
        <div key={key}>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{label}</label>
          <textarea
            value={form[key]}
            onChange={e => setF(key, e.target.value)}
            className={sectionClass}
            placeholder={`Enter ${label.split('—')[1].trim().toLowerCase()}...`}
          />
        </div>
      ))}
      <div className="flex items-center gap-2 pt-2">
        <button onClick={handleFinalize} disabled={finalizing}
          className="bg-brand-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors">
          {finalizing ? 'Finalizing...' : 'Finalize note'}
        </button>
        <button onClick={handleSave} disabled={saving}
          className="border border-gray-300 text-sm font-medium text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
          {saving ? 'Saving...' : 'Save draft'}
        </button>
        {onCancel && (
          <button onClick={onCancel}
            className="text-sm text-gray-400 hover:text-gray-600 px-2 py-2">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function NoteCard({ note, onRefresh, isAdmin }) {
  const api = useApi();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  const handleUnlock = async () => {
    if (!confirm('Unlock this note for editing?')) return;
    setUnlocking(true);
    try {
      await api.post(`/notes/${note.id}/unlock`);
      onRefresh();
    } catch (err) { alert(err.message); }
    finally { setUnlocking(false); }
  };

  if (editing && !note.is_finalized) {
    return (
      <div className="border border-brand-200 rounded-xl p-5 bg-white">
        <NoteHeader note={note} />
        <div className="mt-4">
          <NoteEditor note={note} onSaved={() => { setEditing(false); onRefresh(); }} onCancel={() => setEditing(false)} isAdmin={isAdmin} />
        </div>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-xl p-5 bg-white">
      <div className="flex items-start justify-between">
        <NoteHeader note={note} />
        <div className="flex items-center gap-2 ml-4 shrink-0">
          {note.is_finalized ? (
            <>
              <span className="text-xs bg-green-50 text-green-700 font-medium px-2 py-0.5 rounded-full">Finalized</span>
              {isAdmin && (
                <button onClick={handleUnlock} disabled={unlocking}
                  className="text-xs text-gray-400 hover:text-amber-600 disabled:opacity-50">
                  {unlocking ? 'Unlocking...' : 'Unlock'}
                </button>
              )}
            </>
          ) : (
            <>
              <span className="text-xs bg-yellow-50 text-yellow-700 font-medium px-2 py-0.5 rounded-full">Draft</span>
              <button onClick={() => setEditing(true)} className="text-xs text-brand-500 hover:underline">Edit</button>
            </>
          )}
          <button onClick={() => setExpanded(e => !e)} className="text-xs text-gray-400 hover:text-gray-600">
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
          {[
            { key: 'subjective', label: 'S — Subjective' },
            { key: 'objective', label: 'O — Objective' },
            { key: 'assessment', label: 'A — Assessment' },
            { key: 'plan', label: 'P — Plan' },
          ].map(({ key, label }) => (
            note[key] ? (
              <div key={key}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{note[key]}</p>
              </div>
            ) : null
          ))}
          <div className="text-xs text-gray-400 pt-2 border-t border-gray-100">
            Created {formatDateTime(note.created_at)}
            {note.finalized_at && ` · Finalized ${formatDateTime(note.finalized_at)}`}
            {note.unlocked_at && ` · Unlocked ${formatDateTime(note.unlocked_at)}`}
          </div>
        </div>
      )}
    </div>
  );
}

function NoteHeader({ note }) {
  return (
    <div>
      <p className="text-sm font-semibold text-gray-900">
        Progress Note — {formatDate(note.appointment_date)}
      </p>
      <p className="text-xs text-gray-500 mt-0.5">
        {note.clinician_name}
        {note.cpt_code && ` · ${note.cpt_code}`}
        {note.diagnosis_code && ` · ${note.diagnosis_code}`}
      </p>
    </div>
  );
}

function NewNoteRow({ appointment, clientId, onCreated }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="border border-dashed border-gray-200 rounded-xl p-4 flex items-center justify-between bg-gray-50">
        <div>
          <p className="text-sm font-medium text-gray-700">
            {formatDate(appointment.starts_at)} — {appointment.clinician_name}
          </p>
          <p className="text-xs text-gray-400">{appointment.cpt_code} · No note yet</p>
        </div>
        <button onClick={() => setOpen(true)}
          className="text-sm text-brand-500 font-medium hover:underline">
          + Add note
        </button>
      </div>
    );
  }

  return (
    <div className="border border-brand-200 rounded-xl p-5 bg-white">
      <p className="text-sm font-semibold text-gray-900 mb-4">
        New note — {formatDate(appointment.starts_at)}
      </p>
      <NoteEditor
        note={{ appointment_id: appointment.id, client_id: clientId }}
        onSaved={onCreated}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}

export default function NotesTab({ clientId }) {
  const api = useApi();
  const { sessionClaims } = useAuth();
  const isAdmin = sessionClaims?.metadata?.role === 'admin';

  const [notes, setNotes] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [notesData, apptData] = await Promise.all([
        api.get(`/notes?client_id=${clientId}`),
        api.get(`/clients/${clientId}`).then(c => c.appointments || []),
      ]);
      setNotes(notesData);
      // Only show billable, non-canceled appointments without a note
      const noteApptIds = new Set(notesData.map(n => n.appointment_id));
      const withoutNotes = apptData.filter(a =>
        a.status !== 'Canceled' && a.cpt_code === '92507' && !noteApptIds.has(a.id)
      );
      setAppointments(withoutNotes);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [clientId]);

  if (loading) return <p className="text-sm text-gray-400 py-4">Loading notes...</p>;

  return (
    <div className="space-y-4">
      {/* Existing notes */}
      {notes.map(note => (
        <NoteCard key={note.id} note={note} onRefresh={load} isAdmin={isAdmin} />
      ))}

      {/* Appointments without notes */}
      {appointments.map(appt => (
        <NewNoteRow key={appt.id} appointment={appt} clientId={clientId} onCreated={load} />
      ))}

      {notes.length === 0 && appointments.length === 0 && (
        <p className="text-sm text-gray-400 py-4">No appointments to document yet.</p>
      )}
    </div>
  );
}
