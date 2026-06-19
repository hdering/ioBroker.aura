/**
 * Group-action targets — shared logic for the "master switch" feature.
 *
 * A GroupTarget describes one writable datapoint that a group/list master
 * switch can toggle: its current on/off state plus the values to write for
 * "all on" and "all off". Building these targets is the only type-specific
 * part of the feature; aggregation (useGroupControl) and rendering
 * (GroupMasterSwitch) operate on GroupTarget[] regardless of source.
 */
import type { ioBrokerState, WidgetConfig } from '../types';

/** Config keys controlling how group actions write to different DP kinds.
 *  Stored on a list widget's options or a group widget's options. */
export type GroupActionType = 'switch' | 'dimmer' | 'shutter' | 'momentary';

export interface GroupActionConfigOpts {
    /** Show the group action control in the header / title bar. */
    groupSwitch?: boolean;
    /** Which kind of group control to show. Default 'switch'. */
    groupActionType?: GroupActionType;
    /** Value written to dimmer/level DPs on "all on" (off always writes 0). Default 100. */
    groupDimmerOnValue?: number;
    /** Include plain numeric DPs (value.*) in group actions. Default false. */
    groupIncludeNumbers?: boolean;
    /** Value written to numeric DPs on "all on" when included. Default 1. */
    groupNumberOnValue?: number;
    /** Value written to numeric DPs on "all off" when included. Default 0. */
    groupNumberOffValue?: number;
    // ── momentary (Taster) action ──────────────────────────────────────────────
    /** Value the Taster action writes to every target. Default true. */
    groupPulseValue?: string | number | boolean;
    /** Write a reset value after a delay. Default false. */
    groupPulseReset?: boolean;
    /** Reset value. Default false. */
    groupPulseResetValue?: string | number | boolean;
    /** Delay (ms) before the reset write. Default 500. */
    groupPulseDelay?: number;
    /** Caption for the Taster button. */
    groupPulseLabel?: string;
    /** Keys (list entry id / group child id) explicitly excluded from the group action. */
    groupExcludeIds?: string[];
}

/** A controllable item shown in the group-action target checklist. */
export interface GroupCandidate {
    /** Stable key used for exclusion: list entry id or group child id. */
    key: string;
    label: string;
}

/** One shutter device's command targets, resolved from a list entry or a group
 *  child. Either separate up/down command DPs, or a position DP (write 0/100). */
export interface ShutterTarget {
    upDp?: string;
    downDp?: string;
    stopDp?: string;
    positionDp?: string;
    invert?: boolean;
    writeValue?: string | number | boolean;
}

export interface GroupTarget {
    /** Datapoint to read state from and write to. */
    id: string;
    /** Whether this DP currently counts as "on". */
    active: boolean;
    onWrite: boolean | number | string;
    offWrite: boolean | number | string;
}

/** Active = on / >0 / non-empty — same semantics as the list value filter. */
export function isActiveVal(val: ioBrokerState['val']): boolean {
    if (val === null || val === undefined) return false;
    if (typeof val === 'boolean') return val;
    if (typeof val === 'number') return val > 0;
    if (typeof val === 'string') return val !== '' && val !== '0' && val.toLowerCase() !== 'false';
    return false;
}

function isDimmerRoleOrId(role?: string, id?: string): boolean {
    const r = `${role ?? ''} ${id ?? ''}`.toLowerCase();
    return r.includes('level') || r.includes('dimmer') || r.includes('brightness');
}

/** Roles that describe a numeric value — must never be treated as a switch even
 *  when the live value happens to be 0 or 1. Mirrors AutoListWidget.isNumericRole. */
function isNumericRole(role?: string): boolean {
    const r = (role ?? '').toLowerCase();
    return r.startsWith('value.') || r === 'value' || r.startsWith('level.') || r === 'level';
}

function parseSwitchVal(raw: unknown, fallback: boolean): boolean | number | string {
    if (raw === undefined || raw === null || raw === '') return fallback;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    const num = Number(raw);
    if (Number.isFinite(num)) return num;
    return String(raw);
}

/** Minimal entry shape shared by StaticListEntry and AutoListEntry. */
interface ListEntryLike {
    id: string;
    label?: string;
    role?: string;
    writable?: boolean;
    /** Forces control rendering; respected here too. */
    displayType?: string;
    shutterUpDp?: string;
    shutterStopDp?: string;
    shutterDownDp?: string;
    shutterWriteValue?: string | number | boolean;
}

/**
 * Build a GroupTarget for one list entry, or null if it must not be controlled
 * (read-only, unknown state, string value, or numeric while not opted in).
 */
export function listEntryTarget(
    entry: ListEntryLike,
    val: ioBrokerState['val'],
    cfg: GroupActionConfigOpts,
): GroupTarget | null {
    if (entry.writable === false) return null;
    if (val === null || val === undefined) return null;
    const dimmerOn = cfg.groupDimmerOnValue ?? 100;
    const numberTarget = (): GroupTarget | null =>
        cfg.groupIncludeNumbers
            ? {
                  id: entry.id,
                  active: isActiveVal(val),
                  onWrite: cfg.groupNumberOnValue ?? 1,
                  offWrite: cfg.groupNumberOffValue ?? 0,
              }
            : null;

    const dt = entry.displayType ?? 'auto';
    // Rich controls (shutter/stepper/buttons/momentary) are not simple on/off —
    // never include them in the group master switch.
    if (dt === 'shutter' || dt === 'stepper' || dt === 'buttons' || dt === 'momentary') return null;
    if (dt === 'switch') {
        const isBool = typeof val === 'boolean';
        return { id: entry.id, active: isActiveVal(val), onWrite: isBool ? true : 1, offWrite: isBool ? false : 0 };
    }
    if (dt === 'slider') {
        return { id: entry.id, active: isActiveVal(val), onWrite: dimmerOn, offWrite: 0 };
    }
    if (dt === 'value') {
        return numberTarget();
    }

    // Auto detection
    if (typeof val === 'boolean') {
        return { id: entry.id, active: val, onWrite: true, offWrite: false };
    }
    if (typeof val === 'number') {
        if (isDimmerRoleOrId(entry.role, entry.id)) {
            return { id: entry.id, active: val > 0, onWrite: dimmerOn, offWrite: 0 };
        }
        if ((val === 0 || val === 1) && !isNumericRole(entry.role)) {
            return { id: entry.id, active: val === 1, onWrite: 1, offWrite: 0 };
        }
        return numberTarget();
    }
    // string → not toggleable
    return null;
}

/** DP ids a group must subscribe to so it can compute the aggregate state.
 *  Pure (state-independent) so it can run before any subscription exists. */
export function groupChildDpIds(children: WidgetConfig[], cfg: GroupActionConfigOpts): string[] {
    const ids: string[] = [];
    for (const c of children) {
        const o = c.options ?? {};
        switch (c.type) {
            case 'switch':
                if (!o.momentary && c.datapoint) ids.push(c.datapoint);
                break;
            case 'light':
            case 'dimmer': {
                const sw = (o.switchDp as string) || '';
                if (sw) ids.push(sw);
                else if (c.datapoint) ids.push(c.datapoint);
                break;
            }
            case 'slider':
            case 'knob':
            case 'fill':
                if (cfg.groupIncludeNumbers && c.datapoint) ids.push(c.datapoint);
                break;
        }
    }
    return ids;
}

/**
 * Build a GroupTarget for one group child widget, or null if it is not a
 * controllable type. `stateOf` returns the current value of a DP id.
 */
export function groupChildTarget(
    child: WidgetConfig,
    stateOf: (id: string) => ioBrokerState['val'],
    cfg: GroupActionConfigOpts,
): GroupTarget | null {
    const o = child.options ?? {};
    const dimmerOn = cfg.groupDimmerOnValue ?? 100;

    const boolTarget = (id: string): GroupTarget | null => {
        if (!id) return null;
        const onW = parseSwitchVal(o.onValue, true);
        const offW = parseSwitchVal(o.offValue, false);
        const val = stateOf(id);
        const active = o.onValue !== undefined && o.onValue !== '' ? String(val) === String(onW) : isActiveVal(val);
        return { id, active, onWrite: onW, offWrite: offW };
    };

    switch (child.type) {
        case 'switch':
            if (o.momentary) return null;
            return boolTarget(child.datapoint);
        case 'light':
        case 'dimmer': {
            const switchDp = (o.switchDp as string) || '';
            if (switchDp) return boolTarget(switchDp);
            const id = child.datapoint;
            if (!id) return null;
            return { id, active: isActiveVal(stateOf(id)), onWrite: dimmerOn, offWrite: 0 };
        }
        case 'slider':
        case 'knob':
        case 'fill': {
            if (!cfg.groupIncludeNumbers) return null;
            const id = child.datapoint;
            if (!id) return null;
            return {
                id,
                active: isActiveVal(stateOf(id)),
                onWrite: cfg.groupNumberOnValue ?? 1,
                offWrite: cfg.groupNumberOffValue ?? 0,
            };
        }
        default:
            return null;
    }
}

// ── Dimmer / shutter / pulse collectors (for the dimmer/shutter/momentary group
//    action types). State-independent — they only resolve which DPs to write.
//    `exclude` holds keys (list entry id / group child id) the user deselected. ──

const RICH_DISPLAY_TYPES = ['shutter', 'stepper', 'buttons', 'momentary'];
const notExcluded = (key: string, exclude?: ReadonlySet<string>) => !exclude?.has(key);

/** Numeric/level DPs a "Dimmer" group action should set. */
export function listDimmerIds(entries: ListEntryLike[], exclude?: ReadonlySet<string>): string[] {
    return entries
        .filter(
            (e) =>
                notExcluded(e.id, exclude) &&
                e.writable !== false &&
                (e.displayType === 'slider' || isDimmerRoleOrId(e.role, e.id)),
        )
        .map((e) => e.id);
}

/** Shutter command targets from list entries configured as displayType 'shutter'. */
export function listShutterTargets(entries: ListEntryLike[], exclude?: ReadonlySet<string>): ShutterTarget[] {
    return entries
        .filter(
            (e) =>
                notExcluded(e.id, exclude) &&
                e.displayType === 'shutter' &&
                (e.shutterUpDp || e.shutterStopDp || e.shutterDownDp),
        )
        .map((e) => ({
            upDp: e.shutterUpDp,
            stopDp: e.shutterStopDp,
            downDp: e.shutterDownDp,
            writeValue: e.shutterWriteValue,
        }));
}

/** Main DPs a "Taster" group action should pulse. */
export function listPulseIds(entries: ListEntryLike[], exclude?: ReadonlySet<string>): string[] {
    return entries.filter((e) => notExcluded(e.id, exclude) && e.writable !== false).map((e) => e.id);
}

/** Numeric/level DPs from group child widgets a "Dimmer" action should set. */
export function groupChildDimmerIds(children: WidgetConfig[], exclude?: ReadonlySet<string>): string[] {
    const ids: string[] = [];
    for (const c of children) {
        if (notExcluded(c.id, exclude) && ['dimmer', 'light', 'slider', 'knob', 'fill'].includes(c.type) && c.datapoint)
            ids.push(c.datapoint);
    }
    return ids;
}

/** Shutter command targets resolved from group child shutter widgets. */
export function groupChildShutterTargets(children: WidgetConfig[], exclude?: ReadonlySet<string>): ShutterTarget[] {
    const out: ShutterTarget[] = [];
    for (const c of children) {
        if (c.type !== 'shutter' || !notExcluded(c.id, exclude)) continue;
        const o = c.options ?? {};
        const taster = o.controlMode === 'taster';
        const openDp = o.openDp as string | undefined;
        const closeDp = o.closeDp as string | undefined;
        const stopDp = o.stopDp as string | undefined;
        if (taster && (openDp || closeDp)) {
            out.push({ upDp: openDp, downDp: closeDp, stopDp, writeValue: true });
        } else if (c.datapoint) {
            out.push({ positionDp: c.datapoint, invert: !!o.invertPosition, stopDp, writeValue: true });
        }
    }
    return out;
}

/** Main DPs from group children a "Taster" action should pulse. */
export function groupChildPulseIds(children: WidgetConfig[], exclude?: ReadonlySet<string>): string[] {
    return children.filter((c) => notExcluded(c.id, exclude) && !!c.datapoint).map((c) => c.datapoint);
}

// ── Candidate lists for the target checklist (config UI) — which items the
//    current action type *could* control, with a stable key + label. ──────────

export function listGroupCandidates(
    entries: ListEntryLike[],
    type: GroupActionType,
    resolveName?: (id: string) => string | undefined,
): GroupCandidate[] {
    entries = entries.filter((e) => !!e?.id);
    const label = (e: ListEntryLike) => e.label || resolveName?.(e.id) || e.id.split('.').pop() || e.id;
    let items: ListEntryLike[];
    if (type === 'dimmer') {
        items = entries.filter(
            (e) => e.writable !== false && (e.displayType === 'slider' || isDimmerRoleOrId(e.role, e.id)),
        );
    } else if (type === 'shutter') {
        items = entries.filter(
            (e) => e.displayType === 'shutter' && (e.shutterUpDp || e.shutterStopDp || e.shutterDownDp),
        );
    } else if (type === 'momentary') {
        items = entries.filter((e) => e.writable !== false);
    } else {
        items = entries.filter(
            (e) => e.writable !== false && !(e.displayType && RICH_DISPLAY_TYPES.includes(e.displayType)),
        );
    }
    return items.map((e) => ({ key: e.id, label: label(e) }));
}

export function groupGroupCandidates(
    children: WidgetConfig[],
    type: GroupActionType,
    typeLabel?: (type: string) => string | undefined,
): GroupCandidate[] {
    const label = (c: WidgetConfig) => c.title || typeLabel?.(c.type) || c.type;
    let items: WidgetConfig[];
    if (type === 'dimmer') {
        items = children.filter((c) => ['dimmer', 'light', 'slider', 'knob', 'fill'].includes(c.type) && !!c.datapoint);
    } else if (type === 'shutter') {
        items = children.filter((c) => c.type === 'shutter');
    } else if (type === 'momentary') {
        items = children.filter((c) => !!c.datapoint);
    } else {
        items = children.filter((c) => {
            const o = c.options ?? {};
            if (c.type === 'switch') return !o.momentary && !!c.datapoint;
            if (c.type === 'light' || c.type === 'dimmer') return !!(o.switchDp || c.datapoint);
            return false;
        });
    }
    return items.map((c) => ({ key: c.id, label: label(c) }));
}
