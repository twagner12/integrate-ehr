import { Routes, Route } from 'react-router-dom';
import ClientList from './ClientList.jsx';
import ClientProfile from './ClientProfile.jsx';
import ClientForm from './ClientForm.jsx';

export default function Clients() {
  return (
    <Routes>
      <Route index element={<ClientList />} />
      <Route path="new" element={<ClientForm />} />
      <Route path=":id" element={<ClientProfile />} />
      <Route path=":id/edit" element={<ClientForm />} />
    </Routes>
  );
}
