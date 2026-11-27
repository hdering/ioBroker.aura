/**
 * Alarm widget model (#1037) — what the widget shows, independent of where the
 * data comes from (ioBroker.alarm adapter or freely chosen datapoints).
 *
 * Pure logic, no React and no socket: tested via esbuild (tools/tests/alarm-model-logic.mjs).
 */
import type { TranslationKey } from '../../../i18n';
import type { AlarmModeDef, AlarmPhase, AlarmStateMapEntry, AlarmZoneDef } from '../../../types';

export const ALARM_PHASES: AlarmPhase[] = [
    'off',
    'armed',
    'inside',
    'night',
    'arming',
    'triggered',
    'silent',
    'failed',
    'aborted',
];

export const PHASE_INFO: Record<AlarmPhase, { labelKey: TranslationKey; color: string; pulse?: boolean }> = {
    off: { labelKey: 'alarm.state.deactivated', color: '#64748b' },
    armed: { labelKey: 'alarm.state.sharp', color: '#3b82f6' },
    inside: { labelKey: 'alarm.state.sharpInside', color: '#06b6d4' },
    triggered: { labelKey: 'alarm.state.burglary', color: '#ef4444', pulse: true },
    night: { labelKey: 'alarm.state.nightRest', color: '#6366f1' },
    arming: { labelKey: 'alarm.state.getsActivated', color: '#eab308' },
    failed: { labelKey: 'alarm.state.activationFail', color: '#f97316' },
    aborted: { labelKey: 'alarm.state.activationAbort', color: '#f97316' },
    silent: { labelKey: 'alarm.state.silentAlarm', color: '#dc2626' },
};

/** status.state_list of ioBroker.alarm. */
export const ADAPTER_CODE_PHASE: Record<number, AlarmPhase> = {
    0: 'off',
    1: 'armed',
    2: 'inside',
    3: 'triggered',
    4: 'night',
    5: 'arming',
    6: 'failed',
    7: 'aborted',
    8: 'silent',
};

/** use.list values of ioBroker.alarm: 0 disable, 1 enable, 2 sharp_inside, 3 enable_with_delay, 4 night_rest. */
export const USE_LIST = { off: 0, sharp: 1, inside: 2, delay: 3, night: 4 } as const;

export function isTriggeredPhase(p: AlarmPhase): boolean {
    return p === 'triggered' || p === 'silent';
}

// ── modes ────────────────────────────────────────────────────────────────────

export interface ResolvedMode {
    key: string;
    /** Own text; when empty the widget uses labelKey, then key. */
    label?: string;
    labelKey?: TranslationKey;
    icon: string;
    color: string;
    disarm: boolean;
    requirePin?: boolean;
    writeDp?: string;
    writeValue: string;
    activeWhen: string;
    /** Manual: own on/off datapoint of this mode; empty = compare stateDp. */
    activeDp?: string;
    /** Status while this mode is active and there is no stateDp. */
    phase: AlarmPhase;
}

const ADAPTER_MODES: { key: string; labelKey: TranslationKey; icon: string; color: string; legacy: string }[] = [
    { key: 'off', labelKey: 'alarm.mode.off', icon: 'ShieldOff', color: '#10b981', legacy: 'showModeOff' },
    { key: 'sharp', labelKey: 'alarm.mode.sharp', icon: 'ShieldCheck', color: '#3b82f6', legacy: 'showModeSharp' },
    { key: 'inside', labelKey: 'alarm.mode.inside', icon: 'Lock', color: '#06b6d4', legacy: 'showModeInside' },
    { key: 'night', labelKey: 'alarm.mode.night', icon: 'Moon', color: '#6366f1', legacy: 'showModeNight' },
];
export const ADAPTER_MODE_KEYS = ADAPTER_MODES.map((m) => m.key);
const ADAPTER_MODE_PHASE: Record<string, AlarmPhase> = { off: 'off', sharp: 'armed', inside: 'inside', night: 'night' };

/** The four fixed adapter modes as list rows (seed of the editor). */
export function adapterModeDefaults(): AlarmModeDef[] {
    return ADAPTER_MODES.map((m) => ({ key: m.key }));
}

/**
 * Adapter mode: the fixed four, with label/icon/colour/hidden/order taken from `list`.
 * Unknown keys are dropped (the adapter knows only these four), missing ones are
 * appended. `legacy` carries the old showModeOff/Sharp/Inside/Night switches: `false`
 * there hides the button unless the list says otherwise.
 */
export function resolveAdapterModes(list: AlarmModeDef[] | undefined, legacy: Record<string, unknown>): ResolvedMode[] {
    const byKey = new Map((list ?? []).map((m) => [m.key, m]));
    const order = [
        ...(list ?? []).map((m) => m.key).filter((k) => ADAPTER_MODE_KEYS.includes(k)),
        ...ADAPTER_MODE_KEYS.filter((k) => !byKey.has(k)),
    ];
    const out: ResolvedMode[] = [];
    for (const key of [...new Set(order)]) {
        const base = ADAPTER_MODES.find((m) => m.key === key)!;
        const own = byKey.get(key);
        const hidden = own?.hidden ?? legacy[base.legacy] === false;
        if (hidden) continue;
        out.push({
            key,
            label: own?.label || undefined,
            labelKey: base.labelKey,
            icon: own?.icon || base.icon,
            color: own?.color || base.color,
            disarm: key === 'off',
            writeValue: String(USE_LIST[key as keyof typeof USE_LIST]),
            activeWhen: '',
            phase: ADAPTER_MODE_PHASE[key] ?? 'armed',
        });
    }
    return out;
}

/** Manual mode: every row is a button; defaults: write `key` into stateDp, light up when it holds that value. */
export function resolveManualModes(list: AlarmModeDef[] | undefined): ResolvedMode[] {
    return (list ?? [])
        .filter((m) => m && m.key && !m.hidden)
        .map((m) => {
            const writeValue = m.writeValue ?? m.key;
            return {
                key: m.key,
                label: m.label || undefined,
                icon: m.icon || (m.disarm ? 'ShieldOff' : 'ShieldCheck'),
                color: m.color || (m.disarm ? '#10b981' : '#3b82f6'),
                disarm: m.disarm === true,
                requirePin: m.requirePin,
                writeDp: m.writeDp || undefined,
                writeValue,
                activeWhen: m.activeWhen ?? (m.activeDp ? 'true' : writeValue),
                activeDp: m.activeDp || undefined,
                phase: m.phase && ALARM_PHASES.includes(m.phase) ? m.phase : m.disarm ? 'off' : 'armed',
            };
        });
}

/** Seed for a new manual list: AUS / SCHARF on a boolean state datapoint. */
export function manualModeDefaults(): AlarmModeDef[] {
    return [
        { key: 'off', label: 'Aus', disarm: true, writeValue: 'false' },
        { key: 'armed', label: 'Scharf', writeValue: 'true' },
    ];
}

// ── zones ────────────────────────────────────────────────────────────────────

export interface ResolvedZone {
    key: string;
    label?: string;
    labelKey?: TranslationKey;
    onOffDp?: string;
    triggeredDp?: string;
}

const ADAPTER_ZONES: { key: string; labelKey: TranslationKey }[] = [
    { key: 'one', labelKey: 'alarm.zone.one' },
    { key: 'two', labelKey: 'alarm.zone.two' },
    { key: 'three', labelKey: 'alarm.zone.three' },
];
export const ADAPTER_ZONE_KEYS = ADAPTER_ZONES.map((z) => z.key);

export function adapterZoneDefaults(): AlarmZoneDef[] {
    return ADAPTER_ZONES.map((z) => ({ key: z.key }));
}

export function resolveAdapterZones(list: AlarmZoneDef[] | undefined, prefix: string): ResolvedZone[] {
    const byKey = new Map((list ?? []).map((z) => [z.key, z]));
    const order = [
        ...(list ?? []).map((z) => z.key).filter((k) => ADAPTER_ZONE_KEYS.includes(k)),
        ...ADAPTER_ZONE_KEYS.filter((k) => !byKey.has(k)),
    ];
    const out: ResolvedZone[] = [];
    for (const key of [...new Set(order)]) {
        const own = byKey.get(key);
        if (own?.hidden) continue;
        out.push({
            key,
            label: own?.label || undefined,
            labelKey: ADAPTER_ZONES.find((z) => z.key === key)!.labelKey,
            onOffDp: prefix ? `${prefix}.zone.${key}_on_off` : undefined,
            triggeredDp: prefix ? `${prefix}.zone.${key}` : undefined,
        });
    }
    return out;
}

export function resolveManualZones(list: AlarmZoneDef[] | undefined): ResolvedZone[] {
    return (list ?? [])
        .filter((z) => z && z.key && !z.hidden)
        .map((z) => ({
            key: z.key,
            label: z.label || z.key,
            onOffDp: z.onOffDp || undefined,
            triggeredDp: z.triggeredDp || undefined,
        }));
}

// ── state values ─────────────────────────────────────────────────────────────

/** A datapoint value as text for comparisons ("true", "1", "Scharf"). */
export function valueText(v: unknown): string {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') {
        try {
            return JSON.stringify(v);
        } catch {
            return '';
        }
    }
    return String(v);
}

/** Same comparison as everywhere else: text, but 1 == "1.0", true == "true". */
export function sameValue(raw: unknown, expected: string): boolean {
    const a = valueText(raw).trim();
    const b = expected.trim();
    if (a.toLowerCase() === b.toLowerCase()) return true;
    const na = Number(a);
    const nb = Number(b);
    return a !== '' && b !== '' && Number.isFinite(na) && Number.isFinite(nb) && na === nb;
}

/**
 * Manual mode: the phase of a raw stateDp value. With a map the first matching
 * row wins; without one booleans mean off/armed and the numbers 0–8 follow the
 * alarm adapter. Anything else is `off` with the raw value as text — never guessed.
 */
export function phaseFromValue(
    raw: unknown,
    map: AlarmStateMapEntry[] | undefined,
): { phase: AlarmPhase; label?: string; known: boolean } {
    if (raw === null || raw === undefined || raw === '') return { phase: 'off', known: false };
    for (const row of map ?? []) {
        if (row && ALARM_PHASES.includes(row.phase) && sameValue(raw, row.value)) {
            return { phase: row.phase, label: row.label || undefined, known: true };
        }
    }
    if (map && map.length > 0) return { phase: 'off', label: valueText(raw), known: false };
    if (raw === true || raw === 'true') return { phase: 'armed', known: true };
    if (raw === false || raw === 'false') return { phase: 'off', known: true };
    const n = Number(raw);
    if (Number.isInteger(n) && ADAPTER_CODE_PHASE[n]) return { phase: ADAPTER_CODE_PHASE[n], known: true };
    return { phase: 'off', label: valueText(raw), known: false };
}

/** A boolean-ish datapoint: true, non-zero numbers and "true/on/open/1" count as set. */
export function isSet(v: unknown): boolean {
    if (v === true) return true;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') return /^(true|on|open|offen|1|yes|ja)$/i.test(v.trim());
    return false;
}

/** Text of a notice datapoint: a non-empty string is the text, `true` means "something to acknowledge". */
export function noticeOf(v: unknown): { active: boolean; text: string } {
    if (typeof v === 'string') {
        const s = v.trim();
        if (!s || /^(false|0|off)$/i.test(s)) return { active: false, text: '' };
        if (/^(true|1|on)$/i.test(s)) return { active: true, text: '' };
        return { active: true, text: s };
    }
    return { active: isSet(v), text: '' };
}

/** Value to write, typed like the datapoint expects it as far as it is recognisable. */
export function typedValue(s: string): boolean | number | string {
    const t = s.trim();
    if (t === 'true') return true;
    if (t === 'false') return false;
    if (t !== '' && Number.isFinite(Number(t))) return Number(t);
    return s;
}

/** Countdown seconds from a datapoint: plain seconds, or an end timestamp (ms or s). */
export function countdownSeconds(v: unknown, unit: 's' | 'endTs', now: number): number {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return 0;
    if (unit === 's') return Math.round(n);
    const endMs = n < 1e12 ? n * 1000 : n;
    return Math.max(0, Math.ceil((endMs - now) / 1000));
}

/** Guess a phase from a state text (for "aus common.states übernehmen"). */
export function guessPhase(label: string): AlarmPhase {
    const s = label.toLowerCase();
    if (/still|silent/.test(s)) return 'silent';
    if (/einbruch|alarm(?!anlage)|ausgel|burglar|trigger|intrusion/.test(s)) return 'triggered';
    if (/nacht|night|sleep|schlaf/.test(s)) return 'night';
    if (/innen|intern|inside|home|stay|zuhause|anwesend/.test(s)) return 'inside';
    if (/wird|verz|delay|arming|countdown|exit/.test(s)) return 'arming';
    if (/fehl|fail|error/.test(s)) return 'failed';
    if (/aus|unscharf|deakt|disarm|off|disabled/.test(s)) return 'off';
    if (/scharf|armed|away|abwesend|aktiv|on/.test(s)) return 'armed';
    return 'off';
}

// ── log ──────────────────────────────────────────────────────────────────────

export type LogSeparator = 'br' | 'newline' | 'json';

export function parseLog(raw: unknown, max: number, sep: LogSeparator = 'br'): { time: string; text: string }[] {
    if (raw === null || raw === undefined || raw === '') return [];

    if (sep === 'json' || Array.isArray(raw)) {
        let data: unknown = raw;
        if (typeof raw === 'string') {
            try {
                data = JSON.parse(raw);
            } catch {
                data = [];
            }
        }
        const arr = Array.isArray(data) ? data : [];
        const out: { time: string; text: string }[] = [];
        for (const row of arr) {
            if (out.length >= max) break;
            if (row && typeof row === 'object') {
                const r = row as Record<string, unknown>;
                const text = valueText(r.text ?? r.message ?? r.msg ?? r.event ?? '');
                const time = valueText(r.time ?? r.ts ?? r.date ?? '');
                if (text) out.push({ time: fmtLogTime(time), text });
            } else if (row !== null && row !== undefined) out.push(splitLine(String(row)));
        }
        return out;
    }
    const s = String(raw);
    const lines = (sep === 'newline' ? s.split(/\r?\n/) : s.split(/<br\s*\/?>/i)).map((l) => l.trim()).filter(Boolean);
    return lines.slice(0, max).map(splitLine);
}

function splitLine(line: string): { time: string; text: string } {
    const m = line.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s*[:-]\s*(.+)$/);
    return m ? { time: m[1], text: m[2] } : { time: '', text: line };
}

/** A numeric timestamp in a JSON log row becomes HH:MM, text stays as it is. */
function fmtLogTime(t: string): string {
    const n = Number(t);
    if (t && Number.isFinite(n) && n > 1e9) {
        const d = new Date(n < 1e12 ? n * 1000 : n);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    return t;
}

// ── PIN ──────────────────────────────────────────────────────────────────────

/** Manual mode, pinCheck "dp": what goes into pinDp. */
export function pinPayload(
    format: 'json' | 'pin',
    pin: string,
    action: { mode: string; dp?: string; value?: string },
): string {
    if (format === 'pin') return pin;
    return JSON.stringify({ pin, mode: action.mode, dp: action.dp ?? '', value: action.value ?? '' });
}

// ── takeover ─────────────────────────────────────────────────────────────────

/**
 * "Aus Alarm-Adapter übernehmen": the manual datapoints filled with the adapter's
 * paths, so a user can start from a working setup and swap single elements.
 * PIN stays off: the adapter checks codes on three different datapoints.
 */
export function adapterTakeover(prefix: string): Record<string, unknown> {
    const p = prefix || 'alarm.0';
    const map: AlarmStateMapEntry[] = Object.entries(ADAPTER_CODE_PHASE).map(([value, phase]) => ({ value, phase }));
    return {
        sourceMode: 'manual',
        stateDp: `${p}.status.state_list`,
        stateMap: map,
        modesSource: 'list',
        modes: [
            {
                key: 'off',
                label: 'Aus',
                icon: 'ShieldOff',
                disarm: true,
                writeDp: `${p}.use.list`,
                writeValue: '0',
                activeWhen: '0',
            },
            {
                key: 'sharp',
                label: 'Scharf',
                icon: 'ShieldCheck',
                writeDp: `${p}.use.list`,
                writeValue: '1',
                activeWhen: '1',
            },
            {
                key: 'inside',
                label: 'Innen',
                icon: 'Lock',
                color: '#06b6d4',
                writeDp: `${p}.use.list`,
                writeValue: '2',
                activeWhen: '2',
            },
            {
                key: 'night',
                label: 'Nacht',
                icon: 'Moon',
                color: '#6366f1',
                writeDp: `${p}.use.list`,
                writeValue: '4',
                activeWhen: '4',
            },
        ] satisfies AlarmModeDef[],
        zonesSource: 'list',
        zones: ['one', 'two', 'three'].map((k, i) => ({
            key: k,
            label: `Zone ${i + 1}`,
            onOffDp: `${p}.zone.${k}_on_off`,
            triggeredDp: `${p}.zone.${k}`,
        })) satisfies AlarmZoneDef[],
        triggeredDp: `${p}.status.burglar_alarm`,
        sirenDp: `${p}.status.siren`,
        enableableDp: `${p}.status.enableable`,
        countdownDp: `${p}.status.activation_countdown`,
        countdownUnit: 's',
        circuitsDp: `${p}.info.alarm_circuit_list`,
        noticeDp: `${p}.info.notification_circuit_list`,
        quitDp: `${p}.use.quit_changes`,
        delayDp: `${p}.use.enable_with_delay`,
        panicDp: `${p}.use.panic`,
        presenceDp: `${p}.presence.on_off`,
        logDp: `${p}.info.log_today`,
        logSeparator: 'br',
        pinCheck: 'none',
    };
}
