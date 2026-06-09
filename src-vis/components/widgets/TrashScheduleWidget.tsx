import { useState } from 'react';
import { Truck, CalendarCheck2 } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { DatapointPicker } from '../config/DatapointPicker';
import type { WidgetProps, WidgetConfig } from '../../types';
import { TRASH_ICON_OPTIONS, ICON_MAP } from './TrashWidget';
import { getWidgetIcon } from '../../utils/widgetIconMap';

// ── Data model from trashschedule JSON DP ─────────────────────────────────

interface TrashEntry {
    name: string;
    daysLeft: number;
    nextDate: number; // Unix ms timestamp
    _completed?: boolean;
    _color?: string;
}

function parseEntries(raw: unknown): TrashEntry[] {
    try {
        const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!Array.isArray(arr)) return [];
        return (arr as unknown[]).filter(
            (e): e is TrashEntry => e !== null && typeof e === 'object' && typeof (e as TrashEntry).name === 'string',
        );
    } catch {
        return [];
    }
}

function formatDate(ts: number, fmt: string): string {
    const d = new Date(ts);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    const ee = days[d.getDay()];
    if (fmt === 'dd.MM.yyyy') return `${dd}.${mm}.${yyyy}`;
    if (fmt === 'EE dd.MM.') return `${ee} ${dd}.${mm}.`;
    return `${dd}.${mm}.`;
}

function formatDays(n: number): string {
    if (n < 0) return 'fällig';
    if (n === 0) return 'heute';
    if (n === 1) return 'morgen';
    return `in ${n} T.`;
}

// ── Single bin circle (default layout) ────────────────────────────────────

function BinCircle({
    entry,
    iconName,
    size,
    showNames,
    showDays,
    showDate,
    dateFormat,
    nameFontSize,
    daysFontSize,
    dateFontSize,
}: {
    entry: TrashEntry;
    iconName: string;
    size: number;
    showNames: boolean;
    showDays: boolean;
    showDate: boolean;
    dateFormat: string;
    nameFontSize: number;
    daysFontSize: number;
    dateFontSize: number;
}) {
    const color = entry._color ?? '#6b7280';
    const dimmed = entry._completed === true;
    const Icon = ICON_MAP[iconName] ?? Truck;
    const iconPx = Math.round(size / 2);

    return (
        <div className="flex flex-col items-center gap-1" style={{ maxWidth: size + 16 }}>
            <div
                className="rounded-full flex items-center justify-center"
                style={{
                    width: size,
                    height: size,
                    background: dimmed ? 'transparent' : color,
                    border: `2.5px solid ${color}`,
                    opacity: dimmed ? 0.45 : 1,
                }}
            >
                <Icon size={iconPx} color={dimmed ? color : '#ffffff'} strokeWidth={2} />
            </div>

            {showNames && (
                <span
                    className="text-center leading-tight truncate w-full"
                    style={{ fontSize: nameFontSize, color: 'var(--text-secondary)' }}
                    title={entry.name}
                >
                    {entry.name}
                </span>
            )}

            {showDays && (
                <span
                    className="text-center font-medium leading-none"
                    style={{
                        fontSize: daysFontSize,
                        color: entry.daysLeft <= 1 ? 'var(--accent)' : 'var(--text-primary)',
                    }}
                >
                    {formatDays(entry.daysLeft)}
                </span>
            )}

            {showDate && (
                <span
                    className="text-center leading-none"
                    style={{ fontSize: dateFontSize, color: 'var(--text-secondary)' }}
                >
                    {formatDate(entry.nextDate, dateFormat)}
                </span>
            )}
        </div>
    );
}

// ── Single bin row (list layout) ───────────────────────────────────────────

function BinRow({
    entry,
    iconName,
    circleSize,
    showNames,
    showDays,
    showDate,
    dateFormat,
    nameFontSize,
    daysFontSize,
    dateFontSize,
}: {
    entry: TrashEntry;
    iconName: string;
    circleSize: number;
    showNames: boolean;
    showDays: boolean;
    showDate: boolean;
    dateFormat: string;
    nameFontSize: number;
    daysFontSize: number;
    dateFontSize: number;
}) {
    const color = entry._color ?? '#6b7280';
    const dimmed = entry._completed === true;
    const Icon = ICON_MAP[iconName] ?? Truck;
    const iconPx = Math.round(circleSize / 2);

    return (
        <div className="flex items-center gap-3">
            <div
                className="rounded-full flex items-center justify-center shrink-0"
                style={{
                    width: circleSize,
                    height: circleSize,
                    background: dimmed ? 'transparent' : color,
                    border: `2.5px solid ${color}`,
                    opacity: dimmed ? 0.45 : 1,
                }}
            >
                <Icon size={iconPx} color={dimmed ? color : '#ffffff'} strokeWidth={2} />
            </div>
            <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                {showNames && (
                    <span
                        className="truncate leading-tight"
                        style={{ fontSize: nameFontSize, color: 'var(--text-secondary)' }}
                        title={entry.name}
                    >
                        {entry.name}
                    </span>
                )}
                {showDays && (
                    <span
                        className="font-medium leading-tight"
                        style={{
                            fontSize: daysFontSize,
                            color: entry.daysLeft <= 1 ? 'var(--accent)' : 'var(--text-primary)',
                        }}
                    >
                        {formatDays(entry.daysLeft)}
                    </span>
                )}
                {showDate && (
                    <span className="leading-none" style={{ fontSize: dateFontSize, color: 'var(--text-secondary)' }}>
                        {formatDate(entry.nextDate, dateFormat)}
                    </span>
                )}
            </div>
        </div>
    );
}

// ── Shared title row ───────────────────────────────────────────────────────

function TitleRow({
    config,
    TitleIcon,
    iconSize,
    titleAlign,
    showTitle,
    showIcon,
}: {
    config: WidgetConfig;
    TitleIcon: React.ElementType;
    iconSize: number;
    titleAlign: string;
    showTitle: boolean;
    showIcon: boolean;
}) {
    return (
        <div className="flex items-center gap-1 shrink-0 mb-1 min-w-0">
            {showIcon && <TitleIcon size={iconSize} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />}
            {showTitle && (
                <p
                    className="text-xs truncate flex-1 min-w-0"
                    style={{
                        color: 'var(--text-secondary)',
                        textAlign: titleAlign as React.CSSProperties['textAlign'],
                    }}
                >
                    {config.title}
                </p>
            )}
        </div>
    );
}

// ── Main widget ────────────────────────────────────────────────────────────

export function TrashScheduleWidget({ config }: WidgetProps) {
    const { value } = useDatapoint(config.datapoint);
    const o = config.options ?? {};
    const TitleIcon = getWidgetIcon(o.icon as string | undefined, CalendarCheck2);
    const showTitle = o.showTitle !== false;
    const showIcon = o.showIcon !== false;
    const iconSize = (o.iconSize as number) || 20;
    const titleAlign = (o.titleAlign as string) ?? 'left';
    const hiddenNames = (o.hiddenNames as string[] | undefined) ?? [];
    const iconMap = (o.iconMap as Record<string, string> | undefined) ?? {};
    const showNames = (o.showNames as boolean | undefined) ?? true;
    const showDays = (o.showDays as boolean | undefined) ?? true;
    const showDate = (o.showDate as boolean | undefined) ?? true;
    const dateFormat = (o.dateFormat as string | undefined) ?? 'dd.MM.';
    const layout = (config.layout as string | undefined) ?? 'default';
    const nameFontSize = (o.nameFontSize as number | undefined) ?? 10;
    const daysFontSize = (o.daysFontSize as number | undefined) ?? 10;
    const dateFontSize = (o.dateFontSize as number | undefined) ?? 9;
    const binSizeOpt = o.binSize as number | undefined;
    const listBinSize = (o.listBinSize as number | undefined) ?? 36;

    const all = parseEntries(value);

    if (!config.datapoint || all.length === 0) {
        return (
            <div className="aura-widget-row flex flex-col h-full">
                {(showTitle || showIcon) && (
                    <TitleRow
                        config={config}
                        TitleIcon={TitleIcon}
                        iconSize={iconSize}
                        titleAlign={titleAlign}
                        showTitle={showTitle}
                        showIcon={showIcon}
                    />
                )}
                <div
                    className="flex flex-col items-center justify-center flex-1 gap-2"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <TitleIcon size={32} strokeWidth={1} style={{ color: 'var(--text-secondary)' }} />
                    <span className="text-xs opacity-60">
                        {!config.datapoint ? 'Datenpunkt wählen' : 'Keine Einträge im Zeitplan'}
                    </span>
                </div>
            </div>
        );
    }

    const visible = all.filter((e) => !hiddenNames.includes(e.name)).sort((a, b) => a.daysLeft - b.daysLeft);

    if (visible.length === 0) {
        return (
            <div className="aura-widget-row flex flex-col h-full">
                {(showTitle || showIcon) && (
                    <TitleRow
                        config={config}
                        TitleIcon={TitleIcon}
                        iconSize={iconSize}
                        titleAlign={titleAlign}
                        showTitle={showTitle}
                        showIcon={showIcon}
                    />
                )}
                <div
                    className="flex flex-col items-center justify-center flex-1 gap-2"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <Truck size={32} strokeWidth={1} />
                    <span className="text-xs opacity-60">Alle Tonnen ausgeblendet</span>
                </div>
            </div>
        );
    }

    // ── LIST layout ───────────────────────────────────────────────────────────
    if (layout === 'list') {
        return (
            <div className="aura-widget-row flex flex-col h-full">
                {(showTitle || showIcon) && (
                    <TitleRow
                        config={config}
                        TitleIcon={TitleIcon}
                        iconSize={iconSize}
                        titleAlign={titleAlign}
                        showTitle={showTitle}
                        showIcon={showIcon}
                    />
                )}
                <div className="flex-1 flex flex-col gap-2 overflow-y-auto min-h-0">
                    {visible.map((entry) => (
                        <BinRow
                            key={entry.name}
                            entry={entry}
                            iconName={iconMap[entry.name] ?? 'Trash2'}
                            circleSize={listBinSize}
                            showNames={showNames}
                            showDays={showDays}
                            showDate={showDate}
                            dateFormat={dateFormat}
                            nameFontSize={nameFontSize}
                            daysFontSize={daysFontSize}
                            dateFontSize={dateFontSize}
                        />
                    ))}
                </div>
            </div>
        );
    }

    // ── DEFAULT layout ────────────────────────────────────────────────────────
    const binSize =
        binSizeOpt && binSizeOpt > 0 ? binSizeOpt : visible.length <= 2 ? 72 : visible.length <= 4 ? 58 : 44;

    return (
        <div className="aura-widget-row flex flex-col h-full">
            {(showTitle || showIcon) && (
                <TitleRow
                    config={config}
                    TitleIcon={TitleIcon}
                    iconSize={iconSize}
                    titleAlign={titleAlign}
                    showTitle={showTitle}
                    showIcon={showIcon}
                />
            )}
            <div className="flex-1 flex flex-wrap items-start justify-center gap-3 content-center min-h-0">
                {visible.map((entry) => (
                    <BinCircle
                        key={entry.name}
                        entry={entry}
                        iconName={iconMap[entry.name] ?? 'Trash2'}
                        size={binSize}
                        showNames={showNames}
                        showDays={showDays}
                        showDate={showDate}
                        dateFormat={dateFormat}
                        nameFontSize={nameFontSize}
                        daysFontSize={daysFontSize}
                        dateFontSize={dateFontSize}
                    />
                ))}
            </div>
        </div>
    );
}

// ── Config panel ───────────────────────────────────────────────────────────

const iCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const iSty = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};

export function TrashScheduleConfig({
    config,
    onConfigChange,
}: {
    config: WidgetConfig;
    onConfigChange: (c: WidgetConfig) => void;
}) {
    const [showPicker, setShowPicker] = useState(false);
    const { value } = useDatapoint(config.datapoint);

    const o = config.options ?? {};
    const hiddenNames = (o.hiddenNames as string[] | undefined) ?? [];
    const iconMap = (o.iconMap as Record<string, string> | undefined) ?? {};
    const showNames = (o.showNames as boolean | undefined) ?? true;
    const showDays = (o.showDays as boolean | undefined) ?? true;
    const showDate = (o.showDate as boolean | undefined) ?? true;
    const dateFormat = (o.dateFormat as string | undefined) ?? 'dd.MM.';
    const nameFontSize = (o.nameFontSize as number | undefined) ?? 10;
    const daysFontSize = (o.daysFontSize as number | undefined) ?? 10;
    const dateFontSize = (o.dateFontSize as number | undefined) ?? 9;
    const binSizeOpt = (o.binSize as number | undefined) ?? 0;
    const listBinSize = (o.listBinSize as number | undefined) ?? 36;

    const setO = (patch: Record<string, unknown>) => onConfigChange({ ...config, options: { ...o, ...patch } });

    const liveEntries = parseEntries(value);

    const toggleHidden = (name: string) => {
        const next = hiddenNames.includes(name) ? hiddenNames.filter((n) => n !== name) : [...hiddenNames, name];
        setO({ hiddenNames: next });
    };

    const setIcon = (name: string, iconName: string) => setO({ iconMap: { ...iconMap, [name]: iconName } });

    return (
        <>
            {showPicker && (
                <DatapointPicker
                    currentValue={config.datapoint}
                    onSelect={(dp) => {
                        onConfigChange({ ...config, datapoint: dp });
                        setShowPicker(false);
                    }}
                    onClose={() => setShowPicker(false)}
                />
            )}

            <div className="space-y-4">
                {/* ── Datenpunkt ── */}
                <div>
                    <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                        Zeitplan-Datenpunkt (JSON-Array)
                    </label>
                    <div className="flex gap-1.5">
                        <input
                            type="text"
                            value={config.datapoint}
                            onChange={(e) => onConfigChange({ ...config, datapoint: e.target.value })}
                            placeholder="z.B. trashschedule.0.json"
                            className={`flex-1 ${iCls} font-mono min-w-0`}
                            style={iSty}
                        />
                        <button
                            onClick={() => setShowPicker(true)}
                            className="px-2 rounded-lg shrink-0 hover:opacity-80 text-[11px]"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--app-border)',
                            }}
                        >
                            ⊕
                        </button>
                    </div>
                </div>

                {/* ── Sichtbarkeit & Icon-Mapping ── */}
                {liveEntries.length > 0 && (
                    <div>
                        <label className="text-[11px] mb-2 block" style={{ color: 'var(--text-secondary)' }}>
                            Tonnen (aus aktuellem DP-Wert)
                        </label>
                        <div className="space-y-2">
                            {liveEntries.map((entry) => {
                                const curIcon = iconMap[entry.name] ?? 'Trash2';
                                const color = entry._color ?? '#6b7280';
                                const hidden = hiddenNames.includes(entry.name);
                                return (
                                    <div
                                        key={entry.name}
                                        className="rounded-xl p-3 space-y-2"
                                        style={{
                                            background: 'var(--app-bg)',
                                            border: '1px solid var(--app-border)',
                                            opacity: hidden ? 0.5 : 1,
                                        }}
                                    >
                                        {/* Header: Icon-Kreis + Name + Sichtbarkeit-Toggle */}
                                        <div className="flex items-center gap-2">
                                            {(() => {
                                                const PreviewIcon = ICON_MAP[curIcon] ?? Truck;
                                                return (
                                                    <div
                                                        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                                                        style={{
                                                            background: `${color}22`,
                                                            border: `2px solid ${color}88`,
                                                        }}
                                                    >
                                                        <PreviewIcon size={16} color={color} strokeWidth={1.5} />
                                                    </div>
                                                );
                                            })()}
                                            <span
                                                className="text-xs font-medium flex-1 truncate"
                                                style={{ color: 'var(--text-primary)' }}
                                            >
                                                {entry.name}
                                            </span>
                                            <span
                                                className="text-[10px] mr-1"
                                                style={{ color: 'var(--text-secondary)' }}
                                            >
                                                {formatDays(entry.daysLeft)}
                                            </span>
                                            <button
                                                onClick={() => toggleHidden(entry.name)}
                                                className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                                                style={{ background: hidden ? 'var(--app-border)' : 'var(--accent)' }}
                                                title={hidden ? 'Einblenden' : 'Ausblenden'}
                                            >
                                                <span
                                                    className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                                                    style={{ left: hidden ? '2px' : '18px' }}
                                                />
                                            </button>
                                        </div>

                                        {/* Icon-Picker */}
                                        {!hidden && (
                                            <div>
                                                <label
                                                    className="text-[11px] mb-1.5 block"
                                                    style={{ color: 'var(--text-secondary)' }}
                                                >
                                                    Icon
                                                </label>
                                                <div className="grid grid-cols-7 gap-1">
                                                    {TRASH_ICON_OPTIONS.map((opt) => {
                                                        const Ic = ICON_MAP[opt.name] ?? Truck;
                                                        const selected = curIcon === opt.name;
                                                        return (
                                                            <button
                                                                key={opt.name}
                                                                title={opt.label}
                                                                onClick={() => setIcon(entry.name, opt.name)}
                                                                className="aspect-square flex items-center justify-center rounded-lg transition-colors"
                                                                style={{
                                                                    background: selected
                                                                        ? `${color}30`
                                                                        : 'var(--widget-bg)',
                                                                    border: selected
                                                                        ? `2px solid ${color}`
                                                                        : '1px solid var(--app-border)',
                                                                }}
                                                            >
                                                                <Ic
                                                                    size={15}
                                                                    color={selected ? color : 'var(--text-secondary)'}
                                                                    strokeWidth={1.5}
                                                                />
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {config.datapoint && liveEntries.length === 0 && (
                    <p className="text-[11px] text-center py-2" style={{ color: 'var(--text-secondary)' }}>
                        Warte auf DP-Wert…
                    </p>
                )}

                {/* ── Anzeige-Optionen ── */}
                <div className="space-y-2.5">
                    <label className="text-[11px] mb-1 block font-medium" style={{ color: 'var(--text-secondary)' }}>
                        Anzeige-Optionen
                    </label>

                    <div className="flex items-center justify-between">
                        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            Namen anzeigen
                        </label>
                        <button
                            onClick={() => setO({ showNames: !showNames })}
                            className="relative w-9 h-5 rounded-full transition-colors"
                            style={{ background: showNames ? 'var(--accent)' : 'var(--app-border)' }}
                        >
                            <span
                                className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                                style={{ left: showNames ? '18px' : '2px' }}
                            />
                        </button>
                    </div>

                    <div className="flex items-center justify-between">
                        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            Tage anzeigen
                        </label>
                        <button
                            onClick={() => setO({ showDays: !showDays })}
                            className="relative w-9 h-5 rounded-full transition-colors"
                            style={{ background: showDays ? 'var(--accent)' : 'var(--app-border)' }}
                        >
                            <span
                                className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                                style={{ left: showDays ? '18px' : '2px' }}
                            />
                        </button>
                    </div>

                    <div className="flex items-center justify-between">
                        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            Datum anzeigen
                        </label>
                        <button
                            onClick={() => setO({ showDate: !showDate })}
                            className="relative w-9 h-5 rounded-full transition-colors"
                            style={{ background: showDate ? 'var(--accent)' : 'var(--app-border)' }}
                        >
                            <span
                                className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                                style={{ left: showDate ? '18px' : '2px' }}
                            />
                        </button>
                    </div>

                    {showDate && (
                        <div>
                            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                                Datumsformat
                            </label>
                            <select
                                value={dateFormat}
                                onChange={(e) => setO({ dateFormat: e.target.value })}
                                className={iCls}
                                style={{ ...iSty, cursor: 'pointer' }}
                            >
                                <option value="dd.MM.">dd.MM. (z.B. 17.05.)</option>
                                <option value="dd.MM.yyyy">dd.MM.yyyy (z.B. 17.05.2025)</option>
                                <option value="EE dd.MM.">EE dd.MM. (z.B. Sa 17.05.)</option>
                            </select>
                        </div>
                    )}
                </div>

                {/* ── Icon-Größen ── */}
                <div className="space-y-2.5">
                    <label className="text-[11px] mb-1 block font-medium" style={{ color: 'var(--text-secondary)' }}>
                        Icon-Größen
                    </label>

                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                Standardansicht ({binSizeOpt > 0 ? `${binSizeOpt}px` : 'Auto'})
                            </label>
                            <button
                                onClick={() => setO({ binSize: binSizeOpt > 0 ? 0 : 56 })}
                                className="text-[10px] px-2 py-0.5 rounded-md hover:opacity-80"
                                style={{
                                    background: binSizeOpt > 0 ? 'var(--accent)' : 'var(--app-bg)',
                                    color: binSizeOpt > 0 ? '#fff' : 'var(--text-secondary)',
                                    border: '1px solid var(--app-border)',
                                }}
                                title={binSizeOpt > 0 ? 'Auf Auto zurücksetzen' : 'Feste Größe verwenden'}
                            >
                                {binSizeOpt > 0 ? 'Manuell' : 'Auto'}
                            </button>
                        </div>
                        {binSizeOpt > 0 && (
                            <input
                                type="range"
                                min={32}
                                max={192}
                                step={2}
                                value={binSizeOpt}
                                onChange={(e) => setO({ binSize: Number(e.target.value) })}
                                className="w-full accent-[var(--accent)]"
                            />
                        )}
                    </div>

                    <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            Listenansicht ({listBinSize}px)
                        </label>
                        <input
                            type="range"
                            min={24}
                            max={144}
                            step={2}
                            value={listBinSize}
                            onChange={(e) => setO({ listBinSize: Number(e.target.value) })}
                            className="w-full accent-[var(--accent)]"
                        />
                    </div>
                </div>

                {/* ── Textgrößen ── */}
                {(showNames || showDays || showDate) && (
                    <div className="space-y-2.5">
                        <label
                            className="text-[11px] mb-1 block font-medium"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            Textgrößen
                        </label>
                        {showNames && (
                            <div>
                                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                                    Namen ({nameFontSize}px)
                                </label>
                                <input
                                    type="range"
                                    min={8}
                                    max={48}
                                    step={1}
                                    value={nameFontSize}
                                    onChange={(e) => setO({ nameFontSize: Number(e.target.value) })}
                                    className="w-full accent-[var(--accent)]"
                                />
                            </div>
                        )}
                        {showDays && (
                            <div>
                                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                                    Tage ({daysFontSize}px)
                                </label>
                                <input
                                    type="range"
                                    min={8}
                                    max={48}
                                    step={1}
                                    value={daysFontSize}
                                    onChange={(e) => setO({ daysFontSize: Number(e.target.value) })}
                                    className="w-full accent-[var(--accent)]"
                                />
                            </div>
                        )}
                        {showDate && (
                            <div>
                                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                                    Datum ({dateFontSize}px)
                                </label>
                                <input
                                    type="range"
                                    min={8}
                                    max={48}
                                    step={1}
                                    value={dateFontSize}
                                    onChange={(e) => setO({ dateFontSize: Number(e.target.value) })}
                                    className="w-full accent-[var(--accent)]"
                                />
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}
