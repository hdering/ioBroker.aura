import { lazy, Suspense, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { WidgetConfig } from '../../types';
import type { StatusOverviewOptions } from '../../utils/statusOverview';
import { useConfigStore } from '../../store/configStore';
import { usePortalTarget } from '../../contexts/PortalTargetContext';

// Lazy so the ~battery admin page stays out of the config chunk until opened.
const AdminBatteries = lazy(() =>
    import('../../pages/admin/AdminBatteries').then((m) => ({ default: m.AdminBatteries })),
);

/** Near-fullscreen popup that hosts the battery-type assignment page. */
function BatteryAssignModal({ onClose }: { onClose: () => void }) {
    const portalTarget = usePortalTarget();
    return createPortal(
        <div
            className="fixed inset-0 flex items-center justify-center p-3"
            style={{ zIndex: 10000 }}
            onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)' }} />
            <div
                className="relative w-full h-full rounded-xl shadow-2xl flex flex-col overflow-hidden"
                style={{ maxWidth: 1100, maxHeight: '94vh', background: 'var(--app-surface)' }}
            >
                {/* Fixed top bar — the close button stays visible while the content scrolls. */}
                <div
                    className="shrink-0 flex items-center justify-end px-3 py-2"
                    style={{ borderBottom: '1px solid var(--app-border)' }}
                >
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:opacity-80"
                        style={{
                            background: 'var(--app-bg)',
                            border: '1px solid var(--app-border)',
                            color: 'var(--text-secondary)',
                        }}
                        title="Schließen"
                    >
                        <X size={16} />
                    </button>
                </div>
                <div className="flex-1 min-h-0 overflow-auto">
                    <Suspense
                        fallback={
                            <div className="p-8 text-sm" style={{ color: 'var(--text-secondary)' }}>
                                Lädt …
                            </div>
                        }
                    >
                        <AdminBatteries />
                    </Suspense>
                </div>
            </div>
        </div>,
        portalTarget ?? document.body,
    );
}

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

    const [showBatteries, setShowBatteries] = useState(false);

    // Reachability escape hatch is global (device-level), not per-widget.
    const offlineExtraPatterns = useConfigStore((s) => s.frontend.offlineExtraPatterns);
    const offlineInvert = useConfigStore((s) => s.frontend.offlineInvert);
    const updateFrontend = useConfigStore((s) => s.updateFrontend);

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
                    Typen werden automatisch erkannt (falls bekannt). Nicht erkannte Geräte manuell zuordnen:
                </p>
                <button
                    onClick={() => setShowBatteries(true)}
                    className="inline-flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-2 hover:opacity-80 transition-opacity"
                    style={{ background: 'var(--accent)', color: '#fff' }}
                >
                    Batterietypen zuordnen →
                </button>
                {showBatteries && <BatteryAssignModal onClose={() => setShowBatteries(false)} />}
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

            {/* ── Reachability (global escape hatch) ── */}
            {o.catUnreach !== false && (
                <div className="space-y-2 pt-1" style={{ borderTop: '1px solid var(--app-border)' }}>
                    <span className={sectionTitleCls} style={labelStyle}>
                        Erreichbarkeit (global)
                    </span>
                    <p className="text-[11px]" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                        UNREACH/offline/reachable/connected werden automatisch erkannt (STICKY_UNREACH wird ignoriert).
                        Nur für Sonderfälle: zusätzliche Offline-Datenpunkte. Gilt für alle Widgets.
                    </p>
                    <div>
                        <label className={labelCls} style={labelStyle}>
                            Zusätzliche Offline-Datenpunkte (Muster, Text oder /regex/)
                        </label>
                        <input
                            type="text"
                            value={offlineExtraPatterns}
                            onChange={(e) => updateFrontend({ offlineExtraPatterns: e.target.value })}
                            placeholder=".UNREACHABLE, /\\.offline$/"
                            className={inputCls}
                            style={inputStyle}
                        />
                    </div>
                    <Toggle
                        checked={offlineInvert}
                        onChange={(v) => updateFrontend({ offlineInvert: v })}
                        label="Bei diesen Mustern bedeutet FALSE = offline"
                    />
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
