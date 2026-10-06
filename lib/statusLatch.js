'use strict';

/**
 * Remembered hints for the Statusübersicht widget ("Merken", latch).
 *
 * Battery devices — HomeMatic above all — flip their LOWBAT flag to true in the
 * cold or under load and back to false a little later. The widget only shows the
 * live value, so a weak battery appears and disappears again without anybody ever
 * changing it. With the latch switched on for a category, a hint that was active
 * once stays in the list until somebody closes it ("Gewechselt" / "Quittieren").
 *
 * The state lives here in the adapter, not in a browser: every client sees the
 * same list, a reload changes nothing, and the adapter keeps watching while no
 * browser is open at all. The engine is pure — time is injected, every write goes
 * out through the callbacks — so main.js only moves values between ioBroker and it.
 *
 *   aura.<inst>.status.register        widgets announce what they watch (JSON, ack=false)
 *   aura.<inst>.status.<cat>.sources   merged registrations (JSON, ack=true)
 *   aura.<inst>.status.<cat>.list      the entries (JSON array, ack=true)
 *   aura.<inst>.status.<cat>.cmd       commands from widgets and scripts (ack=false)
 *   aura.<inst>.status.<cat>.event     last event: new | reopened | closed (JSON, ack=true)
 *
 * Commands (text, or JSON — one object or an array of them):
 *   ack:<id>              close the entry ("Gewechselt"/"Quittieren"); the
 *                         recheck window starts
 *   snooze:<id>[@days]    keep it, but "zurückgestellt bis …" (default 2 days)
 *   unsnooze:<id>         take the snooze back
 *   add:<id>[@since]      open an entry by hand / import (since = epoch ms or a date)
 *   remove:<id>           drop the entry, no recheck
 *   {"cmd":"add","id":"…","since":…,"count":3,"name":"…","room":"…"}
 *
 * `<id>` is the datapoint id, but a device id or a bare serial number works too
 * (`ack:0020da499b8f41`) — that is what an existing script keeps in its own list.
 */

const LATCH_CATEGORIES = ['battery', 'unreach', 'alarm'];

const DAY_MS = 24 * 3600 * 1000;
/** A report must be at least this much younger than the acknowledgement to reopen. */
const ACK_GRACE_MS = 10 * 60 * 1000;
/** A widget that has not re-registered for this long is forgotten (deleted widget). */
const SOURCE_TTL_MS = 30 * DAY_MS;

const DEFAULT_RECHECK_DAYS = 7;
const DEFAULT_SNOOZE_DAYS = 2;

/** Auto-close thresholds: a clear jump above the lowest value the entry has seen. */
const VOLT_JUMP_ABS = 0.3;
const VOLT_JUMP_REL = 1.25;
const PCT_MIN = 40;
const PCT_JUMP_ABS = 30;

const STATUS_STATE_DEFS = {
    list: { type: 'string', role: 'json', read: true, write: false, def: '[]' },
    cmd: { type: 'string', role: 'text', read: true, write: true, def: '' },
    event: { type: 'string', role: 'json', read: true, write: false, def: '' },
    sources: { type: 'string', role: 'json', read: true, write: false, def: '{}' },
};

/**
 * Truthy check for boolean-ish states — same rule as the widget (statusOverview.ts isOn).
 *
 * @param val
 */
function isOn(val) {
    if (val === true || val === 1) {
        return true;
    }
    if (typeof val === 'string') {
        return val !== '' && val !== '0' && val.toLowerCase() !== 'false';
    }
    return false;
}

function toNumber(val) {
    if (typeof val === 'number') {
        return Number.isFinite(val) ? val : null;
    }
    if (typeof val === 'string' && val.trim() !== '') {
        const n = parseFloat(val);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

/**
 * Whether a watched value means "needs attention". null = unknown (no value yet),
 * which never opens or touches an entry.
 *
 * @param watch {kind: 'bool'|'boolInv'|'pct', threshold?}
 * @param val
 */
function isAlert(watch, val) {
    if (val === null || val === undefined) {
        return null;
    }
    if (watch.kind === 'pct') {
        const n = toNumber(val);
        if (n === null) {
            return null;
        }
        return n <= (Number.isFinite(watch.threshold) ? watch.threshold : 20);
    }
    if (watch.kind === 'boolInv') {
        return !isOn(val);
    }
    return isOn(val);
}

/**
 * Has the level jumped clearly above the lowest value the entry has seen?
 * Volt: ≥ 0.3 V and ≥ 25 % above the minimum. Percent: ≥ 40 % and ≥ 30 points above.
 * Temperature wobble (±0.1 V) never qualifies.
 *
 * @param unit
 * @param min
 * @param level
 */
function levelJumped(unit, min, level) {
    if (!Number.isFinite(min) || !Number.isFinite(level)) {
        return false;
    }
    if (unit === '%') {
        return level >= PCT_MIN && level >= min + PCT_JUMP_ABS;
    }
    // Rounding: 1.2 + 0.3 must count as a jump of 0.3.
    return level - min >= VOLT_JUMP_ABS - 1e-9 && level >= min * VOLT_JUMP_REL - 1e-9;
}

/**
 * "ack:<id>" / "snooze:<id>@3" / JSON → [{ cmd, id, … }]. Unknown input → [].
 *
 * @param raw
 */
function parseStatusCommand(raw) {
    const s = String(raw ?? '').trim();
    if (!s) {
        return [];
    }
    if (s.startsWith('{') || s.startsWith('[')) {
        let parsed;
        try {
            parsed = JSON.parse(s);
        } catch {
            return [];
        }
        const list = Array.isArray(parsed) ? parsed : [parsed];
        return list
            .filter((c) => c && typeof c === 'object' && typeof c.cmd === 'string' && c.id != null)
            .map((c) => ({ ...c, cmd: c.cmd.toLowerCase(), id: String(c.id).trim() }))
            .filter((c) => c.id);
    }
    const m = s.match(/^(ack|snooze|unsnooze|add|remove)\s*:\s*(.+)$/i);
    if (!m) {
        return [];
    }
    const cmd = m[1].toLowerCase();
    let id = m[2].trim();
    const out = { cmd };
    const at = id.lastIndexOf('@');
    if (at > 0) {
        const extra = id.slice(at + 1).trim();
        id = id.slice(0, at).trim();
        if (cmd === 'snooze') {
            out.days = toNumber(extra);
        } else if (cmd === 'add') {
            out.since = extra;
        }
    }
    if (!id) {
        return [];
    }
    out.id = id;
    return [out];
}

/**
 * epoch ms, a numeric string or anything Date can parse → epoch ms, else null.
 *
 * @param v
 */
function toTime(v) {
    if (v === null || v === undefined || v === '') {
        return null;
    }
    if (typeof v === 'number') {
        return Number.isFinite(v) && v > 0 ? v : null;
    }
    const s = String(v).trim();
    if (/^\d+$/.test(s)) {
        const n = Number(s);
        // Seconds instead of milliseconds — scripts write both.
        return n < 1e11 ? n * 1000 : n;
    }
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : null;
}

class StatusLatchEngine {
    /**
     * @param opts
     * @param opts.now clock (ms)
     * @param opts.log ioBroker-style logger
     * @param opts.writeList (cat, entries[]) — persist + publish the list
     * @param opts.writeEvent (cat, event) — publish one event
     * @param opts.writeSources (cat, sources) — persist the registrations
     */
    constructor(opts = {}) {
        this.now = opts.now || Date.now;
        this.log = opts.log || { debug() {}, info() {}, warn() {} };
        this.writeList = opts.writeList || (() => {});
        this.writeEvent = opts.writeEvent || (() => {});
        this.writeSources = opts.writeSources || (() => {});
        /** cat → { sources, entries: Map, watch: Map, levelOf: Map, settings } */
        this.cats = new Map();
        for (const cat of LATCH_CATEGORIES) {
            this.cats.set(cat, {
                sources: {},
                entries: new Map(),
                watch: new Map(),
                levelIndex: new Map(),
                settings: { recheckDays: DEFAULT_RECHECK_DAYS, autoClose: false },
            });
        }
        /** Last level value per datapoint, so a new entry starts with a known minimum. */
        this.levels = new Map();
    }

    has(cat) {
        return this.cats.has(cat);
    }

    // ── persistence ──────────────────────────────────────────────────────────

    /**
     * Load what the adapter persisted before it stopped.
     *
     * @param cat
     * @param data {list?: string|array, sources?: string|object}
     * @param data.list
     * @param data.sources
     */
    restore(cat, { list, sources } = {}) {
        const c = this.cats.get(cat);
        if (!c) {
            return;
        }
        const parse = (v, fallback) => {
            if (v === null || v === undefined || v === '') {
                return fallback;
            }
            if (typeof v !== 'string') {
                return v;
            }
            try {
                return JSON.parse(v);
            } catch {
                return fallback;
            }
        };
        const arr = parse(list, []);
        c.entries.clear();
        if (Array.isArray(arr)) {
            for (const e of arr) {
                if (e && typeof e.id === 'string' && e.id) {
                    c.entries.set(e.id, { ...e });
                }
            }
        }
        const src = parse(sources, {});
        c.sources = src && typeof src === 'object' && !Array.isArray(src) ? src : {};
        this._rebuildWatch(cat);
    }

    // ── registration ─────────────────────────────────────────────────────────

    /**
     * A widget announces the datapoints it watches for one category.
     *
     * @param payload {source, cat, settings?, watch: [{id, kind, threshold?, name?, room?, levelId?, levelUnit?}], hash?}
     * @returns {{changed: boolean, added: string[]}} added = ids that are new to the watch list
     */
    register(payload) {
        if (!payload || typeof payload !== 'object') {
            return { changed: false, added: [] };
        }
        const cat = String(payload.cat || '');
        const c = this.cats.get(cat);
        const source = String(payload.source || '').trim();
        if (!c || !source) {
            return { changed: false, added: [] };
        }
        const before = new Set(this._allWatchedIds());
        const watch = Array.isArray(payload.watch)
            ? payload.watch
                  .filter((w) => w && typeof w.id === 'string' && w.id)
                  .map((w) => ({
                      id: w.id,
                      kind: w.kind === 'pct' || w.kind === 'boolInv' ? w.kind : 'bool',
                      ...(Number.isFinite(w.threshold) ? { threshold: w.threshold } : {}),
                      ...(w.name ? { name: String(w.name) } : {}),
                      ...(w.room ? { room: String(w.room) } : {}),
                      ...(typeof w.levelId === 'string' && w.levelId ? { levelId: w.levelId } : {}),
                      ...(w.levelUnit === '%' || w.levelUnit === 'V' ? { levelUnit: w.levelUnit } : {}),
                  }))
            : [];
        if (watch.length === 0) {
            if (!c.sources[source]) {
                return { changed: false, added: [] };
            }
            delete c.sources[source];
        } else {
            const s = payload.settings || {};
            c.sources[source] = {
                ts: this.now(),
                hash: payload.hash ? String(payload.hash) : '',
                settings: {
                    recheckDays: Number.isFinite(s.recheckDays) && s.recheckDays >= 0 ? s.recheckDays : undefined,
                    autoClose: s.autoClose === true,
                },
                watch,
            };
        }
        this._rebuildWatch(cat);
        this._resolvePending(cat);
        this.writeSources(cat, c.sources);
        const added = this._allWatchedIds().filter((id) => !before.has(id));
        return { changed: true, added };
    }

    _rebuildWatch(cat) {
        const c = this.cats.get(cat);
        c.watch.clear();
        c.levelIndex.clear();
        // Oldest first, so the most recent registration wins for an id both name.
        const sources = Object.values(c.sources)
            .filter((s) => s && Array.isArray(s.watch))
            .sort((a, b) => (a.ts || 0) - (b.ts || 0));
        let settings = { recheckDays: DEFAULT_RECHECK_DAYS, autoClose: false };
        for (const s of sources) {
            for (const w of s.watch) {
                c.watch.set(w.id, w);
            }
            if (s.settings) {
                settings = {
                    recheckDays: Number.isFinite(s.settings.recheckDays)
                        ? s.settings.recheckDays
                        : DEFAULT_RECHECK_DAYS,
                    autoClose: s.settings.autoClose === true,
                };
            }
        }
        c.settings = settings;
        for (const w of c.watch.values()) {
            const levelId = w.levelId || (w.kind === 'pct' ? w.id : null);
            if (!levelId) {
                continue;
            }
            const list = c.levelIndex.get(levelId) || [];
            list.push(w.id);
            c.levelIndex.set(levelId, list);
        }
    }

    _allWatchedIds() {
        const ids = new Set();
        for (const c of this.cats.values()) {
            for (const w of c.watch.values()) {
                ids.add(w.id);
                if (w.levelId) {
                    ids.add(w.levelId);
                }
            }
        }
        return [...ids];
    }

    /** Every foreign id the adapter has to subscribe (alert and level datapoints). */
    watchedIds() {
        return this._allWatchedIds();
    }

    /** The voltage/percent datapoints among them (read first at start-up). */
    levelIds() {
        const ids = new Set();
        for (const c of this.cats.values()) {
            for (const id of c.levelIndex.keys()) {
                ids.add(id);
            }
        }
        return [...ids];
    }

    // ── value updates ────────────────────────────────────────────────────────

    /**
     * A watched datapoint changed (or its value was read at start-up).
     *
     * @param id
     * @param state {val, ts, lc}
     */
    update(id, state) {
        if (!state) {
            return;
        }
        const num = toNumber(state.val);
        if (num !== null) {
            this.levels.set(id, num);
        }
        for (const [cat, c] of this.cats) {
            const dirty = { list: false };
            const levelOwners = c.levelIndex.get(id);
            if (levelOwners && num !== null) {
                for (const owner of levelOwners) {
                    this._onLevel(cat, c, owner, num, dirty);
                }
            }
            const w = c.watch.get(id);
            if (w) {
                this._onValue(cat, c, w, state, dirty);
            }
            if (dirty.list) {
                this._flush(cat);
            }
        }
    }

    _unitOf(w) {
        if (w.kind === 'pct') {
            return '%';
        }
        return w.levelUnit || (w.levelId ? 'V' : null);
    }

    _levelOf(w) {
        const levelId = w.levelId || (w.kind === 'pct' ? w.id : null);
        if (!levelId) {
            return null;
        }
        const v = this.levels.get(levelId);
        return Number.isFinite(v) ? v : null;
    }

    _expired(c, e) {
        if (!e.ackedAt) {
            return false;
        }
        return this.now() > e.ackedAt + c.settings.recheckDays * DAY_MS;
    }

    _onValue(cat, c, w, state, dirty) {
        const alert = isAlert(w, state.val);
        if (alert === null) {
            return;
        }
        const ts = Number.isFinite(state.ts) && state.ts > 0 ? state.ts : this.now();
        let e = c.entries.get(w.id);
        if (e && this._expired(c, e)) {
            c.entries.delete(w.id);
            e = undefined;
            dirty.list = true;
        }
        if (!alert) {
            // The point of the whole thing: back to "ok" does NOT close the entry.
            if (e && !e.ackedAt && e.active) {
                e.active = false;
                dirty.list = true;
            }
            return;
        }
        if (!e) {
            const lc = Number.isFinite(state.lc) && state.lc > 0 ? state.lc : ts;
            e = {
                id: w.id,
                name: w.name || w.id,
                ...(w.room ? { room: w.room } : {}),
                since: Math.min(lc, ts),
                last: ts,
                count: 1,
                active: true,
                snoozedUntil: null,
                ackedAt: null,
            };
            this._seedLevel(e, w);
            c.entries.set(w.id, e);
            dirty.list = true;
            this._event(cat, 'new', e);
            return;
        }
        if (e.ackedAt) {
            // Recheck: only a report clearly AFTER the acknowledgement counts. A device
            // that has not sent anything since the battery change still carries its
            // old "low" value — that must not reopen the entry at once.
            if (ts < e.ackedAt + ACK_GRACE_MS) {
                return;
            }
            const prevAck = e.ackedAt;
            e.reopenedAfter = prevAck;
            e.ackedAt = null;
            e.closedBy = undefined;
            e.since = ts;
            e.last = ts;
            e.count = (e.count || 0) + 1;
            e.active = true;
            e.snoozedUntil = null;
            delete e.minLevel;
            this._seedLevel(e, w);
            dirty.list = true;
            this._event(cat, 'reopened', e, { ackedAt: prevAck });
            return;
        }
        if (!e.active) {
            // Rising edge on an open entry: it reported again.
            e.active = true;
            e.last = ts;
            e.count = (e.count || 0) + 1;
            dirty.list = true;
        }
        if (w.name && e.name !== w.name) {
            e.name = w.name;
            dirty.list = true;
        }
    }

    _seedLevel(e, w) {
        const unit = this._unitOf(w);
        const level = this._levelOf(w);
        if (unit && level !== null) {
            e.unit = unit;
            e.minLevel = level;
        }
    }

    _onLevel(cat, c, ownerId, level, dirty) {
        const e = c.entries.get(ownerId);
        const w = c.watch.get(ownerId);
        if (!e || !w || e.ackedAt) {
            return;
        }
        const unit = this._unitOf(w);
        if (!unit) {
            return;
        }
        if (!Number.isFinite(e.minLevel) || level < e.minLevel) {
            e.minLevel = level;
            e.unit = unit;
            dirty.list = true;
            return;
        }
        if (c.settings.autoClose && levelJumped(unit, e.minLevel, level)) {
            this._close(cat, c, e, 'auto', { level });
            dirty.list = true;
        }
    }

    _close(cat, c, e, reason, extra = {}) {
        e.ackedAt = this.now();
        e.closedBy = reason;
        e.snoozedUntil = null;
        this._event(cat, 'closed', e, { reason, ...extra });
    }

    // ── commands ─────────────────────────────────────────────────────────────

    /**
     * Find the entry/watch id a command means: exact id, device prefix, or serial.
     *
     * @param c
     * @param key
     */
    _resolve(c, key) {
        if (c.entries.has(key) || c.watch.has(key)) {
            return key;
        }
        const lower = key.toLowerCase();
        const match = (id) => {
            const l = id.toLowerCase();
            return l === lower || l.startsWith(`${lower}.`) || (l.split('.')[2] || '') === lower;
        };
        for (const id of c.entries.keys()) {
            if (match(id)) {
                return id;
            }
        }
        for (const id of c.watch.keys()) {
            if (match(id)) {
                return id;
            }
        }
        return null;
    }

    /** Imported entries whose key matched nothing yet — try again with the new watch list. */
    _resolvePending(cat) {
        const c = this.cats.get(cat);
        let changed = false;
        for (const [key, e] of [...c.entries]) {
            if (!e.unresolved) {
                continue;
            }
            const lower = key.toLowerCase();
            for (const id of c.watch.keys()) {
                const l = id.toLowerCase();
                if (l.startsWith(`${lower}.`) || (l.split('.')[2] || '') === lower) {
                    c.entries.delete(key);
                    if (!c.entries.has(id)) {
                        const w = c.watch.get(id);
                        c.entries.set(id, {
                            ...e,
                            id,
                            unresolved: undefined,
                            name: e.nameGiven ? e.name : w.name || e.name,
                            room: e.room || w.room,
                        });
                    }
                    changed = true;
                    break;
                }
            }
        }
        if (changed) {
            this._flush(cat);
        }
    }

    /**
     * Run one command string (or JSON) against a category.
     *
     * @param cat
     * @param raw
     * @returns {{ok: boolean, done: number, errors: string[]}}
     */
    command(cat, raw) {
        const c = this.cats.get(cat);
        if (!c) {
            return { ok: false, done: 0, errors: [`unknown category ${cat}`] };
        }
        const cmds = parseStatusCommand(raw);
        if (!cmds.length) {
            return { ok: false, done: 0, errors: [`not a command: ${String(raw).slice(0, 80)}`] };
        }
        let done = 0;
        const errors = [];
        let dirty = false;
        for (const cmd of cmds) {
            const r = this._run(cat, c, cmd);
            if (r === true) {
                done++;
                dirty = true;
            } else if (typeof r === 'string') {
                errors.push(r);
            }
        }
        if (dirty) {
            this._flush(cat);
        }
        return { ok: errors.length === 0, done, errors };
    }

    _run(cat, c, cmd) {
        const now = this.now();
        const id = this._resolve(c, cmd.id);
        if (cmd.cmd === 'add') {
            return this._add(cat, c, id, cmd);
        }
        if (!id) {
            return `${cmd.cmd}: no entry for ${cmd.id}`;
        }
        let e = c.entries.get(id);
        if (cmd.cmd === 'ack') {
            if (!e) {
                // A live hint the adapter has no entry for yet (it just appeared):
                // close it anyway, so the recheck window covers it too.
                const w = c.watch.get(id);
                e = {
                    id,
                    name: (w && w.name) || id,
                    ...(w && w.room ? { room: w.room } : {}),
                    since: now,
                    last: now,
                    count: 1,
                    active: true,
                    snoozedUntil: null,
                    ackedAt: null,
                };
                c.entries.set(id, e);
            }
            if (e.ackedAt) {
                return false;
            }
            this._close(cat, c, e, 'ack');
            return true;
        }
        if (!e) {
            return `${cmd.cmd}: no entry for ${cmd.id}`;
        }
        if (cmd.cmd === 'snooze') {
            const days = Number.isFinite(cmd.days) && cmd.days > 0 ? cmd.days : DEFAULT_SNOOZE_DAYS;
            e.snoozedUntil = now + days * DAY_MS;
            return true;
        }
        if (cmd.cmd === 'unsnooze') {
            if (!e.snoozedUntil) {
                return false;
            }
            e.snoozedUntil = null;
            return true;
        }
        if (cmd.cmd === 'remove') {
            c.entries.delete(id);
            if (!e.ackedAt) {
                this._event(cat, 'closed', e, { reason: 'remove' });
            }
            return true;
        }
        return `unknown command ${cmd.cmd}`;
    }

    /**
     * add / import. An entry that already exists keeps its history; an earlier
     * `since` or a higher `count` from the import wins.
     *
     * @param cat
     * @param c
     * @param id
     * @param cmd
     */
    _add(cat, c, id, cmd) {
        const now = this.now();
        const since = toTime(cmd.since) || now;
        const count = Number.isFinite(cmd.count) && cmd.count > 0 ? Math.floor(cmd.count) : 1;
        const key = id || cmd.id;
        const w = id ? c.watch.get(id) : null;
        const existing = c.entries.get(key);
        if (existing && !existing.ackedAt) {
            existing.since = Math.min(existing.since || since, since);
            existing.count = Math.max(existing.count || 1, count);
            if (cmd.name) {
                existing.name = String(cmd.name);
                existing.nameGiven = true;
            }
            if (cmd.room) {
                existing.room = String(cmd.room);
            }
            return true;
        }
        const e = {
            id: key,
            name: cmd.name ? String(cmd.name) : (w && w.name) || key,
            ...(cmd.name ? { nameGiven: true } : {}),
            ...(cmd.room || (w && w.room) ? { room: String(cmd.room || w.room) } : {}),
            since,
            last: toTime(cmd.last) || since,
            count,
            // An import says "this was reported", not "this is low right now". The
            // live value sets it once the datapoint reports.
            active: cmd.active === true,
            snoozedUntil: toTime(cmd.snoozedUntil),
            ackedAt: null,
            ...(id ? {} : { unresolved: true }),
        };
        if (w) {
            this._seedLevel(e, w);
        }
        c.entries.set(key, e);
        return true;
    }

    // ── housekeeping ─────────────────────────────────────────────────────────

    /**
     * Drop closed entries whose recheck window is over, and registrations of widgets
     * that have not been seen for 30 days. Call it now and then (hourly).
     *
     * @returns {boolean} whether the watch list changed (resubscribe)
     */
    tick() {
        const now = this.now();
        let watchChanged = false;
        for (const [cat, c] of this.cats) {
            let listChanged = false;
            for (const [id, e] of [...c.entries]) {
                if (this._expired(c, e)) {
                    c.entries.delete(id);
                    listChanged = true;
                }
            }
            let srcChanged = false;
            for (const [key, s] of Object.entries(c.sources)) {
                if (!s || now - (s.ts || 0) > SOURCE_TTL_MS) {
                    delete c.sources[key];
                    srcChanged = true;
                }
            }
            if (srcChanged) {
                this._rebuildWatch(cat);
                this.writeSources(cat, c.sources);
                watchChanged = true;
            }
            if (listChanged) {
                this._flush(cat);
            }
        }
        return watchChanged;
    }

    /** Entries of one category, oldest first (the order the list state is written in). */
    entries(cat) {
        const c = this.cats.get(cat);
        if (!c) {
            return [];
        }
        return [...c.entries.values()]
            .map((e) => {
                const out = {};
                for (const [k, v] of Object.entries(e)) {
                    if (v !== undefined) {
                        out[k] = v;
                    }
                }
                return out;
            })
            .sort((a, b) => (a.since || 0) - (b.since || 0) || a.id.localeCompare(b.id));
    }

    _flush(cat) {
        this.writeList(cat, this.entries(cat));
    }

    _event(cat, type, e, extra = {}) {
        this.writeEvent(cat, {
            type,
            cat,
            id: e.id,
            name: e.name,
            ...(e.room ? { room: e.room } : {}),
            since: e.since,
            count: e.count,
            ts: this.now(),
            ...extra,
        });
    }
}

module.exports = {
    StatusLatchEngine,
    parseStatusCommand,
    isAlert,
    levelJumped,
    toTime,
    LATCH_CATEGORIES,
    STATUS_STATE_DEFS,
    ACK_GRACE_MS,
    DAY_MS,
};
