import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './index.css';

import App from './App';
import { ThemeProvider } from './ThemeProvider';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AdminLogin } from './pages/admin/AdminLogin';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminTheme } from './pages/admin/AdminTheme';
import { AdminSettings } from './pages/admin/AdminSettings';
import { AdminEditor } from './pages/admin/AdminEditor';
import { AdminEndpoints } from './pages/admin/AdminEndpoints';

const router = createHashRouter([
  { path: '/', element: <App /> },
  { path: '/admin/login', element: <AdminLogin /> },
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      { index: true, element: <AdminDashboard /> },
      { path: 'editor', element: <AdminEditor /> },
      { path: 'endpoints', element: <AdminEndpoints /> },
      { path: 'theme', element: <AdminTheme /> },
      { path: 'settings', element: <AdminSettings /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>,
);
