/**
 * Pure helpers for the Statusübersicht ("Home Health" / attention panel) widget.
 *
 * The widget scans the datapoint cache for a small set of "problem" categories and,
 * per live value, decides whether a datapoint currently needs attention. This module
 * holds the framework-free logic: category detection (structural, from the DP cache),
 * scope filtering, and per-value evaluation. The React widget owns discovery + live
 * subscriptions and calls into these helpers.
 *
 * Reuses conventions from listEntryDisplay (getRoleDisplay for window/door labels) and
 * StatusBadges (percent-vs-boolean battery + threshold). BATTERY sibling id fragments
 * mirror dpTemplates.BATTERY_NAMES (kept local — that const is not exported).
 */
import type { DatapointEntry } from '../hooks/useDatapointList';
import { getRoleDisplay } from './listEntryDisplay';
import type { NameFilterRule } from './nameFilter';
import type { RowPopupOptions } from './rowClickAction';

export type Severity = 'crit' | 'warn' | 'ok';
export type CategoryKey = 'battery' | 'window' | 'light' | 'unreach' | 'alarm';

// Ordered by urgency: safety alarms and open contacts first, maintenance last.
export const CATEGORY_ORDER: CategoryKey[] = ['alarm', 'window', 'unreach', 'battery', 'light'];

/** Severity colours as theme tokens so the widget adapts to every theme. */
export const SEVERITY_COLOR: Record<Severity, string> = {
    crit: 'var(--badge-crit, var(--accent-red, #ef4444))',
    warn: 'var(--badge-warn, #f59e0b)',
    ok: 'var(--badge-ok, var(--accent-green, #22c55e))',
};

/** Truthy check for boolean-ish states — mirror of the private isOn() in listEntryDisplay. */
export function isOn(val: unknown): boolean {
    if (val === true || val === 1) return true;
    if (typeof val === 'string') return val !== '' && val !== '0' && val.toLowerCase() !== 'false';
    return false;
}

/** Lower-cased id fragments that mark a boolean low-battery indicator (mirror dpTemplates). */
const LOWBAT_ID_FRAGMENTS = ['lowbat', 'low_bat', 'battery_low', 'batterylow'];

/** Lower-cased id fragments that mark a boolean unreachable/offline indicator (mirror dpTemplates). */
const UNREACH_ID_FRAGMENTS = ['unreach', 'offline'];

/** True when a role means "reachable" (online=true) rather than "unreachable" (offline=true). */
/** Roles where a truthy value means ONLINE (so offline = !value). */
function isReachableRole(r: string): boolean {
    return (
        r === 'reachable' ||
        r === 'connected' ||
        r === 'available' ||
        r.endsWith('.reachable') ||
        r.endsWith('.connected') ||
        r.endsWith('.available')
    );
}

/** Roles that mark a window/door contact directly. */
function isWindowRole(r: string): boolean {
    return r === 'sensor.window' || r === 'window' || r === 'sensor.door' || r === 'door';
}

export type ContactLevel = 'closed' | 'tilted' | 'open';

/** Word matchers for the three contact states, matched against a `common.states` label. */
const CONTACT_WORDS: Record<ContactLevel, RegExp> = {
    closed: /(closed|geschlossen|^zu$|^dicht$)/,
    tilted: /(tilted|gekippt|kipp)/,
    open: /(open|offen|geöffnet|geoeffnet)/,
};

/**
 * The contact level a datapoint's `common.states` enum maps a value to, or null when
 * the datapoint has no such enum (or the value is not part of it).
 */
function levelFromStates(dp: DatapointEntry, val: unknown): ContactLevel | null {
    const label = dp.states?.[String(val)];
    if (!label) return null;
    const l = label.toLowerCase().trim();
    // tilted first: "gekippt" must not be swallowed by a broader open/closed match.
    if (CONTACT_WORDS.tilted.test(l)) return 'tilted';
    if (CONTACT_WORDS.closed.test(l)) return 'closed';
    if (CONTACT_WORDS.open.test(l)) return 'open';
    return null;
}

/**
 * True when a datapoint carries a *tri-state* contact enum instead of a contact role:
 * rotary handles (HmIP-SRH, HM-Sec-RHS) publish role `state` with
 * `common.states` = { 0: CLOSED, 1: TILTED, 2: OPEN }, so a role check alone never
 * sees them. Detected from the state labels, so it works for every adapter using the
 * same wording. A plain closed/open enum is NOT matched — those either carry a contact
 * role already or are a thermostat's derived WINDOW_STATE, which would only duplicate
 * the real contact.
 */
export function hasContactStates(dp: DatapointEntry): boolean {
    const labels = Object.values(dp.states ?? {}).map((l) => l.toLowerCase().trim());
    if (labels.length < 2) return false;
    return (
        labels.some((l) => CONTACT_WORDS.tilted.test(l)) &&
        labels.some((l) => CONTACT_WORDS.closed.test(l) || CONTACT_WORDS.open.test(l))
    );
}

/**
 * Resolves a contact value to closed/tilted/open. The datapoint's own enum wins; without
 * one, anything that is not an explicit "closed" value counts as open — a numeric contact
 * reporting 2 (HomeMatic OPEN) must not read as closed the way a plain truthy check does.
 */
export function contactLevel(dp: DatapointEntry, val: unknown): ContactLevel {
    const fromStates = levelFromStates(dp, val);
    if (fromStates) return fromStates;
    if (val === null || val === undefined || val === false || val === 0) return 'closed';
    if (typeof val === 'string') {
        const s = val.toLowerCase().trim();
        if (s === '' || s === '0' || s === 'false' || CONTACT_WORDS.closed.test(s)) return 'closed';
        if (CONTACT_WORDS.tilted.test(s)) return 'tilted';
    }
    return 'open';
}

/** True when a role marks a smoke/fire/water/flood safety alarm. */
function isAlarmRole(r: string): boolean {
    return (
        r.startsWith('sensor.alarm') ||
        r.includes('smoke') ||
        r.includes('fire') ||
        r.includes('flood') ||
        r.includes('leak')
    );
}

function isLightFunc(label: string): boolean {
    const f = label.toLowerCase();
    return f.includes('licht') || f.includes('light') || f.includes('lamp');
}

export interface StatusOverviewOptions extends RowPopupOptions {
    // Categories (default: all on)
    catBattery?: boolean;
    catWindow?: boolean;
    catLight?: boolean;
    catUnreach?: boolean;
    catAlarm?: boolean;
    // Battery
    batteryThreshold?: number; // % (default 20)
    includeLowbatBoolean?: boolean; // also match boolean LOWBAT-style DPs (default true)
    // Lights
    lightRoleScope?: 'light' | 'all'; // 'light' = only switch.light (default); 'all' = also switch/switch.power
    lightsOnlyFunction?: boolean; // when scope 'all', require a "Licht"/"Light" function enum
    // Reachability (global escape hatch — merged from config store)
    offlineExtraPatterns?: string; // extra DP id patterns to treat as offline indicators (text or /regex/)
    offlineInvert?: boolean; // for those extra DPs: true = value FALSE means offline (reachable semantics)
    // Scope (comma-separated). Empty = no restriction.
    filterRooms?: string; // room labels
    filterFuncs?: string; // function labels
    filterAdapters?: string; // adapter.instance prefixes, e.g. "zigbee.0"
    excludeIds?: string[];
    excludeIdPatterns?: string; // comma list: plain substring or /regex/flags
    // Battery type
    batteryTypeEnabled?: boolean; // show physical battery type (· CR2032) next to low batteries
    // Display
    valueFilter?: 'alerts' | 'all'; // 'alerts' = only devices needing attention (default); 'all' = every found device
    /** Per-category highlight colour for devices in an attention state (default: per-severity). */
    categoryColors?: Partial<Record<CategoryKey, string>>;
    /** Per-category background colour for attention rows/tiles (default: tint of the highlight colour). */
    categoryBgColors?: Partial<Record<CategoryKey, string>>;
    cardMinWidth?: number; // card layout: min tile width in px (default 96)
    /** Horizontal alignment of the rows/tiles/pills (default 'left'; mainly relevant for the Minimal layout). */
    contentAlign?: 'left' | 'center' | 'right';
    namePattern?: string; // device label template, tokens <Raum> <Gerät> <DPName> <Name> <ID>
    nameFilters?: NameFilterRule[]; // text rules applied to the token values before substitution
    showTitle?: boolean; // show the widget title in the header (default true)
    showCount?: boolean; // show the hint-count chip in the header top-right (default true)
    /**
     * Cap on the rows actually rendered (0 / unset = no cap).
     *
     * The rows are discovered at runtime, so the widget's height could not be
     * planned — on a dashboard that must not scroll it had to be left out. With
     * a cap the height is known, and the "+N weitere" row says what was cut.
     * Sorting runs first, so the cap keeps the most urgent rows; the alert chip
     * keeps counting all of them.
     */
    maxRows?: number;
    showMore?: boolean; // show the "+N weitere" row when maxRows cuts the list off (default true)
    showRoom?: boolean; // show the device room next to the name (default true; layouts Standard/Kompakt/Zweizeilig)
    showSince?: boolean; // show how long a window/door has been open ("seit 5 min", default true)
    /**
     * Categories whose rows show "seit …" (default ['window']). Windows/doors count the
     * time since they opened; batteries and reachability the time since the datapoint
     * last changed. Remembered hints (latch) always show the day of their first report.
     */
    sinceCategories?: CategoryKey[];
    /**
     * Buttons at the end of a row (layouts Standard, Kompakt and Zweizeilig). Each writes a value
     * to a datapoint; placeholders from the row fill target and value.
     */
    rowActions?: StatusRowAction[];
    /** Remember weak batteries until they are closed ("Gewechselt"), even when LOWBAT goes back to false. Needs the AURA adapter. */
    latchBattery?: boolean;
    /** Remember unreachable devices until they are acknowledged ("Quittieren"). Needs the AURA adapter. */
    latchUnreach?: boolean;
    /** Remember smoke/water alarms that went off until they are acknowledged ("Quittieren"), even after the sensor is quiet again. Needs the AURA adapter. */
    latchAlarm?: boolean;
    /** Recheck after closing, in days (default 7): a new report in that time reopens the entry ("trotz Wechsel am …"). */
    latchRecheckDays?: number;
    /** How long "Später" puts an entry back, in days (default 2). */
    latchSnoozeDays?: number;
    /** Batteries: close automatically when the voltage (OPERATING_VOLTAGE) or the percent value clearly jumps up (default false). */
    latchAutoClose?: boolean;
    /** Ask before "Gewechselt"/"Quittieren" — the first tap arms the button, the second closes (default true). */
    latchConfirm?: boolean;
    autoHeight?: boolean; // size the widget to its content in the stacked/mobile view (default false)
    showOkCategories?: boolean; // also list categories with no alerts (default false)
    showAllClear?: boolean; // show the „Alles in Ordnung“ panel when nothing needs attention (default true)
    allClearText?: string;
    sortBy?: 'severity' | 'room'; // default 'severity'
}

/** One datapoint currently in an attention state. */
export interface StatusItem {
    id: string;
    name: string;
    room?: string;
    category: CategoryKey;
    severity: Severity;
    label: string; // status text, e.g. "12 %", "Geöffnet", "An"
    color: string;
    lc?: number; // last change (unix ms), for "seit …"
    // Battery-type enrichment (attached by the widget, not by evaluateItem)
    deviceId?: string;
    batteryType?: string;
    batteryQuantity?: number;
    /** Remembered-hint state, set by applyLatch when the category latches. */
    latch?: LatchInfo;
}

const HM_ADAPTERS = new Set(['hm-rpc', 'hmip', 'homematic']);

/** HomeMatic serial key (adapter.instance.serial, lowercased) — stable across channels. */
function hmSerialKey(id: string): string {
    return id.split('.').slice(0, 3).join('.').toLowerCase();
}

/**
 * Collects HomeMatic devices that are actually battery-powered: they expose an
 * OPERATING_VOLTAGE datapoint (or a value.battery). Mains-powered HomeMatic actuators
 * (HM-LC-Sw…, dimmers, …) also carry a LOWBAT flag but no voltage — so LOWBAT alone must
 * not qualify them. Returns a set of serial keys; pass it to categoryOf to gate LOWBAT.
 */
export function collectHmBatterySerials(cache: DatapointEntry[]): Set<string> {
    const set = new Set<string>();
    for (const dp of cache) {
        const adapter = dp.id.split('.')[0] ?? '';
        if (!HM_ADAPTERS.has(adapter)) continue;
        const r = (dp.role ?? '').toLowerCase();
        if (dp.id.toLowerCase().includes('operating_voltage') || r === 'value.battery') {
            set.add(hmSerialKey(dp.id));
        }
    }
    return set;
}

/**
 * Returns the category a datapoint could belong to (structural match), or null.
 * `hmBatterySerials` (from collectHmBatterySerials) gates HomeMatic LOWBAT detection so
 * mains devices are not treated as battery devices. When omitted, LOWBAT always qualifies.
 */
export function categoryOf(
    dp: DatapointEntry,
    opts: StatusOverviewOptions,
    hmBatterySerials?: Set<string>,
): CategoryKey | null {
    const r = (dp.role ?? '').toLowerCase();
    const id = dp.id.toLowerCase();

    if (opts.catAlarm !== false && isAlarmRole(r)) return 'alarm';
    if (opts.catWindow !== false) {
        if (isWindowRole(r)) return 'window';
        if (hasContactStates(dp)) return 'window';
    }
    if (opts.catUnreach !== false) {
        // Explicit user patterns win (even the sticky twin, if the user really wants it).
        if (matchesOfflineExtra(dp, opts)) return 'unreach';
        // Skip the latching STICKY_UNREACH twin — it stays true after any past outage, so it
        // would both duplicate the live UNREACH and wrongly flag currently-reachable devices.
        if (!id.includes('sticky')) {
            if (r === 'indicator.unreach' || r.endsWith('.unreach') || isReachableRole(r)) return 'unreach';
            if (dp.type === 'boolean' && UNREACH_ID_FRAGMENTS.some((f) => id.includes(f))) return 'unreach';
        }
    }
    if (opts.catBattery !== false) {
        if (r === 'value.battery' && dp.type === 'number') return 'battery';
        // LOWBAT: HomeMatic mains devices also expose it → require a real battery signal
        // (OPERATING_VOLTAGE) for HomeMatic before trusting LOWBAT.
        const isHm = HM_ADAPTERS.has(id.split('.')[0] ?? '');
        const hmOk = !isHm || !hmBatterySerials || hmBatterySerials.has(hmSerialKey(id));
        if (r === 'indicator.lowbat' || r === 'indicator.battery') return hmOk ? 'battery' : null;
        if (
            opts.includeLowbatBoolean !== false &&
            dp.type === 'boolean' &&
            LOWBAT_ID_FRAGMENTS.some((f) => id.includes(f))
        )
            return hmOk ? 'battery' : null;
    }
    if (opts.catLight !== false && matchLight(dp, opts)) return 'light';

    return null;
}

function matchLight(dp: DatapointEntry, opts: StatusOverviewOptions): boolean {
    const r = (dp.role ?? '').toLowerCase();
    if (r === 'switch.light') return true;
    if ((opts.lightRoleScope ?? 'light') === 'all' && (r === 'switch' || r === 'switch.power')) {
        if (opts.lightsOnlyFunction) return dp.funcs.some(isLightFunc);
        return true;
    }
    return false;
}

/** User-defined extra offline-indicator DPs (global escape hatch). */
function matchesOfflineExtra(dp: DatapointEntry, opts: StatusOverviewOptions): boolean {
    const patterns = splitList(opts.offlineExtraPatterns);
    return patterns.length > 0 && patterns.some((p) => matchesIdPattern(dp.id, p));
}

function splitList(csv?: string): string[] {
    return (csv ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

function matchesIdPattern(id: string, pattern: string): boolean {
    const p = pattern.trim();
    if (!p) return false;
    if (p.startsWith('/')) {
        const lastSlash = p.lastIndexOf('/');
        const body = p.slice(1, lastSlash > 0 ? lastSlash : undefined);
        const flags = lastSlash > 0 ? p.slice(lastSlash + 1) : 'i';
        try {
            return new RegExp(body, flags || 'i').test(id);
        } catch {
            return false;
        }
    }
    return id.toLowerCase().includes(p.toLowerCase());
}

/** Applies the user's scope + exclusion filters to a candidate datapoint. */
export function passesScope(dp: DatapointEntry, opts: StatusOverviewOptions): boolean {
    if (opts.excludeIds?.includes(dp.id)) return false;

    const excludePatterns = splitList(opts.excludeIdPatterns);
    if (excludePatterns.some((p) => matchesIdPattern(dp.id, p))) return false;

    const rooms = splitList(opts.filterRooms);
    if (rooms.length && !dp.rooms.some((r) => rooms.includes(r))) return false;

    const funcs = splitList(opts.filterFuncs);
    if (funcs.length && !dp.funcs.some((f) => funcs.includes(f))) return false;

    const adapters = splitList(opts.filterAdapters);
    if (adapters.length) {
        const dot2 = dp.id.indexOf('.', dp.id.indexOf('.') + 1);
        const prefix = dot2 !== -1 ? dp.id.slice(0, dot2) : dp.id;
        if (!adapters.some((a) => prefix === a || dp.id.startsWith(a))) return false;
    }
    return true;
}

/**
 * Given a candidate's category and its live value, returns a StatusItem.
 * By default only devices needing attention are returned (null otherwise). Pass
 * `includeOk` to also return healthy devices (severity 'ok') — used by the "show all"
 * value filter. The OK color is muted; the widget applies the alert highlight colour.
 */
export function evaluateItem(
    dp: DatapointEntry,
    val: unknown,
    cat: CategoryKey,
    opts: StatusOverviewOptions,
    lc?: number,
    includeOk = false,
): StatusItem | null {
    const base = { id: dp.id, name: dp.name, room: dp.rooms[0], category: cat, lc };
    const OK = 'var(--text-secondary)';
    const ok = (label: string): StatusItem | null => (includeOk ? { ...base, severity: 'ok', label, color: OK } : null);

    if (cat === 'battery') {
        const r = (dp.role ?? '').toLowerCase();
        const isPercent = r === 'value.battery' || dp.type === 'number';
        if (isPercent) {
            const num = typeof val === 'number' ? val : parseFloat(String(val ?? ''));
            if (isNaN(num)) return ok('–');
            if (num > (opts.batteryThreshold ?? 20)) return ok(`${Math.round(num)} %`);
            return { ...base, severity: 'warn', label: `${Math.round(num)} %`, color: SEVERITY_COLOR.warn };
        }
        if (!isOn(val)) return ok('OK'); // boolean LOWBAT: truthy = low
        return { ...base, severity: 'warn', label: 'schwach', color: SEVERITY_COLOR.warn };
    }

    if (cat === 'window') {
        const level = contactLevel(dp, val);
        // Role labels stay in charge of the wording ("Geöffnet" for a door role), but they
        // are asked with the resolved level — getRoleDisplay's own truthy check would read
        // a numeric 2 (OPEN) as closed.
        const rd = getRoleDisplay(dp.role, level !== 'closed');
        if (level === 'closed')
            return includeOk ? { ...base, severity: 'ok', label: rd?.label ?? 'Geschlossen', color: OK } : null;
        if (level === 'tilted') return { ...base, severity: 'warn', label: 'Gekippt', color: SEVERITY_COLOR.warn };
        return { ...base, severity: 'crit', label: rd?.label ?? 'Offen', color: rd?.color ?? SEVERITY_COLOR.crit };
    }

    if (cat === 'light') {
        if (!isOn(val)) return ok('Aus');
        return { ...base, severity: 'warn', label: 'An', color: SEVERITY_COLOR.warn };
    }

    if (cat === 'unreach') {
        const r = (dp.role ?? '').toLowerCase();
        // Reachable/connected/available roles → true means online. User extra-pattern DPs
        // follow offlineInvert (true = value FALSE means offline). Everything else (UNREACH,
        // offline indicators) → true means offline.
        const reachSemantics = isReachableRole(r) || (opts.offlineInvert === true && matchesOfflineExtra(dp, opts));
        const offline = reachSemantics ? !isOn(val) : isOn(val);
        if (!offline) return ok('Online');
        return { ...base, severity: 'warn', label: 'Offline', color: SEVERITY_COLOR.warn };
    }

    if (cat === 'alarm') {
        const rd = getRoleDisplay(dp.role, val);
        if (!isOn(val)) return includeOk ? { ...base, severity: 'ok', label: rd?.label ?? 'OK', color: OK } : null;
        return { ...base, severity: 'crit', label: rd?.label ?? 'Alarm!', color: rd?.color ?? SEVERITY_COLOR.crit };
    }

    return null;
}

/**
 * True while the widget must not claim a verdict yet: the datapoint scan is still
 * running, or values are still missing. Over a slow (external) connection both take a
 * moment, and "Alles in Ordnung" during that window is simply wrong — it flips to open
 * windows and weak batteries the second the data lands.
 *
 * `settled` is the grace-period escape hatch: a getState reply lost on a flaky
 * connection would otherwise keep the widget loading forever.
 */
export function isStatusLoading(p: {
    discovered: boolean;
    settled: boolean;
    loaded: number;
    expected: number;
}): boolean {
    if (!p.discovered) return true;
    return !p.settled && p.loaded < p.expected;
}

const SEVERITY_RANK: Record<Severity, number> = { crit: 0, warn: 1, ok: 2 };

/** Sort comparator for status items: by severity (crit first) then name, or by room then name. */
export function compareItems(a: StatusItem, b: StatusItem, sortBy: 'severity' | 'room'): number {
    if (sortBy === 'room') {
        const ra = a.room ?? '￿';
        const rb = b.room ?? '￿';
        if (ra !== rb) return ra.localeCompare(rb, 'de');
        return a.name.localeCompare(b.name, 'de');
    }
    if (a.severity !== b.severity) return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    return a.name.localeCompare(b.name, 'de');
}

// ── Row actions ─────────────────────────────────────────────────────────────

/** One button in a row of the Statusübersicht. */
export interface StatusRowAction {
    label: string; // button text
    targetDp: string; // datapoint to write — placeholders {id} {device} {serial} {name} {room} allowed
    value: string; // value to write, same placeholders; "true"/"false" and plain numbers are written typed
    categories?: CategoryKey[]; // only rows of these categories (unset/empty = every row)
    confirm?: boolean; // ask first: the first tap arms the button, the second writes (default false)
    confirmLabel?: string; // text of the armed button (default "Wirklich?")
}

/** Values a row hands to the {…} placeholders of a row action. */
export interface RowTemplateCtx {
    id: string;
    device: string;
    name: string;
    room?: string;
}

/**
 * Device id without channel and datapoint — the fallback when no device object is
 * known: adapter.instance.device (`hm-rpc.1.0020DA499B8F41.0.LOW_BAT` →
 * `hm-rpc.1.0020DA499B8F41`).
 */
export function deviceIdFallback(id: string): string {
    const parts = id.split('.');
    return parts.slice(0, Math.min(3, Math.max(1, parts.length - 1))).join('.');
}

/** Fills {id} {device} {serial} {name} {room} in a row-action template. */
export function fillRowTemplate(tpl: string, ctx: RowTemplateCtx): string {
    const serial = ctx.device.split('.').pop() ?? '';
    return tpl.replace(/\{(id|device|serial|name|room)\}/g, (_, k: string) => {
        switch (k) {
            case 'id':
                return ctx.id;
            case 'device':
                return ctx.device;
            case 'serial':
                return serial;
            case 'name':
                return ctx.name;
            default:
                return ctx.room ?? '';
        }
    });
}

/** "true"/"false" → boolean, a plain number → number, anything else stays text. */
export function typedActionValue(raw: string): boolean | number | string {
    const s = raw.trim();
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    return raw;
}

/**
 * Ready-made row buttons the editor offers ("Vorlage hinzufügen"). `{id}` as target
 * writes the row's own datapoint, so "Licht aus" works as it is; the other two write
 * to a datapoint of the user's own (`needsDp`) that the editor asks to adjust.
 */
export const ROW_ACTION_PRESETS: {
    key: string;
    title: string;
    hint: string;
    needsDp: boolean;
    action: StatusRowAction;
}[] = [
    {
        key: 'light-off',
        title: 'Licht aus',
        hint: 'Schaltet das Licht der Zeile aus (schreibt false in seinen eigenen Datenpunkt).',
        needsDp: false,
        action: { label: 'Aus', targetDp: '{id}', value: 'false', categories: ['light'] },
    },
    {
        key: 'window-remind',
        title: 'Fenster: Erinnern',
        hint: 'Schreibt „<Name> (<Raum>) ist offen“ in einen eigenen Datenpunkt – z. B. für ein Skript, das später erinnert.',
        needsDp: true,
        action: {
            label: 'Erinnern',
            targetDp: '0_userdata.0.Erinnerung',
            value: '{name} ({room}) ist offen',
            categories: ['window'],
        },
    },
    {
        key: 'battery-script',
        title: 'Batterie: an Skript melden',
        hint: 'Meldet „gewechselt:<Seriennummer>“ an ein eigenes Batterie-Skript. Mit der Merkliste nicht nötig – dort gibt es „Gewechselt“ schon.',
        needsDp: true,
        action: {
            label: 'Gewechselt',
            targetDp: '0_userdata.0.Batterien.Befehl',
            value: 'gewechselt:{serial}',
            categories: ['battery'],
            confirm: true,
        },
    },
];

/** The row actions that apply to one category. */
export function actionsFor(actions: StatusRowAction[] | undefined, cat: CategoryKey): StatusRowAction[] {
    return (actions ?? []).filter(
        (a) => a && a.label && a.targetDp && (!a.categories?.length || a.categories.includes(cat)),
    );
}

// ── Remembered hints (latch) ────────────────────────────────────────────────
// The adapter keeps the entries (lib/statusLatch.js); the widget announces what it
// watches and merges the entries into its live rows.

/** Categories the adapter can remember. */
export const LATCH_CATEGORIES: CategoryKey[] = ['battery', 'unreach', 'alarm'];

/** One entry of aura.0.status.<cat>.list — mirror of the engine's entry. */
export interface LatchEntry {
    id: string;
    name?: string;
    room?: string;
    since?: number;
    last?: number;
    count?: number;
    active?: boolean;
    snoozedUntil?: number | null;
    ackedAt?: number | null;
    closedBy?: string;
    reopenedAfter?: number;
    minLevel?: number;
    unit?: string;
    unresolved?: boolean;
}

/** What a row shows of its remembered entry. */
export interface LatchInfo {
    since?: number;
    count: number;
    active: boolean;
    snoozedUntil?: number;
    reopenedAfter?: number;
    /** Lowest level the adapter saw while the entry is open (voltage or percent). */
    level?: number;
    unit?: string;
}

/** What the widget hands the adapter per watched datapoint. */
export interface LatchWatch {
    id: string;
    kind: 'bool' | 'boolInv' | 'pct';
    threshold?: number;
    name?: string;
    room?: string;
    levelId?: string;
    levelUnit?: 'V' | '%';
}

export function latchEnabled(opts: StatusOverviewOptions, cat: CategoryKey): boolean {
    if (cat === 'battery') return opts.latchBattery === true && opts.catBattery !== false;
    if (cat === 'unreach') return opts.latchUnreach === true && opts.catUnreach !== false;
    if (cat === 'alarm') return opts.latchAlarm === true && opts.catAlarm !== false;
    return false;
}

/** The parsed list state, keyed by datapoint id. Garbage → empty. */
export function parseLatchList(val: unknown): Map<string, LatchEntry> {
    const out = new Map<string, LatchEntry>();
    let arr: unknown = val;
    if (typeof val === 'string') {
        try {
            arr = JSON.parse(val);
        } catch {
            return out;
        }
    }
    if (!Array.isArray(arr)) return out;
    for (const e of arr) {
        if (e && typeof e === 'object' && typeof (e as LatchEntry).id === 'string') out.set((e as LatchEntry).id, e);
    }
    return out;
}

/**
 * How the adapter has to read a candidate: a percent value against the threshold, a
 * boolean where true = problem, or a reachable-style boolean where false = problem.
 */
export function latchKind(dp: DatapointEntry, cat: CategoryKey, opts: StatusOverviewOptions): LatchWatch['kind'] {
    const r = (dp.role ?? '').toLowerCase();
    if (cat === 'battery') return r === 'value.battery' || dp.type === 'number' ? 'pct' : 'bool';
    if (cat === 'unreach') {
        const reach = isReachableRole(r) || (opts.offlineInvert === true && matchesOfflineExtra(dp, opts));
        return reach ? 'boolInv' : 'bool';
    }
    return 'bool';
}

/**
 * The voltage or percent datapoint next to a boolean low-battery flag, so the adapter
 * can tell a real battery change from a flag that only went quiet:
 * OPERATING_VOLTAGE in the same channel, else anywhere under the same device, else a
 * value.battery under the same device.
 */
export function findBatteryLevelDp(
    dp: DatapointEntry,
    cache: DatapointEntry[],
): { id: string; unit: 'V' | '%' } | null {
    const r = (dp.role ?? '').toLowerCase();
    if (r === 'value.battery' || dp.type === 'number') return null; // the value itself is the level
    const parent = dp.id.slice(0, dp.id.lastIndexOf('.'));
    const device = deviceIdFallback(dp.id);
    let sameDevice: string | null = null;
    let pct: string | null = null;
    for (const c of cache) {
        if (c.id === dp.id || !c.id.startsWith(`${device}.`)) continue;
        const lid = c.id.toLowerCase();
        if (lid.endsWith('.operating_voltage')) {
            if (c.id.startsWith(`${parent}.`)) return { id: c.id, unit: 'V' };
            sameDevice ??= c.id;
        } else if ((c.role ?? '').toLowerCase() === 'value.battery' && c.type === 'number') {
            pct ??= c.id;
        }
    }
    if (sameDevice) return { id: sameDevice, unit: 'V' };
    if (pct) return { id: pct, unit: '%' };
    return null;
}

/**
 * Merges a remembered entry into the row the live value produced.
 *
 * `live` is evaluateItem's answer WITH includeOk — the healthy row is needed to show a
 * remembered entry whose datapoint went quiet. Returns the row to show, or null.
 *
 *   no entry            → the live row as before (alerts only unless showAll)
 *   closed entry        → hidden (the live value may still be the stale "low"); in
 *                         "all" mode it shows as ok
 *   open entry, alert   → the live row plus what is remembered
 *   open entry, quiet   → kept as a hint, marked inactive ("bleibt gemerkt")
 */
export function applyLatch(
    live: StatusItem | null,
    entry: LatchEntry | undefined,
    base: { id: string; name: string; room?: string; category: CategoryKey },
    showAll: boolean,
    now: number,
): StatusItem | null {
    const alertLive = !!live && live.severity !== 'ok';
    if (!entry || entry.unresolved) return alertLive || (showAll && live) ? live : null;
    if (entry.ackedAt) {
        if (!showAll || !live) return null;
        return alertLive ? { ...live, severity: 'ok', color: 'var(--text-secondary)' } : live;
    }
    const latch: LatchInfo = {
        since: entry.since,
        count: entry.count ?? 1,
        active: alertLive,
        ...(entry.snoozedUntil && entry.snoozedUntil > now ? { snoozedUntil: entry.snoozedUntil } : {}),
        ...(entry.reopenedAfter ? { reopenedAfter: entry.reopenedAfter } : {}),
        ...(Number.isFinite(entry.minLevel) && entry.unit ? { level: entry.minLevel, unit: entry.unit } : {}),
    };
    if (alertLive) return { ...live!, latch };
    // A remembered alarm stays red: it did go off, even if the sensor is quiet again.
    const isAlarm = base.category === 'alarm';
    const label =
        base.category === 'battery'
            ? live && /%$/.test(live.label)
                ? live.label
                : 'schwach'
            : isAlarm
              ? 'Ausgelöst'
              : 'Offline';
    return {
        ...(live ?? base),
        severity: isAlarm ? 'crit' : 'warn',
        label,
        color: isAlarm ? SEVERITY_COLOR.crit : SEVERITY_COLOR.warn,
        latch,
    };
}

/** Counts towards the hint chip: needs attention and is not put back ("Später"). */
export function countsAsHint(item: StatusItem): boolean {
    return item.severity !== 'ok' && !item.latch?.snoozedUntil;
}

/** Small, stable string hash — tells the widget whether its registration changed. */
export function hashString(s: string): string {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
}

/** "05.10." — the day of a remembered report. */
export function formatDay(ts: number): string {
    const d = new Date(ts);
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
}

/**
 * The extra facts of a remembered row, in reading order:
 * "seit 05.10." · "3× gemeldet" · "meldet zurzeit nichts, bleibt gemerkt" ·
 * "zurückgestellt bis 07.10." · "trotz Wechsel am 01.10."
 */
export function latchFacts(item: StatusItem, showSince: boolean, long = false): string[] {
    const l = item.latch;
    if (!l) return [];
    const out: string[] = [];
    // The two-line row has the room for the longer wording.
    if (showSince && l.since) out.push(`${long ? 'gemeldet seit' : 'seit'} ${formatDay(l.since)}`);
    if (l.count > 1) out.push(`${l.count}× ${item.category === 'alarm' ? 'ausgelöst' : 'gemeldet'}`);
    if (!l.active)
        out.push(long ? 'meldet zurzeit nichts, bleibt aber gemerkt' : 'meldet zurzeit nichts, bleibt gemerkt');
    if (l.snoozedUntil) out.push(`zurückgestellt bis ${formatDay(l.snoozedUntil)}`);
    if (l.reopenedAfter)
        out.push(
            `${item.category === 'battery' ? 'trotz Wechsel' : 'trotz Quittierung'} am ${formatDay(l.reopenedAfter)}`,
        );
    return out;
}
