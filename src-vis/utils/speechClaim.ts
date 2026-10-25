/**
 * Two helpers of the speech output (issue #834) that look past the single page.
 *
 * ServerClock — how far the server's clock is ahead of this device. An
 * announcement carries the server time of its write; to tell whether it is
 * still fresh, that has to be put on this device's clock, and a wall tablet's
 * clock can be minutes off. Every sample `serverTs - localNow` taken when a
 * state arrives is at most the true offset (the write happened before it
 * arrived), so the largest recent sample is the best estimate — and a late
 * delivery after a tab was asleep only yields a smaller one, which is ignored.
 * The estimate errs towards "fresh": an announcement is never dropped because
 * of the device's clock.
 *
 * claimAnnouncement — tabs of one browser share the client id, so for Aura they
 * are one device, and one device should say an announcement once. Every tab
 * that receives it asks; the first to ask wins. A hidden tab asks a little
 * later, so the tab someone is looking at gets it.
 */

const SAMPLE_WINDOW_MS = 30 * 60_000;
const SAMPLES_MAX = 60;

export class ServerClock {
    private samples: { at: number; off: number }[] = [];

    constructor(private now: () => number = () => Date.now()) {}

    /** A server timestamp that just arrived on this device. */
    note(serverTs: unknown): void {
        const ts = Number(serverTs);
        if (!Number.isFinite(ts) || ts <= 0) return;
        const at = this.now();
        this.samples.push({ at, off: ts - at });
        const cutoff = at - SAMPLE_WINDOW_MS;
        this.samples = this.samples.filter((s) => s.at >= cutoff).slice(-SAMPLES_MAX);
    }

    /** Server minus local clock in ms, or null before the first sample. */
    offset(): number | null {
        if (!this.samples.length) return null;
        return Math.max(...this.samples.map((s) => s.off));
    }

    /** A server timestamp on this device's clock, or undefined while the offset is unknown. */
    toLocal(serverTs: number): number | undefined {
        const off = this.offset();
        return off === null || !Number.isFinite(serverTs) ? undefined : serverTs - off;
    }
}

export const SPEECH_CLAIMS_KEY = 'aura-speech-claims';
/** How long a hidden tab leaves the visible one to claim first. */
export const HIDDEN_CLAIM_DELAY_MS = 400;
const CLAIM_KEEP_MS = 60 * 60_000;
const CLAIMS_MAX = 100;

export interface ClaimDeps {
    storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
    locks?: { request: <T>(name: string, cb: () => T | Promise<T>) => Promise<T> } | null;
    visible?: () => boolean;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
}

function browserDeps(): Required<ClaimDeps> {
    let storage: ClaimDeps['storage'] = null;
    try {
        storage = typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
        storage = null;
    }
    const locks = typeof navigator !== 'undefined' ? (navigator as { locks?: ClaimDeps['locks'] }).locks : null;
    return {
        storage,
        locks: locks ?? null,
        visible: () => typeof document === 'undefined' || document.visibilityState === 'visible',
        sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
        now: () => Date.now(),
    };
}

/**
 * Is this tab the one that plays the announcement `key`? Resolves true exactly
 * once per key across the tabs of this browser profile. Without storage (private
 * mode, blocked) every tab plays — better twice than never.
 */
export async function claimAnnouncement(key: string, deps: ClaimDeps = {}): Promise<boolean> {
    const d = { ...browserDeps(), ...deps };
    if (!d.visible()) await d.sleep(HIDDEN_CLAIM_DELAY_MS);
    const storage = d.storage;
    if (!storage) return true;

    const attempt = (): boolean => {
        try {
            const raw = storage.getItem(SPEECH_CLAIMS_KEY);
            const parsed: unknown = raw ? JSON.parse(raw) : {};
            const map: Record<string, number> =
                parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                    ? (parsed as Record<string, number>)
                    : {};
            if (map[key]) return false;
            const now = d.now();
            map[key] = now;
            const keep = Object.entries(map)
                .filter(([, at]) => typeof at === 'number' && now - at < CLAIM_KEEP_MS)
                .sort((a, b) => b[1] - a[1])
                .slice(0, CLAIMS_MAX);
            storage.setItem(SPEECH_CLAIMS_KEY, JSON.stringify(Object.fromEntries(keep)));
            return true;
        } catch {
            return true;
        }
    };

    // The lock makes read-check-write atomic across tabs; without it two tabs
    // asking in the same millisecond could both win (rare, and only means twice).
    if (d.locks) {
        try {
            return await d.locks.request(SPEECH_CLAIMS_KEY, attempt);
        } catch {
            return attempt();
        }
    }
    return attempt();
}
