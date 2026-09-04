import { lookupDeviceName, lookupObjectName, type DatapointEntry } from '../hooks/useDatapointList';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Widget option values a detector may produce (DP ids, flags, volume bounds). */
type ConfigValue = string | number | boolean;

export interface DetectedMediaDevice {
    id: string;
    label: string;
    adapter: string;
    config: Record<string, ConfigValue>;
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
    /**
     * Maps the device root to a full set of widget option keys → DP IDs.
     *
     * `ConfigValue`, not `string`: a detector also sets plain flags (Alexa needs
     * `muteViaVolume`), and typing the map as string-only is what turned that
     * flag into the string `'true'`.
     */
    buildConfig: (root: string) => Record<string, ConfigValue>;
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
            // muteDp ist read-only bei Alexa → muteViaVolume stattdessen.
            // Echter Boolean: als String 'true' war die Option zwar wahrheitswertig
            // richtig, passte aber zu keiner Typangabe — das MCP wies jeden Schreib-
            // vorgang auf so einem Widget ab.
            muteViaVolume: true,
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

// ── Generic role-based detection ──────────────────────────────────────────────
//
// Adapters that follow the ioBroker role convention (yamaha, denon, volumio,
// squeezebox, …) describe a player completely through `common.role`, so no
// per-adapter path pattern is needed. Everything below reads only fields the
// datapoint cache already holds — no extra object reads. (issue #593)

/** Roles that live in the player channel itself: metadata and progress. */
const PLAYER_ROLES: Record<string, string> = {
    'media.title': 'titleDp',
    'media.artist': 'artistDp',
    'media.album': 'albumDp',
    'media.cover': 'coverDp',
    'media.state': 'playStateDp',
    'media.elapsed': 'mediaProgressDp',
    'media.elapsed.text': 'mediaProgressStrDp',
    'media.duration': 'mediaLengthDp',
    'media.duration.text': 'mediaLengthStrDp',
};

/** Transport buttons — the widget only writes to these, so read-only ones are skipped. */
const PLAYER_BUTTONS: Record<string, string> = {
    'button.play': 'playDp',
    'button.pause': 'pauseDp',
    'button.stop': 'stopDp',
    'button.next': 'nextDp',
    'button.prev': 'prevDp',
};

/** Anchor role: a channel without a track title is not a player. */
const ANCHOR_ROLE = 'media.title';

/** Labels adapters use for the playing state inside a `media.state` enum. */
const PLAYING_LABEL = /^\s*(play|playing|started|spielt|wiedergabe)/i;

/** titleDp plus two more player datapoints — below that it is a text state, not a player. */
const MIN_PLAYER_KEYS = 3;

const NAMESPACE_DEPTH = 2; // "yamaha.0" — never walk above the adapter instance

function parentOf(id: string): string {
    const cut = id.lastIndexOf('.');
    return cut < 0 ? '' : id.slice(0, cut);
}

function lastSegment(id: string): string {
    return id.slice(id.lastIndexOf('.') + 1);
}

function isWritable(entry: DatapointEntry): boolean {
    return entry.write !== false;
}

/** Groups every role-carrying state under its immediate parent path. */
function groupByParent(entries: DatapointEntry[]): Map<string, DatapointEntry[]> {
    const byParent = new Map<string, DatapointEntry[]>();
    for (const entry of entries) {
        if (!entry.role) continue;
        const parent = parentOf(entry.id);
        if (!parent) continue;
        const bucket = byParent.get(parent);
        if (bucket) bucket.push(entry);
        else byParent.set(parent, [entry]);
    }
    // Stable order, so a channel offering two candidates for one role always
    // resolves to the same datapoint.
    for (const bucket of byParent.values()) bucket.sort((a, b) => a.id.localeCompare(b.id));
    return byParent;
}

/**
 * Shuffle and repeat are trigger-only in the widget, but adapters commonly expose
 * the mode read-only next to a writable `…Toggle` button (yamaha does). Prefer
 * whichever of the two can actually be written, otherwise leave the button off.
 */
function pickModeDp(group: DatapointEntry[], role: string, keyword: string): string | undefined {
    const writableMode = group.find((e) => e.role === role && isWritable(e));
    if (writableMode) return writableMode.id;
    const toggle = group.find(
        (e) =>
            isWritable(e) &&
            (e.role === 'button' || (e.role?.startsWith('button.') ?? false)) &&
            lastSegment(e.id).toLowerCase().includes(keyword),
    );
    return toggle?.id;
}

/**
 * Nearest state carrying `role` at or above `root`. Only direct children of each
 * level are considered, so a receiver's own `volume` wins over both its
 * `advanced.maxVolume` and a `multiroom.zone2.volume` further down the tree.
 */
function findUpwards(byParent: Map<string, DatapointEntry[]>, root: string, role: string): DatapointEntry | undefined {
    const parts = root.split('.');
    for (let depth = parts.length; depth >= NAMESPACE_DEPTH; depth--) {
        const level = parts.slice(0, depth).join('.');
        const hit = byParent.get(level)?.find((e) => e.role === role);
        if (hit) return hit;
    }
    return undefined;
}

/**
 * Numeric `media.state` enums are not standardised — a Yamaha receiver numbers them
 * 0 = Play, 1 = Stop, 2 = Pause. When the datapoint declares its labels, pin the value
 * that means "playing" so the widget does not have to guess.
 */
function findPlayValue(entry: DatapointEntry | undefined): string | undefined {
    if (!entry?.states) return undefined;
    return Object.entries(entry.states).find(([, label]) => PLAYING_LABEL.test(label))?.[0];
}

/** "Wohnzimmer › Netzwerkplayer" — device name plus the channel that holds the player. */
function buildLabel(root: string): string {
    const device = lookupDeviceName(root);
    const channel = lookupObjectName(root);
    if (device && channel && device !== channel) return `${device} › ${channel}`;
    return device ?? channel ?? lastSegment(root);
}

/**
 * Detects players purely from roles. `taken` holds the roots already claimed by an
 * adapter-specific detector — those keep their hand-tuned config and are skipped
 * here, in both directions (a generic hit nested inside a curated root, and vice versa).
 */
function detectByRoles(entries: DatapointEntry[], taken: Set<string>): DetectedMediaDevice[] {
    const byParent = groupByParent(entries);
    const found: DetectedMediaDevice[] = [];

    for (const [root, group] of byParent) {
        if (!group.some((e) => e.role === ANCHOR_ROLE)) continue;
        if ([...taken].some((t) => t === root || root.startsWith(`${t}.`) || t.startsWith(`${root}.`))) continue;

        const config: Record<string, ConfigValue> = {};
        let playerKeys = 0;
        const claim = (key: string, dp: string) => {
            if (config[key]) return;
            config[key] = dp;
            playerKeys++;
        };

        for (const entry of group) {
            const key = entry.role ? PLAYER_ROLES[entry.role] : undefined;
            if (key) claim(key, entry.id);
        }
        for (const entry of group) {
            const key = entry.role ? PLAYER_BUTTONS[entry.role] : undefined;
            if (key && isWritable(entry)) claim(key, entry.id);
        }

        const shuffleDp = pickModeDp(group, 'media.mode.shuffle', 'shuffle');
        if (shuffleDp) claim('shuffleDp', shuffleDp);
        const repeatDp = pickModeDp(group, 'media.mode.repeat', 'repeat');
        if (repeatDp) claim('repeatDp', repeatDp);

        if (!config.titleDp || playerKeys < MIN_PLAYER_KEYS) continue;

        const playValue = findPlayValue(group.find((e) => e.id === config.playStateDp));
        if (playValue !== undefined) config.playValue = playValue;

        const volume = findUpwards(byParent, root, 'level.volume');
        if (volume) {
            config.volumeDp = volume.id;
            // Without the declared bounds the slider maps a -80.5…16.5 dB scale onto 0…100.
            if (typeof volume.min === 'number' && typeof volume.max === 'number' && volume.max > volume.min) {
                config.volumeMin = volume.min;
                config.volumeMax = volume.max;
                if (typeof volume.step === 'number' && volume.step > 0) config.volumeStep = volume.step;
            }
        }

        const mute = findUpwards(byParent, root, 'media.mute');
        if (mute && isWritable(mute)) config.muteDp = mute.id;
        else if (volume && isWritable(volume)) config.muteViaVolume = true;

        const source = findUpwards(byParent, root, 'media.input');
        if (source) config.sourceDp = source.id;

        found.push({
            id: root,
            label: buildLabel(root),
            adapter: root.split('.')[0] ?? root,
            config,
        });
    }

    return found.sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Scans the datapoint cache and returns all recognized media player devices.
 * Curated per-adapter detectors run first; everything they do not claim is derived
 * from `common.role`. Labels are initially built from the cache (fallback). Call
 * enrichDeviceLabels() afterwards to replace them with live state values.
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
    for (const device of detectByRoles(entries, new Set(found.keys()))) {
        if (!found.has(device.id)) found.set(device.id, device);
    }
    return [...found.values()];
}
