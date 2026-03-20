import { useState, useEffect, useRef } from 'react';
import { useApi } from '../hooks/useApi.js';

const CATEGORIES = ['Intake', 'Invoice', 'Superbill', 'SOAP Note', 'Consent', 'Assessment', 'Other'];

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fileIcon(mimeType) {
  if (mimeType?.startsWith('image/')) return '🖼';
  if (mimeType === 'application/pdf') return '📄';
  if (mimeType?.includes('word') || mimeType?.includes('document')) return '📝';
  if (mimeType?.includes('sheet') || mimeType?.includes('excel')) return '📊';
  return '📎';
}

const categoryColors = {
  Intake: 'bg-purple-100 text-purple-700',
  Invoice: 'bg-blue-100 text-blue-700',
  Superbill: 'bg-cyan-100 text-cyan-700',
  'SOAP Note': 'bg-green-100 text-green-700',
  Consent: 'bg-yellow-100 text-yellow-700',
  Assessment: 'bg-orange-100 text-orange-700',
  Other: 'bg-gray-100 text-gray-500',
};

export default function FilesPanel({ clientId }) {
  const api = useApi();
  const fileInputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [category, setCategory] = useState('Other');

  const loadFiles = () => {
    api.get(`/files?client_id=${clientId}`)
      .then(setFiles)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadFiles(); }, [clientId]);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setPendingFile(file);
      setCategory('Other');
    }
  };

  const handleUpload = async () => {
    if (!pendingFile) return;
    setUploading(true);
    try {
      const token = await window.Clerk?.session?.getToken();
      const formData = new FormData();
      formData.append('file', pendingFile);
      formData.append('client_id', clientId);
      formData.append('category', category);
      const res = await fetch('/api/files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(err.error || 'Upload failed');
      }
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      loadFiles();
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (file) => {
    const token = await window.Clerk?.session?.getToken();
    const res = await fetch(`/api/files/${file.id}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.original_name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (file) => {
    if (!confirm(`Delete "${file.original_name}"?`)) return;
    try {
      await api.delete(`/files/${file.id}`);
      loadFiles();
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) return <p className="text-sm text-gray-400 py-4">Loading files...</p>;

  return (
    <div>
      {/* Upload area */}
      <div className="mb-4">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileSelect}
        />
        {!pendingFile ? (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            + Upload file
          </button>
        ) : (
          <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3 border border-gray-200">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700 truncate">{pendingFile.name}</p>
              <p className="text-xs text-gray-400">{formatBytes(pendingFile.size)}</p>
            </div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="bg-blue-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
            <button
              onClick={() => { setPendingFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
              className="text-gray-400 hover:text-gray-600 text-sm"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* File list */}
      {files.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">No files uploaded yet.</p>
      ) : (
        <div className="space-y-2">
          {files.map(file => (
            <div key={file.id} className="flex items-center gap-3 border border-gray-200 rounded-lg px-3 py-2.5">
              <span className="text-lg flex-shrink-0">{fileIcon(file.mime_type)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700 truncate">{file.original_name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${categoryColors[file.category] || categoryColors.Other}`}>
                    {file.category}
                  </span>
                  <span className="text-xs text-gray-400">{formatBytes(file.size_bytes)}</span>
                  <span className="text-xs text-gray-400">{formatDate(file.created_at)}</span>
                </div>
              </div>
              <button
                onClick={() => handleDownload(file)}
                className="text-gray-400 hover:text-blue-600 flex-shrink-0"
                title="Download"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </button>
              <button
                onClick={() => handleDelete(file)}
                className="text-gray-400 hover:text-red-600 flex-shrink-0"
                title="Delete"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
