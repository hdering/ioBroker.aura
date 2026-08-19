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
    __devInjectObject,
    __devInjectState,
    __devSetHistoryGen,
    __devSetObjectView,
    __devSetSendTo,
    __devSetGetState,
    __devSetWriteLog,
    __devWrites,
    type DevWrite,
    getStateFromCache,
    isStateFresh,
    type HistoryAggregate,
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
    applyMessageHistory,
    clearSessionHandled,
    type MessageScope,
} from '../store/messagesStore';
import { useThemeStore } from '../store/themeStore';
import {
    alignStackedSeries,
    areaOpacityFor,
    outlineWidthFor,
    type StackableSeries,
    type StackPoint,
} from '../utils/stackedSeries';
import { withSuppressedDirty, setScreenshotMode } from '../store/persistManager';
import { NS } from '../utils/namespace';
import type { AuraMessage, MessageSeverity, WidgetConfig, ioBrokerState, ObjectViewResult } from '../types';

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

// Stand in for what a history adapter does with `step` + `aggregate`: raw records are
// grouped into fixed windows and each window is reduced to one row — except `minmax`,
// which emits the window's extremes at their REAL timestamps, so a spike survives a
// coarse step. Emulated rather than skipped because the difference between the modes is
// exactly what the documentation screenshots are meant to show.
function aggregateRaw(
    raw: HistoryEntry[],
    start: number,
    step: number | undefined,
    aggregate: HistoryAggregate | undefined,
): HistoryEntry[] {
    if (!step || !aggregate || aggregate === 'none') return raw;
    const nums = raw.filter((e): e is { ts: number; val: number } => typeof e.val === 'number');
    const groups = new Map<number, { ts: number; val: number }[]>();
    for (const e of nums) {
        const key = Math.floor((e.ts - start) / step);
        const g = groups.get(key);
        if (g) g.push(e);
        else groups.set(key, [e]);
    }
    const out: HistoryEntry[] = [];
    for (const [key, g] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
        const mid = start + key * step + step / 2;
        const lo = g.reduce((a, b) => (b.val < a.val ? b : a));
        const hi = g.reduce((a, b) => (b.val > a.val ? b : a));
        if (aggregate === 'minmax') {
            // Both extremes with their own timestamps; a flat window contributes one row.
            out.push(lo);
            if (hi.ts !== lo.ts) out.push(hi);
        } else if (aggregate === 'min') out.push({ ts: mid, val: lo.val });
        else if (aggregate === 'max') out.push({ ts: mid, val: hi.val });
        else if (aggregate === 'first') out.push(g[0]);
        else if (aggregate === 'last') out.push(g[g.length - 1]);
        else if (aggregate === 'count') out.push({ ts: mid, val: g.length });
        else if (aggregate === 'total') out.push({ ts: mid, val: g.reduce((sum, e) => sum + e.val, 0) });
        else out.push({ ts: mid, val: g.reduce((sum, e) => sum + e.val, 0) / g.length });
    }
    return out.sort((a, b) => a.ts - b.ts);
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

        /** Serve an EXPLICIT raw series per datapoint instead of the wobble generator:
         *  { 'demo.0.pv.total': [[ts, val], …] }, sliced to the requested window and then
         *  bucketed the way the history adapter would for the requested step/aggregate.
         *  Needed for anything the generator can't shape — a monotonic counter above all,
         *  which is what the `delta` aggregation reads — and for showing what the
         *  aggregation itself does to a series. Unlisted ids fall back to the generator so
         *  a mixed dashboard still draws. `false` restores the real getHistory path. */
        mockHistory(byId: Record<string, [number, number][]> | false): void {
            if (byId === false) {
                __devSetHistoryGen(null);
                return;
            }
            __devSetHistoryGen((id, opts) => {
                const points = byId[id];
                if (!points) return genHistory(id, opts);
                const raw = points
                    .filter(([ts]) => ts >= opts.start && ts <= opts.end)
                    .map(([ts, val]): HistoryEntry => ({ ts, val }));
                return aggregateRaw(raw, opts.start, opts.step, opts.aggregate);
            });
        },

        /** Seed whole objects: { 'demo.0.PV.Ertrag_Gesamt': { common: { custom: { 'history.0': { enabled: true } } } } }.
         *  Editor fields derived from the object — the history adapters detected in
         *  `common.custom` above all — then show what a real, logged datapoint would show. */
        mockObject(byId: Record<string, unknown>): void {
            for (const [id, obj] of Object.entries(byId)) {
                __devInjectObject(id, obj as Parameters<typeof __devInjectObject>[1]);
            }
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

        /** Datapoint writes the UI performed, oldest first. Call with `true` to
         *  arm/clear the log first — it stays off until a test asks for it, so
         *  normal screenshot runs record nothing. Lets a test assert the raw value
         *  a control converted to (slat angle on a 0…1 or -90…90 datapoint). */
        writes(reset = false): DevWrite[] {
            if (reset) {
                __devSetWriteLog(true);
                return [];
            }
            return __devWrites();
        },

        /** The most recent datapoint write, or null while the log is not armed. */
        get lastWrite(): DevWrite | null {
            const all = __devWrites();
            return all.length ? all[all.length - 1] : null;
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
         *  replay the same ids. Models a fresh page load, session state included. */
        messagesReset(): void {
            clearSessionHandled();
            useMessagesStore.setState({ seen: {}, lastSeenTs: 0, open: [], history: [], unreadCount: 0 });
        },

        /** Deliver an archive the way the history datapoint does, so the reload
         *  restore runs. `firstDelivery` is the priming value right after a
         *  subscribe — pair it with messagesReset() to model a page load. */
        messagesDeliverHistory(history: AuraMessage[], firstDelivery = false): void {
            applyMessageHistory(history, firstDelivery);
        },

        /** Severities that survive a reload (config.messageDefaults normally
         *  supplies this). */
        messagesRestoreSeverities(severities: MessageSeverity[]): void {
            useMessagesStore.setState({ restoreSeverities: severities });
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

        /** Fill opacity the advanced chart gives an area series. A stacked band is opaque, so it
         *  shows the colour that was picked instead of a paler mix with the background; the
         *  series' own `areaOpacity` (percent) overrides that (issue #557). */
        seriesAreaOpacity(series: StackableSeries): number {
            return areaOpacityFor(series);
        },

        /** What the chart on screen actually plots, per series: name, point count and the
         *  first/last x value. Lets a screenshot script verify the curve covers the whole
         *  window before saving the image — an empty tail is invisible in a thumbnail. */
        chartSeries(): { name: unknown; points: number; first: unknown; last: unknown }[] | null {
            const el = document.querySelector('[_echarts_instance_]');
            const inst = el instanceof HTMLElement ? getInstanceByDom(el) : undefined;
            if (!inst) return null;
            const opt = inst.getOption() as { series?: { name?: unknown; data?: unknown[] }[] };
            return (opt.series ?? []).map((s) => {
                const data = s.data ?? [];
                const at = (p: unknown) => (Array.isArray(p) ? p[0] : p);
                return {
                    name: s.name,
                    points: data.length,
                    first: at(data[0]),
                    last: at(data[data.length - 1]),
                };
            });
        },

        /** grid + y axes of the chart currently on screen, as echarts resolved them. The axis
         *  reserve and the right-axis switch only exist in the rendered option — on the canvas
         *  they are pixels, and pixels are not what a test should assert on (issue #541). */
        chartAxes(): { grid: unknown; yAxis: unknown } | null {
            const el = document.querySelector('[_echarts_instance_]');
            const inst = el instanceof HTMLElement ? getInstanceByDom(el) : undefined;
            if (!inst) return null;
            // A chart that has just been mounted (or replaced by one with a new widget id) can
            // answer before it holds an option at all — that is a "not ready yet", not a failure.
            const opt = inst.getOption() as { grid?: unknown[]; yAxis?: unknown[] } | undefined;
            if (!opt) return null;
            // Round-trip through JSON so the formatter functions echarts adds are dropped and
            // the result survives the trip out of the page.
            return JSON.parse(JSON.stringify({ grid: opt.grid?.[0] ?? null, yAxis: opt.yAxis ?? null }));
        },

        /** Every text echarts painted, in the order zrender draws it. Axis labels are canvas
         *  pixels with no DOM node, so this is the only way a test can read what a tick
         *  actually says — e.g. that it honours the widget's decimals (issue #548). */
        chartTexts(index = 0): string[] | null {
            const el = document.querySelectorAll('[_echarts_instance_]')[index];
            const inst = el instanceof HTMLElement ? getInstanceByDom(el) : undefined;
            if (!inst) return null;
            const zr = inst.getZr() as unknown as {
                storage: { getDisplayList(update?: boolean): { style?: { text?: unknown } }[] };
            };
            return zr.storage
                .getDisplayList(true)
                .map((d) => d.style?.text)
                .filter((t): t is string => typeof t === 'string' && t.trim() !== '');
        },
    };

    (window as unknown as Record<string, unknown>).__auraShot = api;
    console.log('[aura screenshot] harness ready — window.__auraShot');
}

installScreenshotApi();
