/**
 * The on/off rule of a "Schalter" list entry — pure, so the list widgets, the group
 * master switch and the unit test (tools/tests/list-switch.mjs) all share one
 * implementation (issue #591).
 *
 * A list row rendered as a switch offers the same options as the standalone Schalter
 * widget: free write values per state, a separate status datapoint for devices that
 * split command and feedback, and condition-based evaluation for vocabularies the
 * coercion cannot know (ON/OFF, 0/255, HEAT/AUTO …).
 */
import type { ioBrokerState } from '../types';
import { cellStateActive, type StateEvalConfig } from './cellState';

/** The switch-specific slice of a list entry. `EntryControlConfig` extends it, so the
 *  fields are declared once and the helpers below stay usable outside the widgets. */
export interface SwitchEntryConfig extends StateEvalConfig {
    /** Control shape: 'slide' = toggle (default), 'icon' = clickable icon, 'image' = clickable image. */
    switchStyle?: 'slide' | 'icon' | 'image';
    /** Icon/image style: shown in the on/true/>0 state. Icon falls back to Power. */
    trueIcon?: string;
    /** Icon/image style: shown in the off/false/0 state. Icon falls back to Power. */
    falseIcon?: string;
    /** Image style: picture shown in the on state. Falls back to the on icon. */
    onImage?: string;
    /** Image style: picture shown in the off state. Falls back to the off icon. */
    offImage?: string;
    /** Value written when switching on. Empty = follow the datapoint (true / 1). */
    onValue?: string;
    /** Value written when switching off. Empty = follow the datapoint (false / 0). */
    offValue?: string;
    /**
     * Separate read-back datapoint for devices that split command and status
     * (Tasmota: cmnd.POWER switches, stat.POWER reports ON/OFF). State and colours
     * come from here, every write still goes to the entry's own datapoint.
     */
    statusDp?: string;
}

/** Coerce a configured write value (a raw string from the editor) into the proper
 *  boolean/number/string before writing. Exported because every place with
 *  configurable write values (camera action rows, list entries) needs the same. */
export function parseWrite(
    v: string | number | boolean | undefined,
    fallback: boolean | number | string,
): boolean | number | string {
    if (v === undefined || v === '') return fallback;
    if (typeof v !== 'string') return v;
    if (v === 'true') return true;
    if (v === 'false') return false;
    const n = Number(v);
    return v.trim() !== '' && Number.isFinite(n) ? n : v;
}

/** A write value counts as configured only when it is a non-empty string. */
function configured(v: string | undefined): boolean {
    return v !== undefined && v !== '';
}

/**
 * The values a switch entry writes for on and off.
 *
 * Without configured values the write follows the datapoint's current shape — a
 * number DP keeps getting 1/0, everything else true/false — so an entry that was
 * never touched behaves exactly as it did before the option existed.
 */
export function switchWriteValues(
    entry: SwitchEntryConfig,
    val: ioBrokerState['val'],
): { on: boolean | number | string; off: boolean | number | string } {
    const legacyOn = typeof val === 'number' ? 1 : true;
    const legacyOff = typeof val === 'number' ? 0 : false;
    return {
        on: configured(entry.onValue) ? parseWrite(entry.onValue, legacyOn) : legacyOn,
        off: configured(entry.offValue) ? parseWrite(entry.offValue, legacyOff) : legacyOff,
    };
}

/** The status datapoint of a switch entry, or '' when it reads its own. */
export function switchStatusDp(entry: SwitchEntryConfig): string {
    return (entry.statusDp ?? '').trim();
}

/** The value a switch entry evaluates: the status DP's when one is configured. */
export function switchReadValue(
    entry: SwitchEntryConfig,
    val: ioBrokerState['val'],
    statusVal: ioBrokerState['val'] | undefined,
): ioBrokerState['val'] {
    return switchStatusDp(entry) ? (statusVal ?? null) : val;
}

/**
 * On/off state of a switch entry — the Schalter widget's rule verbatim: the AN write
 * value doubles as the comparison, but only while reading the DP we write to (a status
 * DP reports its own vocabulary), and 'condition' mode runs the shared operator engine
 * instead. `dpId` only labels the clause, the value is passed in.
 */
export function switchEntryActive(entry: SwitchEntryConfig, readValue: ioBrokerState['val'], dpId: string): boolean {
    const status = switchStatusDp(entry);
    if (entry.stateMode !== 'condition' && !status && configured(entry.onValue))
        return String(readValue) === String(parseWrite(entry.onValue, true));
    return cellStateActive(entry, readValue, status || dpId, true);
}
