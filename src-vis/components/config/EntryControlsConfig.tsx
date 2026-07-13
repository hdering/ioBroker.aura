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
import { ColorPicker } from '../common/ColorPicker';
import { lucidePascalToIconify } from '../../utils/iconifyLoader';
import { getObjectDirect } from '../../hooks/useIoBroker';
import { ensureDatapointCache, type DatapointEntry } from '../../hooks/useDatapointList';
import type { EntryControlConfig, EntryDisplayType, EntryPreset, EntryStateMap } from '../widgets/entryControls';

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

const TYPE_OPTIONS: { value: EntryDisplayType; label: string }[] = [
    { value: 'auto', label: 'Auto' },
    { value: 'switch', label: 'Schalter' },
    { value: 'slider', label: 'Schieberegler' },
    { value: 'value', label: 'Wert' },
    { value: 'shutter', label: 'Rollladen' },
    { value: 'stepper', label: '+/−' },
    { value: 'buttons', label: 'Tasten' },
    { value: 'momentary', label: 'Taster' },
    { value: 'states', label: 'Zustände' },
];

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

export function EntryControlsConfig({ entry, onUpdate }: Props) {
    const dt = entry.displayType ?? 'auto';
    const sMode = entry.shutterMode ?? 'commands';
    const [pickFor, setPickFor] = useState<null | 'shutterUpDp' | 'shutterStopDp' | 'shutterDownDp'>(null);
    const [statePickFor, setStatePickFor] = useState<number | null>(null);
    const [autoMsg, setAutoMsg] = useState<string | null>(null);
    const [stateMsg, setStateMsg] = useState<string | null>(null);
    const presets = entry.presets ?? [];
    const stateMaps = entry.states ?? [];

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
                <Label>Darstellung</Label>
                <div className="flex flex-wrap gap-1">
                    {TYPE_OPTIONS.map((o) => {
                        const active = dt === o.value;
                        return (
                            <button
                                key={o.value}
                                onClick={() => onUpdate({ displayType: o.value === 'auto' ? undefined : o.value })}
                                className="text-[10px] px-2 py-1 rounded transition-colors"
                                style={{
                                    background: active ? 'var(--accent)' : 'var(--app-bg)',
                                    color: active ? '#fff' : 'var(--text-secondary)',
                                    border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                }}
                            >
                                {o.label}
                            </button>
                        );
                    })}
                </div>
            </div>

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
                        <div key={i} className="flex items-center gap-1">
                            <input
                                className={`${iCls} font-mono`}
                                style={iSty}
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
                            <button
                                onClick={() => onUpdate({ presets: presets.filter((_, j) => j !== i) })}
                                className="shrink-0 hover:opacity-70 p-1"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                <X size={11} />
                            </button>
                        </div>
                    ))}
                    {presets.length === 0 && (
                        <p className="text-[9px] italic" style={{ color: 'var(--text-secondary)', opacity: 0.45 }}>
                            {'Noch keine Werte. „Hinzufügen“ für eine Taste.'}
                        </p>
                    )}
                </div>
            )}

            {/* ── Taster / Impuls ── */}
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
                        <Label>Zustände (Wert → Anzeige)</Label>
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
                        <div key={i} className="flex items-center gap-1">
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
                    ))}
                    {stateMaps.length === 0 && (
                        <p className="text-[9px] italic" style={{ color: 'var(--text-secondary)', opacity: 0.45 }}>
                            {'z.B. Drehgriffkontakt: 0 → Geschlossen, 1 → Gekippt, 2 → Offen'}
                        </p>
                    )}
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
        </div>
    );
}
