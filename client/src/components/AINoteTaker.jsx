import { useState, useRef } from 'react';
import { useApi } from '../hooks/useApi';
import { useAuth } from '@clerk/react';

function StepDot({ label, active, done }) {
  return (
    <div className="flex items-center gap-2">
      {done ? (
        <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : active ? (
        <svg className="w-5 h-5 text-brand-500 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : (
        <span className="w-5 h-5 rounded-full border-2 border-gray-300" />
      )}
      <span className={`text-xs font-medium ${done ? 'text-green-600' : active ? 'text-brand-600' : 'text-gray-400'}`}>
        {label}
      </span>
    </div>
  );
}

export default function AINoteTaker({ appointmentId, clientId, onGenerated, onCancel }) {
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [seconds, setSeconds] = useState(0);
  const [step, setStep] = useState('idle');
  const [processingStep, setProcessingStep] = useState('');
  const [transcript, setTranscript] = useState('');
  const [generated, setGenerated] = useState(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [audioFilename, setAudioFilename] = useState('');
  const timerRef = useRef(null);
  const chunksRef = useRef([]);
  const fileRef = useRef(null);
  const api = useApi();
  const { getToken } = useAuth();

  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const startTimer = () => {
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  };
  const stopTimer = () => clearInterval(timerRef.current);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.start();
      setMediaRecorder(recorder);
      setSeconds(0);
      setStep('recording');
      startTimer();
    } catch (err) {
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const pauseRecording = () => {
    mediaRecorder?.pause();
    stopTimer();
    setStep('paused');
  };

  const resumeRecording = () => {
    mediaRecorder?.resume();
    startTimer();
    setStep('recording');
  };

  const cancelRecording = () => {
    mediaRecorder?.stop();
    mediaRecorder?.stream?.getTracks().forEach((t) => t.stop());
    stopTimer();
    setStep('idle');
    setSeconds(0);
  };

  const finishRecording = () => {
    stopTimer();
    mediaRecorder.onstop = async () => {
      mediaRecorder.stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      await processAudio(blob, 'recording.webm');
    };
    mediaRecorder.stop();
  };

  const processAudio = async (blob, filename) => {
    setStep('processing');
    setProcessingStep('transcribe');

    try {
      // Step 1: Transcribe
      const token = await getToken();
      const formData = new FormData();
      formData.append('audio', blob, filename);
      const transcribeRes = await fetch('/api/notes/transcribe', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!transcribeRes.ok) throw new Error((await transcribeRes.json()).error || 'Transcription failed');
      const { transcript: text, audio_filename } = await transcribeRes.json();
      setTranscript(text);
      setAudioFilename(audio_filename);

      // Step 2: Generate SOAP
      setProcessingStep('generate');
      const soap = await api.post('/notes/generate-soap', {
        transcript: text,
        appointment_id: appointmentId,
      });
      setGenerated(soap);
      setStep('done');
    } catch (err) {
      alert(err.message);
      setStep('idle');
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) processAudio(file, file.name);
    if (fileRef.current) fileRef.current.value = '';
  };

  const regenerate = async () => {
    setStep('processing');
    setProcessingStep('generate');
    try {
      const soap = await api.post('/notes/generate-soap', {
        transcript,
        appointment_id: appointmentId,
      });
      setGenerated(soap);
      setStep('done');
    } catch (err) {
      alert(err.message);
      setStep('done');
    }
  };

  const handleUse = () => {
    onGenerated({ ...generated, transcript });
  };

  const toggleTranscript = () => setShowTranscript((v) => !v);

  const processingMessage =
    processingStep === 'transcribe' ? 'Transcribing audio...' : 'Generating SOAP note...';

  // ── idle ──
  if (step === 'idle') {
    return (
      <div className="border border-dashed border-gray-300 rounded-xl p-6 bg-gray-50/50">
        <div className="text-center">
          <div className="w-12 h-12 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-14 0m7 7v4m-4 0h8M12 1a3 3 0 00-3 3v7a3 3 0 006 0V4a3 3 0 00-3-3z" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">AI Note Taker</h3>
          <p className="text-xs text-gray-500 mb-4">
            Record or upload session audio to auto-generate a SOAP note
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={startRecording}
              className="bg-brand-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-600 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-14 0m7 7v4m-4 0h8M12 1a3 3 0 00-3 3v7a3 3 0 006 0V4a3 3 0 00-3-3z" />
              </svg>
              Record session
            </button>
            <span className="text-xs text-gray-400">or</span>
            <button
              onClick={() => fileRef.current?.click()}
              className="border border-gray-300 text-sm font-medium text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Upload audio
            </button>
          </div>
          <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={handleFileUpload} />
        </div>
      </div>
    );
  }

  // ── recording ──
  if (step === 'recording') {
    return (
      <div className="border border-red-200 rounded-xl p-4 bg-red-50/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm font-mono font-medium text-gray-900">{fmtTime(seconds)}</span>
            <span className="text-xs text-gray-500">Recording...</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={pauseRecording}
              className="border border-gray-300 text-sm font-medium text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50"
            >
              Pause
            </button>
            <button
              onClick={finishRecording}
              className="bg-brand-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-brand-600"
            >
              Finish
            </button>
            <button
              onClick={cancelRecording}
              className="text-sm text-gray-400 hover:text-gray-600 px-2"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── paused ──
  if (step === 'paused') {
    return (
      <div className="border border-amber-200 rounded-xl p-4 bg-amber-50/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-amber-500" />
            <span className="text-sm font-mono font-medium text-gray-900">{fmtTime(seconds)}</span>
            <span className="text-xs text-gray-500">Paused</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={resumeRecording}
              className="border border-gray-300 text-sm font-medium text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50"
            >
              Resume
            </button>
            <button
              onClick={finishRecording}
              className="bg-brand-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-brand-600"
            >
              Finish
            </button>
            <button
              onClick={cancelRecording}
              className="text-sm text-gray-400 hover:text-gray-600 px-2"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── processing ──
  if (step === 'processing') {
    return (
      <div className="border border-gray-200 rounded-xl p-6 bg-white">
        <div className="text-center">
          <svg className="w-6 h-6 text-brand-500 animate-spin mx-auto" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm font-medium text-gray-700 mt-3">{processingMessage}</p>
          <p className="text-xs text-gray-400 mt-1">This may take a minute...</p>
          <div className="flex items-center justify-center gap-8 mt-4">
            <StepDot label="Transcribing" active={processingStep === 'transcribe'} done={processingStep === 'generate'} />
            <StepDot label="Generating note" active={processingStep === 'generate'} done={false} />
          </div>
        </div>
      </div>
    );
  }

  // ── done ──
  if (step === 'done') {
    return (
      <div className="border border-green-200 rounded-xl overflow-hidden bg-white">
        {/* AI disclaimer banner */}
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-xs text-amber-700">AI-generated draft. Review carefully before saving.</p>
        </div>

        {/* Transcript (collapsible) */}
        <div className="px-4 py-3 border-b border-gray-100">
          <button
            onClick={toggleTranscript}
            className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            <svg
              className={`w-4 h-4 transition-transform ${showTranscript ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Session transcript
          </button>
          {showTranscript && (
            <div className="mt-2">
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 min-h-[100px] resize-y focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
              <button onClick={regenerate} className="text-xs text-brand-600 hover:text-brand-700 mt-1">
                Re-generate from edited transcript
              </button>
            </div>
          )}
        </div>

        {/* Generated SOAP preview */}
        <div className="p-4 space-y-3">
          {['Subjective', 'Objective', 'Assessment', 'Plan'].map((section) => (
            <div key={section}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                {section[0]} &mdash; {section}
              </p>
              <p className="text-sm text-gray-700">{generated?.[section.toLowerCase()]}</p>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-2">
          <button
            onClick={handleUse}
            className="bg-brand-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-600"
          >
            Use this draft
          </button>
          <button
            onClick={regenerate}
            className="border border-gray-300 text-sm font-medium text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50"
          >
            Re-generate
          </button>
          <button
            onClick={onCancel}
            className="text-sm text-gray-400 hover:text-gray-600 px-2 py-2"
          >
            Discard
          </button>
        </div>
      </div>
    );
  }

  return null;
}
