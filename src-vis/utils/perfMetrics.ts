/**
 * Frontend load-time metrics.
 *
 * Measures how long the app takes to become usable — initial page load, first
 * contentful paint, socket warm-up, tab switches and main-thread long tasks —
 * and posts each sample to the aura backend via sendTo('perfLog'). The backend
 * keeps a persisted ring buffer and mirrors the latest value to aura.0.metrics.*;
 * the "Ladezeiten" widget reads the history back through getLoadHistory.
 *
 * `socketToFirstState` is reported from useIoBroker (it owns the socket) and
 * `tabSwitch` from Dashboard (it owns the active-tab state); the passive
 * observers here cover the rest.
 */
import { sendToDirect } from '../hooks/useIoBroker';
import { NS } from './namespace';
import { useConnectionStore } from '../store/connectionStore';

export type PerfMetric = 'initialLoad' | 'firstContentfulPaint' | 'socketToFirstState' | 'tabSwitch' | 'longTaskMax';

/** Screenshot harness runs offline and must not emit instance writes. */
function shotMode(): boolean {
    return typeof window !== 'undefined' && Boolean((window as unknown as { __auraShot?: unknown }).__auraShot);
}

// Master gate for page-level metrics. Defaults on so the earliest samples
// (initial load / first paint) are captured before the adapter config is read;
// disabled afterwards if the user turned tracking off in the adapter settings.
let trackingEnabled = true;
export function setPerfTracking(on: boolean): void {
    trackingEnabled = on;
}

/** Fire-and-forget a single metric sample to the backend. */
export function reportMetric(metric: PerfMetric, value: number): void {
    if (!trackingEnabled || shotMode()) return;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return;
    // Tag the sample with this device's identity so the widget can filter/compare
    // per client — these load times are almost entirely client-dependent.
    const { clientId, clientName } = useConnectionStore.getState();
    void sendToDirect(
        NS,
        'perfLog',
        { metric, value: Math.round(value), ts: Date.now(), client: clientId, clientName },
        10000,
    );
}

let started = false;
let longTaskMax = 0;
let longTaskTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Wire up the passive observers (initial load, FCP, long tasks). Idempotent —
 * only the first call has an effect. Call once at app start.
 */
export function initPerfMetrics(): void {
    if (started || typeof window === 'undefined' || typeof performance === 'undefined') return;
    started = true;

    const reportInitial = (): void => {
        try {
            const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
            if (nav && nav.loadEventEnd > 0) reportMetric('initialLoad', nav.loadEventEnd - nav.startTime);
        } catch {
            /* Navigation Timing unsupported — ignore */
        }
    };
    if (document.readyState === 'complete') reportInitial();
    else window.addEventListener('load', () => setTimeout(reportInitial, 0), { once: true });

    // First Contentful Paint.
    try {
        const paintObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                if (entry.name === 'first-contentful-paint') {
                    reportMetric('firstContentfulPaint', entry.startTime);
                    paintObserver.disconnect();
                    break;
                }
            }
        });
        paintObserver.observe({ type: 'paint', buffered: true });
    } catch {
        /* paint entry type unsupported — ignore */
    }

    // Long tasks (main-thread jank). Track the session maximum and flush it
    // debounced, so a burst of janky frames doesn't spam the backend.
    try {
        const longTaskObserver = new PerformanceObserver((list) => {
            let changed = false;
            for (const entry of list.getEntries()) {
                if (entry.duration > longTaskMax) {
                    longTaskMax = entry.duration;
                    changed = true;
                }
            }
            if (!changed) return;
            if (longTaskTimer) clearTimeout(longTaskTimer);
            longTaskTimer = setTimeout(() => {
                longTaskTimer = null;
                reportMetric('longTaskMax', longTaskMax);
            }, 3000);
        });
        longTaskObserver.observe({ type: 'longtask', buffered: true });
    } catch {
        /* longtask entry type unsupported (Firefox/Safari) — ignore */
    }
}
