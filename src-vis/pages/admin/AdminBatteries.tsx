import { useEffect, useMemo, useState } from 'react';
import { BatteryFull, HelpCircle, Search, Wand2, Hand, Eye, EyeOff, Bug } from 'lucide-react';
import { useConfigStore } from '../../store/configStore';
import { ensureDatapointCache } from '../../hooks/useDatapointList';
import { categoryOf } from '../../utils/statusOverview';
import {
    loadDeviceModelIndex,
    loadBatteryLibrary,
    autoBatteryType,
    resolveDeviceIdForDp,
    fetchDeviceModelForDp,
    BATTERY_TYPES,
    type BatteryLibIndex,
    type DeviceModel,
} from '../../utils/batteryLibrary';

interface DeviceRow {
    deviceId: string;
    name: string;
    room?: string;
    manufacturer?: string;
    model?: string;
    modelId?: string;
    dpId: string; // the battery datapoint that produced this row (for the report)
    role?: string;
    autoType: string | null;
    autoQty: number;
}

/**
 * Map cryptic Zigbee vendor codes (as HA/ZHA report them) to a readable brand.
 * The model stays as-is — for these devices the raw Zigbee id is the only identifier.
 */
function friendlyManufacturer(mfr: string): string {
    const m = mfr.trim();
    if (/^_ty|^_tz/i.test(m)) return 'Tuya';
    if (/^lumi/i.test(m)) return 'Aqara/Xiaomi';
    return m;
}

const cardStyle: React.CSSProperties = { background: 'var(--app-surface)', border: '1px solid var(--app-border)' };
const inputCls = 'text-xs rounded-lg px-2 py-1.5 focus:outline-none';
const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};

function StatCard({
    label,
    value,
    icon: Icon,
    color,
}: {
    label: string;
    value: number;
    icon: React.ElementType;
    color: string;
}) {
    return (
        <div className="rounded-xl p-4" style={cardStyle}>
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {label}
                </span>
                <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ background: `${color}22` }}
                >
                    <Icon size={14} style={{ color }} />
                </div>
            </div>
            <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {value}
            </p>
        </div>
    );
}

const EMPTY_OVERRIDES: Record<string, { type: string; quantity?: number }> = {};
const EMPTY_HIDDEN: string[] = [];

/** Readable model string: drop cryptic vendor codes (e.g. zigbee "_TZ3000_…"). */
function formatModel(d: DeviceRow): string {
    const readableMfr = d.manufacturer && !d.manufacturer.startsWith('_') ? d.manufacturer : undefined;
    const primary = d.model || d.modelId;
    return [readableMfr, primary].filter(Boolean).join(' · ') || '—';
}

export function AdminBatteries() {
    // Coalesce: configs persisted before these fields existed rehydrate without them.
    const overrides = useConfigStore((s) => s.frontend.batteryTypeOverrides) ?? EMPTY_OVERRIDES;
    const hiddenDevices = useConfigStore((s) => s.frontend.batteryHiddenDevices) ?? EMPTY_HIDDEN;
    const updateFrontend = useConfigStore((s) => s.updateFrontend);

    const [devices, setDevices] = useState<DeviceRow[]>([]);
    const [lib, setLib] = useState<BatteryLibIndex | null>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showHidden, setShowHidden] = useState(false);
    const [showDp, setShowDp] = useState(false);

    const hiddenSet = useMemo(() => new Set(hiddenDevices), [hiddenDevices]);
    const toggleHidden = (deviceId: string) => {
        const set = new Set(hiddenDevices);
        if (set.has(deviceId)) set.delete(deviceId);
        else set.add(deviceId);
        updateFrontend({ batteryHiddenDevices: [...set] });
    };

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const [cache, index, library] = await Promise.all([
                ensureDatapointCache(),
                loadDeviceModelIndex(),
                loadBatteryLibrary(),
            ]);
            if (cancelled) return;
            const battOpts = { catWindow: false, catLight: false, catUnreach: false, catAlarm: false } as const;
            const byDevice = new Map<string, DeviceRow>();
            for (const dp of cache) {
                if (categoryOf(dp, battOpts) !== 'battery') continue;
                const deviceId = resolveDeviceIdForDp(dp.id, index);
                if (byDevice.has(deviceId)) continue;
                const dm: DeviceModel | undefined = index.get(deviceId);
                const auto = autoBatteryType(deviceId, dm, library);
                byDevice.set(deviceId, {
                    deviceId,
                    name: dm?.name || dp.name,
                    room: dp.rooms[0],
                    manufacturer: dm?.manufacturer,
                    model: dm?.model,
                    modelId: dm?.modelId,
                    dpId: dp.id,
                    role: dp.role,
                    autoType: auto?.batteryType ?? null,
                    autoQty: auto?.quantity ?? 1,
                });
            }
            const list = [...byDevice.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
            setDevices(list);
            setLib(library);
            setLoading(false);

            // Enrich rows the bulk index couldn't model (e.g. HomeMatic IP) by fetching the
            // device object directly, then re-run auto-detection with the recovered model.
            const needModel = list.filter((r) => !r.model && !r.modelId);
            if (needModel.length > 0) {
                await Promise.all(
                    needModel.map(async (r) => {
                        const m = await fetchDeviceModelForDp(r.dpId);
                        if (!m) return;
                        if (m.name) r.name = m.name; // prefer the real device name over "LOW_BAT" etc.
                        if (!m.model && !m.modelId) return;
                        r.manufacturer = m.manufacturer ?? r.manufacturer;
                        r.model = m.model;
                        r.modelId = m.modelId;
                        const auto = autoBatteryType(
                            r.deviceId,
                            {
                                id: r.deviceId,
                                name: r.name,
                                kind: 'device',
                                manufacturer: m.manufacturer,
                                model: m.model,
                                modelId: m.modelId,
                            },
                            library,
                        );
                        if (auto) {
                            r.autoType = auto.batteryType;
                            r.autoQty = auto.quantity;
                        }
                    }),
                );
                if (!cancelled) setDevices([...list]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const setOverride = (deviceId: string, type: string | null, quantity?: number) => {
        const next = { ...overrides };
        if (!type) delete next[deviceId];
        else next[deviceId] = { type, ...(quantity && quantity > 1 ? { quantity } : {}) };
        updateFrontend({ batteryTypeOverrides: next });
    };

    const activeDevices = useMemo(() => devices.filter((d) => !hiddenSet.has(d.deviceId)), [devices, hiddenSet]);
    const hiddenList = useMemo(() => devices.filter((d) => hiddenSet.has(d.deviceId)), [devices, hiddenSet]);

    const stats = useMemo(() => {
        let auto = 0,
            manual = 0,
            unknown = 0;
        for (const d of activeDevices) {
            if (overrides[d.deviceId]?.type) manual++;
            else if (d.autoType) auto++;
            else unknown++;
        }
        return { total: activeDevices.length, auto, manual, unknown };
    }, [activeDevices, overrides]);

    // Devices with no known battery type — offer to report them so they can be added centrally.
    const unknownDevices = useMemo(
        () => activeDevices.filter((d) => !overrides[d.deviceId]?.type && !d.autoType),
        [activeDevices, overrides],
    );
    const reportUrl = useMemo(() => {
        if (unknownDevices.length === 0) return '';
        const lines = unknownDevices.slice(0, 25).map((d) => {
            const adapter = d.deviceId.split('.').slice(0, 2).join('.');
            const detail = [
                `Hersteller: ${d.manufacturer || '?'}`,
                `Modell: ${d.model || d.modelId || '?'}`,
                d.modelId && d.modelId !== d.model ? `Modell-ID: ${d.modelId}` : null,
                `Rolle: ${d.role || '?'}`,
                `Datenpunkt: ${d.dpId}`,
                `Adapter: ${adapter}`,
            ]
                .filter(Boolean)
                .map((s) => `    ${s}`)
                .join('\n');
            return `- ${d.name}\n${detail}`;
        });
        const extra = unknownDevices.length > 25 ? `\n… und ${unknownDevices.length - 25} weitere.` : '';
        const body =
            `Folgende Batteriegeräte werden nicht automatisch erkannt. Bitte Batterietyp + Anzahl zur Datenbank hinzufügen.\n` +
            `(Bei „Modell: ?" bitte den Gerätetyp ergänzen, z. B. HmIP-WTH-2.)\n\n${lines.join('\n\n')}${extra}\n`;
        const title = 'Batterie-Datenbank: nicht erkannte Geräte';
        return `https://github.com/hdering/ioBroker.aura/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    }, [unknownDevices]);

    const libResults = useMemo(() => {
        if (!lib) return [];
        const q = search.trim().toLowerCase();
        const src = lib.entries;
        const filtered = q
            ? src.filter(
                  (e) =>
                      e.manufacturer.toLowerCase().includes(q) ||
                      friendlyManufacturer(e.manufacturer).toLowerCase().includes(q) ||
                      e.model.toLowerCase().includes(q) ||
                      (e.modelId ?? '').toLowerCase().includes(q),
              )
            : src;
        return filtered.slice(0, 100);
    }, [lib, search]);

    const renderDeviceRow = (d: DeviceRow) => {
        const hidden = hiddenSet.has(d.deviceId);
        const ov = overrides[d.deviceId];
        const type = ov?.type ?? d.autoType;
        const source = ov?.type ? 'manuell' : d.autoType ? 'auto' : '—';
        const qty = ov?.quantity ?? (ov?.type ? 1 : d.autoQty);
        return (
            <tr key={d.deviceId} style={{ borderTop: '1px solid var(--app-border)', opacity: hidden ? 0.5 : 1 }}>
                <td className="py-1.5 pr-3" style={{ color: 'var(--text-primary)' }}>
                    {d.name}
                    {d.room && <span className="ml-1 opacity-50">{d.room}</span>}
                    {showDp && (
                        <div
                            className="text-[10px] font-mono break-all"
                            style={{ color: 'var(--text-secondary)', opacity: 0.7 }}
                        >
                            {d.dpId}
                        </div>
                    )}
                </td>
                <td className="py-1.5 pr-3 font-mono" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                    {formatModel(d)}
                </td>
                <td className="py-1.5 pr-3 font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {type ?? <span style={{ color: 'var(--accent-red)' }}>?</span>}
                </td>
                <td className="py-1.5 pr-3">
                    <span
                        className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                        style={{
                            color:
                                source === 'manuell'
                                    ? 'var(--accent-yellow, #f59e0b)'
                                    : source === 'auto'
                                      ? 'var(--accent-green)'
                                      : 'var(--text-secondary)',
                            background:
                                source === '—'
                                    ? 'transparent'
                                    : `color-mix(in srgb, currentColor 15%, var(--app-surface))`,
                        }}
                    >
                        {source === 'manuell' ? <Hand size={9} /> : source === 'auto' ? <Wand2 size={9} /> : null}
                        {source}
                    </span>
                </td>
                <td className="py-1.5 pr-3">
                    <select
                        value={ov?.type ?? ''}
                        onChange={(e) => setOverride(d.deviceId, e.target.value || null, ov?.quantity)}
                        className={inputCls}
                        style={inputStyle}
                    >
                        <option value="">— Auto{d.autoType ? ` (${d.autoType})` : ''} —</option>
                        {BATTERY_TYPES.map((bt) => (
                            <option key={bt} value={bt}>
                                {bt}
                            </option>
                        ))}
                    </select>
                </td>
                <td className="py-1.5 pr-3">
                    <input
                        type="number"
                        min={1}
                        max={20}
                        value={qty}
                        disabled={!ov?.type}
                        onChange={(e) => setOverride(d.deviceId, ov?.type ?? null, Number(e.target.value) || 1)}
                        className={inputCls}
                        style={{ ...inputStyle, width: 56, opacity: ov?.type ? 1 : 0.5 }}
                        title={ov?.type ? 'Anzahl Batterien' : 'Erst Typ zuordnen'}
                    />
                </td>
                <td className="py-1.5">
                    <button
                        onClick={() => toggleHidden(d.deviceId)}
                        className="p-1 rounded hover:opacity-80"
                        style={{ color: 'var(--text-secondary)' }}
                        title={hidden ? 'Wieder einblenden' : 'Ausblenden / ignorieren'}
                    >
                        {hidden ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                </td>
            </tr>
        );
    };

    const tableHead = (
        <thead>
            <tr style={{ color: 'var(--text-secondary)', textAlign: 'left' }}>
                <th className="py-1.5 pr-3 font-medium">Gerät</th>
                <th className="py-1.5 pr-3 font-medium">Erkanntes Modell</th>
                <th className="py-1.5 pr-3 font-medium">Typ</th>
                <th className="py-1.5 pr-3 font-medium">Quelle</th>
                <th className="py-1.5 pr-3 font-medium">Zuordnen</th>
                <th className="py-1.5 pr-3 font-medium">Anzahl</th>
                <th className="py-1.5 font-medium" />
            </tr>
        </thead>
    );

    return (
        <div className="p-8 space-y-8">
            <div>
                <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    Batterien
                </h1>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                    Batterietypen deiner Geräte – automatisch erkannt, manuell korrigierbar.
                </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Batteriegeräte" value={stats.total} icon={BatteryFull} color="var(--accent)" />
                <StatCard label="Automatisch erkannt" value={stats.auto} icon={Wand2} color="var(--accent-green)" />
                <StatCard
                    label="Manuell zugeordnet"
                    value={stats.manual}
                    icon={Hand}
                    color="var(--accent-yellow, #f59e0b)"
                />
                <StatCard label="Unbekannt" value={stats.unknown} icon={HelpCircle} color="var(--accent-red)" />
            </div>

            {/* Report unrecognized devices → GitHub (prefilled) */}
            {unknownDevices.length > 0 && (
                <div
                    className="rounded-xl p-4 flex items-start gap-3"
                    style={{
                        background: 'color-mix(in srgb, var(--accent) 8%, var(--app-surface))',
                        border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                    }}
                >
                    <HelpCircle size={18} className="shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            {unknownDevices.length} {unknownDevices.length === 1 ? 'Gerät wird' : 'Geräte werden'} nicht
                            automatisch erkannt
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                            Du kannst den Typ unten manuell zuordnen. Damit das Gerät künftig für alle automatisch
                            erkannt wird, melde es bitte – die Geräteinfos sind im Issue vorausgefüllt.
                        </p>
                        <a
                            href={reportUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 mt-2 text-xs font-medium rounded-lg px-2.5 py-1.5 hover:opacity-80 transition-opacity"
                            style={{ background: 'var(--accent)', color: '#fff' }}
                        >
                            <Bug size={13} /> Nicht erkannte Geräte melden →
                        </a>
                    </div>
                </div>
            )}

            {/* My devices */}
            <div className="rounded-xl p-5" style={cardStyle}>
                <div className="flex items-center justify-between mb-3">
                    <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                        Meine Geräte
                    </h2>
                    <label
                        className="flex items-center gap-1.5 text-xs cursor-pointer select-none"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        <input type="checkbox" checked={showDp} onChange={(e) => setShowDp(e.target.checked)} />
                        Datenpunkt anzeigen
                    </label>
                </div>
                {loading ? (
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        Lade Geräte …
                    </p>
                ) : devices.length === 0 ? (
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        Keine Batteriegeräte gefunden.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                            {tableHead}
                            <tbody>{activeDevices.map(renderDeviceRow)}</tbody>
                        </table>

                        {hiddenList.length > 0 && (
                            <div className="mt-3">
                                <button
                                    onClick={() => setShowHidden((v) => !v)}
                                    className="inline-flex items-center gap-1.5 text-xs hover:opacity-80"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    <EyeOff size={13} />
                                    {hiddenList.length} ausgeblendet{showHidden ? ' — verbergen' : ' — anzeigen'}
                                </button>
                                {showHidden && (
                                    <table className="w-full text-xs mt-2" style={{ borderCollapse: 'collapse' }}>
                                        {tableHead}
                                        <tbody>{hiddenList.map(renderDeviceRow)}</tbody>
                                    </table>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Library browser (read-only) */}
            <div className="rounded-xl p-5" style={cardStyle}>
                <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                    <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                        Batterie-Datenbank
                    </h2>
                    <div className="flex items-center gap-2 rounded-lg px-2" style={inputStyle}>
                        <Search size={13} style={{ color: 'var(--text-secondary)' }} />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Hersteller / Modell suchen …"
                            className="text-xs py-1.5 bg-transparent focus:outline-none"
                            style={{ color: 'var(--text-primary)', minWidth: 200 }}
                        />
                    </div>
                </div>
                <div className="overflow-x-auto" style={{ maxHeight: 360, overflowY: 'auto' }}>
                    <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ color: 'var(--text-secondary)', textAlign: 'left' }}>
                                <th className="py-1.5 pr-3 font-medium">Hersteller</th>
                                <th className="py-1.5 pr-3 font-medium">Modell</th>
                                <th className="py-1.5 pr-3 font-medium">Modell-ID</th>
                                <th className="py-1.5 pr-3 font-medium">Typ</th>
                                <th className="py-1.5 font-medium">Anzahl</th>
                            </tr>
                        </thead>
                        <tbody>
                            {libResults.map((e, i) => (
                                <tr key={i} style={{ borderTop: '1px solid var(--app-border)' }}>
                                    <td
                                        className="py-1 pr-3"
                                        style={{ color: 'var(--text-secondary)' }}
                                        title={e.manufacturer}
                                    >
                                        {friendlyManufacturer(e.manufacturer)}
                                    </td>
                                    <td className="py-1 pr-3" style={{ color: 'var(--text-primary)' }}>
                                        {e.model}
                                    </td>
                                    <td
                                        className="py-1 pr-3 font-mono"
                                        style={{ color: 'var(--text-secondary)', opacity: 0.7 }}
                                    >
                                        {e.modelId ?? ''}
                                    </td>
                                    <td className="py-1 pr-3 font-semibold" style={{ color: 'var(--text-primary)' }}>
                                        {e.batteryType}
                                    </td>
                                    <td className="py-1" style={{ color: 'var(--text-secondary)' }}>
                                        {e.quantity ?? 1}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="text-[11px] mt-2" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                    {lib
                        ? `${lib.entries.length} Einträge · Aura-Batterie-DB v${lib.sourceVersion} (${lib.snapshotDate})`
                        : 'Lade Datenbank …'}
                    {search && ` · ${libResults.length} Treffer (max. 100)`}
                </p>
            </div>
        </div>
    );
}
