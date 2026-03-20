import { NavLink, Outlet, useParams } from 'react-router-dom';

const tabs = [
  { to: 'appointments', label: 'APPOINTMENTS' },
  { to: 'documents', label: 'DOCUMENTS' },
  { to: 'billing', label: 'BILLING & PAYMENTS' },
];

export default function PortalChild() {
  const { clientId } = useParams();

  return (
    <div>
      {/* Tab bar */}
      <nav className="border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 flex gap-8">
          {tabs.map(tab => (
            <NavLink
              key={tab.to}
              to={`/portal/${clientId}/${tab.to}`}
              className={({ isActive }) =>
                `py-4 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-gray-800 text-gray-900'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Tab content */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        <Outlet />
      </div>
    </div>
  );
}
