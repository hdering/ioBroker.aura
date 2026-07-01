import type { WidgetConfig } from '../../types';
import type { StatusOverviewOptions } from '../../utils/statusOverview';

interface Props {
    config: WidgetConfig;
    onConfigChange: (c: WidgetConfig) => void;
}

const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const labelCls = 'text-[11px] mb-1 block';
const labelStyle: React.CSSProperties = { color: 'var(--text-secondary)' };
const sectionTitleCls = 'text-[11px] font-semibold uppercase tracking-wide';

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
                className="relative w-8 h-4 rounded-full transition-colors shrink-0"
                style={{ background: checked ? 'var(--accent)' : 'var(--app-border)' }}
                onClick={() => onChange(!checked)}
            >
                <div
                    className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform shadow"
                    style={{ left: checked ? 'calc(100% - 14px)' : '2px' }}
                />
            </div>
            <span className="text-xs" style={{ color: 'var(--text-primary)' }}>
                {label}
            </span>
        </label>
    );
}

export function StatusOverviewConfig({ config, onConfigChange }: Props) {
    const o = (config.options ?? {}) as StatusOverviewOptions;
    const set = (patch: Partial<StatusOverviewOptions>) =>
        onConfigChange({ ...config, options: { ...config.options, ...patch } });

    const lightScope = o.lightRoleScope ?? 'light';

    return (
        <div className="space-y-4">
            {/* ── Categories ── */}
            <div className="space-y-2">
                <span className={sectionTitleCls} style={labelStyle}>
                    Kategorien
                </span>
                <Toggle
                    checked={o.catWindow !== false}
                    onChange={(v) => set({ catWindow: v })}
                    label="Offene Fenster & Türen"
                />
                <Toggle
                    checked={o.catBattery !== false}
                    onChange={(v) => set({ catBattery: v })}
                    label="Schwache Batterien"
                />
                <Toggle
                    checked={o.catLight !== false}
                    onChange={(v) => set({ catLight: v })}
                    label="Eingeschaltete Lichter"
                />
                <Toggle
                    checked={o.catAlarm !== false}
                    onChange={(v) => set({ catAlarm: v })}
                    label="Rauch- & Wasser-Alarme"
                />
                <Toggle
                    checked={o.catUnreach !== false}
                    onChange={(v) => set({ catUnreach: v })}
                    label="Nicht erreichbar / offline"
                />
            </div>

            {/* ── Battery ── */}
            {o.catBattery !== false && (
                <div className="space-y-2 pt-1" style={{ borderTop: '1px solid var(--app-border)' }}>
                    <span className={sectionTitleCls} style={labelStyle}>
                        Batterien
                    </span>
                    <div>
                        <label className={labelCls} style={labelStyle}>
                            Warnschwelle (% – darunter gilt als schwach)
                        </label>
                        <input
                            type="number"
                            min={1}
                            max={100}
                            value={o.batteryThreshold ?? 20}
                            onChange={(e) =>
                                set({ batteryThreshold: e.target.value ? Number(e.target.value) : undefined })
                            }
                            className={inputCls}
                            style={inputStyle}
                        />
                    </div>
                    <Toggle
                        checked={o.includeLowbatBoolean !== false}
                        onChange={(v) => set({ includeLowbatBoolean: v })}
                        label="Boolesche LOWBAT-Datenpunkte einbeziehen"
                    />
                </div>
            )}

            {/* ── Lights ── */}
            {o.catLight !== false && (
                <div className="space-y-2 pt-1" style={{ borderTop: '1px solid var(--app-border)' }}>
                    <span className={sectionTitleCls} style={labelStyle}>
                        Lichter
                    </span>
                    <div>
                        <label className={labelCls} style={labelStyle}>
                            Welche Schalter zählen als Licht?
                        </label>
                        <select
                            value={lightScope}
                            onChange={(e) => set({ lightRoleScope: e.target.value as 'light' | 'all' })}
                            className={inputCls}
                            style={inputStyle}
                        >
                            <option value="light">Nur Lichter (Rolle switch.light)</option>
                            <option value="all">Alle Schalter (switch, switch.power)</option>
                        </select>
                    </div>
                    {lightScope === 'all' && (
                        <Toggle
                            checked={!!o.lightsOnlyFunction}
                            onChange={(v) => set({ lightsOnlyFunction: v })}
                            label="Nur Schalter in Funktion „Licht“"
                        />
                    )}
                </div>
            )}

            {/* ── Scope ── */}
            <div className="space-y-2 pt-1" style={{ borderTop: '1px solid var(--app-border)' }}>
                <span className={sectionTitleCls} style={labelStyle}>
                    Einschränkung (optional)
                </span>
                <div>
                    <label className={labelCls} style={labelStyle}>
                        Räume (Komma-getrennt, leer = alle)
                    </label>
                    <input
                        type="text"
                        value={o.filterRooms ?? ''}
                        onChange={(e) => set({ filterRooms: e.target.value || undefined })}
                        placeholder="z. B. Wohnzimmer, Küche"
                        className={inputCls}
                        style={inputStyle}
                    />
                </div>
                <div>
                    <label className={labelCls} style={labelStyle}>
                        Funktionen (Komma-getrennt)
                    </label>
                    <input
                        type="text"
                        value={o.filterFuncs ?? ''}
                        onChange={(e) => set({ filterFuncs: e.target.value || undefined })}
                        placeholder="z. B. Licht, Fenster"
                        className={inputCls}
                        style={inputStyle}
                    />
                </div>
                <div>
                    <label className={labelCls} style={labelStyle}>
                        Adapter (Komma-getrennt, z. B. zigbee.0)
                    </label>
                    <input
                        type="text"
                        value={o.filterAdapters ?? ''}
                        onChange={(e) => set({ filterAdapters: e.target.value || undefined })}
                        placeholder="zigbee.0, hm-rpc.0"
                        className={inputCls}
                        style={inputStyle}
                    />
                </div>
                <div>
                    <label className={labelCls} style={labelStyle}>
                        Ausschluss-Muster (Text oder /regex/)
                    </label>
                    <input
                        type="text"
                        value={o.excludeIdPatterns ?? ''}
                        onChange={(e) => set({ excludeIdPatterns: e.target.value || undefined })}
                        placeholder=".info., _REMOTE_"
                        className={inputCls}
                        style={inputStyle}
                    />
                </div>
            </div>

            {/* ── Battery type ── */}
            <div className="space-y-2 pt-1" style={{ borderTop: '1px solid var(--app-border)' }}>
                <span className={sectionTitleCls} style={labelStyle}>
                    Batterietypen
                </span>
                <Toggle
                    checked={o.batteryTypeEnabled !== false}
                    onChange={(v) => set({ batteryTypeEnabled: v ? undefined : false })}
                    label="Batterietyp & Anzahl neben schwachen Batterien anzeigen"
                />
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                    Typen werden automatisch erkannt (falls bekannt). Zuordnung &amp; Übersicht aller Batteriegeräte
                    unter Admin → Batterien.
                </p>
            </div>

            {/* ── Display ── */}
            <div className="space-y-2 pt-1" style={{ borderTop: '1px solid var(--app-border)' }}>
                <span className={sectionTitleCls} style={labelStyle}>
                    Anzeige
                </span>
                <div>
                    <label className={labelCls} style={labelStyle}>
                        Welche Geräte anzeigen
                    </label>
                    <select
                        value={o.valueFilter ?? 'alerts'}
                        onChange={(e) => set({ valueFilter: e.target.value as 'alerts' | 'all' })}
                        className={inputCls}
                        style={inputStyle}
                    >
                        <option value="alerts">Nur Auffällige (z. B. schwache Batterie)</option>
                        <option value="all">Alle gefundenen Geräte</option>
                    </select>
                </div>
                <div>
                    <label className={labelCls} style={labelStyle}>
                        Hervorhebungsfarbe (Auffällige)
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            type="color"
                            value={o.alertColor || '#f59e0b'}
                            onChange={(e) => set({ alertColor: e.target.value })}
                            className="w-8 h-7 rounded cursor-pointer p-0.5"
                            style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                        />
                        {o.alertColor && (
                            <button
                                onClick={() => set({ alertColor: undefined })}
                                className="text-[11px] hover:opacity-80"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                ↩ Standard (nach Dringlichkeit)
                            </button>
                        )}
                    </div>
                </div>
                <Toggle
                    checked={!!o.showOkCategories}
                    onChange={(v) => set({ showOkCategories: v })}
                    label="Auch Kategorien ohne Hinweise zeigen"
                />
                <div>
                    <label className={labelCls} style={labelStyle}>
                        Sortierung
                    </label>
                    <select
                        value={o.sortBy ?? 'severity'}
                        onChange={(e) => set({ sortBy: e.target.value as 'severity' | 'room' })}
                        className={inputCls}
                        style={inputStyle}
                    >
                        <option value="severity">Nach Dringlichkeit</option>
                        <option value="room">Nach Raum</option>
                    </select>
                </div>
                <div>
                    <label className={labelCls} style={labelStyle}>
                        Klick auf Zeile
                    </label>
                    <select
                        value={o.rowClick ?? 'jump'}
                        onChange={(e) => set({ rowClick: e.target.value as 'none' | 'jump' })}
                        className={inputCls}
                        style={inputStyle}
                    >
                        <option value="jump">Zum Gerät springen</option>
                        <option value="none">Keine Aktion</option>
                    </select>
                </div>
                <div>
                    <label className={labelCls} style={labelStyle}>
                        Text bei „Alles in Ordnung“
                    </label>
                    <input
                        type="text"
                        value={o.allClearText ?? ''}
                        onChange={(e) => set({ allClearText: e.target.value || undefined })}
                        placeholder="Alles in Ordnung"
                        className={inputCls}
                        style={inputStyle}
                    />
                </div>
            </div>
        </div>
    );
}
