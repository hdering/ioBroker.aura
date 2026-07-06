/**
 * Per-widget and per-backend-command performance attribution.
 *
 * The five page-level metrics in perfMetrics.ts tell you *that* something is
 * slow; this module tells you *who* — which widget takes long to become ready
 * or to render, and which backend command (sendTo round-trip) is slow.
 *
 * Costs are aggregated in-memory per session (count / avg / max / last per key)
 * and flushed to the aura backend on a relaxed debounce via sendTo('perfBreakdown').
 * The backend keeps only the latest snapshot per client; the "Ladezeiten" widget
 * reads it back through getPerfBreakdown.
 *
 * Recording is OPT-IN and gated by the adapter config (see setBreakdownTracking):
 * widget instrumentation adds a per-render effect to every widget, so it stays
 * off unless the user enables it in the adapter settings to diagnose a problem.
 */
import { sendToDirect } from '../hooks/useIoBroker';
import { NS } from './namespace';
import { useConnectionStore } from '../store/connectionStore';

export type BreakdownCat = 'widgetRender' | 'widgetReady' | 'backend';

interface Agg {
    cat: BreakdownCat;
    key: string;
    label: string;
    count: number;
    sum: number;
    max: number;
    last: number;
}

const store = new Map<string, Agg>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

// Gates, both default off — enabled from the adapter config after app start.
let backendEnabled = false;
let widgetEnabled = false;

/** Screenshot harness runs offline and must not emit instance writes. */
function shotMode(): boolean {
    return typeof window !== 'undefined' && Boolean((window as unknown as { __auraShot?: unknown }).__auraShot);
}

export function setBreakdownTracking(opts: { backend?: boolean; widget?: boolean }): void {
    if (typeof opts.backend === 'boolean') backendEnabled = opts.backend;
    if (typeof opts.widget === 'boolean') widgetEnabled = opts.widget;
}

/** Whether per-widget instrumentation should be installed (read by WidgetFrame). */
export function isWidgetTrackingEnabled(): boolean {
    return widgetEnabled;
}

function bump(cat: BreakdownCat, key: string, label: string, ms: number): void {
    if (shotMode()) return;
    if (!Number.isFinite(ms) || ms < 0) return;
    const mapKey = `${cat}::${key}`;
    let a = store.get(mapKey);
    if (!a) {
        a = { cat, key, label, count: 0, sum: 0, max: 0, last: 0 };
        store.set(mapKey, a);
    }
    a.label = label;
    a.count += 1;
    a.sum += ms;
    a.last = ms;
    if (ms > a.max) a.max = ms;
    scheduleFlush();
}

function scheduleFlush(): void {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
        flushTimer = null;
        void flush();
    }, 10000);
}

function flush(): void {
    if (store.size === 0) return;
    const { clientId, clientName } = useConnectionStore.getState();
    const entries = Array.from(store.values()).map((a) => ({
        cat: a.cat,
        key: a.key,
        label: a.label,
        count: a.count,
        avg: Math.round(a.sum / Math.max(1, a.count)),
        max: Math.round(a.max),
        last: Math.round(a.last),
    }));
    void sendToDirect(NS, 'perfBreakdown', { client: clientId, clientName, entries }, 10000);
}

export function recordWidgetRender(key: string, label: string, ms: number): void {
    if (!widgetEnabled) return;
    bump('widgetRender', key, label, ms);
}

export function recordWidgetReady(key: string, label: string, ms: number): void {
    if (!widgetEnabled) return;
    bump('widgetReady', key, label, ms);
}

export function recordBackendCall(command: string, ms: number): void {
    if (!backendEnabled) return;
    bump('backend', command, command, ms);
}
