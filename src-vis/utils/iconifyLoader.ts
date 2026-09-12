/**
 * Iconify integration — served from Aura's own origin.
 *
 * Instead of shipping the full lucide + mdi collections (~3.3 MB raw,
 * ~800 KB gzipped) with every page load, the `<Icon>` component from
 * `@iconify/react` fetches individual icons on demand. Multiple icon requests
 * within ~50 ms are batched into a single HTTP call automatically, and every
 * icon that arrived once is kept in this device's localStorage by the cache
 * further down — `@iconify/react` 6 no longer brings one of its own.
 *
 * Those requests go to `/icons/…` on Aura's own server, NOT to the public
 * `api.iconify.design` / `api.simplesvg.com` / `api.unisvg.com` hosts the
 * library ships with. Those three are on the block lists of Samsung Internet
 * and Opera, and a kiosk tablet (Fully Kiosk, Native Alpha) often has no route
 * to the internet at all — so on exactly the devices a wall dashboard runs on,
 * every icon stayed blank while the library kept rotating through all three
 * hosts every 750 ms (#636). The adapter answers the same API shape from a
 * local cache and only reaches out once per icon it has never seen.
 *
 * `loadIconSets` / `areIconSetsLoaded` are kept as no-ops so existing
 * callers (TabBar, IconPickerModal) keep working without a refactor.
 */
import { addAPIProvider, addCollection, getIcon, listIcons } from '@iconify/react';
import type { IconifyIcon } from '@iconify/react';

/** Same-origin Iconify API. The empty host keeps the URL relative, so it follows
 *  the page's protocol, host and port without any configuration.
 *
 *  The public API stays behind it as a last resort for the mirror image of the
 *  reported setup: an ioBroker host without internet, reached from a browser
 *  that has it. Iconify only rotates to the next resource once the one before it
 *  gave up, and `rotate` is raised well above the default 750 ms so a cold icon —
 *  which the adapter has to fetch before it can answer — is not raced against the
 *  public hosts on every first request. */
addAPIProvider('', {
    resources: ['', 'https://api.iconify.design'],
    path: '/icons/',
    rotate: 6000,
    timeout: 12000,
});

/* ── Persistent icon cache ────────────────────────────────────────────────────
 *
 * @iconify/react 6 dropped the localStorage cache it used to keep, so EVERY
 * page load fetches every visible icon over the network again — and the answer
 * arrives after the first paint. On desktop Chrome that is a flicker nobody
 * notices; on Android (Samsung Internet, and the WebViews behind Fully Kiosk /
 * Native Alpha) the late DOM insertion is not reliably repainted, so the icon
 * sits in the DOM, correctly sized and coloured, and stays invisible until some
 * unrelated invalidation — a touch — makes it flash up (#636).
 *
 * So we keep the cache ourselves: what was loaded once is restored
 * SYNCHRONOUSLY on the next load, before `createRoot`, and every icon is part
 * of the very first render. Nothing is inserted late, so there is nothing left
 * to repaint — and a dashboard that has run once needs no icon request at all,
 * which is also what stops the constant background traffic the same report
 * describes.
 */
const CACHE_KEY = 'aura-icons-v1';
/** Roughly 1 200 icons — far beyond what a dashboard shows, still well inside
 *  the 5 MB localStorage budget once the character cap below applies. */
const MAX_ICONS = 1200;
/** Hard cap on the serialised payload; localStorage is shared with the config
 *  cache, and a QuotaExceededError there would cost more than a cold icon. */
const MAX_CHARS = 600_000;
/** Iconify's own defaults — storing a value that equals them is dead weight. */
const ICON_DEFAULTS: Record<string, number | boolean> = {
    left: 0,
    top: 0,
    width: 16,
    height: 16,
    rotate: 0,
    hFlip: false,
    vFlip: false,
};

type StoredIcons = Record<string, IconifyIcon>;

/** Icon count at the last successful write — a cheap "nothing new" guard. */
let lastSavedCount = -1;

/** Put everything this device loaded before back into Iconify's storage.
 *  Runs at import time, i.e. before the first render. */
function restoreIconCache(): void {
    let raw: string | null = null;
    try {
        raw = localStorage.getItem(CACHE_KEY);
    } catch {
        return; // private mode / storage disabled — nothing to restore
    }
    if (!raw) return;
    try {
        const parsed = JSON.parse(raw) as { v?: number; icons?: StoredIcons };
        if (parsed?.v !== 1 || !parsed.icons) throw new Error('unsupported cache');
        const byPrefix = new Map<string, StoredIcons>();
        for (const [id, data] of Object.entries(parsed.icons)) {
            const colon = id.indexOf(':');
            if (colon < 1 || !data || typeof data.body !== 'string') continue;
            const prefix = id.slice(0, colon);
            let icons = byPrefix.get(prefix);
            if (!icons) byPrefix.set(prefix, (icons = {}));
            icons[id.slice(colon + 1)] = data;
        }
        for (const [prefix, icons] of byPrefix) addCollection({ prefix, icons });
        lastSavedCount = Object.keys(parsed.icons).length;
    } catch {
        // A corrupt entry would break every later write too — drop it.
        try {
            localStorage.removeItem(CACHE_KEY);
        } catch {
            /* ignore */
        }
    }
}

/** Strip the fields that match Iconify's defaults — body is what matters. */
function trim(data: Required<IconifyIcon>): IconifyIcon {
    const out: IconifyIcon = { body: data.body };
    const extra = out as unknown as Record<string, unknown>;
    for (const [key, def] of Object.entries(ICON_DEFAULTS)) {
        const value = (data as unknown as Record<string, unknown>)[key];
        if (value !== undefined && value !== def) extra[key] = value;
    }
    return out;
}

/** Write every currently loaded icon back to localStorage. */
function saveIconCache(): void {
    let names: string[];
    try {
        names = listIcons('');
    } catch {
        return;
    }
    if (names.length === lastSavedCount) return;
    const icons: StoredIcons = {};
    let chars = 0;
    for (const name of names.slice(0, MAX_ICONS)) {
        const data = getIcon(name);
        if (!data || typeof data.body !== 'string') continue;
        chars += data.body.length + name.length + 24;
        if (chars > MAX_CHARS) break;
        icons[name] = trim(data);
    }
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ v: 1, at: Date.now(), icons }));
        lastSavedCount = names.length;
    } catch {
        // Out of quota (or storage disabled): drop our entry rather than leave a
        // half-written one behind, and stop retrying until new icons show up.
        try {
            localStorage.removeItem(CACHE_KEY);
        } catch {
            /* ignore */
        }
        lastSavedCount = names.length;
    }
}

/* ── Repainting icons that arrive late ────────────────────────────────────────
 *
 * The cache above only helps from the second load on; the very first visit
 * still inserts every icon after the page has painted. The video attached to
 * #636 shows what Android makes of that: the icon is in the DOM, correctly
 * sized and coloured, and the tile it belongs to is never re-rastered — until a
 * touch forces one, which is when the icons flash up and then disappear again.
 *
 * So when icons do arrive late, invalidate them explicitly: hide every icon,
 * force ONE reflow, show them again. Two forced layouts for the whole batch,
 * nothing painted in between (it all happens inside one frame), and it only
 * runs while icons are actually still coming in. */
const NUDGE_DELAY_MS = 250;
/** How long after boot new icons are watched for closely. Everything a page
 *  shows is requested in the first seconds; later arrivals (a tab switched to
 *  for the first time) are caught by the save tick below. */
const STARTUP_WATCH_MS = 20_000;
const STARTUP_TICK_MS = 500;

let nudgeTimer: ReturnType<typeof setTimeout> | null = null;
/** Icon count the repaint watcher last saw — growth means something arrived. */
let watchedCount = 0;

function repaintIcons(): void {
    if (document.visibilityState !== 'visible') return;
    const nodes = document.querySelectorAll<SVGElement>('svg.iconify');
    if (!nodes.length) return;
    const display: string[] = [];
    nodes.forEach((el, i) => {
        display[i] = el.style.display;
        el.style.display = 'none';
    });
    void document.body.offsetHeight; // one forced reflow for the whole batch
    nodes.forEach((el, i) => {
        el.style.display = display[i];
    });
}

/** Collapse a burst of arrivals — Iconify answers a whole batch at once. */
function scheduleRepaint(): void {
    if (nudgeTimer) clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(() => {
        nudgeTimer = null;
        repaintIcons();
    }, NUDGE_DELAY_MS);
}

if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    restoreIconCache();
    watchedCount = lastSavedCount > 0 ? lastSavedCount : 0;
    // Watch the first seconds closely: that is when a cold device fetches the
    // icons the page is showing right now, and exactly those need the nudge.
    const startedAt = Date.now();
    const watch = setInterval(() => {
        const count = listIcons('').length;
        if (count !== watchedCount) {
            watchedCount = count;
            scheduleRepaint();
        }
        if (Date.now() - startedAt > STARTUP_WATCH_MS) clearInterval(watch);
    }, STARTUP_TICK_MS);
    // A tab switch or a popup can pull in icons minutes after boot, so re-check
    // periodically; the count guard makes every later tick a no-op.
    setInterval(() => {
        const count = listIcons('').length;
        if (count !== watchedCount) {
            watchedCount = count;
            scheduleRepaint();
        }
        saveIconCache();
    }, 30_000);
    // A kiosk page is never closed, a phone is backgrounded constantly — catch
    // both so the very first visit already leaves a usable cache behind.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') saveIconCache();
    });
    window.addEventListener('pagehide', saveIconCache);
}

/** No-op: icons are now resolved on demand by the `<Icon>` component. */
export function loadIconSets(): Promise<void> {
    return Promise.resolve();
}

/** Always `true`: there is no global "loaded" state in API mode. */
export function areIconSetsLoaded(): boolean {
    return true;
}

/** Convert PascalCase Lucide name to Iconify "lucide:kebab-case" ID.
 *  e.g. "ZapOff" → "lucide:zap-off", "Home" → "lucide:home" */
export function lucidePascalToIconify(name: string): string {
    if (name.includes(':')) return name;
    const kebab = name.replace(/([A-Z])/g, (ch, _, offset) =>
        offset === 0 ? ch.toLowerCase() : `-${ch.toLowerCase()}`,
    );
    return `lucide:${kebab}`;
}
