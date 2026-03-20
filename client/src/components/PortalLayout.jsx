import { useState, useEffect } from 'react';
import { useNavigate, useParams, Outlet } from 'react-router-dom';
import { UserButton } from '@clerk/react';
import { useApi } from '../hooks/useApi.js';

export default function PortalLayout() {
  const api = useApi();
  const navigate = useNavigate();
  const { clientId } = useParams();
  const [settings, setSettings] = useState(null);
  const [me, setMe] = useState(null);

  useEffect(() => {
    api.get('/portal/settings').then(setSettings).catch(() => {});
    api.get('/portal/me').then(setMe).catch(() => {});
  }, []);

  const currentChild = me?.children?.find(c => c.id === parseInt(clientId));
  const hasMultipleChildren = me?.children?.length > 1;

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Header */}
      <header className="border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="font-semibold text-gray-900">{settings?.practice_name || 'Integrate'}</span>
          <div className="flex items-center gap-4">
            {currentChild && hasMultipleChildren && (
              <select
                value={clientId || ''}
                onChange={e => navigate(`/portal/${e.target.value}/appointments`)}
                className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 text-gray-700"
              >
                {me.children.map(c => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
            )}
            {currentChild && !hasMultipleChildren && (
              <span className="text-sm text-gray-600">{currentChild.full_name}</span>
            )}
            <UserButton />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1">
        <Outlet context={{ me, settings }} />
      </main>

      {/* Footer */}
      {settings && (
        <footer className="bg-gray-700 text-gray-300 mt-auto">
          <div className="max-w-5xl mx-auto px-6 py-8 flex justify-between">
            <div>
              <p className="text-white font-medium">{settings.practice_name}</p>
              {settings.phone && (
                <p className="text-sm mt-1">
                  <a href={`tel:${settings.phone}`} className="hover:text-white">{settings.phone}</a>
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-white font-medium">Main Location</p>
              <p className="text-sm mt-1">{settings.address_line1}</p>
              <p className="text-sm">{settings.city}, {settings.state} {settings.zip}</p>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
