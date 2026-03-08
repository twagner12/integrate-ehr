import { NavLink } from 'react-router-dom';
import { UserButton } from '@clerk/react';

const nav = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/clients',   label: 'Clients' },
  { to: '/calendar',  label: 'Calendar' },
  { to: '/invoices',  label: 'Invoices' },
  { to: '/notes',     label: 'Notes' },
];

export default function Layout({ children }) {
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-gray-200">
          <span className="text-brand-500 font-semibold text-lg tracking-tight">
            integrate
          </span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map(({ to, label }) => (
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

        {/* User button at bottom */}
        <div className="p-4 border-t border-gray-200">
          <UserButton afterSignOutUrl="/" />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-8">
        {children}
      </main>
    </div>
  );
}
