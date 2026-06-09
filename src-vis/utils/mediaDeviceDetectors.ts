import type { DatapointEntry } from '../hooks/useDatapointList';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DetectedMediaDevice {
    id: string;
    label: string;
    adapter: string;
    config: Record<string, string>;
    /** DP that holds the human-readable device name (fetched after initial scan). */
    nameDp?: string;
    /** DP that holds the serial number (shown alongside the name). */
    serialDp?: string;
}

interface DeviceDetector {
    adapter: string;
    /** Returns the device root path if this DP belongs to a known player, else null. */
    match: (dpId: string) => string | null;
    /** Fallback label built from the DP cache alone (no live state reads). */
    label: (root: string, entries: DatapointEntry[]) => string;
    /** Maps the device root to a full set of widget option keys → DP IDs. */
    buildConfig: (root: string) => Record<string, string>;
    /** Optional: DP containing the real device name (value fetched at runtime). */
    nameDp?: (root: string) => string;
    /** Optional: DP containing the serial number (value fetched at runtime). */
    serialDp?: (root: string) => string;
}

// ── Detectors ─────────────────────────────────────────────────────────────────

const DETECTORS: DeviceDetector[] = [
    // ── Amazon Alexa (ioBroker.alexa2) ──────────────────────────────────────────
    // Pattern: alexa2.{n}.Echo-Devices.{serial}.Player.*
    // Name:    alexa2.{n}.Echo-Devices.{serial}.Info.name
    {
        adapter: 'alexa2',
        match: (dpId) => {
            const m = dpId.match(/^(alexa2\.\d+\.Echo-Devices\.[^.]+\.Player)\./);
            return m?.[1] ?? null;
        },
        label: (root) => {
            // Fallback before live name is available: show serial number
            const serial = root.split('.')[3] ?? root;
            return `Alexa — ${serial}`;
        },
        nameDp: (root) => {
            // root = "alexa2.0.Echo-Devices.G0922J0624540TWT.Player"
            const base = root.split('.').slice(0, 4).join('.'); // alexa2.0.Echo-Devices.G0922J0624540TWT
            return `${base}.Info.name`;
        },
        serialDp: (root) => {
            const base = root.split('.').slice(0, 4).join('.');
            return `${base}.Info.serialNumber`;
        },
        buildConfig: (root) => ({
            titleDp: `${root}.currentTitle`,
            artistDp: `${root}.currentArtist`,
            albumDp: `${root}.currentAlbum`,
            coverDp: `${root}.mainArtUrl`,
            sourceDp: `${root}.providerName`,
            playStateDp: `${root}.currentState`,
            volumeDp: `${root}.volume`,
            // muteDp ist read-only bei Alexa → muteViaVolume stattdessen
            muteViaVolume: 'true',
            playDp: `${root}.controlPlay`,
            pauseDp: `${root}.controlPause`,
            nextDp: `${root}.controlNext`,
            prevDp: `${root}.controlPrevious`,
            shuffleDp: `${root}.controlShuffle`,
            repeatDp: `${root}.controlRepeat`,
            mediaProgressDp: `${root}.mediaProgress`,
            mediaLengthDp: `${root}.mediaLength`,
            mediaProgressStrDp: `${root}.mediaProgressStr`,
            mediaLengthStrDp: `${root}.mediaLengthStr`,
        }),
    },

    // ── Sonos (ioBroker.sonos) ───────────────────────────────────────────────────
    // Pattern: sonos.{n}.root.{ip}.*
    {
        adapter: 'sonos',
        match: (dpId) => {
            const m = dpId.match(/^(sonos\.\d+\.root\.[^.]+)\./);
            return m?.[1] ?? null;
        },
        label: (root, entries) => {
            const sample = entries.find((e) => e.id.startsWith(`${root}.`));
            if (sample) {
                const parent = sample.name.split(' › ')[0];
                if (parent && parent !== sample.name) return `Sonos — ${parent}`;
            }
            return `Sonos — ${root.split('.')[3] ?? root}`;
        },
        buildConfig: (root) => ({
            titleDp: `${root}.currentTitle`,
            artistDp: `${root}.currentArtist`,
            albumDp: `${root}.currentAlbum`,
            coverDp: `${root}.cover_url`,
            playStateDp: `${root}.state_simple`,
            volumeDp: `${root}.volume`,
            muteDp: `${root}.muted`,
            playDp: `${root}.play`,
            pauseDp: `${root}.pause`,
            nextDp: `${root}.next`,
            prevDp: `${root}.prev`,
        }),
    },

    // ── Spotify Premium (ioBroker.spotify-premium) ───────────────────────────────
    // Pattern: spotify.{n}.player.*
    {
        adapter: 'spotify-premium',
        match: (dpId) => {
            const m = dpId.match(/^(spotify\.\d+\.player)\./);
            return m?.[1] ?? null;
        },
        label: (root) => `Spotify (${root.split('.')[1] ?? '0'})`,
        buildConfig: (root) => ({
            titleDp: `${root}.title`,
            artistDp: `${root}.artist`,
            albumDp: `${root}.album`,
            coverDp: `${root}.album_cover_url`,
            playStateDp: `${root}.isPlaying`,
            volumeDp: `${root}.volume`,
            nextDp: `${root}.skipPlus`,
            prevDp: `${root}.skipMinus`,
            shuffleDp: `${root}.shuffle`,
            repeatDp: `${root}.repeat`,
        }),
    },

    // ── Kodi (ioBroker.kodi) ─────────────────────────────────────────────────────
    // Pattern: kodi.{n}.{state}  (flat namespace, one instance per device)
    {
        adapter: 'kodi',
        match: (dpId) => {
            const m = dpId.match(/^(kodi\.\d+)\.[^.]+$/);
            return m?.[1] ?? null;
        },
        label: (root, entries) => {
            const sample = entries.find((e) => e.id.startsWith(`${root}.`));
            if (sample) {
                const parent = sample.name.split(' › ')[0];
                if (parent && parent !== sample.name) return `Kodi — ${parent}`;
            }
            return `Kodi (${root.split('.')[1] ?? '0'})`;
        },
        buildConfig: (root) => ({
            titleDp: `${root}.title`,
            artistDp: `${root}.artist`,
            albumDp: `${root}.album`,
            coverDp: `${root}.thumbnail`,
            playStateDp: `${root}.state`,
            volumeDp: `${root}.volume`,
            muteDp: `${root}.muted`,
            nextDp: `${root}.next`,
            prevDp: `${root}.previous`,
        }),
    },
];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Scans the datapoint cache and returns all recognized media player devices.
 * Labels are initially built from the cache (fallback). Call enrichDeviceLabels()
 * afterwards to replace them with live state values.
 */
export function detectMediaDevices(entries: DatapointEntry[]): DetectedMediaDevice[] {
    const found = new Map<string, DetectedMediaDevice>();
    for (const entry of entries) {
        for (const detector of DETECTORS) {
            const root = detector.match(entry.id);
            if (root && !found.has(root)) {
                found.set(root, {
                    id: root,
                    label: detector.label(root, entries),
                    adapter: detector.adapter,
                    config: detector.buildConfig(root),
                    nameDp: detector.nameDp?.(root),
                    serialDp: detector.serialDp?.(root),
                });
            }
        }
    }
    return [...found.values()];
}
