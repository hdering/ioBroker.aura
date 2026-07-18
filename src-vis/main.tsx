import { StrictMode, Suspense, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, RouterProvider, Navigate } from 'react-router-dom';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './index.css';

import App from './App';
import { ThemeProvider } from './ThemeProvider';
import { lazyWithReload, installChunkErrorRecovery } from './utils/lazyWithReload';
import { setScreenshotMode } from './store/persistManager';
import { FEATURES } from './featureFlags';

// Recharts' ResponsiveContainer logs a "width(-1) and height(-1) of chart should be
// greater than 0" warning when a chart briefly renders inside a hidden tab (container
// measured at 0/-1) before its ResizeObserver fires. It is purely cosmetic — the chart
// redraws correctly once visible — so we filter just that one message to keep the
// console clean. Every other warning passes through untouched.
const __origWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('of chart should be greater than 0')) return;
    __origWarn(...args);
};

installChunkErrorRecovery();

// DEV-only screenshot harness: enabled with ?shot=1 so the documentation
// tooling can render widgets in controlled states. Never bundled in prod.
if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('shot')) {
    // Set screenshot mode synchronously (before React mounts and configLoader
    // can fire) so the real instance config is never pulled in over the demo.
    setScreenshotMode(true);
    import('./devtools/screenshotApi');
}

// Admin pages are large (editors, pickers, echart configurators) and are not
// needed by the public dashboard route. Lazy-loaded so the frontend bundle
// stays small for slow mobile/VPN clients.
const AdminLayout = lazyWithReload(() => import('./pages/admin/AdminLayout').then((m) => ({ default: m.AdminLayout })));
const AdminLogin = lazyWithReload(() => import('./pages/admin/AdminLogin').then((m) => ({ default: m.AdminLogin })));
const AdminDashboard = lazyWithReload(() =>
    import('./pages/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard })),
);
const AdminSettings = lazyWithReload(() =>
    import('./pages/admin/AdminSettings').then((m) => ({ default: m.AdminSettings })),
);
const AdminEditor = lazyWithReload(() => import('./pages/admin/AdminEditor').then((m) => ({ default: m.AdminEditor })));
const AdminWidgets = lazyWithReload(() =>
    import('./pages/admin/AdminWidgets').then((m) => ({ default: m.AdminWidgets })),
);
const AdminWidgetDesigner = lazyWithReload(() =>
    import('./pages/admin/AdminWidgetDesigner').then((m) => ({ default: m.AdminWidgetDesigner })),
);
const AdminLayouts = lazyWithReload(() =>
    import('./pages/admin/AdminLayouts').then((m) => ({ default: m.AdminLayouts })),
);
const AdminDesign = lazyWithReload(() => import('./pages/admin/AdminDesign').then((m) => ({ default: m.AdminDesign })));
const AdminCssJs = lazyWithReload(() => import('./pages/admin/AdminCssJs').then((m) => ({ default: m.AdminCssJs })));
const AdminPopups = lazyWithReload(() => import('./pages/admin/AdminPopups').then((m) => ({ default: m.AdminPopups })));
const PopupViewEditor = lazyWithReload(() =>
    import('./pages/admin/PopupViewEditor').then((m) => ({ default: m.PopupViewEditor })),
);
const AdminBatteries = lazyWithReload(() =>
    import('./pages/admin/AdminBatteries').then((m) => ({ default: m.AdminBatteries })),
);
const AdminLoadTimes = lazyWithReload(() =>
    import('./pages/admin/AdminLoadTimes').then((m) => ({ default: m.AdminLoadTimes })),
);

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
    { path: '/view/:layoutSlug/s/:sectionSlug', element: <App /> },
    { path: '/view/:layoutSlug/s/:sectionSlug/tab/:tabSlug', element: <App /> },
    { path: '/admin/login', element: lazyRoute(AdminLogin) },
    {
        path: '/admin',
        element: lazyRoute(AdminLayout),
        children: [
            { index: true, element: lazyRoute(AdminDashboard) },
            { path: 'editor', element: lazyRoute(AdminEditor) },
            { path: 'theme', element: <Navigate to="/admin/design?tab=theme" replace /> },
            ...(FEATURES.widgetDesigner ? [{ path: 'widget-designer', element: lazyRoute(AdminWidgetDesigner) }] : []),
            { path: 'widgets', element: lazyRoute(AdminWidgets) },
            { path: 'layouts', element: lazyRoute(AdminLayouts) },
            { path: 'design', element: lazyRoute(AdminDesign) },
            { path: 'frontend', element: <Navigate to="/admin/design?tab=header" replace /> },
            { path: 'css-js', element: lazyRoute(AdminCssJs) },
            { path: 'popups', element: lazyRoute(AdminPopups) },
            { path: 'popups/:viewId', element: lazyRoute(PopupViewEditor) },
            { path: 'batteries', element: lazyRoute(AdminBatteries) },
            { path: 'loadtimes', element: lazyRoute(AdminLoadTimes) },
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
