/**
 * GroupActionConfig — shared config block for the "master switch" feature.
 * Used by the static list, dynamic list and group widget editors. Operates on a
 * plain options object via get (opts) / set (setOpts) so each host can plug in
 * its own persistence.
 */
import type { GroupActionConfigOpts } from '../../utils/groupTargets';

interface Props {
    opts: GroupActionConfigOpts;
    setOpts: (patch: Partial<GroupActionConfigOpts>) => void;
}

const iSty = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
} as React.CSSProperties;
const iCls = 'w-full text-[10px] rounded px-2 py-1 focus:outline-none tabular-nums';

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

export function GroupActionConfig({ opts, setOpts }: Props) {
    const enabled = !!opts.groupSwitch;
    const includeNumbers = !!opts.groupIncludeNumbers;

    return (
        <div>
            <div className="flex items-center justify-between">
                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Gruppen-Schalter
                </label>
                <Toggle on={enabled} onClick={() => setOpts({ groupSwitch: !enabled })} />
            </div>
            {enabled && (
                <div className="mt-1.5 space-y-1.5">
                    <p className="text-[9px]" style={{ color: 'var(--text-secondary)', opacity: 0.65 }}>
                        Schaltet alle steuerbaren Datenpunkte gemeinsam. Mittelstellung = gemischter Zustand.
                    </p>
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
                        <Toggle on={includeNumbers} onClick={() => setOpts({ groupIncludeNumbers: !includeNumbers })} />
                    </div>
                    {includeNumbers && (
                        <div className="grid grid-cols-2 gap-1.5">
                            <div>
                                <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
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
                                            groupNumberOnValue: e.target.value === '' || !isFinite(n) ? undefined : n,
                                        });
                                    }}
                                />
                            </div>
                            <div>
                                <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
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
                                            groupNumberOffValue: e.target.value === '' || !isFinite(n) ? undefined : n,
                                        });
                                    }}
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
