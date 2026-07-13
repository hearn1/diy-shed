import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import HomePage from './pages/HomePage.jsx';
import ProjectFormPage from './pages/ProjectFormPage.jsx';
import ProjectDetailPage from './pages/ProjectDetailPage.jsx';
import InventoryPage from './pages/InventoryPage.jsx';
import SetupPage from './pages/SetupPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/projects/new" element={<ProjectFormPage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="/projects/:id/edit" element={<ProjectFormPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
