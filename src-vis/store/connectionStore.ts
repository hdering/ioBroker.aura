import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invalidateDatapointCache } from '../hooks/useDatapointList';
import { reconnectSocket } from '../hooks/useIoBroker';

const RESERVED_CLIENT_IDS = ['register', 'resolution', 'deleterequest'];

/**
 * Normalise a user-supplied client id so it is safe as an ioBroker object-id
 * segment: no dots (they would nest the tree), no whitespace, no exotic
 * characters. Mirrors sanitizeClientId() in main.js — keep both in sync.
 */
export function sanitizeClientId(raw: string): string {
    const clean = String(raw ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
    // The relay states live directly under clients.*, so those names cannot be clients.
    return RESERVED_CLIENT_IDS.includes(clean) ? '' : clean;
}

// Two independent djb2 hashes over the parts → 16 hex chars.
function hashParts(parts: (string | number)[]): string {
    const fp = parts.join('|');
    let h1 = 5381,
        h2 = 52711;
    for (let i = 0; i < fp.length; i++) {
        const c = fp.charCodeAt(i);
        h1 = Math.imul((h1 << 5) + h1, 1) ^ c;
        h2 = Math.imul((h2 << 5) + h2, 1) ^ c;
    }
    return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

function baseFingerprintParts(): (string | number)[] {
    return [
        screen.width,
        screen.height,
        screen.colorDepth,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        navigator.language,
        navigator.hardwareConcurrency ?? 0,
    ];
}

/**
 * Device fingerprint WITHOUT the user agent. The UA used to be part of it, which
 * meant every browser update handed the device a brand-new id — Edge carries its
 * full four-part version in the UA and ships every few days, so named devices
 * turned into fresh nameless duplicates roughly weekly (#620).
 *
 * This is only the *seed* for a device that has never connected before; once
 * pinned, the id lives in localStorage and the fingerprint is never consulted
 * again.
 */
function deviceFingerprintId(): string {
    return hashParts(baseFingerprintParts());
}

/**
 * The pre-0.55 fingerprint (user agent included). Used exactly once, on first
 * start after the update, to adopt the id this device already owns on the
 * server instead of appearing as a new device.
 */
export function legacyFingerprintId(): string {
    return hashParts([navigator.userAgent, ...baseFingerprintParts()]);
}

/**
 * True when the id was derived from the device fingerprint rather than chosen by
 * the user. Identical hardware (two Fire tablets of the same model, same browser)
 * yields the same fingerprint, so only such ids can collide by accident (#844).
 */
export function isFingerprintClientId(id: string): boolean {
    return id === deviceFingerprintId() || id === legacyFingerprintId();
}

// getRandomValues, not randomUUID: the latter needs a secure context, and kiosk
// tablets usually open Aura over plain http on the LAN.
function randomToken(): string {
    try {
        return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
        return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
    }
}

// ── Durable identity ──────────────────────────────────────────────────────────
// Kiosk browsers (Fully) can be set to wipe web storage on start or reload. A wiped
// device used to come back with a new token, found its own id "owned" by the old one
// and split off — a fresh client every day (#844). A cookie keeps a second copy of
// the token and the own id, and a browser that can keep neither never splits.
const DEVICE_COOKIE = 'aura-device';

function readDeviceCookie(): { token: string; id: string } {
    try {
        if (typeof document === 'undefined') return { token: '', id: '' };
        const raw = document.cookie.split('; ').find((c) => c.startsWith(`${DEVICE_COOKIE}=`));
        const [token = '', id = ''] = decodeURIComponent(raw?.slice(DEVICE_COOKIE.length + 1) ?? '').split('.');
        return { token: /^[0-9a-f]{8,64}$/.test(token) ? token : '', id: sanitizeClientId(id) };
    } catch {
        return { token: '', id: '' };
    }
}

function writeDeviceCookie(token: string, id: string): void {
    try {
        if (typeof document === 'undefined' || !token) return;
        const value = encodeURIComponent(id ? `${token}.${id}` : token);
        document.cookie = `${DEVICE_COOKIE}=${value}; path=/; max-age=315360000; SameSite=Lax`;
    } catch {
        /* cookies blocked */
    }
}

function localStorageWorks(): boolean {
    try {
        localStorage.setItem('aura-probe', '1');
        const ok = localStorage.getItem('aura-probe') === '1';
        localStorage.removeItem('aura-probe');
        return ok;
    } catch {
        return false;
    }
}

function storedConnection(): Partial<ConnectionState> {
    try {
        return JSON.parse(localStorage.getItem('aura-connection') ?? '{}')?.state ?? {};
    } catch {
        return {};
    }
}

// `?client=wohnzimmer-tablet` sets a speaking id for as long as it is in the URL:
// the datapoint tree then reads aura.0.clients.wohnzimmer-tablet.*. It is NOT stored —
// opening such a link once on another device (a PC) must not turn that device into
// the tablet for good (#844). The device's own id stays in storage underneath.
let urlClientId = '';
try {
    urlClientId = sanitizeClientId(new URLSearchParams(window.location.search).get('client') ?? '');
} catch {
    /* no URL */
}
let ownClient = { id: '', pinned: false };

function ownIdentity(state: Pick<ConnectionState, 'clientId' | 'clientIdPinned'>) {
    return urlClientId ? ownClient : { id: state.clientId, pinned: state.clientIdPinned };
}

interface ConnectionState {
    ioBrokerUrl: string;
    clientId: string;
    /** true once the id is anchored in localStorage (adopted, seeded or user-set). */
    clientIdPinned: boolean;
    clientName: string;
    /**
     * Random per-browser token, persisted from the first start. The adapter remembers
     * which token owns a client id (clients.<id>.info.deviceToken), which is how a
     * second device with the same fingerprint notices that the id is taken (#844).
     * Empty when the browser can keep nothing — such a device must never split.
     */
    deviceToken: string;
    setIoBrokerUrl: (url: string) => void;
    setClientName: (name: string) => void;
    /** Anchor an id for this device. Returns the sanitised id that was stored. */
    pinClientId: (id: string) => string;
    /** Leave a fingerprint id another device owns: pin a fresh, random-salted one. */
    splitClientId: () => string;
}

// In production use same host as the page but socketio port 8084.
// In dev the Vite proxy handles /socket.io so origin is fine.
export const DEFAULT_IOBROKER_URL = import.meta.env.DEV
    ? window.location.origin
    : `${window.location.protocol}//${window.location.hostname}:8084`;

export const useConnectionStore = create<ConnectionState>()(
    persist(
        (set) => ({
            ioBrokerUrl: DEFAULT_IOBROKER_URL,
            clientId: deviceFingerprintId(),
            clientIdPinned: false,
            clientName: '',
            deviceToken: randomToken(),
            setIoBrokerUrl: (url) => {
                invalidateDatapointCache();
                reconnectSocket(url);
                set({ ioBrokerUrl: url });
            },
            setClientName: (name) => set({ clientName: name }),
            // An explicit choice outranks the URL for the rest of this page load.
            pinClientId: (id) => {
                const clean = sanitizeClientId(id) || deviceFingerprintId();
                urlClientId = '';
                set({ clientId: clean, clientIdPinned: true });
                return clean;
            },
            splitClientId: () => {
                const fresh = hashParts([...baseFingerprintParts(), randomToken()]);
                urlClientId = '';
                set({ clientId: fresh, clientIdPinned: true });
                return fresh;
            },
        }),
        {
            name: 'aura-connection',
            // The id is persisted only once it is pinned. Until then the fingerprint
            // above provides a stable-enough seed, which also survives a cleared
            // localStorage on mobile — the reason the id was never stored before.
            // A ?client= id is never written: the device's own id stays stored instead.
            partialize: (state) => {
                const own = ownIdentity(state);
                return {
                    ioBrokerUrl: state.ioBrokerUrl,
                    clientName: state.clientName,
                    deviceToken: state.deviceToken,
                    ...(own.pinned ? { clientId: own.id, clientIdPinned: true } : {}),
                } as Partial<ConnectionState>;
            },
        },
    ),
);

// Restore what a wiped web storage lost from the cookie copy: the token, so the
// device still owns its id, and the pinned id itself. Then lay a ?client= id on top.
{
    const s = useConnectionStore.getState();
    const stored = storedConnection();
    const cookie = readDeviceCookie();
    ownClient = { id: s.clientId, pinned: s.clientIdPinned };
    if (!stored.clientIdPinned && cookie.id) ownClient = { id: cookie.id, pinned: true };
    useConnectionStore.setState({
        ...(!stored.deviceToken && cookie.token ? { deviceToken: cookie.token } : {}),
        ...(urlClientId
            ? { clientId: urlClientId, clientIdPinned: true }
            : { clientId: ownClient.id, clientIdPinned: ownClient.pinned }),
    });
}

// persist writes nothing until the first set(), and the token has to be stable from
// the very first start on, or every reload would look like a different device.
// localStorage hydrates synchronously, so this keeps a token that is already stored.
useConnectionStore.setState({ deviceToken: useConnectionStore.getState().deviceToken });

{
    const keepCookie = (s: ConnectionState) => {
        const own = ownIdentity(s);
        writeDeviceCookie(s.deviceToken, own.pinned ? own.id : '');
    };
    keepCookie(useConnectionStore.getState());
    useConnectionStore.subscribe(keepCookie);
    // Neither storage nor cookie survives a reload → a token would be new on every
    // start and the device would split off its own id each time. Without one it just
    // shares the fingerprint id, as before #844.
    if (!localStorageWorks() && readDeviceCookie().token !== useConnectionStore.getState().deviceToken) {
        useConnectionStore.setState({ deviceToken: '' });
    }
}
