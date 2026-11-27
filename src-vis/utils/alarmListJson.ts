/**
 * Alarm widget: mode buttons and zones from a JSON datapoint (#1037) — the
 * counterpart to the Auswahlfeld's entries (#577, enumEntriesJson).
 *
 * Accepted shapes:
 *
 *   [{ "key": "off", "label": "Aus", "icon": "ShieldOff", "disarm": true }, …]
 *   { "0": "Aus", "1": "Scharf" }                (map: key = value written into stateDp)
 *   { "0": { "label": "Aus", "disarm": true } }
 *   ["Aus", "Scharf"]                             (key = label)
 *   { "modes": [ … ], "zones": [ … ] }            (one datapoint for both)
 *   { "result": [ … ] }                           (wrapper with exactly one list)
 *
 * Invalid rows are skipped and reported (`rejected`) so the panel can show why.
 */
import type { AlarmModeDef, AlarmZoneDef } from '../types';
import { isPlainObject, parseJsonValue, pick, toText } from './jsonFieldPick';
import { isValidStateId } from './stateId';

const AUTO_KEY = ['key', 'id', 'mode', 'value', 'val', 'code'];
const AUTO_LABEL = ['label', 'name', 'text', 'title', 'caption'];
const AUTO_ICON = ['icon'];
const AUTO_COLOR = ['color', 'colour'];
const AUTO_WRITE_DP = ['writeDp', 'dp', 'datapoint', 'stateId', 'oid'];
const AUTO_WRITE_VALUE = ['writeValue', 'value', 'val'];
const AUTO_ACTIVE = ['activeWhen', 'activeValue'];
const AUTO_ACTIVE_DP = ['activeDp', 'statusDp', 'stateDp'];
const PHASES = ['off', 'armed', 'inside', 'night', 'arming', 'triggered', 'silent', 'failed', 'aborted'];
const AUTO_ONOFF = ['onOffDp', 'onOff', 'switchDp', 'enabledDp', 'dp', 'datapoint'];
const AUTO_TRIGGERED = ['triggeredDp', 'triggered', 'alarmDp', 'alarm'];

export interface AlarmListResult<T> {
    items: T[];
    /** Rows that were dropped, with the reason (for the panel preview). */
    rejected: { row: string; reason: string }[];
    /** The value was not readable JSON at all (empty, broken, wrong shape). */
    invalid: boolean;
}

function asBool(v: unknown): boolean | undefined {
    if (typeof v === 'boolean') return v;
    if (v === 'true' || v === 1 || v === '1') return true;
    if (v === 'false' || v === 0 || v === '0') return false;
    return undefined;
}

function short(row: unknown): string {
    try {
        const s = typeof row === 'string' ? row : JSON.stringify(row);
        return s.length > 60 ? `${s.slice(0, 57)}…` : s;
    } catch {
        return String(row);
    }
}

/** The list part of the value: array, the named list of a wrapper, or a map as [key,row] pairs. */
function rowsOf(data: unknown, listName: 'modes' | 'zones'): { rows: unknown[]; mapKeys?: string[] } | null {
    if (Array.isArray(data)) return { rows: data };
    if (!isPlainObject(data)) return null;
    if (Array.isArray(data[listName])) return { rows: data[listName] as unknown[] };
    // A wrapper that carries the *other* list only — nothing for us.
    const other = listName === 'modes' ? 'zones' : 'modes';
    if (Array.isArray(data[other])) return { rows: [] };
    const arrays = Object.values(data).filter(Array.isArray) as unknown[][];
    if (arrays.length === 1) return { rows: arrays[0] };
    const keys = Object.keys(data);
    return { rows: keys.map((k) => data[k]), mapKeys: keys };
}

function dedupeKeys<T extends { key: string }>(items: T[], rejected: AlarmListResult<T>['rejected']): T[] {
    const seen = new Set<string>();
    return items.filter((it) => {
        if (seen.has(it.key)) {
            rejected.push({ row: it.key, reason: 'doppelter key' });
            return false;
        }
        seen.add(it.key);
        return true;
    });
}

function validDp(v: unknown): string | undefined | false {
    const s = toText(v)?.trim();
    if (!s) return undefined;
    return isValidStateId(s) ? s : false;
}

export function parseAlarmModesJson(raw: unknown): AlarmListResult<AlarmModeDef> {
    const data = parseJsonValue(raw);
    const src = data === undefined ? null : rowsOf(data, 'modes');
    if (!src) return { items: [], rejected: [], invalid: true };
    const rejected: AlarmListResult<AlarmModeDef>['rejected'] = [];
    const items: AlarmModeDef[] = [];
    src.rows.forEach((row, i) => {
        const mapKey = src.mapKeys?.[i];
        if (row === null || row === undefined || (typeof row !== 'object' && toText(row) === undefined)) {
            if (mapKey !== undefined) items.push({ key: mapKey, label: mapKey });
            else rejected.push({ row: short(row), reason: 'leere Zeile' });
            return;
        }
        if (typeof row !== 'object' || Array.isArray(row)) {
            const label = Array.isArray(row) ? (toText(row[1]) ?? toText(row[0])) : toText(row);
            const key = mapKey ?? (Array.isArray(row) ? toText(row[0]) : label);
            if (!key) {
                rejected.push({ row: short(row), reason: 'kein key' });
                return;
            }
            items.push({ key, label: label ?? key });
            return;
        }
        const o = row as Record<string, unknown>;
        const label = toText(pick(o, undefined, AUTO_LABEL));
        const key = mapKey ?? toText(pick(o, undefined, AUTO_KEY)) ?? label;
        if (!key) {
            rejected.push({ row: short(row), reason: 'weder key noch label' });
            return;
        }
        const mode: AlarmModeDef = { key };
        if (label) mode.label = label;
        const icon = toText(pick(o, undefined, AUTO_ICON));
        if (icon) mode.icon = icon;
        const color = toText(pick(o, undefined, AUTO_COLOR));
        if (color) mode.color = color;
        const writeDp = validDp(pick(o, undefined, AUTO_WRITE_DP));
        if (writeDp === false) {
            rejected.push({ row: key, reason: 'ungültiger Datenpunkt' });
            return;
        }
        if (writeDp) mode.writeDp = writeDp;
        // In the map form the key *is* the value; an explicit field still wins.
        const writeValue = toText(pick(o, undefined, AUTO_WRITE_VALUE));
        if (writeValue !== undefined && writeValue !== key) mode.writeValue = writeValue;
        const activeWhen = toText(pick(o, undefined, AUTO_ACTIVE));
        if (activeWhen !== undefined) mode.activeWhen = activeWhen;
        const activeDp = validDp(pick(o, undefined, AUTO_ACTIVE_DP));
        if (activeDp === false) {
            rejected.push({ row: key, reason: 'ungültiger Datenpunkt' });
            return;
        }
        if (activeDp) mode.activeDp = activeDp;
        const phase = toText(o.phase);
        if (phase && PHASES.includes(phase)) mode.phase = phase as AlarmModeDef['phase'];
        if (asBool(o.disarm) === true) mode.disarm = true;
        const reqPin = asBool(o.requirePin ?? o.pin);
        if (reqPin !== undefined) mode.requirePin = reqPin;
        if (asBool(o.hidden) === true) mode.hidden = true;
        items.push(mode);
    });
    return { items: dedupeKeys(items, rejected), rejected, invalid: false };
}

export function parseAlarmZonesJson(raw: unknown): AlarmListResult<AlarmZoneDef> {
    const data = parseJsonValue(raw);
    const src = data === undefined ? null : rowsOf(data, 'zones');
    if (!src) return { items: [], rejected: [], invalid: true };
    const rejected: AlarmListResult<AlarmZoneDef>['rejected'] = [];
    const items: AlarmZoneDef[] = [];
    src.rows.forEach((row, i) => {
        const mapKey = src.mapKeys?.[i];
        if (typeof row === 'string' && mapKey === undefined) {
            items.push({ key: row, label: row });
            return;
        }
        if (typeof row === 'string' && mapKey !== undefined) {
            items.push({ key: mapKey, label: row });
            return;
        }
        if (!isPlainObject(row)) {
            rejected.push({ row: short(row), reason: 'kein Objekt' });
            return;
        }
        const label = toText(pick(row, undefined, AUTO_LABEL));
        const key = mapKey ?? toText(pick(row, undefined, ['key', 'id'])) ?? label;
        if (!key) {
            rejected.push({ row: short(row), reason: 'weder key noch label' });
            return;
        }
        const zone: AlarmZoneDef = { key };
        if (label) zone.label = label;
        const onOff = validDp(pick(row, undefined, AUTO_ONOFF));
        const trig = validDp(pick(row, undefined, AUTO_TRIGGERED));
        if (onOff === false || trig === false) {
            rejected.push({ row: key, reason: 'ungültiger Datenpunkt' });
            return;
        }
        if (onOff) zone.onOffDp = onOff;
        if (trig) zone.triggeredDp = trig;
        if (asBool(row.hidden) === true) zone.hidden = true;
        items.push(zone);
    });
    return { items: dedupeKeys(items, rejected), rejected, invalid: false };
}
