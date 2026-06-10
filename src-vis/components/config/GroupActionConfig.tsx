/**
 * GroupActionConfig — shared config block for the group action control.
 * Used by the static list, dynamic list and group widget editors. Operates on a
 * plain options object via get (opts) / set (setOpts) so each host can plug in
 * its own persistence. The action type (switch/dimmer/shutter/momentary) decides
 * which extra fields are shown.
 */
import type { GroupActionConfigOpts, GroupActionType, GroupCandidate } from '../../utils/groupTargets';

interface Props {
    opts: GroupActionConfigOpts;
    setOpts: (patch: Partial<GroupActionConfigOpts>) => void;
    /** Controllable items for the current action type — drives the target checklist. */
    candidates?: GroupCandidate[];
}

const iSty = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
} as React.CSSProperties;
const iCls = 'w-full text-[10px] rounded px-2 py-1 focus:outline-none tabular-nums';

const TYPE_OPTIONS: { value: GroupActionType; label: string }[] = [
    { value: 'switch', label: 'Schalter' },
    { value: 'dimmer', label: 'Dimmer' },
    { value: 'shutter', label: 'Rollladen' },
    { value: 'momentary', label: 'Taster' },
];

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="relative w-9 h-5 rounded-full transition-colors shrink-0"
            style={{ background: on ? 'var(--accent)' : 'var(--app-border)' }}
        >
            <span
                className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                style={{ left: on ? '18px' : '2px' }}
            />
        </button>
    );
}

function Info({ children }: { children: React.ReactNode }) {
    return (
        <p className="text-[9px]" style={{ color: 'var(--text-secondary)', opacity: 0.65 }}>
            {children}
        </p>
    );
}

export function GroupActionConfig({ opts, setOpts, candidates }: Props) {
    const enabled = !!opts.groupSwitch;
    const type = (opts.groupActionType ?? 'switch') as GroupActionType;
    const includeNumbers = !!opts.groupIncludeNumbers;
    const excluded = opts.groupExcludeIds ?? [];
    const toggleExclude = (key: string) => {
        const next = excluded.includes(key) ? excluded.filter((k) => k !== key) : [...excluded, key];
        setOpts({ groupExcludeIds: next.length ? next : undefined });
    };
    const includedCount = (candidates ?? []).filter((c) => !excluded.includes(c.key)).length;

    return (
        <div>
            <div className="flex items-center justify-between">
                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Gruppen-Aktion
                </label>
                <Toggle on={enabled} onClick={() => setOpts({ groupSwitch: !enabled })} />
            </div>
            {enabled && (
                <div className="mt-1.5 space-y-1.5">
                    {/* Action type */}
                    <div>
                        <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                            Typ
                        </label>
                        <div className="flex flex-wrap gap-1">
                            {TYPE_OPTIONS.map((o) => {
                                const active = type === o.value;
                                return (
                                    <button
                                        key={o.value}
                                        onClick={() =>
                                            setOpts({ groupActionType: o.value === 'switch' ? undefined : o.value })
                                        }
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

                    {/* ── Schalter (An/Aus) ── */}
                    {type === 'switch' && (
                        <>
                            <Info>
                                Schaltet alle steuerbaren Datenpunkte gemeinsam. Mittelstellung = gemischter Zustand.
                            </Info>
                            <div>
                                <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                    {'Dimmer „AN“-Wert (AUS = 0)'}
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    max={100}
                                    className={iCls}
                                    style={iSty}
                                    placeholder="100"
                                    value={opts.groupDimmerOnValue ?? ''}
                                    onChange={(e) => {
                                        const n = parseInt(e.target.value, 10);
                                        setOpts({ groupDimmerOnValue: isFinite(n) ? n : undefined });
                                    }}
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                    Zahlenwerte einbeziehen
                                </label>
                                <Toggle
                                    on={includeNumbers}
                                    onClick={() => setOpts({ groupIncludeNumbers: !includeNumbers })}
                                />
                            </div>
                            {includeNumbers && (
                                <div className="grid grid-cols-2 gap-1.5">
                                    <div>
                                        <label
                                            className="text-[9px] block mb-0.5"
                                            style={{ color: 'var(--text-secondary)' }}
                                        >
                                            {'Zahl „AN“-Wert'}
                                        </label>
                                        <input
                                            type="number"
                                            className={iCls}
                                            style={iSty}
                                            placeholder="1"
                                            value={opts.groupNumberOnValue ?? ''}
                                            onChange={(e) => {
                                                const n = Number(e.target.value);
                                                setOpts({
                                                    groupNumberOnValue:
                                                        e.target.value === '' || !isFinite(n) ? undefined : n,
                                                });
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label
                                            className="text-[9px] block mb-0.5"
                                            style={{ color: 'var(--text-secondary)' }}
                                        >
                                            {'Zahl „AUS“-Wert'}
                                        </label>
                                        <input
                                            type="number"
                                            className={iCls}
                                            style={iSty}
                                            placeholder="0"
                                            value={opts.groupNumberOffValue ?? ''}
                                            onChange={(e) => {
                                                const n = Number(e.target.value);
                                                setOpts({
                                                    groupNumberOffValue:
                                                        e.target.value === '' || !isFinite(n) ? undefined : n,
                                                });
                                            }}
                                        />
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* ── Dimmer ── */}
                    {type === 'dimmer' && (
                        <Info>
                            Schieberegler im Header setzt alle Dimmer-/Level-Datenpunkte gemeinsam (Wert beim
                            Loslassen).
                        </Info>
                    )}

                    {/* ── Rollladen ── */}
                    {type === 'shutter' && (
                        <Info>
                            ▲ ■ ▼ steuern alle Rollläden. Auf/Stop/Ab werden automatisch aus den Einträgen (Darstellung
                            „Rollladen") bzw. den Rollladen-Widgets der Gruppe übernommen.
                        </Info>
                    )}

                    {/* ── Taster ── */}
                    {type === 'momentary' && (
                        <div className="space-y-1.5">
                            <Info>Schreibt einen Impuls an alle Datenpunkte der Liste/Gruppe.</Info>
                            <div className="grid grid-cols-2 gap-1.5">
                                <div>
                                    <label
                                        className="text-[9px] block mb-0.5"
                                        style={{ color: 'var(--text-secondary)' }}
                                    >
                                        Beschriftung
                                    </label>
                                    <input
                                        className={iCls.replace(' tabular-nums', '')}
                                        style={iSty}
                                        placeholder="Auslösen"
                                        value={opts.groupPulseLabel ?? ''}
                                        onChange={(e) => setOpts({ groupPulseLabel: e.target.value || undefined })}
                                    />
                                </div>
                                <div>
                                    <label
                                        className="text-[9px] block mb-0.5"
                                        style={{ color: 'var(--text-secondary)' }}
                                    >
                                        Wert (Standard: true)
                                    </label>
                                    <input
                                        className={`${iCls} font-mono`}
                                        style={iSty}
                                        placeholder="true"
                                        value={opts.groupPulseValue === undefined ? '' : String(opts.groupPulseValue)}
                                        onChange={(e) =>
                                            setOpts({
                                                groupPulseValue: e.target.value === '' ? undefined : e.target.value,
                                            })
                                        }
                                    />
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                    Nach Verzögerung zurücksetzen
                                </label>
                                <Toggle
                                    on={!!opts.groupPulseReset}
                                    onClick={() => setOpts({ groupPulseReset: !opts.groupPulseReset })}
                                />
                            </div>
                            {opts.groupPulseReset && (
                                <div className="grid grid-cols-2 gap-1.5">
                                    <div>
                                        <label
                                            className="text-[9px] block mb-0.5"
                                            style={{ color: 'var(--text-secondary)' }}
                                        >
                                            Reset-Wert (Standard: false)
                                        </label>
                                        <input
                                            className={`${iCls} font-mono`}
                                            style={iSty}
                                            placeholder="false"
                                            value={
                                                opts.groupPulseResetValue === undefined
                                                    ? ''
                                                    : String(opts.groupPulseResetValue)
                                            }
                                            onChange={(e) =>
                                                setOpts({
                                                    groupPulseResetValue:
                                                        e.target.value === '' ? undefined : e.target.value,
                                                })
                                            }
                                        />
                                    </div>
                                    <div>
                                        <label
                                            className="text-[9px] block mb-0.5"
                                            style={{ color: 'var(--text-secondary)' }}
                                        >
                                            Verzögerung (ms)
                                        </label>
                                        <input
                                            type="number"
                                            className={iCls}
                                            style={iSty}
                                            placeholder="500"
                                            value={opts.groupPulseDelay ?? ''}
                                            onChange={(e) =>
                                                setOpts({
                                                    groupPulseDelay:
                                                        e.target.value === '' ? undefined : Number(e.target.value),
                                                })
                                            }
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {/* Target checklist — deselect DPs that should not be controlled */}
                    {candidates && candidates.length > 0 && (
                        <details style={{ borderTop: '1px solid var(--app-border)', paddingTop: 6, marginTop: 2 }}>
                            <summary
                                className="text-[10px] cursor-pointer select-none"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                Betroffene Datenpunkte ({includedCount}/{candidates.length})
                            </summary>
                            <div className="mt-1 space-y-0.5 max-h-40 overflow-y-auto aura-scroll">
                                {candidates.map((c) => (
                                    <label
                                        key={c.key}
                                        className="flex items-center gap-2 text-[10px] cursor-pointer py-0.5"
                                        style={{ color: 'var(--text-primary)' }}
                                        title={c.key}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={!excluded.includes(c.key)}
                                            onChange={() => toggleExclude(c.key)}
                                            style={{ accentColor: 'var(--accent)' }}
                                        />
                                        <span className="truncate">{c.label}</span>
                                    </label>
                                ))}
                            </div>
                            {includedCount === 0 && (
                                <p className="text-[9px] mt-1" style={{ color: 'var(--accent-red, #ef4444)' }}>
                                    Keine Datenpunkte ausgewählt – die Aktion bewirkt nichts.
                                </p>
                            )}
                        </details>
                    )}
                </div>
            )}
        </div>
    );
}
