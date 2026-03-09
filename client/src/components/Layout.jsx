import { NavLink } from 'react-router-dom';
import { UserButton, useAuth } from '@clerk/react';

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
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="h-16 flex items-center px-5 border-b border-gray-200">
          <span className="text-brand-500 font-semibold text-lg tracking-tight">
            integrate
          </span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.filter(n => n.show).map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-600'
                    : 'text-gray-600 hover:bg-gray-100'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-200">
          <UserButton />
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-8">
        {children}
      </main>
    </div>
  );
}
