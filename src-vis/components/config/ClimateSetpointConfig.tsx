/**
 * Raumklima: "Soll bedienen" (#838). Makes the target temperature writable —
 * +/− beside the target in the default layout, quick-select buttons and, in a
 * custom grid, the circle menu. Same option names as the thermostat (minTemp,
 * maxTemp, step, presets), so both widgets read alike.
 */
import { SubGroup } from './ConfigSection';
import { NumberListInput } from './NumberListInput';
import { CircleMenuSettings, PrimaryValueSelect, showsCircleMenu } from './CircleMenuSettings';
import { DEFAULT_SETPOINT_PRESETS, setpointCircleEntries } from '../widgets/SetpointCircle';

const hint: React.CSSProperties = { color: 'var(--text-secondary)' };
const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};

export function ClimateSetpointConfig({
    o,
    set,
    layout,
}: {
    o: Record<string, unknown>;
    set: (patch: Record<string, unknown>) => void;
    layout: string | undefined;
}) {
    const on = o.targetControl === true;
    const hasDp = !!o.targetDatapoint;
    const presets = o.showPresets !== false ? ((o.presets as number[] | undefined) ?? DEFAULT_SETPOINT_PRESETS) : [];
    return (
        <>
            <SubGroup title="Soll bedienen" className="aura-climate-setpoint">
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <label className="text-[11px] block" style={hint}>
                            Solltemperatur bedienbar
                        </label>
                        <p className="text-[10px]" style={hint}>
                            {hasDp
                                ? '− / + neben dem Sollwert, Schnellwahl darunter; im eigenen Layout auch als Kreismenü.'
                                : 'Braucht einen Datenpunkt für die Soll-Temperatur.'}
                        </p>
                    </div>
                    <button
                        onClick={() => set({ targetControl: on ? undefined : true })}
                        className="relative w-9 h-5 rounded-full transition-colors shrink-0 mt-0.5"
                        style={{ background: on ? 'var(--accent)' : 'var(--app-border)' }}
                        aria-pressed={on}
                    >
                        <span
                            className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                            style={{ left: on ? '18px' : '2px' }}
                        />
                    </button>
                </div>
                {on && (
                    <>
                        <div className="flex gap-2">
                            <div className="flex-1 min-w-0">
                                <label className="text-[11px] mb-1 block" style={hint}>
                                    Min °C
                                </label>
                                <input
                                    type="number"
                                    value={(o.minTemp as number) ?? 10}
                                    onChange={(e) => set({ minTemp: Number(e.target.value) })}
                                    className={inputCls}
                                    style={inputStyle}
                                />
                            </div>
                            <div className="flex-1 min-w-0">
                                <label className="text-[11px] mb-1 block" style={hint}>
                                    Max °C
                                </label>
                                <input
                                    type="number"
                                    value={(o.maxTemp as number) ?? 30}
                                    onChange={(e) => set({ maxTemp: Number(e.target.value) })}
                                    className={inputCls}
                                    style={inputStyle}
                                />
                            </div>
                            <div className="flex-1 min-w-0">
                                <label className="text-[11px] mb-1 block" style={hint}>
                                    Schritt
                                </label>
                                <select
                                    value={(o.step as number) ?? 0.5}
                                    onChange={(e) => set({ step: Number(e.target.value) })}
                                    className={inputCls}
                                    style={inputStyle}
                                >
                                    <option value={0.5}>0,5 °C</option>
                                    <option value={1}>1 °C</option>
                                    <option value={0.1}>0,1 °C</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="text-[11px] mb-1 block" style={hint}>
                                Schnellwahl (mit ; getrennt, leer = keine)
                            </label>
                            <NumberListInput
                                value={presets}
                                onChange={(v) => set({ presets: v ?? [], showPresets: undefined })}
                                placeholder="18; 20; 21,5; 24"
                                className={inputCls}
                                style={inputStyle}
                            />
                        </div>
                    </>
                )}
            </SubGroup>
            {on && showsCircleMenu(layout, o) && (
                <CircleMenuSettings
                    o={o}
                    setO={set}
                    intro="Kreismenü-Zelle: Kälter (−), die Schnellwahl-Temperaturen und Wärmer (+). − und + lassen das Menü offen; in der Mitte steht der Sollwert."
                    entries={setpointCircleEntries(true, presets)}
                    iconPlaceholder="Thermometer"
                    extra={<PrimaryValueSelect o={o} setO={set} />}
                />
            )}
        </>
    );
}
