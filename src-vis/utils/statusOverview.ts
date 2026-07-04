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

export interface StatusOverviewOptions {
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
    namePattern?: string; // device label template, tokens <Raum> <Gerät> <DPName> <Name> <ID>
    showTitle?: boolean; // show the widget title in the header (default true)
    showCount?: boolean; // show the hint-count chip in the header top-right (default true)
    showOkCategories?: boolean; // also list categories with no alerts (default false)
    allClearText?: string;
    sortBy?: 'severity' | 'room'; // default 'severity'
    rowClick?: 'none' | 'jump'; // click a row → jump to a widget bound to that DP (default 'jump')
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
        if (r === 'sensor.window' || r === 'window' || r === 'sensor.door' || r === 'door') return 'window';
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
        const rd = getRoleDisplay(dp.role, val);
        if (!isOn(val))
            return includeOk ? { ...base, severity: 'ok', label: rd?.label ?? 'Geschlossen', color: OK } : null;
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
