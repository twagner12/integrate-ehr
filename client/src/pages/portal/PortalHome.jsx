import { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useApi } from '../../hooks/useApi.js';

const colors = ['bg-orange-400', 'bg-sky-400', 'bg-emerald-400', 'bg-violet-400', 'bg-rose-400'];

export default function PortalHome() {
  const api = useApi();
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/portal/me')
      .then(setMe)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (!me) return <div className="p-12 text-center text-gray-500">Unable to load your profile.</div>;

  // Single child — skip picker
  if (me.children.length === 1) {
    return <Navigate to={`/portal/${me.children[0].id}/appointments`} replace />;
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-2xl font-light text-center text-gray-800 mb-12">
        Which profile would you like to manage?
      </h1>
      <div className="flex justify-center gap-8 flex-wrap">
        {me.children.map((child, i) => {
          const initials = `${child.first_name?.[0] || ''}${child.last_name?.[0] || ''}`.toUpperCase();
          return (
            <button
              key={child.id}
              onClick={() => navigate(`/portal/${child.id}/appointments`)}
              className="flex flex-col items-center gap-3 group"
            >
              <div className={`w-28 h-28 rounded-full ${colors[i % colors.length]} flex items-center justify-center text-white text-3xl font-semibold shadow-md group-hover:shadow-lg transition-shadow`}>
                {initials}
              </div>
              <span className="text-gray-800 font-medium">{child.full_name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
