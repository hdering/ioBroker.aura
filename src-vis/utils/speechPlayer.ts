import { pickVoice, splitSpeechText, type SpeechRequest, type SpeechResult } from './speech';

/**
 * Plays announcements one after the other (issue #834).
 *
 * The queue logic is separate from the browser APIs (SpeechBackend), so it runs
 * under node with a fake backend; `browserSpeechBackend()` is the real one.
 *
 * Autoplay: browsers refuse sound until the page has seen a user gesture. A
 * refused announcement is not lost — it stays at the head of the queue, the
 * queue reports `blocked`, and `unlock()` (called from a tap) plays it.
 *
 * Expiry: an announcement is only worth playing for SPEECH_MAX_AGE_MS. Whatever
 * held it up — the autoplay block, a tab the browser put to sleep and woke an
 * hour later, Chrome holding media back in a background tab until it is shown —
 * a late one is reported `skipped` instead of "Es hat geklingelt" an hour on.
 */

/** `expired`: it only got to start after its deadline and was stopped at once. */
export type PlayOutcome = 'ended' | 'blocked' | 'interrupted' | 'error' | 'expired';

export interface SpeechBackend {
    speak(
        text: string,
        opts: { volume: number; voice?: string; lang?: string; rate?: number; pitch?: number; deadline?: number },
    ): Promise<PlayOutcome>;
    /** `deadline` (epoch ms): if the sound only starts after it, stop and resolve `expired`. */
    play(url: string, volume: number, deadline?: number): Promise<PlayOutcome>;
    /** Stop whatever is playing; the running speak/play resolves `interrupted`. */
    cancel(): void;
}

export interface QueuedSpeech {
    req: SpeechRequest;
    /** 0..100, resolved when the item was queued. */
    volume: number;
    /** Resolved sound URL for a file item. */
    url?: string;
    queuedAt: number;
    /** Epoch ms (local clock) after which it is not played any more. Absent = queuedAt + SPEECH_MAX_AGE_MS. */
    expiresAt?: number;
}

export interface SpeechQueueHooks {
    onPlaying?: (playing: boolean) => void;
    onResult?: (result: SpeechResult, item: QueuedSpeech) => void;
    onBlocked?: (blocked: boolean) => void;
}

/** More than this waiting means a script is looping; the oldest are dropped. */
export const SPEECH_QUEUE_MAX = 20;

/** An announcement older than this is not worth playing any more. */
export const SPEECH_MAX_AGE_MS = 10 * 60_000;

export function speechExpiry(item: QueuedSpeech): number {
    return item.expiresAt ?? item.queuedAt + SPEECH_MAX_AGE_MS;
}

export class SpeechQueue {
    private queue: QueuedSpeech[] = [];
    private running = false;
    private blocked = false;
    private playingReported = false;
    private current: QueuedSpeech | null = null;
    /** Bumped by interrupt/clear so a finishing item of an old run stops the loop. */
    private generation = 0;

    constructor(
        private backend: SpeechBackend,
        private hooks: SpeechQueueHooks = {},
        private now: () => number = () => Date.now(),
    ) {}

    get isBlocked(): boolean {
        return this.blocked;
    }

    get size(): number {
        return this.queue.length + (this.current ? 1 : 0);
    }

    enqueue(item: QueuedSpeech): void {
        if (item.req.interrupt) {
            this.generation += 1;
            const cur = this.current;
            const dropped = this.queue;
            this.queue = [];
            this.current = null;
            this.running = false;
            this.backend.cancel();
            if (cur) this.hooks.onResult?.('interrupted', cur);
            for (const d of dropped) this.hooks.onResult?.('interrupted', d);
            this.setBlocked(false);
        }
        this.queue.push(item);
        while (this.queue.length > SPEECH_QUEUE_MAX) {
            const old = this.queue.shift()!;
            this.hooks.onResult?.('skipped', old);
        }
        if (!this.blocked) void this.run();
    }

    /**
     * Retry after a user gesture. Must be called synchronously from the gesture's
     * event handler: the first play() of the run happens before this returns, which
     * is what the browser counts as "started by the user".
     */
    unlock(): void {
        if (!this.blocked) return;
        this.dropExpired();
        this.setBlocked(false);
        void this.run();
    }

    /** Throw away waiting announcements that are too old to still matter. */
    dropExpired(): void {
        const now = this.now();
        const keep: QueuedSpeech[] = [];
        for (const q of this.queue) {
            if (speechExpiry(q) < now) this.hooks.onResult?.('skipped', q);
            else keep.push(q);
        }
        this.queue = keep;
        if (!this.queue.length && this.blocked) this.setBlocked(false);
    }

    /** Stop and forget everything (unmount, muted). */
    clear(): void {
        this.generation += 1;
        const cur = this.current;
        this.queue = [];
        this.current = null;
        this.running = false;
        if (cur) this.backend.cancel();
        this.setBlocked(false);
        this.setPlaying(false);
    }

    private setBlocked(b: boolean): void {
        if (this.blocked === b) return;
        this.blocked = b;
        this.hooks.onBlocked?.(b);
    }

    private setPlaying(p: boolean): void {
        if (this.playingReported === p) return;
        this.playingReported = p;
        this.hooks.onPlaying?.(p);
    }

    private async run(): Promise<void> {
        if (this.running) return;
        this.running = true;
        const gen = this.generation;
        while (gen === this.generation && !this.blocked && this.queue.length) {
            const item = this.queue.shift()!;
            if (speechExpiry(item) < this.now()) {
                this.hooks.onResult?.('skipped', item);
                continue;
            }
            this.current = item;
            this.setPlaying(true);
            let outcome: PlayOutcome;
            try {
                outcome = await this.playOne(item);
            } catch {
                outcome = 'error';
            }
            if (gen !== this.generation) return; // interrupted: the new run owns the state
            this.current = null;
            if (outcome === 'blocked') {
                // Back to the head; a tap replays it.
                this.queue.unshift(item);
                this.hooks.onResult?.('blocked', item);
                this.setBlocked(true);
                break;
            }
            this.hooks.onResult?.(outcome === 'ended' ? 'played' : outcome === 'expired' ? 'skipped' : outcome, item);
        }
        if (gen === this.generation) {
            this.running = false;
            this.setPlaying(false);
        }
    }

    private playOne(item: QueuedSpeech): Promise<PlayOutcome> {
        const { req, volume } = item;
        const deadline = speechExpiry(item);
        if (req.file) return this.backend.play(item.url ?? req.file, volume, deadline);
        return this.backend.speak(req.text ?? '', {
            volume,
            deadline,
            voice: req.voice,
            lang: req.lang,
            rate: req.rate,
            pitch: req.pitch,
        });
    }
}

// ── Browser backend ─────────────────────────────────────────────────────────

/** Voices arrive asynchronously in Chrome; wait for them once, briefly. */
function loadVoices(synth: SpeechSynthesis, timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
    const now = synth.getVoices();
    if (now.length) return Promise.resolve(now);
    return new Promise((resolve) => {
        const t: { id?: ReturnType<typeof setTimeout> } = {};
        const done = () => {
            synth.removeEventListener('voiceschanged', done);
            clearTimeout(t.id);
            resolve(synth.getVoices());
        };
        t.id = setTimeout(done, timeoutMs);
        synth.addEventListener('voiceschanged', done);
    });
}

export function browserSpeechBackend(): SpeechBackend {
    let audio: HTMLAudioElement | null = null;
    let finishAudio: ((o: PlayOutcome) => void) | null = null;
    let cancelled = false;

    const speakChunk = (synth: SpeechSynthesis, u: SpeechSynthesisUtterance, chars: number, deadline?: number) =>
        new Promise<PlayOutcome>((resolve) => {
            let settled = false;
            const guard: { id?: ReturnType<typeof setTimeout> } = {};
            const settle = (o: PlayOutcome) => {
                if (settled) return;
                settled = true;
                clearTimeout(guard.id);
                resolve(o);
            };
            u.onstart = () => {
                if (deadline && Date.now() > deadline) {
                    settle('expired');
                    synth.cancel();
                }
            };
            u.onend = () => settle('ended');
            u.onerror = (e) => {
                const err = (e as SpeechSynthesisErrorEvent).error;
                if (err === 'not-allowed') settle('blocked');
                else if (err === 'interrupted' || err === 'canceled') settle('interrupted');
                else settle('error');
            };
            // Some engines never fire `end` (Chrome on Android after a voice
            // download, Safari in the background). Never let the queue hang.
            guard.id = setTimeout(
                () => {
                    synth.cancel();
                    settle('error');
                },
                15_000 + chars * 150,
            );
            synth.speak(u);
        });

    return {
        async speak(text, opts) {
            const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
            if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return 'error';
            cancelled = false;
            const lang = opts.lang || document.documentElement.lang || navigator.language;
            const chunks = splitSpeechText(text);
            if (!chunks.length) return 'ended';
            // getVoices() is synchronous when the list is there; only the very first
            // announcement may wait for it — and must not, if it is already late for
            // the gesture (the voice is a nicety, the gesture is not).
            const voices = synth.getVoices().length ? synth.getVoices() : await loadVoices(synth);
            const voice = pickVoice(voices, { voice: opts.voice, lang });
            for (const chunk of chunks) {
                if (cancelled) return 'interrupted';
                const u = new SpeechSynthesisUtterance(chunk);
                u.lang = voice?.lang ?? lang;
                if (voice) u.voice = voice;
                u.volume = Math.max(0, Math.min(1, opts.volume / 100));
                if (opts.rate) u.rate = opts.rate;
                if (opts.pitch !== undefined) u.pitch = opts.pitch;
                const o = await speakChunk(synth, u, chunk.length, opts.deadline);
                if (o !== 'ended') return cancelled ? 'interrupted' : o;
            }
            return 'ended';
        },

        play(url, volume, deadline) {
            cancelled = false;
            return new Promise<PlayOutcome>((resolve) => {
                const a = new Audio();
                audio = a;
                let settled = false;
                const settle = (o: PlayOutcome) => {
                    if (settled) return;
                    settled = true;
                    finishAudio = null;
                    if (audio === a) audio = null;
                    a.onended = a.onerror = a.onplaying = null;
                    resolve(o);
                };
                finishAudio = settle;
                a.preload = 'auto';
                a.volume = Math.max(0, Math.min(1, volume / 100));
                a.onended = () => settle('ended');
                a.onerror = () => settle('error');
                // A background tab may hold the sound back until it is shown.
                a.onplaying = () => {
                    if (deadline && Date.now() > deadline) {
                        a.pause();
                        settle('expired');
                    }
                };
                a.src = url;
                a.play().catch((e: unknown) => {
                    const name = (e as { name?: string })?.name;
                    if (name === 'NotAllowedError') settle('blocked');
                    else if (name === 'AbortError') settle('interrupted');
                    else settle('error');
                });
            });
        },

        cancel() {
            cancelled = true;
            try {
                window.speechSynthesis?.cancel();
            } catch {
                /* no speech engine */
            }
            if (audio) {
                audio.pause();
                audio.removeAttribute('src');
                audio.load();
            }
            finishAudio?.('interrupted');
        },
    };
}
