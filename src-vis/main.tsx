import { StrictMode, Suspense, lazy, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, RouterProvider, Navigate } from 'react-router-dom';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './index.css';

import App from './App';
import { ThemeProvider } from './ThemeProvider';

// Admin pages are large (editors, pickers, echart configurators) and are not
// needed by the public dashboard route. Lazy-loaded so the frontend bundle
// stays small for slow mobile/VPN clients.
const AdminLayout     = lazy(() => import('./pages/admin/AdminLayout').then((m) => ({ default: m.AdminLayout })));
const AdminLogin      = lazy(() => import('./pages/admin/AdminLogin').then((m) => ({ default: m.AdminLogin })));
const AdminDashboard  = lazy(() => import('./pages/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard })));
const AdminSettings   = lazy(() => import('./pages/admin/AdminSettings').then((m) => ({ default: m.AdminSettings })));
const AdminEditor     = lazy(() => import('./pages/admin/AdminEditor').then((m) => ({ default: m.AdminEditor })));
const AdminWidgets    = lazy(() => import('./pages/admin/AdminWidgets').then((m) => ({ default: m.AdminWidgets })));
const AdminLayouts    = lazy(() => import('./pages/admin/AdminLayouts').then((m) => ({ default: m.AdminLayouts })));
const AdminPopups     = lazy(() => import('./pages/admin/AdminPopups').then((m) => ({ default: m.AdminPopups })));
const PopupViewEditor = lazy(() => import('./pages/admin/PopupViewEditor').then((m) => ({ default: m.PopupViewEditor })));

function lazyRoute(Comp: ComponentType): JSX.Element {
  return (
    <Suspense fallback={<div style={{ padding: 24, color: 'var(--text-secondary)' }}>…</div>}>
      <Comp />
    </Suspense>
  );
}

const router = createHashRouter([
  { path: '/', element: <App /> },
  { path: '/tab/:tabSlug', element: <App /> },
  { path: '/view/:layoutSlug', element: <App /> },
  { path: '/view/:layoutSlug/tab/:tabSlug', element: <App /> },
  { path: '/admin/login', element: lazyRoute(AdminLogin) },
  {
    path: '/admin',
    element: lazyRoute(AdminLayout),
    children: [
      { index: true, element: lazyRoute(AdminDashboard) },
      { path: 'editor', element: lazyRoute(AdminEditor) },
      { path: 'theme', element: <Navigate to="/admin/layouts?tab=theme" replace /> },
      { path: 'widgets', element: lazyRoute(AdminWidgets) },
      { path: 'layouts', element: lazyRoute(AdminLayouts) },
      { path: 'popups', element: lazyRoute(AdminPopups) },
      { path: 'popups/:viewId', element: lazyRoute(PopupViewEditor) },
      { path: 'settings', element: lazyRoute(AdminSettings) },
    ],
  },
]);

// Remove the pre-React boot screen once JS has loaded and React is about to paint.
const bootEl = document.getElementById('aura-boot');
if (bootEl) {
  bootEl.classList.add('hidden');
  bootEl.addEventListener('transitionend', () => bootEl.remove(), { once: true });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>,
);
