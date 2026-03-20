import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth, SignIn } from '@clerk/react';
import Layout from './components/Layout.jsx';
import PortalLayout from './components/PortalLayout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Clients from './pages/Clients.jsx';
import Calendar from './pages/Calendar.jsx';
import Invoices from './pages/Invoices.jsx';
import Settings from './pages/Settings.jsx';
import PortalHome from './pages/portal/PortalHome.jsx';
import PortalChild from './pages/portal/PortalChild.jsx';
import PortalAppointments from './pages/portal/PortalAppointments.jsx';
import PortalDocuments from './pages/portal/PortalDocuments.jsx';
import PortalBilling from './pages/portal/PortalBilling.jsx';

function ProtectedRoute({ children }) {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return null;
  if (!isSignedIn) return <SignIn />;
  return children;
}

function RoleRouter() {
  const { sessionClaims } = useAuth();
  const role = sessionClaims?.metadata?.role;

  if (role === 'parent') {
    return <Navigate to="/portal" replace />;
  }
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Role-based root redirect */}
        <Route index element={
          <ProtectedRoute><RoleRouter /></ProtectedRoute>
        } />

        {/* Staff app */}
        <Route path="/*" element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="clients/*" element={<Clients />} />
                <Route path="calendar" element={<Calendar />} />
                <Route path="invoices" element={<Invoices />} />
                <Route path="invoices/:id" element={<Invoices />} />
                <Route path="settings" element={<Settings />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        } />

        {/* Parent portal */}
        <Route path="/portal" element={
          <ProtectedRoute><PortalLayout /></ProtectedRoute>
        }>
          <Route index element={<PortalHome />} />
          <Route path=":clientId" element={<PortalChild />}>
            <Route index element={<Navigate to="appointments" replace />} />
            <Route path="appointments" element={<PortalAppointments />} />
            <Route path="documents" element={<PortalDocuments />} />
            <Route path="billing" element={<PortalBilling />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
