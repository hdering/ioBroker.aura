import { lazy, Suspense, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronDown } from 'lucide-react';
import type { WidgetConfig } from '../../types';
import type { StatusOverviewOptions, CategoryKey } from '../../utils/statusOverview';
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

    // Default highlight colour per category (severity): crit = red, warn = amber.
    const DEFAULT_CAT_HEX: Record<CategoryKey, string> = {
        window: '#ef4444',
        alarm: '#ef4444',
        battery: '#f59e0b',
        light: '#f59e0b',
        unreach: '#f59e0b',
    };
    const setCatColor = (cat: CategoryKey, color: string | null) => {
        const next = { ...(o.categoryColors ?? {}) };
        if (color) next[cat] = color;
        else delete next[cat];
        set({ categoryColors: next });
    };
    const CatColor = ({ cat }: { cat: CategoryKey }) => {
        const custom = o.categoryColors?.[cat];
        return (
            <div>
                <label className={labelCls} style={labelStyle}>
                    Hervorhebungsfarbe
                </label>
                <div className="flex items-center gap-2">
                    <input
                        type="color"
                        value={custom || DEFAULT_CAT_HEX[cat]}
                        onChange={(e) => setCatColor(cat, e.target.value)}
                        className="w-8 h-7 rounded cursor-pointer p-0.5"
                        style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                    />
                    {custom && (
                        <button
                            onClick={() => setCatColor(cat, null)}
                            className="text-[11px] hover:opacity-80"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            ↩ Standard
                        </button>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-4">
            {/* ── Categories (each with its own settings, shown when enabled) ── */}
            <div className="space-y-2.5">
                <span className={sectionTitleCls} style={labelStyle}>
                    Kategorien
                </span>

                <Toggle
                    checked={o.catWindow !== false}
                    onChange={(v) => set({ catWindow: v })}
                    label="Offene Fenster & Türen"
                />
                {o.catWindow !== false && (
                    <div className="ml-1 pl-3 pb-1" style={{ borderLeft: '2px solid var(--app-border)' }}>
                        <CatColor cat="window" />
                    </div>
                )}

                <Toggle
                    checked={o.catBattery !== false}
                    onChange={(v) => set({ catBattery: v })}
                    label="Schwache Batterien"
                />
                {o.catBattery !== false && (
                    <div className="ml-1 pl-3 space-y-2 pb-1" style={{ borderLeft: '2px solid var(--app-border)' }}>
                        <div className="flex gap-3 items-start">
                            <div className="flex-1">
                                <label className={labelCls} style={labelStyle}>
                                    Warnschwelle (%)
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
                            <CatColor cat="battery" />
                        </div>
                        <Toggle
                            checked={o.includeLowbatBoolean !== false}
                            onChange={(v) => set({ includeLowbatBoolean: v })}
                            label="Boolesche LOWBAT-Datenpunkte einbeziehen"
                        />
                        <Toggle
                            checked={o.batteryTypeEnabled !== false}
                            onChange={(v) => set({ batteryTypeEnabled: v ? undefined : false })}
                            label="Batterietyp & Anzahl anzeigen"
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
                )}

                <Toggle
                    checked={o.catLight !== false}
                    onChange={(v) => set({ catLight: v })}
                    label="Eingeschaltete Lichter"
                />
                {o.catLight !== false && (
                    <div className="ml-1 pl-3 space-y-2 pb-1" style={{ borderLeft: '2px solid var(--app-border)' }}>
                        <div className="flex gap-3 items-start">
                            <div className="flex-1">
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
                            <CatColor cat="light" />
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

                <Toggle
                    checked={o.catAlarm !== false}
                    onChange={(v) => set({ catAlarm: v })}
                    label="Rauch- & Wasser-Alarme"
                />
                {o.catAlarm !== false && (
                    <div className="ml-1 pl-3 pb-1" style={{ borderLeft: '2px solid var(--app-border)' }}>
                        <CatColor cat="alarm" />
                    </div>
                )}

                <Toggle
                    checked={o.catUnreach !== false}
                    onChange={(v) => set({ catUnreach: v })}
                    label="Nicht erreichbar / offline"
                />
                {o.catUnreach !== false && (
                    <div className="ml-1 pl-3 space-y-2 pb-1" style={{ borderLeft: '2px solid var(--app-border)' }}>
                        <p className="text-[11px]" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                            UNREACH/offline/reachable/connected werden automatisch erkannt (STICKY_UNREACH wird
                            ignoriert). Nur für Sonderfälle: zusätzliche Offline-Datenpunkte. Gilt global für alle
                            Widgets.
                        </p>
                        <div className="flex gap-3 items-start">
                            <div className="flex-1">
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
                            <CatColor cat="unreach" />
                        </div>
                        <Toggle
                            checked={offlineInvert}
                            onChange={(v) => updateFrontend({ offlineInvert: v })}
                            label="Bei diesen Mustern bedeutet FALSE = offline"
                        />
                    </div>
                )}
            </div>

            {/* ── Scope (collapsed by default) ── */}
            <details className="group pt-1" style={{ borderTop: '1px solid var(--app-border)' }}>
                <summary className="flex items-center justify-between cursor-pointer list-none">
                    <span className={sectionTitleCls} style={labelStyle}>
                        Einschränkung (optional)
                    </span>
                    <ChevronDown
                        size={13}
                        className="transition-transform group-open:rotate-180"
                        style={{ color: 'var(--text-secondary)' }}
                    />
                </summary>
                <div className="space-y-2 mt-2">
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
            </details>

            {/* ── Display (collapsed by default) ── */}
            <details className="group pt-1" style={{ borderTop: '1px solid var(--app-border)' }}>
                <summary className="flex items-center justify-between cursor-pointer list-none">
                    <span className={sectionTitleCls} style={labelStyle}>
                        Anzeige
                    </span>
                    <ChevronDown
                        size={13}
                        className="transition-transform group-open:rotate-180"
                        style={{ color: 'var(--text-secondary)' }}
                    />
                </summary>
                <div className="space-y-2 mt-2">
                    {config.layout === 'card' && (
                        <div>
                            <label className={labelCls} style={labelStyle}>
                                Kartengröße (min. Breite in px)
                            </label>
                            <input
                                type="number"
                                min={60}
                                max={400}
                                step={10}
                                value={o.cardMinWidth ?? 96}
                                onChange={(e) =>
                                    set({ cardMinWidth: e.target.value ? Number(e.target.value) : undefined })
                                }
                                className={inputCls}
                                style={inputStyle}
                            />
                        </div>
                    )}
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
                            Namensmuster (leer = Standard)
                        </label>
                        <input
                            type="text"
                            value={o.namePattern ?? ''}
                            onChange={(e) => set({ namePattern: e.target.value || undefined })}
                            placeholder="<Raum> <Gerät>"
                            className={inputCls}
                            style={inputStyle}
                        />
                        <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                            Platzhalter: &lt;Raum&gt;, &lt;Gerät&gt;, &lt;DPName&gt;, &lt;Name&gt;, &lt;ID&gt;.
                            Beispiel: „&lt;Raum&gt; &lt;Gerät&gt;".
                        </p>
                    </div>
                    <Toggle
                        checked={!!o.showOkCategories}
                        onChange={(v) => set({ showOkCategories: v })}
                        label="Auch Kategorien ohne Hinweise zeigen"
                    />
                    <p className="text-[11px]" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                        Standardmäßig werden Kategorien ohne Auffälligkeiten ausgeblendet. Aktiviert erscheint jede
                        aktive Kategorie mit einem „ok"-Häkchen, auch wenn dort gerade nichts anliegt (nur Layout
                        Standard).
                    </p>
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
                        <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                            Dringlichkeit: kritisch zuerst (offene Fenster, Rauch/Wasser), dann Warnungen (schwache
                            Batterien, Lichter, offline), dann OK — innerhalb gleich sortiert nach Name.
                        </p>
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
            </details>
        </div>
    );
}
