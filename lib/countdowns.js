'use strict';

/**
 * Countdown engine for the Countdown widget (issue #675).
 *
 * The widget publishes its configuration to aura.<inst>.countdowns.<key>.config
 * and writes commands to .cmd; the adapter runs the countdown here so it
 * survives a closed browser tab and an adapter restart. The engine is pure:
 * time and timers are injected, ioBroker writes go through two callbacks.
 *
 *   status  { state, endTs, remainingMs, durationMs }
 *     state       idle | running | paused | ended
 *     endTs       epoch ms of the end while running, else 0
 *     remainingMs frozen remaining time while paused; the full duration while
 *                 idle; 0 once ended; while running only a snapshot (the
 *                 frontend derives the live value from endTs)
 *     durationMs  the current setting — grows and shrinks with +/-/= and is the
 *                 base of the progress display
 *
 *   commands (cmd state, ack=false)
 *     start        arm with durationMs (a running countdown restarts, a paused
 *                  one resumes)
 *     pause        freeze remaining time
 *     resume       continue a paused countdown
 *     toggle       running → pause, paused → resume, else start
 *     stop         back to idle with the full duration; writes valueOnEnd when
 *                  the countdown "owns" the target (see stopWritesEnd)
 *     end          finish now: write valueOnEnd, state ended
 *     +N / -N      add or remove time — N in seconds or [h:]m:s
 *     =N           set the duration (and the remaining time) to N
 *
 * mytime's countdown datapoints use the same command vocabulary, so a script
 * that drove mytime.0.Countdowns.<n>.cmd keeps working against .countdowns.<key>.cmd.
 */

const MIN_DURATION_MS = 1000;
const MAX_DURATION_MS = 366 * 24 * 3600 * 1000;
/** setTimeout tops out at 2^31-1 ms; longer waits are armed in chunks. */
const MAX_TIMEOUT_MS = 2147483647;
const TICK_MS = 1000;

const STATES = ['idle', 'running', 'paused', 'ended'];

/** Object definitions shared by the adapter's ensure step (frontend mirrors them). */
const COUNTDOWN_STATE_DEFS = {
    config: { type: 'string', role: 'json', read: true, write: true, def: '' },
    cmd: { type: 'string', role: 'text', read: true, write: true, def: '' },
    state: { type: 'string', role: 'text', read: true, write: false, def: 'idle' },
    endTs: { type: 'number', role: 'date', read: true, write: false, def: 0 },
    remainingMs: { type: 'number', role: 'value.interval', unit: 'ms', read: true, write: false, def: 0 },
    durationMs: { type: 'number', role: 'value.interval', unit: 'ms', read: true, write: false, def: 0 },
};

/**
 * "90" → 90 s, "1:30" → 90 s, "1:00:00" → 3600 s. Returns null for anything else.
 *
 * @param text
 */
function parseSeconds(text) {
    const s = String(text ?? '').trim();
    if (s === '') {
        return null;
    }
    if (/^\d+(\.\d+)?$/.test(s)) {
        return Number(s);
    }
    if (/^\d{1,3}(:\d{1,2}){1,2}$/.test(s)) {
        const parts = s.split(':').map(Number);
        return parts.reduce((acc, n) => acc * 60 + n, 0);
    }
    return null;
}

/**
 * Parse a cmd value. Returns { kind, ms? } or null when the text is not a command.
 *
 * @param raw
 */
function parseCountdownCommand(raw) {
    const s = String(raw ?? '').trim();
    if (!s) {
        return null;
    }
    const lower = s.toLowerCase();
    if (['start', 'pause', 'resume', 'toggle', 'stop', 'end', 'reset'].includes(lower)) {
        return { kind: lower === 'reset' ? 'stop' : lower };
    }
    const m = s.match(/^([+\-=])\s*(.+)$/);
    if (!m) {
        return null;
    }
    const secs = parseSeconds(m[2]);
    if (secs == null || !Number.isFinite(secs)) {
        return null;
    }
    const ms = Math.round(secs * 1000);
    if (m[1] === '=') {
        return { kind: 'set', ms };
    }
    return { kind: 'add', ms: m[1] === '-' ? -ms : ms };
}

function clampDuration(ms) {
    if (!Number.isFinite(ms)) {
        return MIN_DURATION_MS;
    }
    return Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, Math.round(ms)));
}

/**
 * The duration a config asks for, in ms (durationSec preferred, durationMs accepted).
 *
 * @param config
 */
function durationFromConfig(config) {
    if (!config || typeof config !== 'object') {
        return 0;
    }
    if (Number.isFinite(Number(config.durationSec)) && Number(config.durationSec) > 0) {
        return clampDuration(Number(config.durationSec) * 1000);
    }
    if (Number.isFinite(Number(config.durationMs)) && Number(config.durationMs) > 0) {
        return clampDuration(Number(config.durationMs));
    }
    return 0;
}

function hasText(v) {
    return typeof v === 'string' && v.trim() !== '';
}

class CountdownEngine {
    /**
     * @param {object} deps
     * @param {() => number} [deps.now]
     * @param {(fn: () => void, ms: number) => any} [deps.setTimeout]
     * @param {(handle: any) => void} [deps.clearTimeout]
     * @param {{info: Function, warn: Function, debug?: Function}} [deps.log]
     * @param {(key: string, status: object) => Promise<void>|void} deps.writeStatus
     * @param {(dp: string, rawValue: string, why: string) => Promise<void>|void} deps.writeTarget
     * @param {(key: string, entry: object) => Promise<void>|void} [deps.onEnded]
     */
    constructor(deps) {
        this.now = deps.now || (() => Date.now());
        this._setTimeout = deps.setTimeout || ((fn, ms) => setTimeout(fn, ms));
        this._clearTimeout = deps.clearTimeout || ((h) => clearTimeout(h));
        this.log = deps.log || { info() {}, warn() {}, debug() {} };
        this.writeStatus = deps.writeStatus || (() => {});
        this.writeTarget = deps.writeTarget || (() => {});
        this.onEnded = deps.onEnded || null;
        this.entries = new Map();
    }

    get size() {
        return this.entries.size;
    }

    keys() {
        return [...this.entries.keys()];
    }

    has(key) {
        return this.entries.has(key);
    }

    /**
     * A copy of the status the adapter publishes for this key, or null.
     *
     * @param key
     */
    snapshot(key) {
        const e = this.entries.get(key);
        if (!e) {
            return null;
        }
        return { state: e.state, endTs: e.endTs, remainingMs: this._remaining(e), durationMs: e.durationMs };
    }

    config(key) {
        const e = this.entries.get(key);
        return e ? e.config : null;
    }

    _entry(key) {
        let e = this.entries.get(key);
        if (!e) {
            e = {
                key,
                config: null,
                state: 'idle',
                endTs: 0,
                remainingMs: 0,
                durationMs: 0,
                timer: null,
                ticker: null,
                pending: null,
            };
            this.entries.set(key, e);
        }
        return e;
    }

    _remaining(e) {
        if (e.state === 'running') {
            return Math.max(0, e.endTs - this.now());
        }
        return e.remainingMs;
    }

    /**
     * Take over the config state (JSON string or object). Returns true when the
     * published status changed because of it (duration edited in the editor).
     * Called on every config write — the editor republishes per keystroke — so
     * it must stay cheap and silent when nothing relevant changed.
     *
     * @param key
     * @param raw
     */
    ingestConfig(key, raw) {
        let config = null;
        if (raw != null && raw !== '') {
            try {
                config = typeof raw === 'string' ? JSON.parse(raw) : raw;
            } catch (e) {
                this.log.warn(`[countdowns] config parse error (${key}): ${e.message}`);
                config = null;
            }
        }
        const e = this._entry(key);
        const prevDuration = durationFromConfig(e.config);
        const nextDuration = durationFromConfig(config);
        const wasTicking = !!e.ticker;
        e.config = config && typeof config === 'object' ? config : null;

        let changed = false;
        // The configured duration is the setting's baseline: adopt it when it is
        // new or the admin edited it; a +/- adjustment made on the widget survives
        // config republishes that leave the duration untouched.
        if (nextDuration > 0 && (e.durationMs === 0 || nextDuration !== prevDuration)) {
            e.durationMs = nextDuration;
            if (e.state === 'idle' || e.state === 'ended') {
                e.remainingMs = e.state === 'idle' ? nextDuration : 0;
            }
            changed = true;
        }
        const shouldTick = e.state === 'running' && !!(e.config && e.config.publishRemaining);
        if (shouldTick && !wasTicking) {
            this._startTicker(e);
        }
        if (!shouldTick && wasTicking) {
            this._stopTicker(e);
        }
        if (changed) {
            this._publish(e);
        }
        return changed;
    }

    /**
     * Take over persisted status values found on disk at startup. Only used
     * before restore(); later status writes originate here and are ignored.
     *
     * @param key
     * @param partial
     */
    ingestStatus(key, partial) {
        const e = this._entry(key);
        if (!partial || typeof partial !== 'object') {
            return;
        }
        if (STATES.includes(partial.state)) {
            e.state = partial.state;
        }
        if (Number.isFinite(Number(partial.endTs))) {
            e.endTs = Math.max(0, Number(partial.endTs));
        }
        if (Number.isFinite(Number(partial.remainingMs))) {
            e.remainingMs = Math.max(0, Number(partial.remainingMs));
        }
        if (Number.isFinite(Number(partial.durationMs)) && Number(partial.durationMs) > 0) {
            e.durationMs = clampDuration(Number(partial.durationMs));
        }
    }

    /**
     * Re-arm what was running when the adapter stopped and catch up on what
     * ended in the meantime. Publishes every status once so a state that was
     * created by hand carries sane values.
     */
    async restore() {
        for (const e of this.entries.values()) {
            if (e.durationMs === 0) {
                e.durationMs = durationFromConfig(e.config);
            }
            if (e.state === 'running') {
                if (e.endTs <= this.now()) {
                    await this._finish(e, 'ended while the adapter was down');
                    continue;
                }
                this._arm(e);
                if (e.config && e.config.publishRemaining) {
                    this._startTicker(e);
                }
            } else if (e.state === 'idle') {
                e.remainingMs = e.durationMs;
            } else if (e.state === 'ended') {
                e.remainingMs = 0;
                e.endTs = 0;
            }
            await this._publish(e);
        }
    }

    /**
     * Forget a key (config object deleted).
     *
     * @param key
     */
    remove(key) {
        const e = this.entries.get(key);
        if (!e) {
            return;
        }
        this._disarm(e);
        this._stopTicker(e);
        this.entries.delete(key);
    }

    dispose() {
        for (const e of this.entries.values()) {
            this._disarm(e);
            this._stopTicker(e);
        }
    }

    /**
     * Execute a cmd value. Resolves to true when the command was understood.
     *
     * @param key
     * @param raw
     */
    async command(key, raw) {
        const cmd = parseCountdownCommand(raw);
        if (!cmd) {
            this.log.warn(`[countdowns] unknown command "${raw}" for ${key}`);
            return false;
        }
        const e = this._entry(key);
        if (e.durationMs === 0) {
            e.durationMs = durationFromConfig(e.config);
        }
        switch (cmd.kind) {
            case 'start':
                if (e.state === 'paused') {
                    await this._resume(e);
                } else {
                    await this._start(e);
                }
                return true;
            case 'resume':
                if (e.state === 'paused') {
                    await this._resume(e);
                } else if (e.state !== 'running') {
                    await this._start(e);
                }
                return true;
            case 'pause':
                if (e.state === 'running') {
                    await this._pause(e);
                }
                return true;
            case 'toggle':
                if (e.state === 'running') {
                    await this._pause(e);
                } else if (e.state === 'paused') {
                    await this._resume(e);
                } else {
                    await this._start(e);
                }
                return true;
            case 'stop':
                await this._stop(e);
                return true;
            case 'end':
                if (e.state === 'running' || e.state === 'paused') {
                    await this._finish(e, 'ended by command');
                }
                return true;
            case 'add':
                await this._adjust(e, cmd.ms);
                return true;
            case 'set':
                await this._set(e, cmd.ms);
                return true;
            default:
                return false;
        }
    }

    // ── transitions ──────────────────────────────────────────────────────────

    async _start(e) {
        if (e.durationMs < MIN_DURATION_MS) {
            this.log.warn(`[countdowns] ${e.key}: no duration configured — start ignored`);
            return;
        }
        e.endTs = this.now() + e.durationMs;
        e.remainingMs = e.durationMs;
        e.state = 'running';
        this._arm(e);
        if (e.config && e.config.publishRemaining) {
            this._startTicker(e);
        }
        await this._publish(e);
        const c = e.config || {};
        if (hasText(c.targetDp) && hasText(c.valueOnStart)) {
            await this.writeTarget(c.targetDp, c.valueOnStart, `${e.key} started`);
        }
    }

    async _pause(e) {
        e.remainingMs = Math.max(0, e.endTs - this.now());
        e.endTs = 0;
        e.state = 'paused';
        this._disarm(e);
        this._stopTicker(e);
        await this._publish(e);
    }

    async _resume(e) {
        if (e.remainingMs <= 0) {
            await this._finish(e, 'resumed with no time left');
            return;
        }
        e.endTs = this.now() + e.remainingMs;
        e.state = 'running';
        this._arm(e);
        if (e.config && e.config.publishRemaining) {
            this._startTicker(e);
        }
        await this._publish(e);
    }

    async _stop(e) {
        const wasActive = e.state === 'running' || e.state === 'paused';
        this._disarm(e);
        this._stopTicker(e);
        e.state = 'idle';
        e.endTs = 0;
        e.remainingMs = e.durationMs;
        await this._publish(e);
        const c = e.config || {};
        // A countdown that switched something on at start switches it off again
        // when it is cancelled; a pure end action is simply not fired.
        const stopWritesEnd = c.stopWritesEnd !== undefined ? !!c.stopWritesEnd : hasText(c.valueOnStart);
        if (wasActive && stopWritesEnd && hasText(c.targetDp) && hasText(c.valueOnEnd)) {
            await this.writeTarget(c.targetDp, c.valueOnEnd, `${e.key} stopped`);
        }
    }

    async _finish(e, why) {
        this._disarm(e);
        this._stopTicker(e);
        e.state = 'ended';
        e.endTs = 0;
        e.remainingMs = 0;
        await this._publish(e);
        const c = e.config || {};
        if (hasText(c.targetDp) && hasText(c.valueOnEnd)) {
            await this.writeTarget(c.targetDp, c.valueOnEnd, `${e.key} ${why}`);
        } else {
            this.log.info(`[countdowns] ${e.key} ${why}`);
        }
        if (this.onEnded) {
            try {
                await this.onEnded(e.key, e);
            } catch (err) {
                this.log.warn(`[countdowns] onEnded failed (${e.key}): ${err.message}`);
            }
        }
    }

    async _adjust(e, deltaMs) {
        if (!Number.isFinite(deltaMs) || deltaMs === 0) {
            return;
        }
        if (e.state === 'running') {
            e.durationMs = clampDuration(e.durationMs + deltaMs);
            e.endTs += deltaMs;
            if (e.endTs <= this.now()) {
                await this._finish(e, 'ended by adjustment');
                return;
            }
            this._arm(e);
            await this._publish(e);
            return;
        }
        if (e.state === 'paused') {
            e.durationMs = clampDuration(e.durationMs + deltaMs);
            e.remainingMs = e.remainingMs + deltaMs;
            if (e.remainingMs <= 0) {
                await this._finish(e, 'ended by adjustment');
                return;
            }
            await this._publish(e);
            return;
        }
        // idle / ended: change the setting for the next start
        e.durationMs = clampDuration(e.durationMs + deltaMs);
        e.remainingMs = e.durationMs;
        e.state = 'idle';
        await this._publish(e);
    }

    async _set(e, ms) {
        const next = clampDuration(ms);
        e.durationMs = next;
        if (e.state === 'running') {
            e.endTs = this.now() + next;
            this._arm(e);
        } else if (e.state === 'paused') {
            e.remainingMs = next;
        } else {
            e.remainingMs = next;
            e.state = 'idle';
        }
        await this._publish(e);
    }

    // ── timers ───────────────────────────────────────────────────────────────

    _arm(e) {
        this._disarm(e);
        const wait = e.endTs - this.now();
        if (wait <= 0) {
            // Finish asynchronously so callers never see a re-entrant transition.
            e.timer = this._setTimeout(() => {
                e.timer = null;
                void this._finish(e, 'elapsed');
            }, 0);
            return;
        }
        const chunk = Math.min(wait, MAX_TIMEOUT_MS);
        e.timer = this._setTimeout(() => {
            e.timer = null;
            if (e.state !== 'running') {
                return;
            }
            if (e.endTs - this.now() > 0) {
                this._arm(e);
            } else {
                void this._finish(e, 'elapsed');
            }
        }, chunk);
    }

    _disarm(e) {
        if (e.timer) {
            this._clearTimeout(e.timer);
            e.timer = null;
        }
    }

    _startTicker(e) {
        this._stopTicker(e);
        const tick = () => {
            if (e.state !== 'running') {
                e.ticker = null;
                return;
            }
            void this.writeStatus(e.key, { remainingMs: Math.max(0, e.endTs - this.now()) });
            e.ticker = this._setTimeout(tick, TICK_MS);
        };
        e.ticker = this._setTimeout(tick, TICK_MS);
    }

    _stopTicker(e) {
        if (e.ticker) {
            this._clearTimeout(e.ticker);
            e.ticker = null;
        }
    }

    async _publish(e) {
        const run = async () => {
            try {
                await this.writeStatus(e.key, {
                    state: e.state,
                    endTs: e.endTs,
                    remainingMs: this._remaining(e),
                    durationMs: e.durationMs,
                });
            } catch (err) {
                this.log.warn(`[countdowns] status write failed (${e.key}): ${err.message}`);
            }
        };
        // Remember the write so settle() can wait for it — ingestConfig is
        // synchronous and cannot await the publish itself.
        e.pending = run();
        await e.pending;
    }

    /** Resolve once every status write that is still in flight has landed. */
    async settle() {
        await Promise.all([...this.entries.values()].map((e) => e.pending).filter(Boolean));
    }
}

module.exports = {
    CountdownEngine,
    COUNTDOWN_STATE_DEFS,
    parseCountdownCommand,
    parseSeconds,
    durationFromConfig,
    MIN_DURATION_MS,
    MAX_DURATION_MS,
};
