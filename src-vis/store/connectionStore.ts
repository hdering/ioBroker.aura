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
            pinClientId: (id) => {
                const clean = sanitizeClientId(id) || deviceFingerprintId();
                set({ clientId: clean, clientIdPinned: true });
                return clean;
            },
            splitClientId: () => {
                const fresh = hashParts([...baseFingerprintParts(), randomToken()]);
                set({ clientId: fresh, clientIdPinned: true });
                return fresh;
            },
        }),
        {
            name: 'aura-connection',
            // The id is persisted only once it is pinned. Until then the fingerprint
            // above provides a stable-enough seed, which also survives a cleared
            // localStorage on mobile — the reason the id was never stored before.
            partialize: (state) =>
                ({
                    ioBrokerUrl: state.ioBrokerUrl,
                    clientName: state.clientName,
                    deviceToken: state.deviceToken,
                    ...(state.clientIdPinned ? { clientId: state.clientId, clientIdPinned: true } : {}),
                }) as Partial<ConnectionState>,
        },
    ),
);

// persist writes nothing until the first set(), and the token has to be stable from
// the very first start on, or every reload would look like a different device.
// localStorage hydrates synchronously, so this keeps a token that is already stored.
useConnectionStore.setState({ deviceToken: useConnectionStore.getState().deviceToken });

// `?client=wohnzimmer-tablet` pins a speaking id for this device and wins over
// everything else: the datapoint tree then reads aura.0.clients.wohnzimmer-tablet.*,
// which is what scripts and Blockly actually want to address.
try {
    const wanted = sanitizeClientId(new URLSearchParams(window.location.search).get('client') ?? '');
    if (wanted && wanted !== useConnectionStore.getState().clientId) {
        useConnectionStore.getState().pinClientId(wanted);
    }
} catch {
    /* no URL / no storage — keep the fingerprint */
}
