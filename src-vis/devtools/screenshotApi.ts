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

import { getInstanceByDom } from 'echarts';
import {
    __devInjectState,
    __devSetHistoryGen,
    __devSetObjectView,
    __devSetSendTo,
    __devSetGetState,
    getStateFromCache,
    isStateFresh,
    type HistoryEntry,
} from '../hooks/useIoBroker';
import { useDashboardStore, type DashboardLayout } from '../store/dashboardStore';
import { useGroupDefsStore } from '../store/groupDefsStore';
import { usePopupConfigStore, type PopupTrigger, type PopupView } from '../store/popupConfigStore';
import { __devForceDpTriggers } from '../components/widgets/popup/DpPopupTriggers';
import { __devForceConditionRefresh, __devForceConditionNotify } from '../hooks/useConditionStyle';
import {
    useMessagesStore,
    __devForceMessages,
    __devSentMessages,
    __devClearSentMessages,
    type MessageScope,
} from '../store/messagesStore';
import { useThemeStore } from '../store/themeStore';
import { alignStackedSeries, outlineWidthFor, type StackableSeries, type StackPoint } from '../utils/stackedSeries';
import { withSuppressedDirty, setScreenshotMode } from '../store/persistManager';
import { NS } from '../utils/namespace';
import type { AuraMessage, WidgetConfig, ioBrokerState, ObjectViewResult } from '../types';

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
const DEMO_SECTION_ID = 'screenshot-section';
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
                activeSectionId: DEMO_SECTION_ID,
                settings: {
                    gridRowHeight: opts.gridRowHeight ?? 20,
                    gridSnapX: opts.gridSnapX ?? opts.gridRowHeight ?? 20,
                    gridGap: opts.gridGap ?? 10,
                },
                sections: [
                    {
                        id: DEMO_SECTION_ID,
                        name: 'Screenshot',
                        slug: 'screenshot',
                        activeTabId: DEMO_TAB_ID,
                        tabs: [
                            {
                                id: DEMO_TAB_ID,
                                name: opts.tabName ?? 'Demo',
                                slug: 'demo',
                                widgets,
                            },
                        ],
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

        /** Define what `getState` returns, i.e. the value the SERVER holds, without
         *  touching the local cache or emitting a stateChange. That models a datapoint
         *  which changed while the frontend held no subscription — the case the cache
         *  freshness check exists for (issue #528). Unlisted IDs fall through to the
         *  real socket. Pass false to restore it. */
        mockServerState(byId: Record<string, MockValue> | false): void {
            __devSetGetState(byId === false ? null : (id) => (id in byId ? toState(byId[id]) : undefined));
        },

        /** Whether the cached value for `id` is currently considered trustworthy
         *  without a round-trip (live subscription, or confirmed very recently). */
        isFresh(id: string): boolean {
            return isStateFresh(id);
        },

        /** Seed datapoint popup triggers and arm them (screenshot mode disables
         *  them by default so a real trigger can't pop into a shot). `false`
         *  clears and disarms. Reset writes stay blocked in screenshot mode. */
        dpTriggers(triggers: PopupTrigger[] | false): void {
            __devForceDpTriggers(triggers !== false);
            withSuppressedDirty(() => usePopupConfigStore.setState({ triggers: triggers === false ? [] : triggers }));
        },

        /** Arm condition rules with "reload widget". Off in screenshot mode by
         *  default — a widget remounting mid-shot would corrupt the image. */
        conditionRefresh(on = true): void {
            __devForceConditionRefresh(on);
        },

        /** Arm condition rules with "send a message". The write stays blocked —
         *  read what would have gone out with `sentMessages()`. */
        conditionNotify(on = true): void {
            __devForceConditionNotify(on);
            if (on) __devClearSentMessages();
        },

        /** Payloads that `send()` swallowed because screenshot mode blocks writes. */
        sentMessages(): unknown[] {
            return __devSentMessages().map((raw) => {
                try {
                    return JSON.parse(raw);
                } catch {
                    return raw;
                }
            });
        },

        /** Seed popup views so a `popup-view` action has something to render. */
        popupViews(views: PopupView[]): void {
            withSuppressedDirty(() => usePopupConfigStore.setState({ views }));
        },

        /** Arm the message runtime (off in screenshot mode so a real notice can't
         *  pop into a shot). Writes stay blocked either way. */
        messages(on = true): void {
            __devForceMessages(on);
        },

        /** Push messages straight into the toast queue, skipping the datapoint
         *  plumbing. `scope` (optional) sets what the target filter is matched
         *  against; without it every message is in scope. */
        messageIngest(messages: AuraMessage[], scope?: MessageScope): void {
            const store = useMessagesStore.getState();
            if (scope) store.setScope(scope);
            for (const msg of messages) store.ingest(msg);
        },

        /** Forget which messages this browser has already shown, so a test can
         *  replay the same ids. */
        messagesReset(): void {
            useMessagesStore.setState({ seen: {}, lastSeenTs: 0, open: [], history: [], unreadCount: 0 });
        },

        /** Seed the archive mirror (what the Meldungen widget lists) without
         *  writing the history datapoint. Does NOT raise toasts — use
         *  messageIngest for that. */
        messagesHistory(history: AuraMessage[]): void {
            // Also seed the cache the subscription reads from. Without this the
            // live datapoint wins the moment it delivers, and on an instance that
            // actually holds messages the seeded archive is gone before the
            // assertions run.
            __devInjectState(`${NS}.messages.history`, toState(JSON.stringify(history)));
            useMessagesStore.setState({
                history,
                unreadCount: history.filter((m) => !m.read).length,
            });
        },

        /** Toasts per screen position before the rest queue up (config.messageDefaults
         *  normally supplies this). */
        messagesMaxVisible(n: number): void {
            useMessagesStore.setState({ maxVisible: n });
        },

        /** Pretend a toast layer is / is not mounted — models a route that only
         *  reads the archive (admin history, widget editor). */
        messagesDisplayActive(active: boolean): void {
            useMessagesStore.setState({ displayActive: active });
        },

        /** Which message ids this browser has already handled, id → timestamp. */
        messagesSeen(): Record<string, number> {
            return useMessagesStore.getState().seen;
        },

        /** The timeline the advanced chart resamples stacked series onto before echarts
         *  stacks them by index. Exposed because the stacking itself only exists on a
         *  canvas, while this is where it can actually be wrong (issue #541). */
        stackAlign(series: StackableSeries[], data: StackPoint[][]): StackPoint[][] {
            return alignStackedSeries(series, data);
        },

        /** Stroke width the advanced chart gives a series. 0 for a stacked band, whose outline
         *  would otherwise draw a full-width line wherever the series sits at 0 (issue #541). */
        seriesLineWidth(series: StackableSeries): number {
            return outlineWidthFor(series);
        },

        /** grid + y axes of the chart currently on screen, as echarts resolved them. The axis
         *  reserve and the right-axis switch only exist in the rendered option — on the canvas
         *  they are pixels, and pixels are not what a test should assert on (issue #541). */
        chartAxes(): { grid: unknown; yAxis: unknown } | null {
            const el = document.querySelector('[_echarts_instance_]');
            const inst = el instanceof HTMLElement ? getInstanceByDom(el) : undefined;
            if (!inst) return null;
            const opt = inst.getOption() as { grid?: unknown[]; yAxis?: unknown[] };
            // Round-trip through JSON so the formatter functions echarts adds are dropped and
            // the result survives the trip out of the page.
            return JSON.parse(JSON.stringify({ grid: opt.grid?.[0] ?? null, yAxis: opt.yAxis ?? null }));
        },
    };

    (window as unknown as Record<string, unknown>).__auraShot = api;
    console.log('[aura screenshot] harness ready — window.__auraShot');
}

installScreenshotApi();
