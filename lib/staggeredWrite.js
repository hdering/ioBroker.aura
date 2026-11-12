'use strict';

/**
 * Staggered writes (#974): several datapoints switched one after another instead
 * of in the same millisecond — e.g. shutters whose motors would otherwise all
 * draw their start-up current at once.
 *
 * A run belongs to a key (timer widget, group action control). A new run for the
 * same key, or cancel(key), drops whatever is still pending from the previous
 * one: a late "down" must never overtake the "up" (or the stop) that followed.
 *
 * Items with delayMs 0 are written right away, in order; the rest on a timer.
 * The engine is plain — the caller hands in write() and the timer functions
 * (adapter.setTimeout keeps the handles tied to the adapter's lifetime).
 */

/** Longest accepted delay per item: 10 minutes. */
const MAX_DELAY_MS = 600000;

/**
 * Clamp a user-entered delay: non-numbers and negatives become 0, rounded to ms.
 *
 * @param {unknown} v - the raw delay
 * @returns {number} delay in ms within 0..MAX_DELAY_MS
 */
function clampDelay(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(MAX_DELAY_MS, Math.round(n));
}

/** @typedef {{ id: string, val: any, delayMs?: number }} StaggerItem */

class StaggeredWriter {
    /**
     * @param {object} opts - dependencies
     * @param {(id: string, val: any) => Promise<unknown>} opts.write - one state write
     * @param {(fn: () => void, ms: number) => any} [opts.setTimeout] - timer factory
     * @param {(h: any) => void} [opts.clearTimeout] - timer cancel
     */
    constructor({ write, setTimeout: st, clearTimeout: ct }) {
        this._write = write;
        this._setTimeout = st || ((fn, ms) => setTimeout(fn, ms));
        this._clearTimeout = ct || ((h) => clearTimeout(/** @type {any} */ (h)));
        /** @type {Map<string, Set<any>>} key → pending timer handles */
        this._pending = new Map();
    }

    /**
     * Start a run: cancels the key's pending writes, writes the immediate items
     * and schedules the delayed ones. Resolves once the immediate writes are done.
     *
     * @param {string} key - owner of the run
     * @param {StaggerItem[]} items - what to write
     * @param {(id: string, val: any) => Promise<unknown>} [write] - this run's writer (default: the constructor's)
     * @returns {Promise<number>} how many writes were scheduled for later
     */
    async run(key, items, write) {
        this.cancel(key);
        const list = (Array.isArray(items) ? items : []).filter(
            (it) => it && typeof it.id === 'string' && it.id.trim() !== '',
        );
        const handles = new Set();
        const later = [];
        const now = [];
        for (const it of list) (clampDelay(it.delayMs) > 0 ? later : now).push(it);
        if (later.length > 0) this._pending.set(key, handles);
        for (const it of later) {
            const h = this._setTimeout(() => {
                handles.delete(h);
                if (handles.size === 0 && this._pending.get(key) === handles) this._pending.delete(key);
                void this._safeWrite(it, write);
            }, clampDelay(it.delayMs));
            handles.add(h);
        }
        for (const it of now) await this._safeWrite(it, write);
        return later.length;
    }

    /**
     * Drop the key's pending writes (immediate ones already happened).
     *
     * @param {string} key - owner of the run
     * @returns {number} how many writes were dropped
     */
    cancel(key) {
        const handles = this._pending.get(key);
        if (!handles) return 0;
        this._pending.delete(key);
        for (const h of handles) this._clearTimeout(h);
        return handles.size;
    }

    /**
     * Number of writes still waiting for a key.
     *
     * @param {string} key - owner of the run
     * @returns {number} pending writes
     */
    pendingCount(key) {
        return this._pending.get(key)?.size ?? 0;
    }

    /** Drop everything (adapter unload). */
    dispose() {
        for (const key of [...this._pending.keys()]) this.cancel(key);
    }

    async _safeWrite(it, write) {
        try {
            await (write || this._write)(it.id.trim(), it.val);
        } catch {
            /* write() logs its own failures */
        }
    }
}

module.exports = { StaggeredWriter, clampDelay, MAX_DELAY_MS };
