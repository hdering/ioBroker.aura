// ─────────────────────────────────────────────────────────────────────────────
// DEV-only screenshot harness
// ─────────────────────────────────────────────────────────────────────────────
// Exposes `window.__auraShot` so Playwright can render any widget in any state
// for the documentation screenshots — fully controlled and side-effect-free:
//
//   • Datapoint values are injected into the in-memory cache (no socket write,
//     so no real device is ever toggled). Use fictional IDs like `demo.switch`.
//   • The demo layout is pushed straight into the dashboard store with dirty
//     tracking suppressed and screenshotMode on, so nothing is ever persisted
//     back to the ioBroker instance the dev server proxies to.
//
// Stripped from production: only imported from main.tsx under import.meta.env.DEV.

import { __devInjectState } from '../hooks/useIoBroker';
import { useDashboardStore, type DashboardLayout } from '../store/dashboardStore';
import { withSuppressedDirty, setScreenshotMode } from '../store/persistManager';
import type { WidgetConfig, ioBrokerState } from '../types';

type MockValue = boolean | number | string | null | Partial<ioBrokerState>;

function toState(v: MockValue): ioBrokerState {
    const now = Date.now();
    if (v !== null && typeof v === 'object') {
        return { val: null, ack: true, ts: now, lc: now, ...v };
    }
    return { val: v, ack: true, ts: now, lc: now };
}

export interface ShowWidgetsOptions {
    editMode?: boolean;
    /** Tab name shown in the editor tab bar (cosmetic). */
    tabName?: string;
    /** Grid cell pixel size — deterministic regardless of the instance defaults. */
    gridRowHeight?: number;
    gridSnapX?: number;
    gridGap?: number;
}

const DEMO_LAYOUT_ID = 'screenshot-demo';
const DEMO_TAB_ID = 'screenshot-tab';

function installScreenshotApi(): void {
    setScreenshotMode(true);

    const api = {
        ready: true,

        /** Inject fabricated datapoint values: { 'demo.switch': true, 'demo.temp': { val: 21.5, unit: '°C' } } */
        mock(map: Record<string, MockValue>): void {
            for (const [id, v] of Object.entries(map)) {
                __devInjectState(id, toState(v));
            }
        },

        /** Replace the dashboard with a single transient tab holding the given widgets. */
        showWidgets(widgets: WidgetConfig[], opts: ShowWidgetsOptions = {}): void {
            const layout: DashboardLayout = {
                id: DEMO_LAYOUT_ID,
                name: 'Screenshot',
                slug: 'screenshot',
                activeTabId: DEMO_TAB_ID,
                settings: {
                    gridRowHeight: opts.gridRowHeight ?? 20,
                    gridSnapX: opts.gridSnapX ?? opts.gridRowHeight ?? 20,
                    gridGap: opts.gridGap ?? 10,
                },
                tabs: [
                    {
                        id: DEMO_TAB_ID,
                        name: opts.tabName ?? 'Demo',
                        slug: 'demo',
                        widgets,
                    },
                ],
            };
            withSuppressedDirty(() => {
                useDashboardStore.setState({
                    layouts: [layout],
                    activeLayoutId: DEMO_LAYOUT_ID,
                    editMode: opts.editMode ?? false,
                });
            });
        },

        setEditMode(on: boolean): void {
            withSuppressedDirty(() => useDashboardStore.setState({ editMode: on }));
        },

        /** Seed a full multi-layout demo config (for admin-area screenshots). */
        seed(payload: { layouts: DashboardLayout[]; activeLayoutId?: string; editMode?: boolean }): void {
            withSuppressedDirty(() => {
                useDashboardStore.setState({
                    layouts: payload.layouts,
                    activeLayoutId: payload.activeLayoutId ?? payload.layouts[0]?.id,
                    editMode: payload.editMode ?? false,
                });
            });
        },
    };

    (window as unknown as Record<string, unknown>).__auraShot = api;
    console.log('[aura screenshot] harness ready — window.__auraShot');
}

installScreenshotApi();
