/**
 * EntryControlsConfig — shared editor block for a list entry's "Darstellung"
 * (displayType) plus the per-type fields it needs. Used by both StaticListConfig
 * and AutoListConfig so the static and dynamic lists offer the same controls.
 */
import { useState } from 'react';
import { X, Database } from 'lucide-react';
import { DatapointPicker } from './DatapointPicker';
import type { EntryControlConfig, EntryDisplayType, EntryPreset } from '../widgets/entryControls';

interface Props {
    entry: EntryControlConfig;
    onUpdate: (patch: Partial<EntryControlConfig>) => void;
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
    const [pickFor, setPickFor] = useState<null | 'shutterUpDp' | 'shutterStopDp' | 'shutterDownDp'>(null);
    const presets = entry.presets ?? [];

    const setPreset = (i: number, patch: Partial<EntryPreset>) => {
        const next = presets.map((p, j) => (j === i ? { ...p, ...patch } : p));
        onUpdate({ presets: next });
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
                <div className="grid grid-cols-3 gap-1.5">
                    <DpRow label="Auf-DP" value={entry.shutterUpDp} onPick={() => setPickFor('shutterUpDp')} />
                    <DpRow label="Stop-DP" value={entry.shutterStopDp} onPick={() => setPickFor('shutterStopDp')} />
                    <DpRow label="Ab-DP" value={entry.shutterDownDp} onPick={() => setPickFor('shutterDownDp')} />
                    <div className="col-span-3">
                        <Label>Schreibwert (Standard: true)</Label>
                        <input
                            className={iCls}
                            style={iSty}
                            placeholder="true"
                            value={entry.shutterWriteValue === undefined ? '' : String(entry.shutterWriteValue)}
                            onChange={(e) =>
                                onUpdate({ shutterWriteValue: e.target.value === '' ? undefined : e.target.value })
                            }
                        />
                    </div>
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
                            Noch keine Werte. „Hinzufügen“ für eine Taste.
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
        </div>
    );
}
