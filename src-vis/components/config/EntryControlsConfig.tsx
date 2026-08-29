/**
 * EntryControlsConfig — shared editor block for a list entry's "Darstellung"
 * (displayType) plus the per-type fields it needs. Used by both StaticListConfig
 * and AutoListConfig so the static and dynamic lists offer the same controls.
 */
import { useEffect, useState } from 'react';
import { X, Database, Wand2, Plus } from 'lucide-react';
import { Icon } from '@iconify/react';
import { DatapointPicker } from './DatapointPicker';
import { IconPickerModal } from './IconPickerModal';
import { ImagePathHint } from './ImagePathHint';
import { ColorPicker } from '../common/ColorPicker';
import { lucidePascalToIconify } from '../../utils/iconifyLoader';
import { getObjectDirect } from '../../hooks/useIoBroker';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useT } from '../../i18n';
import { TIME_DISPLAY_PRESETS, formatTimeDisplay } from '../../utils/timeDisplay';
import { ensureDatapointCache, type DatapointEntry } from '../../hooks/useDatapointList';
import type { ConditionOperator } from '../../types';
import type { EntryControlConfig, EntryDisplayType, EntryPreset, EntryStateMap } from '../widgets/entryControls';
import type { EnumRender } from '../widgets/EnumWidget';
import { entryDateText } from '../widgets/entryControls';
import { DATE_PATTERN_TOKENS, FORMAT_LABELS, DEFAULT_DATE_PATTERN, type DateOutputFormat } from '../../utils/dateValue';
import {
    type ContactState,
    WC_PRESETS,
    WC_PRESET_LABELS,
    WC_FALLBACK,
    WC_FALLBACK_ICON_NAME,
} from '../../utils/windowContact';

function toIconifyId(name: string): string {
    return name.includes(':') ? name : lucidePascalToIconify(name);
}

/** Parse an ioBroker `common.states` value (object / array / "k:v;…" string) into
 *  entry state mappings. Numeric-looking keys become numbers so they match the DP. */
function parseCommonStates(states: unknown): EntryStateMap[] {
    if (!states) return [];
    const toValue = (raw: string): string | number => {
        const s = raw.trim();
        const num = Number(s);
        return s !== '' && isFinite(num) ? num : s;
    };
    if (Array.isArray(states)) {
        return states.map((label, i) => ({ value: i, label: String(label) }));
    }
    if (typeof states === 'string') {
        return states
            .split(';')
            .map((pair) => pair.split(':'))
            .filter((kv) => kv.length >= 2 && kv[0].trim() !== '')
            .map((kv) => ({ value: toValue(kv[0]), label: kv.slice(1).join(':').trim() }));
    }
    if (typeof states === 'object') {
        return Object.entries(states as Record<string, unknown>).map(([v, label]) => ({
            value: toValue(v),
            label: String(label),
        }));
    }
    return [];
}

interface Props {
    // entry carries the list-entry id at runtime (StaticListEntry/AutoListEntry);
    // needed to scope sibling lookup for shutter auto-detection.
    entry: EntryControlConfig & { id?: string };
    onUpdate: (patch: Partial<EntryControlConfig>) => void;
    /** Drop the internal "Darstellung" caption - for callers whose own section
     *  heading already says it (the datapoint dialog's detail pane). */
    hideLabel?: boolean;
    /** Caption of the 'auto' choice. The dynamic list renames it to name the
     *  list-wide display an entry without one of its own inherits. */
    autoLabel?: string;
}

// ── Shutter auto-detection ────────────────────────────────────────────────────
// Match up/stop/down command DPs among the siblings of a base shutter DP by
// last-segment keyword or ioBroker role (button.open/stop/close.blind …).
const shutterSeg = (id: string) => id.split('.').pop() ?? id;

const SHUTTER_UP_RE =
    /(?:^|[._])(?:up|open|auf|oeffnen|öffnen|hoch|raise|moving[._]?up)(?:$|[._])|open\.(?:blind|window|slat|shutter)/i;
const SHUTTER_STOP_RE = /(?:^|[._])(?:stop|stopp|halt)(?:$|[._])|stop\.(?:blind|window|slat|shutter)/i;
const SHUTTER_DOWN_RE =
    /(?:^|[._])(?:down|close|ab|zu|schliessen|schließen|runter|tief|lower|moving[._]?down)(?:$|[._])|close\.(?:blind|window|slat|shutter)/i;

function detectShutterDps(
    baseId: string,
    entries: DatapointEntry[],
): { mode: 'commands' | 'position'; up?: string; stop?: string; down?: string } {
    const lastDot = baseId.lastIndexOf('.');
    const parent = lastDot > 0 ? baseId.slice(0, lastDot) : baseId;
    const grandDot = parent.lastIndexOf('.');
    const grand = grandDot > 0 ? parent.slice(0, grandDot) : parent;

    const matchIn = (scope: string, re: RegExp): string | undefined => {
        const cands = entries.filter(
            (e) =>
                e.id !== baseId && e.id.startsWith(`${scope}.`) && (re.test(shutterSeg(e.id)) || re.test(e.role ?? '')),
        );
        if (!cands.length) return undefined;
        // Prefer writable command DPs over read-only status DPs.
        const writable = cands.filter((e) => e.write !== false);
        return (writable[0] ?? cands[0]).id;
    };

    const detect = (scope: string) => ({
        up: matchIn(scope, SHUTTER_UP_RE),
        stop: matchIn(scope, SHUTTER_STOP_RE),
        down: matchIn(scope, SHUTTER_DOWN_RE),
    });

    // Search the immediate parent (channel) first, fall back to the device level.
    let res = detect(parent);
    if (!res.up && !res.stop && !res.down && grand !== parent) res = detect(grand);

    // Discrete up/down command DPs → command mode. Otherwise assume HomeMatic-style
    // position control over the entry's main (LEVEL) DP, keeping any stop DP found.
    if (res.up || res.down) return { mode: 'commands', ...res };
    return { mode: 'position', stop: res.stop };
}

/** German collation, so ä/ö/ü sort next to a/o/u instead of after z. */
const TYPE_LABEL_COLLATOR = new Intl.Collator('de');

/**
 * The "Darstellung" choices: 'auto' first (it is the default — no override), the
 * rest sorted by label. The sort runs here, so a new display type only has to be
 * added to the list, never placed by hand.
 */
export const TYPE_OPTIONS: { value: EntryDisplayType; label: string }[] = (
    [
        { value: 'auto', label: 'Auto' },
        { value: 'switch', label: 'Schalter' },
        { value: 'slider', label: 'Schieberegler' },
        { value: 'value', label: 'Wert' },
        { value: 'time', label: 'Datum/Zeit' },
        { value: 'datepicker', label: 'Datumswähler' },
        { value: 'shutter', label: 'Rollladen' },
        { value: 'stepper', label: '+/−' },
        { value: 'buttons', label: 'Tasten' },
        { value: 'momentary', label: 'Taster' },
        { value: 'states', label: 'Wertzuordnung' },
        { value: 'contact', label: 'Fenster-/Türkontakt' },
        { value: 'input', label: 'Eingabefeld' },
    ] as { value: EntryDisplayType; label: string }[]
).sort((a, b) =>
    a.value === 'auto' || b.value === 'auto'
        ? Number(b.value === 'auto') - Number(a.value === 'auto')
        : TYPE_LABEL_COLLATOR.compare(a.label, b.label),
);

/** Human label of a display type, e.g. 'switch' -> 'Schalter'. */
export function entryDisplayTypeLabel(dt: EntryDisplayType | undefined): string {
    return TYPE_OPTIONS.find((o) => o.value === (dt ?? 'auto'))?.label ?? 'Auto';
}

const iSty = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
} as React.CSSProperties;
const iCls = 'w-full text-[10px] rounded px-2 py-1 focus:outline-none';

function Label({ children }: { children: React.ReactNode }) {
    return (
        <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
            {children}
        </label>
    );
}

/** Label + switch on one line - the shape used by every on/off option here. */
function ToggleRow({
    label,
    checked,
    onChange,
}: {
    label: string;
    checked: boolean;
    onChange: (next: boolean) => void;
}) {
    return (
        <div className="flex items-center justify-between">
            <label className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                {label}
            </label>
            <button
                onClick={() => onChange(!checked)}
                className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                style={{ background: checked ? 'var(--accent)' : 'var(--app-border)' }}
            >
                <span
                    className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                    style={{ left: checked ? '18px' : '2px' }}
                />
            </button>
        </div>
    );
}

/** A single shutter command-DP picker row. */
function DpRow({ label, value, onPick }: { label: string; value?: string; onPick: () => void }) {
    return (
        <div>
            <Label>{label}</Label>
            <button
                onClick={onPick}
                className="w-full flex items-center gap-1 text-[9px] font-mono rounded px-1.5 py-1 hover:opacity-80 text-left"
                style={iSty}
            >
                <Database size={9} className="shrink-0" />
                <span className="truncate flex-1">{value || '— wählen —'}</span>
            </button>
        </div>
    );
}

export function EntryControlsConfig({ entry, onUpdate, hideLabel, autoLabel }: Props) {
    const t = useT();
    const dt = entry.displayType ?? 'auto';
    // Live value of the entry's datapoint, so the automatic time detection is
    // verifiable while configuring. Only subscribed for the date/time display.
    const { value: timeVal } = useDatapoint(dt === 'time' || dt === 'datepicker' ? (entry.id ?? '') : '');
    const timePreview =
        dt === 'time' ? formatTimeDisplay(timeVal, entry.timeFormat || 'time', t, entry.timePattern) : null;
    const datePreview = dt === 'datepicker' ? entryDateText(entry, timeVal ?? null) : null;
    const sMode = entry.shutterMode ?? 'commands';
    const switchStyle = entry.switchStyle ?? 'slide';
    const switchStateMode = entry.stateMode ?? 'boolean';
    const inputSubmitMode = entry.inputSubmitMode ?? 'submit';
    const [pickFor, setPickFor] = useState<
        null | 'shutterUpDp' | 'shutterStopDp' | 'shutterDownDp' | 'statusDp' | 'contactLockDp' | 'presetsDp'
    >(null);
    const [switchIconFor, setSwitchIconFor] = useState<null | 'trueIcon' | 'falseIcon'>(null);
    const [statePickFor, setStatePickFor] = useState<number | null>(null);
    const [presetIconFor, setPresetIconFor] = useState<number | null>(null);
    const [contactIconPickFor, setContactIconPickFor] = useState<ContactState | null>(null);
    const [autoMsg, setAutoMsg] = useState<string | null>(null);
    const [stateMsg, setStateMsg] = useState<string | null>(null);
    const presets = entry.presets ?? [];
    const stateMaps = entry.states ?? [];
    const contactPreset = entry.contactPreset ?? 'hmip';

    const setContactAppearance = (st: ContactState, patch: { label?: string; color?: string; icon?: string }) => {
        const prev = entry.contactAppearance ?? {};
        onUpdate({ contactAppearance: { ...prev, [st]: { ...prev[st], ...patch } } });
    };

    const setPreset = (i: number, patch: Partial<EntryPreset>) => {
        const next = presets.map((p, j) => (j === i ? { ...p, ...patch } : p));
        onUpdate({ presets: next });
    };

    const setStateMap = (i: number, patch: Partial<EntryStateMap>) => {
        onUpdate({ states: stateMaps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
    };

    const loadStatesFromObject = async () => {
        if (!entry.id) return;
        const obj = await getObjectDirect(entry.id);
        const parsed = parseCommonStates(obj?.common?.states);
        if (parsed.length) {
            onUpdate({ states: parsed });
            setStateMsg(`${parsed.length} Zustände aus common.states übernommen`);
        } else {
            setStateMsg('Keine common.states im Objekt gefunden');
        }
    };

    // On switching to the "states" display with no mappings yet, try to prefill
    // from the DP's common.states. Guarded so it never overwrites manual edits.
    useEffect(() => {
        if (dt !== 'states' || (entry.states?.length ?? 0) > 0 || !entry.id) return;
        let cancelled = false;
        getObjectDirect(entry.id).then((obj) => {
            if (cancelled) return;
            const parsed = parseCommonStates(obj?.common?.states);
            if (parsed.length) {
                onUpdate({ states: parsed });
                setStateMsg(`${parsed.length} Zustände aus common.states übernommen`);
            }
        });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dt, entry.id]);

    const autoDetectShutter = async () => {
        if (!entry.id) return;
        const cache = await ensureDatapointCache();
        const det = detectShutterDps(entry.id, cache);
        if (det.mode === 'commands') {
            onUpdate({
                shutterMode: undefined,
                shutterUpDp: det.up,
                shutterStopDp: det.stop,
                shutterDownDp: det.down,
            });
            const n = [det.up, det.stop, det.down].filter(Boolean).length;
            setAutoMsg(`Befehls-DPs erkannt (${n})`);
        } else {
            // No discrete up/down DPs (e.g. HomeMatic) → position control over the LEVEL DP.
            onUpdate({
                shutterMode: 'position',
                shutterStopDp: det.stop,
                shutterUpDp: undefined,
                shutterDownDp: undefined,
            });
            setAutoMsg(
                det.stop ? 'Positionssteuerung (LEVEL) + Stop-DP erkannt' : 'Positionssteuerung über LEVEL (Haupt-DP)',
            );
        }
    };

    return (
        <div className="space-y-1.5">
            <div>
                {!hideLabel && <Label>Darstellung</Label>}
                <div className="flex flex-wrap gap-1">
                    {TYPE_OPTIONS.map((o) => {
                        const active = dt === o.value;
                        return (
                            <button
                                key={o.value}
                                onClick={() =>
                                    onUpdate(
                                        o.value === 'time'
                                            ? // Seed a concrete format so the entry renders something meaningful at once.
                                              { displayType: 'time', timeFormat: entry.timeFormat ?? 'time' }
                                            : { displayType: o.value === 'auto' ? undefined : o.value },
                                    )
                                }
                                className="text-[10px] px-2 py-1 rounded transition-colors"
                                style={{
                                    background: active ? 'var(--accent)' : 'var(--app-bg)',
                                    color: active ? '#fff' : 'var(--text-secondary)',
                                    border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                }}
                            >
                                {o.value === 'auto' ? (autoLabel ?? o.label) : o.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Schalter ── */}
            {/* Same option set as the standalone Schalter widget (issue #591), so a
                list row can drive a plug that expects ON/OFF, 0/255 or a split
                command/status pair instead of a plain boolean. */}
            {dt === 'switch' && (
                <div className="space-y-1.5">
                    <div>
                        <Label>Schalter-Stil</Label>
                        <div className="flex gap-1">
                            {(
                                [
                                    ['slide', 'Schiebeschalter'],
                                    ['icon', 'Icon'],
                                    ['image', 'Bild'],
                                ] as const
                            ).map(([v, lbl]) => {
                                const active = switchStyle === v;
                                return (
                                    <button
                                        key={v}
                                        onClick={() => onUpdate({ switchStyle: v === 'slide' ? undefined : v })}
                                        className="flex-1 text-[10px] py-1 rounded transition-colors"
                                        style={{
                                            background: active ? 'var(--accent)' : 'var(--app-bg)',
                                            color: active ? '#fff' : 'var(--text-secondary)',
                                            border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                        }}
                                    >
                                        {lbl}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    {switchStyle !== 'slide' && (
                        <>
                            <div className="grid grid-cols-3 gap-1.5 items-end">
                                {(['trueIcon', 'falseIcon'] as const).map((key) => (
                                    <div key={key}>
                                        <Label>{key === 'trueIcon' ? 'Icon AN' : 'Icon AUS'}</Label>
                                        <div className="relative">
                                            <button
                                                onClick={() => setSwitchIconFor(key)}
                                                title={entry[key] || 'Icon wählen'}
                                                className="w-full flex items-center justify-center rounded hover:opacity-80"
                                                style={{ ...iSty, height: 28 }}
                                            >
                                                {entry[key] ? (
                                                    <Icon icon={toIconifyId(entry[key]!)} width={16} height={16} />
                                                ) : (
                                                    <Plus
                                                        size={13}
                                                        style={{ color: 'var(--text-secondary)', opacity: 0.6 }}
                                                    />
                                                )}
                                            </button>
                                            {entry[key] && (
                                                <button
                                                    onClick={() => onUpdate({ [key]: undefined })}
                                                    title="Icon entfernen"
                                                    className="absolute -top-1 -right-1 flex items-center justify-center rounded-full hover:opacity-80"
                                                    style={{
                                                        width: 13,
                                                        height: 13,
                                                        background: 'var(--app-bg)',
                                                        border: '1px solid var(--app-border)',
                                                        color: 'var(--text-secondary)',
                                                    }}
                                                >
                                                    <X size={8} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                <div>
                                    <Label>Größe (px)</Label>
                                    <input
                                        type="number"
                                        min={8}
                                        max={96}
                                        className={`${iCls} tabular-nums`}
                                        style={iSty}
                                        placeholder="22"
                                        value={entry.iconSize ?? ''}
                                        onChange={(e) => {
                                            const n = parseInt(e.target.value, 10);
                                            onUpdate({ iconSize: Number.isFinite(n) && n > 0 ? n : undefined });
                                        }}
                                    />
                                </div>
                            </div>
                            {switchStyle === 'image' && (
                                <div className="space-y-1.5">
                                    {(['onImage', 'offImage'] as const).map((key) => {
                                        const img = entry[key] ?? '';
                                        return (
                                            <div key={key}>
                                                <Label>{key === 'onImage' ? 'Bild AN' : 'Bild AUS'}</Label>
                                                <div className="flex items-center gap-1.5">
                                                    {img && (
                                                        <img
                                                            src={img}
                                                            alt=""
                                                            className="shrink-0 rounded"
                                                            style={{
                                                                width: 24,
                                                                height: 24,
                                                                objectFit: 'contain',
                                                                border: '1px solid var(--app-border)',
                                                            }}
                                                        />
                                                    )}
                                                    <input
                                                        className={`${iCls} font-mono min-w-0`}
                                                        style={iSty}
                                                        placeholder="https://…/bild.png · /adapter/… · data:image/…"
                                                        value={img}
                                                        onChange={(e) =>
                                                            onUpdate({ [key]: e.target.value.trim() || undefined })
                                                        }
                                                    />
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        title="Bild hochladen"
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (!file) return;
                                                            const reader = new FileReader();
                                                            reader.onload = () =>
                                                                onUpdate({ [key]: reader.result as string });
                                                            reader.readAsDataURL(file);
                                                        }}
                                                        className="w-16 shrink-0 text-[9px] cursor-pointer"
                                                        style={{ color: 'var(--text-secondary)' }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                    <ImagePathHint />
                                    <p
                                        className="text-[9px] leading-tight"
                                        style={{ color: 'var(--text-secondary)', opacity: 0.7 }}
                                    >
                                        Ohne Bild greift das Icon des jeweiligen Zustands.
                                    </p>
                                </div>
                            )}
                        </>
                    )}
                    <div className="grid grid-cols-2 gap-1.5">
                        <div>
                            <Label>Wert AN (Standard: true)</Label>
                            <input
                                className={`${iCls} font-mono`}
                                style={iSty}
                                placeholder="true"
                                value={entry.onValue ?? ''}
                                onChange={(e) => onUpdate({ onValue: e.target.value || undefined })}
                            />
                        </div>
                        <div>
                            <Label>Wert AUS (Standard: false)</Label>
                            <input
                                className={`${iCls} font-mono`}
                                style={iSty}
                                placeholder="false"
                                value={entry.offValue ?? ''}
                                onChange={(e) => onUpdate({ offValue: e.target.value || undefined })}
                            />
                        </div>
                    </div>
                    <p className="text-[9px] leading-tight" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                        Schreibwerte, z.B. 0/100, 0/255, ON/OFF. Leer = wie der Datenpunkt (true/false bzw. 1/0).
                    </p>
                    <DpRow
                        label="Status-Datenpunkt (optional)"
                        value={entry.statusDp}
                        onPick={() => setPickFor('statusDp')}
                    />
                    {entry.statusDp && (
                        <button
                            onClick={() => onUpdate({ statusDp: undefined })}
                            className="text-[9px] hover:opacity-70"
                            style={{ color: 'var(--accent)' }}
                        >
                            Status-Datenpunkt entfernen
                        </button>
                    )}
                    <p className="text-[9px] leading-tight" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                        Für Geräte, die Schalten und Rückmeldung trennen (Tasmota: cmnd.POWER schaltet, stat.POWER
                        meldet ON/OFF). Zustand und Farben kommen dann von hier, geschrieben wird weiter auf den
                        Datenpunkt der Zeile.
                    </p>
                    <div>
                        <Label>Auswertung</Label>
                        <div className="flex gap-1">
                            {(
                                [
                                    ['boolean', 'Automatisch'],
                                    ['condition', 'Bedingung'],
                                ] as const
                            ).map(([mode, lbl]) => {
                                const active = switchStateMode === mode;
                                return (
                                    <button
                                        key={mode}
                                        onClick={() =>
                                            onUpdate({ stateMode: mode === 'boolean' ? undefined : 'condition' })
                                        }
                                        className="flex-1 text-[10px] py-1 rounded transition-colors"
                                        style={{
                                            background: active ? 'var(--accent)' : 'var(--app-bg)',
                                            color: active ? '#fff' : 'var(--text-secondary)',
                                            border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                        }}
                                    >
                                        {lbl}
                                    </button>
                                );
                            })}
                        </div>
                        {switchStateMode === 'condition' ? (
                            <div className="flex items-center gap-1 mt-1">
                                <span className="text-[9px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
                                    An wenn
                                </span>
                                <select
                                    value={entry.stateOperator ?? '>'}
                                    onChange={(e) => onUpdate({ stateOperator: e.target.value as ConditionOperator })}
                                    className={`${iCls} shrink-0 w-14`}
                                    style={iSty}
                                >
                                    {(['==', '!=', '>', '>=', '<', '<='] as const).map((op) => (
                                        <option key={op} value={op}>
                                            {op}
                                        </option>
                                    ))}
                                </select>
                                <input
                                    className={`${iCls} font-mono min-w-0`}
                                    style={iSty}
                                    placeholder="ON"
                                    value={entry.stateValue ?? ''}
                                    onChange={(e) => onUpdate({ stateValue: e.target.value })}
                                />
                            </div>
                        ) : (
                            <p
                                className="text-[9px] leading-tight mt-1"
                                style={{ color: 'var(--text-secondary)', opacity: 0.7 }}
                            >
                                An bei true, Zahlen ungleich 0 und Texten wie ON; aus bei false, 0, off und leer. Andere
                                Werte über {'„Bedingung“'} vergleichen.
                            </p>
                        )}
                    </div>
                    <ToggleRow
                        label="Sicherheitsabfrage"
                        checked={!!entry.confirm}
                        onChange={(v) => onUpdate({ confirm: v || undefined })}
                    />
                    {entry.confirm && (
                        <input
                            className={iCls}
                            style={iSty}
                            placeholder="Wirklich schalten?"
                            value={entry.confirmText ?? ''}
                            onChange={(e) => onUpdate({ confirmText: e.target.value || undefined })}
                        />
                    )}
                </div>
            )}

            {/* ── Datum/Zeit ── */}
            {/* ── Schieberegler ── */}
            {/* Same option set as the standalone Schieberegler widget, per row, so a
                list can drive a 0…255 dimmer or a −20…40 setpoint. The widget's
                vertical orientation is left out: a list row is a horizontal strip. */}
            {dt === 'slider' && (
                <div className="space-y-1.5">
                    <div className="grid grid-cols-3 gap-1.5">
                        <div>
                            <Label>Min</Label>
                            <input
                                type="number"
                                className={iCls}
                                style={iSty}
                                placeholder="0"
                                value={entry.sliderMin ?? ''}
                                onChange={(e) =>
                                    onUpdate({ sliderMin: e.target.value === '' ? undefined : Number(e.target.value) })
                                }
                            />
                        </div>
                        <div>
                            <Label>Max</Label>
                            <input
                                type="number"
                                className={iCls}
                                style={iSty}
                                placeholder="100"
                                value={entry.sliderMax ?? ''}
                                onChange={(e) =>
                                    onUpdate({ sliderMax: e.target.value === '' ? undefined : Number(e.target.value) })
                                }
                            />
                        </div>
                        <div>
                            <Label>Schritt</Label>
                            <input
                                type="number"
                                className={iCls}
                                style={iSty}
                                placeholder="1"
                                value={entry.sliderStep ?? ''}
                                onChange={(e) =>
                                    onUpdate({ sliderStep: e.target.value === '' ? undefined : Number(e.target.value) })
                                }
                            />
                        </div>
                    </div>
                    <div>
                        <Label>Optik</Label>
                        <div className="flex gap-1">
                            {(
                                [
                                    [false, 'Regler'],
                                    [true, 'Balken'],
                                ] as const
                            ).map(([bar, label]) => {
                                const active = !!entry.sliderBarStyle === bar;
                                return (
                                    <button
                                        key={label}
                                        onClick={() => onUpdate({ sliderBarStyle: bar || undefined })}
                                        className="flex-1 text-[10px] px-2 py-1 rounded transition-colors"
                                        style={{
                                            background: active ? 'var(--accent)' : 'var(--app-bg)',
                                            color: active ? '#fff' : 'var(--text-secondary)',
                                            border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                        }}
                                    >
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                        <div>
                            <Label>{entry.sliderBarStyle ? 'Balkenhöhe (%)' : 'Dicke (px)'}</Label>
                            {entry.sliderBarStyle ? (
                                <input
                                    type="number"
                                    min={5}
                                    max={100}
                                    className={iCls}
                                    style={iSty}
                                    placeholder="100"
                                    value={entry.sliderBarSize ?? ''}
                                    onChange={(e) => {
                                        const n = parseInt(e.target.value, 10);
                                        onUpdate({ sliderBarSize: isFinite(n) && n > 0 ? n : undefined });
                                    }}
                                />
                            ) : (
                                <input
                                    type="number"
                                    min={2}
                                    max={24}
                                    className={iCls}
                                    style={iSty}
                                    placeholder="4"
                                    value={entry.sliderThickness ?? ''}
                                    onChange={(e) => {
                                        const n = parseInt(e.target.value, 10);
                                        onUpdate({ sliderThickness: isFinite(n) && n > 0 ? n : undefined });
                                    }}
                                />
                            )}
                        </div>
                        <div>
                            <Label>Breite (px, leer = 80)</Label>
                            <input
                                type="number"
                                min={40}
                                max={600}
                                className={iCls}
                                style={iSty}
                                placeholder="80"
                                value={entry.sliderWidth ?? ''}
                                onChange={(e) => {
                                    const n = parseInt(e.target.value, 10);
                                    onUpdate({ sliderWidth: isFinite(n) && n > 0 ? n : undefined });
                                }}
                            />
                        </div>
                    </div>
                    <div>
                        <Label>Farbe</Label>
                        <div className="flex gap-1 items-center">
                            <ColorPicker
                                value={entry.sliderColor?.match(/#[0-9a-fA-F]{6}/)?.[0] ?? '#3b82f6'}
                                onChange={(v) => onUpdate({ sliderColor: v })}
                                className="w-7 h-6 rounded cursor-pointer shrink-0"
                                style={{ border: '1px solid var(--app-border)', padding: '1px' }}
                            />
                            <input
                                className={iCls}
                                style={iSty}
                                placeholder="var(--accent)"
                                value={entry.sliderColor ?? ''}
                                onChange={(e) => onUpdate({ sliderColor: e.target.value || undefined })}
                            />
                        </div>
                    </div>
                    <ToggleRow
                        label="Wert anzeigen"
                        checked={entry.sliderShowValue !== false}
                        onChange={(v) => onUpdate({ sliderShowValue: v ? undefined : false })}
                    />
                    <ToggleRow
                        label="Einheit anzeigen"
                        checked={entry.sliderShowUnit !== false}
                        onChange={(v) => onUpdate({ sliderShowUnit: v ? undefined : false })}
                    />
                    <ToggleRow
                        label="Min/Max-Beschriftung"
                        checked={!!entry.sliderShowMinMax}
                        onChange={(v) => onUpdate({ sliderShowMinMax: v || undefined })}
                    />
                    <ToggleRow
                        label="Erst beim Loslassen schreiben"
                        checked={!!entry.sliderCommitOnRelease}
                        onChange={(v) => onUpdate({ sliderCommitOnRelease: v || undefined })}
                    />
                    <ToggleRow
                        label="Fortschrittsanzeige (nicht bedienbar)"
                        checked={!!entry.sliderReadOnly}
                        onChange={(v) => onUpdate({ sliderReadOnly: v || undefined })}
                    />
                    <p className="text-[9px] leading-tight" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                        Die Einheit stammt aus dem Feld „Einheit“ des Eintrags; ohne Angabe steht „%“ daneben.
                    </p>
                </div>
            )}

            {dt === 'time' && (
                <div className="space-y-1.5">
                    <div>
                        <Label>Format</Label>
                        <select
                            value={entry.timeFormat || 'time'}
                            onChange={(e) =>
                                onUpdate({
                                    timeFormat: e.target.value,
                                    timePattern:
                                        e.target.value === 'custom'
                                            ? (entry.timePattern ?? 'dd.MM.yyyy HH:mm')
                                            : undefined,
                                })
                            }
                            className={iCls}
                            style={iSty}
                        >
                            {TIME_DISPLAY_PRESETS.filter((p) => p.id !== 'none').map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.label}
                                </option>
                            ))}
                            <option value="custom">Eigenes Format…</option>
                        </select>
                    </div>
                    {entry.timeFormat === 'custom' && (
                        <div>
                            <Label>Muster</Label>
                            <input
                                className={`${iCls} font-mono`}
                                style={iSty}
                                value={entry.timePattern ?? ''}
                                onChange={(e) => onUpdate({ timePattern: e.target.value || undefined })}
                                placeholder="dd.MM.yyyy HH:mm"
                            />
                            <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                                Tokens: HH mm ss · dd MM yyyy yy · EEEE (Wochentag) · EE · MMMM (Monat) · ww (KW)
                            </p>
                        </div>
                    )}
                    <p className="text-[9px]" style={{ color: 'var(--text-secondary)', opacity: 0.75 }}>
                        {timePreview
                            ? `Vorschau: ${timePreview}`
                            : 'Zeitstempel (Sekunden/Millisekunden), ISO-Zeitangaben und HH:mm werden automatisch erkannt.'}
                    </p>
                </div>
            )}

            {/* ── Datumswähler (Datum/Zeit setzen) ── */}
            {dt === 'datepicker' && (
                <div className="space-y-1.5">
                    <div>
                        <Label>Eingabeformat</Label>
                        <select
                            value={entry.dateInputFormat ?? 'picker'}
                            onChange={(e) =>
                                onUpdate({ dateInputFormat: e.target.value === 'custom' ? 'custom' : undefined })
                            }
                            className={iCls}
                            style={iSty}
                        >
                            <option value="picker">Datums-/Zeitwähler</option>
                            <option value="custom">Eigenes Format…</option>
                        </select>
                    </div>
                    {entry.dateInputFormat === 'custom' ? (
                        <div>
                            <Label>Eingabe-Muster</Label>
                            <input
                                className={`${iCls} font-mono`}
                                style={iSty}
                                placeholder="z.B. MM.yyyy"
                                value={entry.dateInputPattern ?? ''}
                                onChange={(e) => onUpdate({ dateInputPattern: e.target.value || undefined })}
                            />
                            <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                                Das Muster bestimmt die Auswahl: <code>MM.yyyy</code> → Monatswähler,{' '}
                                <code>dd.MM.yyyy</code> → Kalender, <code>HH:mm</code> → Uhrzeit; sonst freies Textfeld.
                                Nicht genannte Teile bleiben erhalten. Tokens: {DATE_PATTERN_TOKENS}
                            </p>
                        </div>
                    ) : (
                        <>
                            <ToggleRow
                                label="Nur Uhrzeit (kein Datum)"
                                checked={!!entry.dateTimeOnly}
                                onChange={(v) =>
                                    onUpdate({
                                        dateTimeOnly: v || undefined,
                                        dateShowTime: v ? true : entry.dateShowTime,
                                    })
                                }
                            />
                            {!entry.dateTimeOnly && (
                                <ToggleRow
                                    label="Uhrzeit-Eingabe anzeigen"
                                    checked={!!entry.dateShowTime}
                                    onChange={(v) => onUpdate({ dateShowTime: v || undefined })}
                                />
                            )}
                        </>
                    )}
                    <div>
                        <Label>Ausgabeformat</Label>
                        <select
                            value={entry.dateOutputFormat ?? 'timestamp_ms'}
                            onChange={(e) => {
                                const v = e.target.value as DateOutputFormat;
                                onUpdate({
                                    dateOutputFormat: v === 'timestamp_ms' ? undefined : v,
                                    dateOutputPattern:
                                        v === 'custom'
                                            ? (entry.dateOutputPattern ?? DEFAULT_DATE_PATTERN)
                                            : entry.dateOutputPattern,
                                });
                            }}
                            className={iCls}
                            style={iSty}
                        >
                            {(Object.entries(FORMAT_LABELS) as [DateOutputFormat, string][]).map(([key, label]) => (
                                <option key={key} value={key}>
                                    {label}
                                </option>
                            ))}
                        </select>
                    </div>
                    {entry.dateOutputFormat === 'custom' && (
                        <div>
                            <Label>Ausgabe-Muster</Label>
                            <input
                                className={`${iCls} font-mono`}
                                style={iSty}
                                placeholder={DEFAULT_DATE_PATTERN}
                                value={entry.dateOutputPattern ?? ''}
                                onChange={(e) => onUpdate({ dateOutputPattern: e.target.value || undefined })}
                            />
                            <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                                Tokens: {DATE_PATTERN_TOKENS}
                            </p>
                        </div>
                    )}
                    <p className="text-[9px]" style={{ color: 'var(--text-secondary)', opacity: 0.75 }}>
                        {datePreview && datePreview !== '–'
                            ? `Gesetzt: ${datePreview}`
                            : 'Der gewählte Wert wird im Ausgabeformat in den Datenpunkt geschrieben.'}
                    </p>
                </div>
            )}

            {/* ── Rollladen (shutter) ── */}
            {dt === 'shutter' && (
                <div className="space-y-1.5">
                    <button
                        onClick={autoDetectShutter}
                        disabled={!entry.id}
                        title="Steuerung & DPs anhand benachbarter Datenpunkte automatisch erkennen (Befehls-DPs oder LEVEL)"
                        className="w-full flex items-center justify-center gap-1 text-[10px] py-1 rounded hover:opacity-80 disabled:opacity-40"
                        style={{
                            background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                            color: 'var(--accent)',
                            border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                        }}
                    >
                        <Wand2 size={10} /> Auto-Erkennung
                    </button>
                    {autoMsg && (
                        <p className="text-[9px]" style={{ color: 'var(--text-secondary)', opacity: 0.75 }}>
                            {autoMsg}
                        </p>
                    )}

                    {/* Steuerungs-Modell: separate Befehls-DPs oder Position über LEVEL */}
                    <div>
                        <Label>Steuerung</Label>
                        <div className="flex gap-1">
                            {(
                                [
                                    ['commands', 'Befehls-DPs'],
                                    ['position', 'Position (LEVEL)'],
                                ] as const
                            ).map(([v, lbl]) => {
                                const active = sMode === v;
                                return (
                                    <button
                                        key={v}
                                        onClick={() => onUpdate({ shutterMode: v === 'commands' ? undefined : v })}
                                        className="flex-1 text-[10px] py-1 rounded transition-colors"
                                        style={{
                                            background: active ? 'var(--accent)' : 'var(--app-bg)',
                                            color: active ? '#fff' : 'var(--text-secondary)',
                                            border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                        }}
                                    >
                                        {lbl}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {sMode === 'position' ? (
                        <>
                            <p className="text-[9px]" style={{ color: 'var(--text-secondary)', opacity: 0.65 }}>
                                {
                                    'Steuert den Haupt-DP des Eintrags (z.B. LEVEL): „Auf“ / „Ab“ schreiben den jeweiligen Wert, „Stop“ schreibt die aktuelle Position zurück (oder nutzt den Stop-DP).'
                                }
                            </p>
                            <div className="grid grid-cols-2 gap-1.5">
                                <div>
                                    <Label>Auf-Wert (Standard: 100)</Label>
                                    <input
                                        type="number"
                                        className={iCls}
                                        style={iSty}
                                        placeholder="100"
                                        value={entry.shutterOpenValue ?? ''}
                                        onChange={(e) =>
                                            onUpdate({
                                                shutterOpenValue:
                                                    e.target.value === '' ? undefined : Number(e.target.value),
                                            })
                                        }
                                    />
                                </div>
                                <div>
                                    <Label>Ab-Wert (Standard: 0)</Label>
                                    <input
                                        type="number"
                                        className={iCls}
                                        style={iSty}
                                        placeholder="0"
                                        value={entry.shutterCloseValue ?? ''}
                                        onChange={(e) =>
                                            onUpdate({
                                                shutterCloseValue:
                                                    e.target.value === '' ? undefined : Number(e.target.value),
                                            })
                                        }
                                    />
                                </div>
                            </div>
                            <DpRow
                                label="Stop-DP (optional)"
                                value={entry.shutterStopDp}
                                onPick={() => setPickFor('shutterStopDp')}
                            />
                        </>
                    ) : (
                        <>
                            <div className="grid grid-cols-3 gap-1.5">
                                <DpRow
                                    label="Auf-DP"
                                    value={entry.shutterUpDp}
                                    onPick={() => setPickFor('shutterUpDp')}
                                />
                                <DpRow
                                    label="Stop-DP"
                                    value={entry.shutterStopDp}
                                    onPick={() => setPickFor('shutterStopDp')}
                                />
                                <DpRow
                                    label="Ab-DP"
                                    value={entry.shutterDownDp}
                                    onPick={() => setPickFor('shutterDownDp')}
                                />
                            </div>
                            <div>
                                <Label>Schreibwert (Standard: true)</Label>
                                <input
                                    className={iCls}
                                    style={iSty}
                                    placeholder="true"
                                    value={entry.shutterWriteValue === undefined ? '' : String(entry.shutterWriteValue)}
                                    onChange={(e) =>
                                        onUpdate({
                                            shutterWriteValue: e.target.value === '' ? undefined : e.target.value,
                                        })
                                    }
                                />
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ── Stepper ── */}
            {dt === 'stepper' && (
                <div className="grid grid-cols-3 gap-1.5">
                    <div>
                        <Label>Min</Label>
                        <input
                            type="number"
                            className={iCls}
                            style={iSty}
                            value={entry.stepMin ?? ''}
                            onChange={(e) =>
                                onUpdate({ stepMin: e.target.value === '' ? undefined : Number(e.target.value) })
                            }
                        />
                    </div>
                    <div>
                        <Label>Max</Label>
                        <input
                            type="number"
                            className={iCls}
                            style={iSty}
                            value={entry.stepMax ?? ''}
                            onChange={(e) =>
                                onUpdate({ stepMax: e.target.value === '' ? undefined : Number(e.target.value) })
                            }
                        />
                    </div>
                    <div>
                        <Label>Schritt</Label>
                        <input
                            type="number"
                            className={iCls}
                            style={iSty}
                            placeholder="1"
                            value={entry.stepStep ?? ''}
                            onChange={(e) =>
                                onUpdate({ stepStep: e.target.value === '' ? undefined : Number(e.target.value) })
                            }
                        />
                    </div>
                </div>
            )}

            {/* ── Wert-Presets / Tasten ── */}
            {dt === 'buttons' && (
                <div className="space-y-1">
                    {/* Herkunft der Tasten — Liste oder JSON-Datenpunkt, wie beim Auswahl-Widget. */}
                    <div>
                        <Label>Herkunft</Label>
                        <div className="flex gap-1">
                            {(
                                [
                                    [undefined, 'Liste'],
                                    ['json', 'JSON-Datenpunkt'],
                                ] as const
                            ).map(([src, label]) => {
                                const active = (entry.presetsSource ?? undefined) === src;
                                return (
                                    <button
                                        key={label}
                                        onClick={() => onUpdate({ presetsSource: src })}
                                        className="flex-1 text-[10px] px-2 py-1 rounded transition-colors"
                                        style={{
                                            background: active ? 'var(--accent)' : 'var(--app-bg)',
                                            color: active ? '#fff' : 'var(--text-secondary)',
                                            border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                        }}
                                    >
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <ToggleRow
                        label="Als Auswahlliste (Dropdown)"
                        checked={!!entry.presetSelect}
                        onChange={(v) => onUpdate({ presetSelect: v || undefined })}
                    />
                    {entry.presetsSource === 'json' ? (
                        <>
                            <DpRow
                                label="Datenpunkt mit JSON"
                                value={entry.presetsDp}
                                onPick={() => setPickFor('presetsDp')}
                            />
                            <p className="text-[9px] leading-tight" style={{ color: 'var(--text-secondary)' }}>
                                Array von Objekten oder ein Wert-zu-Text-Objekt. Die Feldnamen werden erkannt; die
                                Felder unten überschreiben sie.
                            </p>
                            <div className="grid grid-cols-2 gap-1.5">
                                {(
                                    [
                                        ['presetsValueKey', 'Wert-Feld', 'value'],
                                        ['presetsLabelKey', 'Text-Feld', 'label'],
                                        ['presetsColorKey', 'Farb-Feld', 'color'],
                                        ['presetsIconKey', 'Icon-Feld', 'icon'],
                                        ['presetsImageKey', 'Bild-Feld', 'image'],
                                    ] as const
                                ).map(([key, label, ph]) => (
                                    <div key={key}>
                                        <Label>{label}</Label>
                                        <input
                                            className={`${iCls} font-mono`}
                                            style={iSty}
                                            placeholder={ph}
                                            value={entry[key] ?? ''}
                                            onChange={(e) => onUpdate({ [key]: e.target.value || undefined })}
                                        />
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex items-center justify-between">
                                <Label>Werte-Tasten</Label>
                                <button
                                    onClick={() => onUpdate({ presets: [...presets, { value: '', label: '' }] })}
                                    className="text-[10px] px-1.5 py-0.5 rounded hover:opacity-80"
                                    style={{
                                        background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                                        color: 'var(--accent)',
                                    }}
                                >
                                    + Hinzufügen
                                </button>
                            </div>
                            {presets.map((p, i) => (
                                <div key={i} className="space-y-1">
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => setPresetIconFor(i)}
                                            title={p.icon || 'Icon wählen'}
                                            className="shrink-0 flex items-center justify-center rounded hover:opacity-80"
                                            style={{ ...iSty, width: 26, height: 26 }}
                                        >
                                            {p.icon ? (
                                                <Icon icon={toIconifyId(p.icon)} width={14} height={14} />
                                            ) : (
                                                <Plus
                                                    size={12}
                                                    style={{ color: 'var(--text-secondary)', opacity: 0.6 }}
                                                />
                                            )}
                                        </button>
                                        <input
                                            className={`${iCls} font-mono`}
                                            style={{ ...iSty, width: 56 }}
                                            placeholder="Wert"
                                            value={String(p.value)}
                                            onChange={(e) => {
                                                const raw = e.target.value;
                                                const num = Number(raw);
                                                setPreset(i, { value: raw !== '' && isFinite(num) ? num : raw });
                                            }}
                                        />
                                        <input
                                            className={iCls}
                                            style={iSty}
                                            placeholder="Label"
                                            value={p.label ?? ''}
                                            onChange={(e) => setPreset(i, { label: e.target.value || undefined })}
                                        />
                                        <ColorPicker
                                            value={p.color?.match(/#[0-9a-fA-F]{6}/)?.[0] ?? '#94a3b8'}
                                            onChange={(v) => setPreset(i, { color: v })}
                                            className="w-7 h-6 rounded cursor-pointer shrink-0"
                                            style={{ border: '1px solid var(--app-border)', padding: '1px' }}
                                        />
                                        <button
                                            onClick={() => onUpdate({ presets: presets.filter((_, j) => j !== i) })}
                                            className="shrink-0 hover:opacity-70 p-1"
                                            style={{ color: 'var(--text-secondary)' }}
                                        >
                                            <X size={11} />
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-1 pl-[30px]">
                                        <select
                                            value={p.render ?? 'text'}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                setPreset(i, {
                                                    render: v === 'text' ? undefined : (v as EnumRender),
                                                });
                                            }}
                                            className={iCls}
                                            style={{ ...iSty, width: 78 }}
                                        >
                                            <option value="text">Text</option>
                                            <option value="icon">Icon</option>
                                            <option value="image">Bild</option>
                                            <option value="html">HTML</option>
                                        </select>
                                        {p.render === 'image' && (
                                            <input
                                                className={`${iCls} font-mono`}
                                                style={iSty}
                                                placeholder="Bildpfad / URL"
                                                value={p.image ?? ''}
                                                onChange={(e) => setPreset(i, { image: e.target.value || undefined })}
                                            />
                                        )}
                                        {(p.render === 'image' || p.render === 'icon') && (
                                            <input
                                                type="number"
                                                min={8}
                                                max={64}
                                                className={iCls}
                                                style={{ ...iSty, width: 52 }}
                                                placeholder="14"
                                                title="Größe in px"
                                                value={p.size ?? ''}
                                                onChange={(e) => {
                                                    const n = parseInt(e.target.value, 10);
                                                    setPreset(i, { size: isFinite(n) && n > 0 ? n : undefined });
                                                }}
                                            />
                                        )}
                                    </div>
                                </div>
                            ))}
                            {presets.length === 0 && (
                                <p
                                    className="text-[9px] italic"
                                    style={{ color: 'var(--text-secondary)', opacity: 0.45 }}
                                >
                                    {'Noch keine Werte. „Hinzufügen“ für eine Taste.'}
                                </p>
                            )}
                            <ImagePathHint />
                        </>
                    )}
                </div>
            )}

            {dt === 'momentary' && (
                <div className="space-y-1.5">
                    <div className="grid grid-cols-2 gap-1.5">
                        <div>
                            <Label>Beschriftung</Label>
                            <input
                                className={iCls}
                                style={iSty}
                                placeholder="Auslösen"
                                value={entry.pulseLabel ?? ''}
                                onChange={(e) => onUpdate({ pulseLabel: e.target.value || undefined })}
                            />
                        </div>
                        <div>
                            <Label>Wert (Standard: true)</Label>
                            <input
                                className={`${iCls} font-mono`}
                                style={iSty}
                                placeholder="true"
                                value={entry.pulseValue === undefined ? '' : String(entry.pulseValue)}
                                onChange={(e) =>
                                    onUpdate({ pulseValue: e.target.value === '' ? undefined : e.target.value })
                                }
                            />
                        </div>
                    </div>
                    <div className="flex items-center justify-between">
                        <label className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                            Nach Verzögerung zurücksetzen
                        </label>
                        <button
                            onClick={() => onUpdate({ pulseReset: !entry.pulseReset })}
                            className="relative w-9 h-5 rounded-full transition-colors"
                            style={{ background: entry.pulseReset ? 'var(--accent)' : 'var(--app-border)' }}
                        >
                            <span
                                className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                                style={{ left: entry.pulseReset ? '18px' : '2px' }}
                            />
                        </button>
                    </div>
                    {entry.pulseReset && (
                        <div className="grid grid-cols-2 gap-1.5">
                            <div>
                                <Label>Reset-Wert (Standard: false)</Label>
                                <input
                                    className={`${iCls} font-mono`}
                                    style={iSty}
                                    placeholder="false"
                                    value={entry.pulseResetValue === undefined ? '' : String(entry.pulseResetValue)}
                                    onChange={(e) =>
                                        onUpdate({
                                            pulseResetValue: e.target.value === '' ? undefined : e.target.value,
                                        })
                                    }
                                />
                            </div>
                            <div>
                                <Label>Verzögerung (ms)</Label>
                                <input
                                    type="number"
                                    className={`${iCls} tabular-nums`}
                                    style={iSty}
                                    placeholder="500"
                                    value={entry.pulseDelay ?? ''}
                                    onChange={(e) =>
                                        onUpdate({
                                            pulseDelay: e.target.value === '' ? undefined : Number(e.target.value),
                                        })
                                    }
                                />
                            </div>
                        </div>
                    )}
                    <ToggleRow
                        label="Sicherheitsabfrage"
                        checked={!!entry.confirm}
                        onChange={(v) => onUpdate({ confirm: v || undefined })}
                    />
                    {entry.confirm && (
                        <input
                            className={iCls}
                            style={iSty}
                            placeholder="Wirklich auslösen?"
                            value={entry.confirmText ?? ''}
                            onChange={(e) => onUpdate({ confirmText: e.target.value || undefined })}
                        />
                    )}
                </div>
            )}

            {/* ── Zustände (Wert→Label/Icon/Farbe) ── */}
            {dt === 'states' && (
                <div className="space-y-1">
                    <button
                        onClick={loadStatesFromObject}
                        disabled={!entry.id}
                        title="Zustände aus common.states des Datenpunkts übernehmen"
                        className="w-full flex items-center justify-center gap-1 text-[10px] py-1 rounded hover:opacity-80 disabled:opacity-40"
                        style={{
                            background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                            color: 'var(--accent)',
                            border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                        }}
                    >
                        <Wand2 size={10} /> Aus common.states laden
                    </button>
                    {stateMsg && (
                        <p className="text-[9px]" style={{ color: 'var(--text-secondary)', opacity: 0.75 }}>
                            {stateMsg}
                        </p>
                    )}
                    <div className="flex items-center justify-between">
                        <Label>Wertzuordnung (Wert → Anzeige)</Label>
                        <button
                            onClick={() =>
                                onUpdate({ states: [...stateMaps, { value: '', label: '', color: undefined }] })
                            }
                            className="text-[10px] px-1.5 py-0.5 rounded hover:opacity-80"
                            style={{
                                background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                                color: 'var(--accent)',
                            }}
                        >
                            + Hinzufügen
                        </button>
                    </div>
                    {stateMaps.map((s, i) => (
                        <div key={i} className="space-y-1">
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setStatePickFor(i)}
                                    title={s.icon || 'Icon wählen'}
                                    className="shrink-0 flex items-center justify-center rounded hover:opacity-80"
                                    style={{ ...iSty, width: 26, height: 26 }}
                                >
                                    {s.icon ? (
                                        <Icon icon={toIconifyId(s.icon)} width={14} height={14} />
                                    ) : (
                                        <Plus size={12} style={{ color: 'var(--text-secondary)', opacity: 0.6 }} />
                                    )}
                                </button>
                                <select
                                    value={s.op ?? '=='}
                                    title="Vergleich"
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setStateMap(i, { op: v === '==' ? undefined : (v as ConditionOperator) });
                                    }}
                                    className={iCls}
                                    style={{ ...iSty, width: 46 }}
                                >
                                    <option value="==">=</option>
                                    <option value="!=">≠</option>
                                    <option value=">">&gt;</option>
                                    <option value=">=">≥</option>
                                    <option value="<">&lt;</option>
                                    <option value="<=">≤</option>
                                    <option value="contains">enth.</option>
                                </select>
                                <input
                                    className={`${iCls} font-mono`}
                                    style={{ ...iSty, width: 56 }}
                                    placeholder="Wert"
                                    value={String(s.value)}
                                    onChange={(e) => {
                                        const raw = e.target.value;
                                        const num = Number(raw);
                                        setStateMap(i, { value: raw !== '' && isFinite(num) ? num : raw });
                                    }}
                                />
                                <input
                                    className={iCls}
                                    style={iSty}
                                    placeholder="Text"
                                    value={s.label ?? ''}
                                    onChange={(e) => setStateMap(i, { label: e.target.value || undefined })}
                                />
                                <ColorPicker
                                    value={s.color?.match(/#[0-9a-fA-F]{6}/)?.[0] ?? '#94a3b8'}
                                    onChange={(v) => setStateMap(i, { color: v })}
                                    className="w-7 h-6 rounded cursor-pointer shrink-0"
                                    style={{ border: '1px solid var(--app-border)', padding: '1px' }}
                                />
                                <button
                                    onClick={() => onUpdate({ states: stateMaps.filter((_, j) => j !== i) })}
                                    className="shrink-0 hover:opacity-70 p-1"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    <X size={11} />
                                </button>
                            </div>
                            <div className="flex items-center gap-1 pl-[30px]">
                                <select
                                    value={s.render ?? 'text'}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setStateMap(i, { render: v === 'text' ? undefined : (v as EnumRender) });
                                    }}
                                    className={iCls}
                                    style={{ ...iSty, width: 78 }}
                                >
                                    <option value="text">Text</option>
                                    <option value="icon">Icon</option>
                                    <option value="image">Bild</option>
                                    <option value="html">HTML</option>
                                </select>
                                {s.render === 'image' && (
                                    <input
                                        className={`${iCls} font-mono`}
                                        style={iSty}
                                        placeholder="Bildpfad / URL"
                                        value={s.image ?? ''}
                                        onChange={(e) => setStateMap(i, { image: e.target.value || undefined })}
                                    />
                                )}
                                {(s.render === 'image' || s.render === 'icon') && (
                                    <input
                                        type="number"
                                        min={8}
                                        max={64}
                                        className={iCls}
                                        style={{ ...iSty, width: 52 }}
                                        placeholder="16"
                                        title="Größe in px"
                                        value={s.size ?? ''}
                                        onChange={(e) => {
                                            const n = parseInt(e.target.value, 10);
                                            setStateMap(i, { size: isFinite(n) && n > 0 ? n : undefined });
                                        }}
                                    />
                                )}
                            </div>
                        </div>
                    ))}
                    <p className="text-[9px] leading-tight" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                        Ohne Vergleich gilt Gleichheit. Mit Vergleich wird die Zeile zum Bereich (z. B. ≥ 30) — die
                        erste passende Zeile gewinnt, also von eng nach weit sortieren.
                    </p>
                    <ImagePathHint />
                    {stateMaps.length === 0 && (
                        <p className="text-[9px] italic" style={{ color: 'var(--text-secondary)', opacity: 0.45 }}>
                            {'z.B. Drehgriffkontakt: 0 → Geschlossen, 1 → Gekippt, 2 → Offen'}
                        </p>
                    )}
                </div>
            )}

            {/* ── Fenster-/Türkontakt (Preset-Wertemapping + Aussehen je Zustand) ── */}
            {dt === 'contact' && (
                <div className="space-y-1">
                    <div>
                        <Label>Wertemapping</Label>
                        <select
                            value={contactPreset}
                            onChange={(e) => {
                                const next = e.target.value;
                                if (next !== 'custom') {
                                    onUpdate({
                                        contactPreset: next,
                                        contactValuesClosed: undefined,
                                        contactValuesTilted: undefined,
                                        contactValuesOpen: undefined,
                                    });
                                } else {
                                    const cur = WC_PRESETS[contactPreset] ?? WC_PRESETS.hmip;
                                    onUpdate({
                                        contactPreset: 'custom',
                                        contactValuesClosed: cur.closed,
                                        contactValuesTilted: cur.tilted,
                                        contactValuesOpen: cur.open,
                                    });
                                }
                            }}
                            className={iCls}
                            style={iSty}
                        >
                            {Object.entries(WC_PRESET_LABELS).map(([k, lbl]) => (
                                <option key={k} value={k}>
                                    {lbl}
                                </option>
                            ))}
                        </select>
                    </div>
                    {contactPreset === 'custom' &&
                        (['closed', 'tilted', 'open'] as const).map((st) => {
                            const cur =
                                st === 'closed'
                                    ? entry.contactValuesClosed
                                    : st === 'tilted'
                                      ? entry.contactValuesTilted
                                      : entry.contactValuesOpen;
                            return (
                                <div key={st}>
                                    <Label>Werte {WC_FALLBACK[st].label} (kommagetrennt)</Label>
                                    <input
                                        className={`${iCls} font-mono`}
                                        style={iSty}
                                        placeholder={WC_PRESETS.hmip[st] || '–'}
                                        value={cur ?? WC_PRESETS.hmip[st]}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            onUpdate(
                                                st === 'closed'
                                                    ? { contactValuesClosed: v }
                                                    : st === 'tilted'
                                                      ? { contactValuesTilted: v }
                                                      : { contactValuesOpen: v },
                                            );
                                        }}
                                    />
                                </div>
                            );
                        })}
                    <Label>Aussehen je Zustand</Label>
                    {(['closed', 'tilted', 'open'] as const).map((st) => {
                        const ov = entry.contactAppearance?.[st];
                        const fb = WC_FALLBACK[st];
                        return (
                            <div key={st} className="flex items-center gap-1">
                                <button
                                    onClick={() => setContactIconPickFor(st)}
                                    title={ov?.icon || fb.label}
                                    className="shrink-0 flex items-center justify-center rounded hover:opacity-80"
                                    style={{ ...iSty, width: 26, height: 26 }}
                                >
                                    <Icon
                                        icon={toIconifyId(ov?.icon || WC_FALLBACK_ICON_NAME[st])}
                                        width={14}
                                        height={14}
                                    />
                                </button>
                                <input
                                    className={iCls}
                                    style={iSty}
                                    placeholder={fb.label}
                                    value={ov?.label ?? ''}
                                    onChange={(e) => setContactAppearance(st, { label: e.target.value || undefined })}
                                />
                                <ColorPicker
                                    value={ov?.color?.match(/#[0-9a-fA-F]{6}/)?.[0] ?? fb.color}
                                    onChange={(v) => setContactAppearance(st, { color: v })}
                                    className="w-7 h-6 rounded cursor-pointer shrink-0"
                                    style={{ border: '1px solid var(--app-border)', padding: '1px' }}
                                />
                            </div>
                        );
                    })}
                    {/* Verriegelung - das Schloss-Datenpunkt-Feld des Kontakt-Widgets. */}
                    <DpRow
                        label="Verriegelung (optional)"
                        value={entry.contactLockDp}
                        onPick={() => setPickFor('contactLockDp')}
                    />
                    {entry.contactLockDp && (
                        <>
                            <div>
                                <Label>Werte "abgeschlossen" (kommagetrennt)</Label>
                                <input
                                    className={`${iCls} font-mono`}
                                    style={iSty}
                                    placeholder="true,1"
                                    value={entry.contactLockValues ?? ''}
                                    onChange={(e) => onUpdate({ contactLockValues: e.target.value || undefined })}
                                />
                            </div>
                            <button
                                onClick={() => onUpdate({ contactLockDp: undefined, contactLockValues: undefined })}
                                className="text-[9px] px-1.5 py-0.5 rounded hover:opacity-80"
                                style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)' }}
                            >
                                Verriegelung entfernen
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* ── Eingabefeld (Freitext / Zahl) ── */}
            {dt === 'input' && (
                <div className="space-y-1.5">
                    <div>
                        <Label>Platzhalter</Label>
                        <input
                            className={iCls}
                            style={iSty}
                            placeholder="z.B. Nachricht eingeben…"
                            value={entry.inputPlaceholder ?? ''}
                            onChange={(e) => onUpdate({ inputPlaceholder: e.target.value || undefined })}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                        <div>
                            <Label>Feldbreite (px, leer = Standard)</Label>
                            <input
                                type="number"
                                min={40}
                                max={600}
                                className={iCls}
                                style={iSty}
                                placeholder="110"
                                value={entry.inputWidth ?? ''}
                                onChange={(e) => {
                                    const n = parseInt(e.target.value, 10);
                                    onUpdate({ inputWidth: isFinite(n) && n > 0 ? n : undefined });
                                }}
                            />
                        </div>
                        <div>
                            <Label>Eingabeart</Label>
                            <select
                                value={entry.inputMode ?? 'text'}
                                onChange={(e) =>
                                    onUpdate({ inputMode: e.target.value === 'number' ? 'number' : undefined })
                                }
                                className={iCls}
                                style={iSty}
                            >
                                <option value="text">Text</option>
                                <option value="number">Zahl</option>
                            </select>
                        </div>
                    </div>
                    {/* Zahlmodus: Bereich und Schrittweite wie im Eingabefeld-Widget. */}
                    {entry.inputMode === 'number' && !entry.inputMultiline && (
                        <div className="grid grid-cols-3 gap-1.5">
                            <div>
                                <Label>Min</Label>
                                <input
                                    type="number"
                                    className={iCls}
                                    style={iSty}
                                    value={entry.inputMin ?? ''}
                                    onChange={(e) =>
                                        onUpdate({
                                            inputMin: e.target.value === '' ? undefined : Number(e.target.value),
                                        })
                                    }
                                />
                            </div>
                            <div>
                                <Label>Max</Label>
                                <input
                                    type="number"
                                    className={iCls}
                                    style={iSty}
                                    value={entry.inputMax ?? ''}
                                    onChange={(e) =>
                                        onUpdate({
                                            inputMax: e.target.value === '' ? undefined : Number(e.target.value),
                                        })
                                    }
                                />
                            </div>
                            <div>
                                <Label>Schritt</Label>
                                <input
                                    type="number"
                                    className={iCls}
                                    style={iSty}
                                    placeholder="1"
                                    value={entry.inputStep ?? ''}
                                    onChange={(e) =>
                                        onUpdate({
                                            inputStep: e.target.value === '' ? undefined : Number(e.target.value),
                                        })
                                    }
                                />
                            </div>
                        </div>
                    )}
                    <ToggleRow
                        label="Mehrzeilig"
                        checked={!!entry.inputMultiline}
                        onChange={(v) => onUpdate({ inputMultiline: v || undefined })}
                    />
                    {entry.inputMultiline && (
                        <div>
                            <Label>Höhe (px, leer = 48)</Label>
                            <input
                                type="number"
                                min={24}
                                max={400}
                                className={iCls}
                                style={iSty}
                                placeholder="48"
                                value={entry.inputHeight ?? ''}
                                onChange={(e) => {
                                    const n = parseInt(e.target.value, 10);
                                    onUpdate({ inputHeight: isFinite(n) && n > 0 ? n : undefined });
                                }}
                            />
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-1.5">
                        <div>
                            <Label>Übertragen</Label>
                            <select
                                value={entry.inputSubmitMode ?? 'submit'}
                                onChange={(e) =>
                                    onUpdate({ inputSubmitMode: e.target.value === 'live' ? 'live' : undefined })
                                }
                                className={iCls}
                                style={iSty}
                            >
                                <option value="submit">Nach Bestätigung</option>
                                <option value="live">Bei jedem Tastenschlag</option>
                            </select>
                        </div>
                        <div>
                            <Label>Textausrichtung</Label>
                            <select
                                value={entry.inputTextAlign ?? 'left'}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    onUpdate({
                                        inputTextAlign: v === 'left' ? undefined : (v as 'center' | 'right'),
                                    });
                                }}
                                className={iCls}
                                style={iSty}
                            >
                                <option value="left">Links</option>
                                <option value="center">Zentriert</option>
                                <option value="right">Rechts</option>
                            </select>
                        </div>
                    </div>
                    <p className="text-[9px] leading-tight" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                        {inputSubmitMode === 'live'
                            ? 'Jeder Tastenschlag schreibt sofort in den Datenpunkt.'
                            : 'Geschrieben wird mit Enter, beim Verlassen des Felds oder über den Senden-Button.'}
                    </p>
                    {/* Alles darunter gilt nur für „Nach Bestätigung“ und ohne Schreibschutz. */}
                    {inputSubmitMode === 'submit' && !entry.inputReadOnly && (
                        <>
                            <ToggleRow
                                label="Senden-Button anzeigen"
                                checked={entry.inputShowSubmit !== false}
                                onChange={(v) => onUpdate({ inputShowSubmit: v ? undefined : false })}
                            />
                            <ToggleRow
                                label="Feld nach dem Senden leeren"
                                checked={!!entry.inputClearAfterSubmit}
                                onChange={(v) => onUpdate({ inputClearAfterSubmit: v || undefined })}
                            />
                            {entry.inputClearAfterSubmit && (
                                <p
                                    className="text-[9px] leading-tight"
                                    style={{ color: 'var(--text-secondary)', opacity: 0.7 }}
                                >
                                    Befehlsfeld: zeigt nie den Datenpunkt-Wert, sendet nur beim Klick auf Senden bzw.
                                    mit Enter.
                                </p>
                            )}
                            <ToggleRow
                                label="Sicherheitsabfrage"
                                checked={!!entry.confirm}
                                onChange={(v) => onUpdate({ confirm: v || undefined })}
                            />
                            {entry.confirm && (
                                <input
                                    className={iCls}
                                    style={iSty}
                                    placeholder="Wirklich senden?"
                                    value={entry.confirmText ?? ''}
                                    onChange={(e) => onUpdate({ confirmText: e.target.value || undefined })}
                                />
                            )}
                        </>
                    )}
                    <ToggleRow
                        label="Schreibschutz"
                        checked={!!entry.inputReadOnly}
                        onChange={(v) => onUpdate({ inputReadOnly: v || undefined })}
                    />
                </div>
            )}

            {pickFor && (
                <DatapointPicker
                    currentValue={(entry[pickFor] as string) || ''}
                    onSelect={(id) => {
                        if (id) onUpdate({ [pickFor]: id });
                        setPickFor(null);
                    }}
                    onClose={() => setPickFor(null)}
                />
            )}
            {switchIconFor && (
                <IconPickerModal
                    current={entry[switchIconFor] ?? ''}
                    onSelect={(name) => {
                        onUpdate({ [switchIconFor]: name || undefined });
                        setSwitchIconFor(null);
                    }}
                    onClose={() => setSwitchIconFor(null)}
                />
            )}
            {presetIconFor !== null && (
                <IconPickerModal
                    current={presets[presetIconFor]?.icon ?? ''}
                    onSelect={(name) => {
                        // A picked icon only shows up in the icon/HTML-free modes, so
                        // switch the button over unless it already draws something else.
                        setPreset(presetIconFor, {
                            icon: name || undefined,
                            render: name && !presets[presetIconFor]?.render ? 'icon' : presets[presetIconFor]?.render,
                        });
                        setPresetIconFor(null);
                    }}
                    onClose={() => setPresetIconFor(null)}
                />
            )}
            {statePickFor !== null && (
                <IconPickerModal
                    current={stateMaps[statePickFor]?.icon ?? ''}
                    onSelect={(name) => {
                        setStateMap(statePickFor, { icon: name || undefined });
                        setStatePickFor(null);
                    }}
                    onClose={() => setStatePickFor(null)}
                />
            )}
            {contactIconPickFor !== null && (
                <IconPickerModal
                    current={
                        entry.contactAppearance?.[contactIconPickFor]?.icon ?? WC_FALLBACK_ICON_NAME[contactIconPickFor]
                    }
                    onSelect={(name) => {
                        setContactAppearance(contactIconPickFor, { icon: name || undefined });
                        setContactIconPickFor(null);
                    }}
                    onClose={() => setContactIconPickFor(null)}
                />
            )}
        </div>
    );
}
