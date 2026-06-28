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

import {
    __devInjectState,
    __devSetHistoryGen,
    __devSetObjectView,
    __devSetSendTo,
    getStateFromCache,
    type HistoryEntry,
} from '../hooks/useIoBroker';
import { useDashboardStore, type DashboardLayout } from '../store/dashboardStore';
import { useGroupDefsStore } from '../store/groupDefsStore';
import { useThemeStore } from '../store/themeStore';
import { withSuppressedDirty, setScreenshotMode } from '../store/persistManager';
import type { WidgetConfig, ioBrokerState, ObjectViewResult } from '../types';

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

// Fabricate a smooth, deterministic history series centred on the datapoint's
// current cached value, so chart/echart widgets render a believable curve from
// injected state alone (no history adapter behind the dev proxy).
function genHistory(id: string, opts: { start: number; end: number; count?: number }): HistoryEntry[] {
    const cur = getStateFromCache(id);
    const center = typeof cur?.val === 'number' ? cur.val : 50;
    const amp = Math.max(Math.abs(center) * 0.14, 2);
    let seed = 0;
    for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) >>> 0;
    const phase = ((seed % 1000) / 1000) * Math.PI * 2;
    const n = 64;
    const span = Math.max(opts.end - opts.start, 1);
    const out: HistoryEntry[] = [];
    for (let i = 0; i <= n; i++) {
        const ts = Math.round(opts.start + (span * i) / n);
        const x = (i / n) * Math.PI * 4 + phase;
        const wobble = Math.sin(x) * amp + Math.sin(x * 2.7 + seed) * amp * 0.35 + Math.sin(x * 0.5) * amp * 0.4;
        out.push({ ts, val: Math.round((center + wobble) * 100) / 100 });
    }
    return out;
}

function installScreenshotApi(): void {
    setScreenshotMode(true);
    // Force the light frontend theme so all documentation screenshots share a
    // consistent look (the default frontend theme is dark).
    withSuppressedDirty(() => useThemeStore.getState().setTheme('light'));

    const api = {
        ready: true,

        /** Switch the frontend theme preset (e.g. 'light', 'dark'). */
        setTheme(id: string): void {
            withSuppressedDirty(() => useThemeStore.getState().setTheme(id));
        },

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

        /** Populate group/panels children (they live in a separate RAM store, keyed
         *  by the widget's options.defId). */
        groupDefs(defs: Record<string, WidgetConfig[]>): void {
            withSuppressedDirty(() => useGroupDefsStore.setState({ defs, hydrated: true }));
        },

        /** Turn on fabricated history so chart/echart widgets render curves
         *  (pass false to restore the real getHistory path). */
        enableHistory(on = true): void {
            __devSetHistoryGen(on ? genHistory : null);
        },

        /** Stub getObjectView per object type: { instance: [{id,value}], script: [...] }.
         *  Unlisted types resolve empty so nothing real leaks into the demo. */
        mockObjectView(byType: Record<string, { id: string; value: unknown }[]>): void {
            __devSetObjectView((type) => ({ rows: byType[type] ?? [] }) as unknown as ObjectViewResult);
        },

        /** Stub sendTo responses keyed by command, e.g. { getRecentLogs: {...} }.
         *  Unlisted commands fall through to the real socket. */
        mockSendTo(byCommand: Record<string, unknown>): void {
            __devSetSendTo((_t, command) => (command in byCommand ? byCommand[command] : undefined));
        },
    };

    (window as unknown as Record<string, unknown>).__auraShot = api;
    console.log('[aura screenshot] harness ready — window.__auraShot');
}

installScreenshotApi();
