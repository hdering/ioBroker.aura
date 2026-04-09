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
import { AdminWidgets } from './pages/admin/AdminWidgets';
import { AdminLayouts } from './pages/admin/AdminLayouts';

const router = createHashRouter([
  { path: '/', element: <App /> },
  { path: '/tab/:tabSlug', element: <App /> },
  { path: '/view/:layoutSlug', element: <App /> },
  { path: '/view/:layoutSlug/tab/:tabSlug', element: <App /> },
  { path: '/admin/login', element: <AdminLogin /> },
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      { index: true, element: <AdminDashboard /> },
      { path: 'editor', element: <AdminEditor /> },
      { path: 'theme', element: <AdminTheme /> },
      { path: 'widgets', element: <AdminWidgets /> },
      { path: 'layouts', element: <AdminLayouts /> },
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
