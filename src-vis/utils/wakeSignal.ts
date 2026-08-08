/**
 * Wake signal — fires when this document comes back after *not running* for a
 * while: a wall tablet whose display went to standby, an OS suspend, or a
 * browser tab that was frozen.
 *
 * Why widgets need this (issue #526): a live stream embedded in an iframe
 * (go2rtc et al.) is torn down when the WebView is backgrounded. On resume the
 * embedded player reconnects and calls `video.play()` — without user activation,
 * which the browser rejects for unmuted media no matter what `allow="autoplay"`
 * delegates. The frame is left showing a play overlay until someone taps it.
 * Re-mounting the frame instead gives the embedded document a fresh load, where
 * autoplay is evaluated against the frame's permission policy again.
 *
 * Three signals, because no single one covers every device:
 *  - `visibilitychange`: the normal path (Android WebView pauses on screen-off).
 *  - `pageshow` with `persisted`: restored from the back/forward cache.
 *  - a wall-clock gap between heartbeats: kiosk browsers that keep the document
 *    `visible` while the device sleeps only show up here.
 *
 * Listeners are installed on the first subscriber and removed with the last, so
 * dashboards without a stream widget pay nothing.
 */

/** Below this, a hidden→visible round trip is a glance away, not a standby. */
const HIDDEN_THRESHOLD_MS = 10_000;
/**
 * Hidden tabs get their timers clamped to roughly one tick per minute, so the
 * gap must sit clearly above that to mean "we were not running".
 */
const GAP_THRESHOLD_MS = 120_000;
const HEARTBEAT_MS = 15_000;
/** Standby fires several signals at once — collapse them into one wake. */
const COALESCE_MS = 3_000;

type WakeListener = () => void;

const listeners = new Set<WakeListener>();

let hiddenSince = 0;
let lastWakeAt = 0;
let lastBeat = 0;
let heartbeat: ReturnType<typeof setInterval> | null = null;

function fireWake(): void {
    const now = Date.now();
    if (now - lastWakeAt < COALESCE_MS) return;
    lastWakeAt = now;
    listeners.forEach((fn) => fn());
}

function onVisibilityChange(): void {
    if (document.visibilityState === 'visible') {
        const hiddenFor = hiddenSince ? Date.now() - hiddenSince : 0;
        hiddenSince = 0;
        // Reset the heartbeat too: the timer was throttled while hidden, and a
        // stale `lastBeat` would fire a second, redundant wake right after.
        lastBeat = Date.now();
        if (hiddenFor >= HIDDEN_THRESHOLD_MS) fireWake();
    } else {
        hiddenSince = Date.now();
    }
}

function onPageShow(e: PageTransitionEvent): void {
    if (e.persisted) fireWake();
}

function onHeartbeat(): void {
    const now = Date.now();
    const gap = now - lastBeat;
    lastBeat = now;
    if (gap > GAP_THRESHOLD_MS) fireWake();
}

function install(): void {
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', onPageShow);
    // Page Lifecycle API — not in the TS DOM lib, hence the string event name.
    document.addEventListener('resume', fireWake);
    hiddenSince = document.visibilityState === 'visible' ? 0 : Date.now();
    lastBeat = Date.now();
    heartbeat = setInterval(onHeartbeat, HEARTBEAT_MS);
}

function uninstall(): void {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pageshow', onPageShow);
    document.removeEventListener('resume', fireWake);
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
}

/** Subscribe to wake-ups. Returns the unsubscribe function. */
export function onWake(fn: WakeListener): () => void {
    if (typeof document === 'undefined') return () => {};
    if (listeners.size === 0) install();
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
        if (listeners.size === 0) uninstall();
    };
}
