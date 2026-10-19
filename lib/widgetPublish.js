'use strict';

/**
 * Widget content as datapoints (#798): the static list, the dynamic list and the
 * Statusübersicht publish what they show to aura.0.lists.<widgetId>.
 *
 *   count  number of rows
 *   items  JSON array of the rows (id, name, room, val, text, unit, lc …)
 *   text   the same as plain lines "Raum: Name (Wert)", ready for a message
 *   ts     when the content last changed
 *
 * Computed HERE, in the adapter, so a report sent at 22:00 is right with every
 * browser closed — the reason for the issue ("abends sehen, welche Fenster offen
 * sind"). Filtering, sorting and naming reuse the frontend's own code through
 * lib/shared/auraShared.js, so the rows are the ones the widget renders.
 *
 * Which rows a widget has:
 *   list / autolist  — options.entries of the stored dashboard. The dynamic list's
 *                      search stays in the browser; a new device joins once the
 *                      dashboard was opened (and the list synced) again.
 *   statusoverview   — the widget registers its candidates (status.register with
 *                      `publish: true`), the adapter evaluates their values. The
 *                      category detection needs objects, enums and roles — that
 *                      stays in the browser, see registerStatus().
 *
 * The engine is pure: values come in through update(), writes go out through the
 * injected callbacks. main.js only moves data between ioBroker and here.
 */

const shared = require('./shared/auraShared');

/** The states under aura.0.lists.<widgetId>. Read-only: the adapter is the only writer. */
const PUBLISH_STATE_DEFS = {
    count: { type: 'number', role: 'value', read: true, write: false, def: 0 },
    items: { type: 'string', role: 'json', read: true, write: false, def: '[]' },
    text: { type: 'string', role: 'text', read: true, write: false, def: '' },
    ts: { type: 'number', role: 'value.time', read: true, write: false, def: 0 },
};

const LIST_TYPES = new Set(['list', 'autolist']);
const STATUS_TYPE = 'statusoverview';
const DEFAULT_TITLES = { list: 'Statische Liste', autolist: 'Dynamische Liste', statusoverview: 'Statusübersicht' };

/** Is this widget one that publishes? */
function publishes(w) {
    return !!w && (LIST_TYPES.has(w.type) || w.type === STATUS_TYPE) && w.options && w.options.publishCount === true;
}

/** Plain title of a widget — `[[dp]]` tokens are a display feature. */
function widgetTitle(w) {
    const raw = typeof w.title === 'string' ? w.title : '';
    return shared.stripDpTokens(raw) || DEFAULT_TITLES[w.type] || 'Widget';
}

/** `common.name` as text: a translation object reads German first, like the widgets. */
function objectName(name, fallback) {
    if (!name) {
        return fallback;
    }
    if (typeof name === 'string') {
        return name;
    }
    if (typeof name === 'object') {
        return name.de || name.en || Object.values(name)[0] || fallback;
    }
    return fallback;
}

function parseJson(raw) {
    if (raw && typeof raw === 'object') {
        return raw;
    }
    if (typeof raw !== 'string' || raw.length < 2) {
        return null;
    }
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/**
 * Every publishing widget of the stored configuration.
 *
 * The three keys are config.dashboard, config.group-defs and config.popup-config as
 * stored (strings or parsed). Group children live in group-defs; the children of a
 * device card (#743) are skipped: one widget id stands for n devices there, so there
 * is no single path to publish to.
 *
 * `extra` is walked as well: the content of PIN-protected sections and tabs, which
 * the vault keeps out of config.dashboard (lib/security/dashboardVault.js).
 *
 * @param {{dashboard: unknown, groupDefs?: unknown, popupConfig?: unknown, extra?: unknown}} cfg stored config states
 * @returns {Map<string, {id: string, type: string, title: string, options: object}>} publishing widgets by id
 */
function collectWidgets(cfg) {
    const out = new Map();
    const dashboard = parseJson(cfg.dashboard);
    const groupDefsRaw = parseJson(cfg.groupDefs);
    const popupConfig = parseJson(cfg.popupConfig);
    const defs = (groupDefsRaw && ((groupDefsRaw.state && groupDefsRaw.state.defs) || groupDefsRaw.defs)) || {};

    const walk = (node, depth, visit) => {
        if (!node || typeof node !== 'object' || depth > 40) {
            return;
        }
        if (Array.isArray(node)) {
            for (const x of node) {
                walk(x, depth + 1, visit);
            }
            return;
        }
        visit(node);
        for (const v of Object.values(node)) {
            if (v && typeof v === 'object') {
                walk(v, depth + 1, visit);
            }
        }
    };

    // Defs shown by a device card, and every def nested in one of them.
    const cardDefs = new Set();
    const queue = [];
    const findCards = (n) => {
        if (n.type === 'devicecard' && n.options && typeof n.options.defId === 'string') {
            queue.push(n.options.defId);
        }
    };
    const extra = cfg.extra && typeof cfg.extra === 'object' ? cfg.extra : null;
    walk(dashboard, 0, findCards);
    walk(popupConfig, 0, findCards);
    walk(extra, 0, findCards);
    walk(defs, 0, findCards);
    while (queue.length) {
        const defId = queue.shift();
        if (cardDefs.has(defId)) {
            continue;
        }
        cardDefs.add(defId);
        for (const child of Array.isArray(defs[defId]) ? defs[defId] : []) {
            if (child && child.options && typeof child.options.defId === 'string') {
                queue.push(child.options.defId);
            }
        }
    }

    const take = (n) => {
        if (typeof n.id === 'string' && n.id && typeof n.type === 'string' && publishes(n)) {
            out.set(n.id, { id: n.id, type: n.type, title: widgetTitle(n), options: n.options });
        }
    };
    walk(dashboard, 0, take);
    walk(popupConfig, 0, take);
    walk(extra, 0, take);
    for (const [defId, children] of Object.entries(defs)) {
        if (!cardDefs.has(defId)) {
            walk(children, 0, take);
        }
    }
    return out;
}

/** The second-line datapoints a row filters on — the same sources the widgets use. */
function rowSubDps(w, entry) {
    if (w.type === 'autolist') {
        const own = (entry.subDps || []).filter((s) => s && (s.id || shared.isStampSub(s)));
        return own.length ? own : shared.resolveSubDpTemplate(w.options.subDpTemplate, entry.id);
    }
    return (entry.subDps || []).filter((s) => s && s.id);
}

/** Rows of a list: dividers kept as section markers for the static list's sort. */
function listEntries(w) {
    const entries = Array.isArray(w.options.entries) ? w.options.entries : [];
    return entries.filter((e) => e && typeof e === 'object' && (e.id || (w.type === 'list' && e.divider === true)));
}

/** "21,5 °C", "offen", "Geöffnet" — a short readable value, never formatting markup. */
function valueText(val, entry, opts, meta) {
    if (val === null || val === undefined || val === '') {
        return '';
    }
    const trueLabel = entry.trueLabel !== undefined ? entry.trueLabel : opts.trueText;
    const falseLabel = entry.falseLabel !== undefined ? entry.falseLabel : opts.falseText;
    const boolLike = typeof val === 'boolean' || (typeof val === 'number' && (val === 0 || val === 1));
    if (boolLike && (trueLabel || falseLabel)) {
        const on = val === true || val === 1;
        return (on ? trueLabel : falseLabel) || '';
    }
    if (meta && meta.states && meta.states[String(val)] !== undefined) {
        return String(meta.states[String(val)]);
    }
    if (typeof val === 'boolean') {
        const rd = shared.getRoleDisplay(meta && meta.role, val);
        if (rd) {
            return rd.label;
        }
        return val ? 'an' : 'aus';
    }
    const unit = entry.unit || (meta && meta.unit) || '';
    if (typeof val === 'number') {
        const decimals = Number.isFinite(entry.decimals) ? entry.decimals : opts.decimals;
        const num = Number.isFinite(decimals) && decimals >= 0 ? val.toFixed(Math.min(decimals, 10)) : String(val);
        return unit ? `${num} ${unit}` : num;
    }
    if (typeof val === 'object') {
        try {
            return JSON.stringify(val);
        } catch {
            return '';
        }
    }
    return unit ? `${val} ${unit}` : String(val);
}

/** One line of the `text` state: "Bad: Fenster Bad (offen)". */
function textLine(item) {
    const head = item.room ? `${item.room}: ${item.name}` : item.name;
    return item.text ? `${head} (${item.text})` : head;
}

class WidgetPublishEngine {
    /**
     * @param {object} opts
     * @param {(widgetId: string, data: {title: string, count: number, items: string, text: string, ts: number}) => void} opts.writeList
     * @param {(widgetId: string) => void} opts.removeList
     * @param {(fn: () => void) => void} [opts.defer] run fn a little later (debounce); default: at once
     * @param {{entries: (cat: string) => object[], isIgnored: (cat: string, id: string) => boolean}} [opts.latch]
     * @param {() => number} [opts.now]
     * @param {{debug: Function}} [opts.log]
     */
    constructor(opts = {}) {
        this.writeList = opts.writeList || (() => {});
        this.removeList = opts.removeList || (() => {});
        this.defer = opts.defer || ((fn) => fn());
        this.latch = opts.latch || null;
        this.now = opts.now || (() => Date.now());
        this.log = opts.log || { debug() {} };
        /** @type {Map<string, {id: string, type: string, title: string, options: object}>} */
        this.widgets = new Map();
        /** widget id → registered status candidates */
        this.status = new Map();
        /** datapoint id → {val, ts, lc} */
        this.values = new Map();
        /** datapoint id → {name, unit, role, states} */
        this.meta = new Map();
        /** object id → room names (enum.rooms members) */
        this.roomMembers = new Map();
        /** widget id → the items JSON last written */
        this.published = new Map();
        /** datapoint id → widget ids reading it */
        this.index = new Map();
        this.dirty = new Set();
        this._flushPending = false;
    }

    // ── configuration ────────────────────────────────────────────────────────

    /**
     * The publishing widgets of the stored dashboard. Widgets that are gone or no
     * longer publish lose their datapoints.
     *
     * @param {Map<string, object>} widgets from collectWidgets()
     * @returns {{removed: string[]}} widget ids whose datapoints were removed
     */
    setWidgets(widgets) {
        // A registration of a widget the stored dashboard does not know yet is kept:
        // the editor sends it as soon as the option is switched on, the save follows.
        const removed = [];
        for (const id of [...this.widgets.keys(), ...this.published.keys()]) {
            if (!widgets.has(id) && !removed.includes(id)) {
                removed.push(id);
            }
        }
        for (const id of removed) {
            this.widgets.delete(id);
            this.published.delete(id);
            this.status.delete(id);
            this.dirty.delete(id);
            this.removeList(id);
        }
        for (const [id, w] of widgets) {
            const prev = this.widgets.get(id);
            this.widgets.set(id, w);
            if (!prev || JSON.stringify(prev) !== JSON.stringify(w)) {
                this.dirty.add(id);
            }
        }
        this._rebuildIndex();
        this._scheduleFlush();
        return { removed };
    }

    /**
     * A Statusübersicht announces the datapoints it shows (status.register with
     * `publish: true`). Kept as long as the widget is in the stored dashboard —
     * unlike the remembered hints, a report must not run empty because nobody
     * opened the page for a month.
     *
     * @param {string} widgetId
     * @param {object[]} items [{id, cat, name?, room?, role?, type?, states?, min?, max?, unit?}]
     * @returns {{changed: boolean}}
     */
    registerStatus(widgetId, items) {
        const clean = (Array.isArray(items) ? items : [])
            .filter((it) => it && typeof it.id === 'string' && it.id && typeof it.cat === 'string')
            .map((it) => {
                const o = { id: it.id, cat: it.cat };
                for (const k of ['name', 'room', 'role', 'type', 'unit']) {
                    if (typeof it[k] === 'string' && it[k]) {
                        o[k] = it[k];
                    }
                }
                for (const k of ['min', 'max']) {
                    if (Number.isFinite(it[k])) {
                        o[k] = it[k];
                    }
                }
                if (it.states && typeof it.states === 'object' && !Array.isArray(it.states)) {
                    o.states = it.states;
                }
                return o;
            });
        const before = JSON.stringify(this.status.get(widgetId) || null);
        this.status.set(widgetId, clean);
        const changed = JSON.stringify(clean) !== before;
        if (changed) {
            this.dirty.add(widgetId);
            this._rebuildIndex();
            this._scheduleFlush();
        }
        return { changed };
    }

    /** Registered candidates of one Statusübersicht (what main.js persists). */
    statusItems(widgetId) {
        return this.status.get(widgetId) || null;
    }

    /** The items JSON already in ioBroker — a restart then does not touch `ts`. */
    seedPublished(widgetId, itemsJson) {
        if (typeof itemsJson === 'string') {
            this.published.set(widgetId, itemsJson);
        }
    }

    /** Object metadata of a datapoint (name, unit, role, states). */
    setMeta(id, obj) {
        const common = (obj && obj.common) || {};
        this.meta.set(id, {
            exists: !!obj,
            name: objectName(common.name, ''),
            unit: typeof common.unit === 'string' ? common.unit : '',
            role: typeof common.role === 'string' ? common.role : '',
            states: common.states && typeof common.states === 'object' ? common.states : null,
        });
        for (const w of this._widgetsReading(id)) {
            this.dirty.add(w);
        }
    }

    /** enum.rooms as member id → room names. */
    setRooms(memberRooms) {
        this.roomMembers = memberRooms instanceof Map ? memberRooms : new Map(Object.entries(memberRooms || {}));
        for (const id of this.widgets.keys()) {
            this.dirty.add(id);
        }
        this._rebuildIndex();
        this._scheduleFlush();
    }

    /**
     * After a batch of setMeta(): a name pattern may now name other datapoints
     * (`[[{{parent}}.DeviceName]]` needs the row's room or name first).
     */
    refresh() {
        this._rebuildIndex();
        this._scheduleFlush();
    }

    /** Anything about the remembered hints changed — the status widgets re-evaluate. */
    latchChanged() {
        for (const w of this.widgets.values()) {
            if (w.type === STATUS_TYPE) {
                this.dirty.add(w.id);
            }
        }
        this._scheduleFlush();
    }

    // ── values ───────────────────────────────────────────────────────────────

    /** Datapoints to subscribe. */
    watchedIds() {
        return [...this.index.keys()];
    }

    /** Datapoints whose object (name, unit, states) the rows need. */
    metaIds() {
        const out = new Set();
        for (const w of this.widgets.values()) {
            if (!LIST_TYPES.has(w.type)) {
                continue;
            }
            for (const e of listEntries(w)) {
                if (e.id && e.divider !== true) {
                    out.add(shared.splitDpRef(e.id).id);
                }
            }
        }
        return [...out];
    }

    /**
     * A watched datapoint changed.
     *
     * @param {string} id
     * @param {{val: unknown, ts?: number, lc?: number} | null} state
     */
    update(id, state) {
        const readers = this.index.get(id);
        if (!readers) {
            return;
        }
        this.values.set(id, state ? { val: state.val, ts: state.ts, lc: state.lc } : null);
        for (const w of readers) {
            this.dirty.add(w);
        }
        this._scheduleFlush();
    }

    _scheduleFlush() {
        if (this._flushPending || !this.dirty.size) {
            return;
        }
        this._flushPending = true;
        this.defer(() => {
            this._flushPending = false;
            this.flush();
        });
    }

    /** Evaluate every widget whose input changed; write the ones whose rows changed. */
    flush() {
        const ids = [...this.dirty];
        this.dirty.clear();
        for (const id of ids) {
            const w = this.widgets.get(id);
            if (!w) {
                continue;
            }
            // A Statusübersicht nobody has opened since the option went on has no
            // candidates yet — say nothing rather than a confident "0".
            if (w.type === STATUS_TYPE && !this.status.has(id)) {
                continue;
            }
            // Not before every datapoint it reads was answered once (null = no such
            // state): at start the rows would otherwise go out empty for a moment and
            // fire every script watching them.
            if (!this._ready(w)) {
                continue;
            }
            const items = this.rows(id);
            const json = JSON.stringify(items);
            if (this.published.get(id) === json) {
                continue;
            }
            this.published.set(id, json);
            this.writeList(id, {
                title: w.title,
                count: items.length,
                items: json,
                text: items.map(textLine).join('\n'),
                ts: this.now(),
            });
        }
    }

    // ── evaluation ───────────────────────────────────────────────────────────

    /** The rows a widget publishes right now. */
    rows(widgetId) {
        const w = this.widgets.get(widgetId);
        if (!w) {
            return [];
        }
        return w.type === STATUS_TYPE ? this._statusRows(w) : this._listRows(w);
    }

    _value(ref) {
        const { id, path } = shared.splitDpRef(ref);
        const st = this.values.get(id);
        if (!st) {
            return { val: null, ts: undefined, lc: undefined };
        }
        return { val: shared.resolveDpValue(st.val, path), ts: st.ts, lc: st.lc };
    }

    _rooms(ref) {
        const parts = shared.splitDpRef(ref).id.split('.');
        const rooms = new Set();
        for (let i = parts.length; i >= 2; i--) {
            for (const r of this.roomMembers.get(parts.slice(0, i).join('.')) || []) {
                rooms.add(r);
            }
        }
        return [...rooms];
    }

    _room(w, entry) {
        if (w.type === 'autolist' && Array.isArray(entry.rooms) && entry.rooms[0]) {
            return entry.rooms[0];
        }
        return this._rooms(entry.id)[0];
    }

    /** Name as the widget writes it: label → object name → last id segment, then the pattern. */
    _rawLabel(w, entry) {
        const meta = this.meta.get(shared.splitDpRef(entry.id).id);
        const base = entry.label || (meta && meta.name) || entry.id.split('.').pop() || entry.id;
        const raw = shared.formatItemName(
            { id: entry.id, name: base, room: this._room(w, entry) },
            w.options.namePattern,
            w.options.nameFilters,
        );
        return { raw, base };
    }

    _label(w, entry) {
        const { raw, base } = this._rawLabel(w, entry);
        if (!shared.hasLiveToken(raw)) {
            return raw;
        }
        const text = shared.replaceDpTokens(raw, (ref) => shared.dpValueText(this._value(ref).val));
        return shared.finishItemName(text, w.options.nameFilters, base);
    }

    _filterRow(w, entry) {
        const v = this._value(entry.id);
        return {
            id: entry.id,
            label: this._label(w, entry),
            value: v.val,
            ts: v.ts,
            lc: v.lc,
            subs: rowSubDps(w, entry).map((s) => {
                const sv = s.id ? this._value(s.id) : { val: null };
                return { id: s.id || '', label: s.label, value: sv.val, ts: sv.ts, lc: sv.lc };
            }),
        };
    }

    _listRows(w) {
        const o = w.options;
        const mode = shared.normalizeFilterMode(
            o.publishFilter !== undefined ? o.publishFilter : o.valueFilter,
            shared.buildFilterChoices(o),
        );
        const rows = [];
        for (const entry of listEntries(w)) {
            if (entry.divider === true) {
                rows.push({ divider: true });
                continue;
            }
            const row = this._filterRow(w, entry);
            if (!shared.matchesFilterMode(mode, o.filterPresets, row)) {
                continue;
            }
            rows.push({ entry, row });
        }
        // Same chain as the widget. The static list sorts inside its sections, so a
        // hand-made grouping keeps its order of sections.
        const cmp = shared.makeSortComparator(
            shared.effectiveSortRules(o),
            (r) => r.row,
            (r) => r.row.id,
        );
        const sorted = [];
        let section = [];
        const flushSection = () => {
            if (cmp) {
                section.sort(cmp);
            }
            sorted.push(...section);
            section = [];
        };
        for (const r of rows) {
            if (r.divider) {
                flushSection();
            } else {
                section.push(r);
            }
        }
        flushSection();
        return sorted.map(({ entry, row }) => {
            const meta = this.meta.get(shared.splitDpRef(entry.id).id);
            const room = this._room(w, entry);
            const unit = entry.unit || (meta && meta.unit) || '';
            const item = { id: entry.id, name: row.label, val: row.value === undefined ? null : row.value };
            if (room) {
                item.room = room;
            }
            item.text = valueText(row.value, entry, o, meta);
            if (unit) {
                item.unit = unit;
            }
            item.lc = row.lc || row.ts || null;
            return item;
        });
    }

    _statusRows(w) {
        const o = w.options;
        const showAll = o.valueFilter === 'all';
        const now = this.now();
        const latchMaps = new Map();
        const latchMap = (cat) => {
            if (!latchMaps.has(cat)) {
                const m = new Map();
                for (const e of (this.latch && this.latch.entries(cat)) || []) {
                    m.set(e.id, e);
                }
                latchMaps.set(cat, m);
            }
            return latchMaps.get(cat);
        };
        const out = [];
        for (const it of this.status.get(w.id) || []) {
            const st = this.values.get(it.id);
            if (!st) {
                continue; // no such state (yet) — the widget skips those too
            }
            const dp = {
                id: it.id,
                name: it.name || it.id.split('.').pop(),
                rooms: it.room ? [it.room] : [],
                funcs: [],
                role: it.role,
                type: it.type,
                states: it.states,
                min: it.min,
                max: it.max,
                unit: it.unit,
            };
            const val = st.val === undefined ? null : st.val;
            const lc = st.lc && st.lc > 0 ? st.lc : st.ts;
            let item;
            if (this.latch && this.latch.isIgnored(it.cat, it.id)) {
                if (!o.showIgnored) {
                    continue;
                }
                const live = shared.evaluateItem(dp, val, it.cat, o, lc, true);
                item = live ? { ...live, severity: 'ok', latch: undefined, ignored: true } : null;
            } else if (this.latch && shared.latchEnabled(o, it.cat)) {
                const live = shared.evaluateItem(dp, val, it.cat, o, lc, true);
                item = shared.applyLatch(
                    live,
                    latchMap(it.cat).get(it.id),
                    { id: it.id, name: dp.name, room: dp.rooms[0], category: it.cat },
                    showAll,
                    now,
                );
            } else {
                item = shared.evaluateItem(dp, val, it.cat, o, lc, showAll);
            }
            if (item) {
                out.push({ item, val });
            }
        }
        out.sort((a, b) => shared.compareItems(a.item, b.item, o.sortBy || 'severity'));
        return out.map(({ item, val }) => {
            // The name as the widget prints it: its name pattern over the datapoint name.
            const raw = shared.formatItemName(item, o.namePattern, o.nameFilters);
            const name = shared.hasLiveToken(raw)
                ? shared.finishItemName(
                      shared.replaceDpTokens(raw, (ref) => shared.dpValueText(this._value(ref).val)),
                      o.nameFilters,
                      item.name,
                  )
                : raw;
            const row = { id: item.id, name };
            if (item.room) {
                row.room = item.room;
            }
            row.category = item.category;
            row.severity = item.severity;
            row.text = item.label;
            row.val = val;
            row.lc = item.lc || null;
            row.latched = !!item.latch;
            row.since = (item.latch && item.latch.since) || null;
            if (item.ignored) {
                row.ignored = true;
            }
            return row;
        });
    }

    // ── index ────────────────────────────────────────────────────────────────

    _widgetRefs(w) {
        const refs = new Set();
        const add = (ref) => {
            if (ref) {
                refs.add(shared.splitDpRef(ref).id);
            }
        };
        if (w.type === STATUS_TYPE) {
            for (const it of this.status.get(w.id) || []) {
                add(it.id);
                const raw = shared.formatItemName(
                    { id: it.id, name: it.name || it.id, room: it.room },
                    w.options.namePattern,
                    w.options.nameFilters,
                );
                for (const ref of shared.dpTokenRefs(raw)) {
                    add(ref);
                }
            }
            return refs;
        }
        for (const e of listEntries(w)) {
            // A divider carries a synthetic id (divider:1) — nothing to read.
            if (!e.id || e.divider === true) {
                continue;
            }
            add(e.id);
            for (const s of rowSubDps(w, e)) {
                add(s.id);
            }
            // `[[{{parent}}.DeviceName]]` in the name pattern reads a datapoint too.
            for (const ref of shared.dpTokenRefs(this._rawLabel(w, e).raw)) {
                add(ref);
            }
        }
        return refs;
    }

    _rebuildIndex() {
        const index = new Map();
        for (const w of this.widgets.values()) {
            for (const id of this._widgetRefs(w)) {
                if (!index.has(id)) {
                    index.set(id, new Set());
                }
                index.get(id).add(w.id);
            }
        }
        this.index = index;
        for (const id of [...this.values.keys()]) {
            if (!index.has(id)) {
                this.values.delete(id);
            }
        }
    }

    _ready(w) {
        for (const id of this._widgetRefs(w)) {
            if (!this.values.has(id)) {
                return false;
            }
        }
        return true;
    }

    _widgetsReading(id) {
        return this.index.get(id) || [];
    }
}

module.exports = { WidgetPublishEngine, PUBLISH_STATE_DEFS, collectWidgets, publishes, widgetTitle, textLine };
