/**
 * Takes over the device-local settings from Aura's old own port (#997, step 10).
 *
 * The old port forwards to `<web>/aura/#aura-handoff=<base64url JSON>` (see
 * lib/portRedirect.js). localStorage hangs on the origin (host AND port), so this
 * origin starts empty; the settings that belong to the device come along here,
 * once. Imported first in main.tsx: the stores read localStorage on import.
 *
 * Only what is missing here is written - a device that already used /aura/
 * keeps its own state. Only the allowed keys, only from the same host (the
 * referrer of the forward), and never the connection URL: behind the web
 * extension the socket is the web instance's own.
 */

/** Kept equal to HANDOFF_KEYS in lib/portRedirect.js (tools/tests/port-redirect.mjs). */
export const HANDOFF_KEYS = [
    'aura-connection',
    'aura-admin-prefs',
    'aura-messages-seen',
    'aura-announcements',
    'aura-message-defaults',
    'aura-iframe-zoom',
    'aura-theme-mode',
    'aura-boot-colors',
    'aura-speech-claims',
    'aura-dp-picker-filters',
    'aura-dp-picker-view',
    'aura-recent-templates',
    'aura-guideline-inset',
    'aura-guidelines-hint-dismissed',
    'aura-tabsleep-hint-dismissed',
];

export const HANDOFF_PREFIX = '#aura-handoff=';
const MAX_TOTAL = 64 * 1024;

interface HandoffPayload {
    v: number;
    from: string;
    hash: string;
    items: Record<string, string>;
}

function decode(raw: string): HandoffPayload | null {
    try {
        if (raw.length > MAX_TOTAL * 2) return null;
        const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
        const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
        const json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
        const p = JSON.parse(json) as HandoffPayload;
        if (!p || p.v !== 1 || typeof p.from !== 'string' || !p.items || typeof p.items !== 'object') return null;
        return p;
    } catch {
        return null;
    }
}

/** The forward came from Aura's old port on this very host (not from a foreign page). */
function fromSameHost(from: string, referrer: string, here: Location): boolean {
    try {
        const f = new URL(from);
        const r = new URL(referrer);
        return f.origin === r.origin && f.hostname === here.hostname && f.origin !== here.origin;
    } catch {
        return false;
    }
}

/** aura-connection without the connection URL - behind /aura/ the web instance is the socket. */
function connectionWithoutUrl(raw: string): string | null {
    try {
        const v = JSON.parse(raw) as { state?: Record<string, unknown>; version?: number };
        if (!v || typeof v !== 'object' || !v.state || typeof v.state !== 'object') return null;
        const { ioBrokerUrl: _drop, ...state } = v.state;
        return JSON.stringify({ ...v, state });
    } catch {
        return null;
    }
}

/**
 * Applies a hand-over in the URL, if there is one, and puts the original fragment
 * (the route) back. Returns the keys that were taken over.
 */
export function applyHandoff(
    loc: Location = window.location,
    storage: Storage = window.localStorage,
    referrer: string = document.referrer,
): string[] {
    if (!loc.hash.startsWith(HANDOFF_PREFIX)) return [];
    const payload = decode(loc.hash.slice(HANDOFF_PREFIX.length));
    const taken: string[] = [];
    if (payload && fromSameHost(payload.from, referrer, loc)) {
        for (const key of HANDOFF_KEYS) {
            let value = payload.items[key];
            if (typeof value !== 'string') continue;
            if (key === 'aura-connection') value = connectionWithoutUrl(value) ?? '';
            if (!value) continue;
            try {
                if (storage.getItem(key) !== null) continue;
                storage.setItem(key, value);
                taken.push(key);
            } catch {
                /* storage full or blocked - the rest is optional anyway */
            }
        }
    }
    const hash = payload && typeof payload.hash === 'string' && payload.hash.startsWith('#') ? payload.hash : '';
    try {
        history.replaceState(history.state, '', `${loc.pathname}${loc.search}${hash}`);
    } catch {
        /* sandboxed: the fragment stays, the router falls back to the start tab */
    }
    return taken;
}

if (typeof window !== 'undefined') {
    const taken = applyHandoff();
    if (taken.length) console.info(`[aura] took over from the old port: ${taken.join(', ')}`);
}
