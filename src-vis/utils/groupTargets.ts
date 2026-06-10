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
export interface GroupActionConfigOpts {
    /** Show the master switch in the header / title bar. */
    groupSwitch?: boolean;
    /** Value written to dimmer/level DPs on "all on" (off always writes 0). Default 100. */
    groupDimmerOnValue?: number;
    /** Include plain numeric DPs (value.*) in group actions. Default false. */
    groupIncludeNumbers?: boolean;
    /** Value written to numeric DPs on "all on" when included. Default 1. */
    groupNumberOnValue?: number;
    /** Value written to numeric DPs on "all off" when included. Default 0. */
    groupNumberOffValue?: number;
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
    role?: string;
    writable?: boolean;
    /** Forces control rendering; respected here too. */
    displayType?: string;
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
