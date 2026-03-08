import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth, SignIn } from '@clerk/react';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Clients from './pages/Clients.jsx';
import Calendar from './pages/Calendar.jsx';
import Invoices from './pages/Invoices.jsx';
import Notes from './pages/Notes.jsx';

function ProtectedRoute({ children }) {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return null;
  if (!isSignedIn) return <SignIn />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/*" element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="clients/*" element={<Clients />} />
                <Route path="calendar" element={<Calendar />} />
                <Route path="invoices" element={<Invoices />} />
                <Route path="notes" element={<Notes />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        } />
      </Routes>
    </BrowserRouter>
  );
}
