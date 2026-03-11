import { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { UserButton, useAuth } from '@clerk/react';
import { useApi } from '../hooks/useApi.js';

function GlobalSearch() {
  const api = useApi();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const timeout = useRef(null);

  useEffect(() => {
    if (query.length < 2) { setResults([]); setOpen(false); return; }
    clearTimeout(timeout.current);
    setSearching(true);
    timeout.current = setTimeout(async () => {
      try {
        const all = await api.get('/clients');
        const q = query.toLowerCase();
        const filtered = all.filter(c =>
          c.full_name.toLowerCase().includes(q) ||
          c.first_name?.toLowerCase().includes(q) ||
          c.last_name?.toLowerCase().includes(q)
        ).slice(0, 8);
        setResults(filtered);
        setOpen(true);
      } finally { setSearching(false); }
    }, 200);
  }, [query]);

  const handleSelect = (client) => {
    navigate(`/clients/${client.id}`);
    setQuery('');
    setResults([]);
    setOpen(false);
    inputRef.current?.blur();
  };

  useEffect(() => {
    const handler = (e) => {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={containerRef} className="relative w-72">
      <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
        <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search clients..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          className="bg-transparent text-sm text-gray-700 placeholder-gray-400 focus:outline-none w-full"
        />
        {searching && (
          <svg className="w-3.5 h-3.5 text-gray-400 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full mt-1 left-0 w-full bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden z-50">
          {results.map(c => (
            <button key={c.id} onMouseDown={() => handleSelect(c)}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0">
              <span className="font-medium text-gray-900">{c.full_name}</span>
              {c.primary_clinician && (
                <span className="text-gray-400 ml-2 text-xs">{c.primary_clinician}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PlusMenu() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const actions = [
    {
      label: 'Create client',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
      onClick: () => { navigate('/clients/new'); setOpen(false); },
    },
    {
      label: 'Schedule appointment',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      onClick: () => { navigate('/calendar?new=1'); setOpen(false); },
    },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-8 h-8 bg-brand-500 hover:bg-brand-600 text-white rounded-full flex items-center justify-center transition-colors shadow-sm">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden z-50">
          {actions.map(a => (
            <button key={a.label} onClick={a.onClick}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 border-b border-gray-50 last:border-0">
              <span className="text-gray-400">{a.icon}</span>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Layout({ children }) {
  const { sessionClaims } = useAuth();
  const role = sessionClaims?.metadata?.role;
  const isAdmin = role === 'admin';
  const nav = [
    { to: '/dashboard', label: 'Dashboard', show: true },
    { to: '/clients',   label: 'Clients',   show: true },
    { to: '/calendar',  label: 'Calendar',  show: true },
    { to: '/notes',     label: 'Notes',     show: true },
    { to: '/invoices',  label: 'Invoices',  show: isAdmin },
    { to: '/reports',   label: 'Reports',   show: isAdmin },
    { to: '/settings',  label: 'Settings',  show: isAdmin },
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="h-14 flex items-center px-5 border-b border-gray-200">
          <span className="text-brand-500 font-semibold text-lg tracking-tight">integrate</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.filter(n => n.show).map(({ to, label }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive ? 'bg-brand-50 text-brand-600' : 'text-gray-600 hover:bg-gray-100'
                }`
              }>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-200">
          <UserButton />
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center px-6 gap-4 shrink-0">
          <GlobalSearch />
          <div className="ml-auto">
            <PlusMenu />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
