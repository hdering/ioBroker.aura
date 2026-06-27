/**
 * StaticListConfig – config panel for the "Statische Liste" widget.
 *
 * Unlike AutoListConfig (filter-based discovery), entries are added
 * manually one at a time via the DatapointPicker (object browser).
 */
import { useState, useEffect } from 'react';
import { Database, X, ChevronRight, Settings2, GripVertical, Plus } from 'lucide-react';
import { Icon } from '@iconify/react';
import type { WidgetConfig } from '../../types';
import type { StaticListEntry, StaticListOptions } from '../widgets/ListWidget';
import { DatapointPicker } from './DatapointPicker';
import { EntryControlsConfig } from './EntryControlsConfig';
import { IconPickerModal } from './IconPickerModal';
import { lookupDatapointEntry, ensureDatapointCache } from '../../hooks/useDatapointList';
import { lucidePascalToIconify } from '../../utils/iconifyLoader';
import { useGlobalSettingsStore } from '../../store/globalSettingsStore';
import { NS } from '../../utils/namespace';
import { useT } from '../../i18n';

function toIconifyId(name: string): string {
    return name.includes(':') ? name : lucidePascalToIconify(name);
}

function ColorField({
    label,
    value,
    fallback,
    onChange,
}: {
    label: string;
    value: string | undefined;
    fallback: string;
    onChange: (v: string | undefined) => void;
}) {
    return (
        <div>
            <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                {label}
            </label>
            <div className="flex items-center gap-1">
                <input
                    type="color"
                    value={value?.match(/#[0-9a-fA-F]{6}/)?.[0] ?? fallback}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-7 h-6 rounded cursor-pointer shrink-0"
                    style={{ border: '1px solid var(--app-border)', padding: '1px' }}
                />
                {value ? (
                    <button
                        onClick={() => onChange(undefined)}
                        title="Zurücksetzen"
                        className="text-[9px] px-1.5 py-0.5 rounded hover:opacity-70"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--app-border)',
                        }}
                    >
                        Reset
                    </button>
                ) : (
                    <span className="text-[9px] opacity-60" style={{ color: 'var(--text-secondary)' }}>
                        —
                    </span>
                )}
            </div>
        </div>
    );
}

interface Props {
    config: WidgetConfig;
    onConfigChange: (config: WidgetConfig) => void;
}

// ── Per-entry row ─────────────────────────────────────────────────────────────

function EntryRow({
    entry,
    resolvedName,
    onUpdate,
    onChangeId,
    onRemove,
    defaultDecimals,
    index,
    isDragging,
    isDragTarget,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDrop,
}: {
    entry: StaticListEntry;
    resolvedName?: string;
    onUpdate: (patch: Partial<StaticListEntry>) => void;
    onChangeId: (newId: string, unit?: string, role?: string, writable?: boolean) => void;
    onRemove: () => void;
    defaultDecimals: number;
    index: number;
    isDragging: boolean;
    isDragTarget: boolean;
    onDragStart: (idx: number) => void;
    onDragOver: (idx: number) => void;
    onDragEnd: () => void;
    onDrop: (idx: number) => void;
}) {
    const t = useT();
    const [expanded, setExpanded] = useState(false);
    const [iconPickerOpen, setIconPickerOpen] = useState(false);
    const [trueIconPickerOpen, setTrueIconPickerOpen] = useState(false);
    const [falseIconPickerOpen, setFalseIconPickerOpen] = useState(false);
    const [dpPickerOpen, setDpPickerOpen] = useState(false);
    // AN/AUS styling (switch style, icon size, on/off colors) only applies when the
    // entry is explicitly rendered as a switch; all other types (incl. Auto) hide it.
    const isSwitch = (entry.displayType ?? 'auto') === 'switch';
    // Confirmation prompt is offered for switch-like controls (switch, momentary).
    const isSwitchLike = isSwitch || entry.displayType === 'momentary';
    const iSty = {
        background: 'var(--app-bg)',
        color: 'var(--text-primary)',
        border: '1px solid var(--app-border)',
    } as React.CSSProperties;
    const iCls = 'w-full text-[10px] rounded px-2 py-0.5 focus:outline-none font-mono';

    return (
        <div
            className="rounded-lg overflow-hidden transition-opacity"
            style={{
                border: '1px solid var(--app-border)',
                opacity: isDragging ? 0.4 : 1,
                ...(isDragTarget ? { boxShadow: '0 -2px 0 0 var(--accent)' } : {}),
            }}
            onDragOver={(e) => {
                e.preventDefault();
                onDragOver(index);
            }}
            onDragEnter={(e) => {
                e.preventDefault();
                onDragOver(index);
            }}
            onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDrop(index);
            }}
        >
            <div className="flex items-center gap-1.5 px-2 py-1.5" style={{ background: 'var(--app-bg)' }}>
                <span
                    draggable
                    onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        onDragStart(index);
                    }}
                    onDragEnd={onDragEnd}
                    title="Ziehen zum Sortieren"
                    className="shrink-0 cursor-grab active:cursor-grabbing hover:opacity-80 flex items-center"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <GripVertical size={11} />
                </span>
                <button
                    onClick={() => setExpanded((e) => !e)}
                    className="shrink-0 hover:opacity-70 transition-transform"
                    style={{ color: 'var(--text-secondary)', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                >
                    <ChevronRight size={11} />
                </button>
                {entry.icon &&
                    (() => {
                        const previewSize = Math.max(11, Math.min(28, entry.iconSize ?? 11));
                        return (
                            <button
                                onClick={() => setIconPickerOpen(true)}
                                className="shrink-0 hover:opacity-70 p-0.5"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                <Icon icon={toIconifyId(entry.icon)} width={previewSize} height={previewSize} />
                            </button>
                        );
                    })()}
                <span className="flex-1 text-[10px] truncate" style={{ color: 'var(--text-primary)' }}>
                    {entry.label ||
                        resolvedName ||
                        entry.id?.split('.').pop() ||
                        entry.id ||
                        `⚠ ${t('autolist.invalidEntry')}`}
                </span>
                <button
                    onClick={() => setExpanded((e) => !e)}
                    className="shrink-0 hover:opacity-70 p-0.5"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <Settings2 size={10} />
                </button>
                <button
                    onClick={onRemove}
                    className="shrink-0 hover:opacity-70"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <X size={11} />
                </button>
            </div>

            {expanded && (
                <div
                    className="px-2.5 pb-2.5 pt-1 space-y-1"
                    style={{ borderTop: '1px solid var(--app-border)', background: 'var(--app-surface)' }}
                >
                    <div className="flex gap-1 mb-1">
                        <input
                            type="text"
                            value={entry.id ?? ''}
                            onChange={(e) => onUpdate({ id: e.target.value })}
                            placeholder="Datenpunkt-ID"
                            className={`flex-1 ${iCls} min-w-0`}
                            style={iSty}
                        />
                        <button
                            onClick={() => setDpPickerOpen(true)}
                            title="Aus ioBroker wählen"
                            className="px-2 rounded hover:opacity-80 shrink-0 flex items-center justify-center"
                            style={{
                                color: 'var(--text-secondary)',
                                background: 'var(--app-bg)',
                                border: '1px solid var(--app-border)',
                            }}
                        >
                            <Database size={13} />
                        </button>
                    </div>
                    {/* Icon (kompakt) + Bezeichnung + Einheit in einer Zeile */}
                    <div className="flex items-end gap-1.5">
                        <div className="shrink-0">
                            <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                Icon
                            </label>
                            <div className="relative" style={{ width: 40 }}>
                                <button
                                    onClick={() => setIconPickerOpen(true)}
                                    title={entry.icon || 'Icon wählen'}
                                    className="w-full flex items-center justify-center rounded hover:opacity-80"
                                    style={{ ...iSty, height: 23 }}
                                >
                                    {entry.icon ? (
                                        <Icon icon={toIconifyId(entry.icon)} width={15} height={15} />
                                    ) : (
                                        <Plus size={13} style={{ color: 'var(--text-secondary)', opacity: 0.6 }} />
                                    )}
                                </button>
                                {entry.icon && (
                                    <button
                                        onClick={() => onUpdate({ icon: undefined })}
                                        title="Icon entfernen"
                                        className="absolute -top-1 -right-1 flex items-center justify-center rounded-full hover:opacity-80"
                                        style={{
                                            width: 13,
                                            height: 13,
                                            background: 'var(--app-bg)',
                                            border: '1px solid var(--app-border)',
                                            color: 'var(--text-secondary)',
                                        }}
                                    >
                                        <X size={8} />
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                Bezeichnung
                            </label>
                            <input
                                className={iCls}
                                style={iSty}
                                placeholder="Auto"
                                value={entry.label ?? ''}
                                onChange={(e) => onUpdate({ label: e.target.value || undefined })}
                            />
                        </div>
                        <div className="w-16 shrink-0">
                            <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                Einheit
                            </label>
                            <input
                                className={iCls}
                                style={iSty}
                                placeholder="°C"
                                value={entry.unit ?? ''}
                                onChange={(e) => onUpdate({ unit: e.target.value || undefined })}
                            />
                        </div>
                    </div>
                    <div className="flex items-end gap-1.5">
                        <div className="shrink-0">
                            <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                Dezimalstellen
                            </label>
                            <div className="flex gap-1">
                                <input
                                    type="number"
                                    min={0}
                                    max={4}
                                    disabled={entry.decimals === undefined}
                                    value={entry.decimals ?? defaultDecimals}
                                    onChange={(e) => onUpdate({ decimals: Number(e.target.value) })}
                                    className="w-10 text-[10px] rounded px-2 py-0.5 focus:outline-none text-center"
                                    style={{ ...iSty, opacity: entry.decimals === undefined ? 0.5 : 1 }}
                                />
                                <button
                                    onClick={() =>
                                        onUpdate({
                                            decimals: entry.decimals === undefined ? defaultDecimals : undefined,
                                        })
                                    }
                                    title={
                                        entry.decimals === undefined
                                            ? 'Globale Einstellung aktiv – klicken für eigenen Wert'
                                            : 'Auf globale Einstellung zurücksetzen'
                                    }
                                    className="px-1.5 rounded text-[10px] font-bold shrink-0"
                                    style={{
                                        background:
                                            entry.decimals === undefined ? 'var(--accent)' : 'var(--app-border)',
                                        color: entry.decimals === undefined ? '#fff' : 'var(--text-secondary)',
                                    }}
                                >
                                    Global
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                Schriftgröße (px)
                            </label>
                            <input
                                type="number"
                                min={8}
                                max={96}
                                className={iCls}
                                style={iSty}
                                placeholder="Auto"
                                value={entry.fontSize ?? ''}
                                onChange={(e) => {
                                    const n = parseInt(e.target.value, 10);
                                    onUpdate({ fontSize: isFinite(n) && n > 0 ? n : undefined });
                                }}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                        <div>
                            <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                Text aktiv
                            </label>
                            <input
                                className={iCls}
                                style={iSty}
                                placeholder="AN"
                                value={entry.trueLabel ?? ''}
                                onChange={(e) => onUpdate({ trueLabel: e.target.value || undefined })}
                            />
                        </div>
                        <div>
                            <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                Text inaktiv
                            </label>
                            <input
                                className={iCls}
                                style={iSty}
                                placeholder="AUS"
                                value={entry.falseLabel ?? ''}
                                onChange={(e) => onUpdate({ falseLabel: e.target.value || undefined })}
                            />
                        </div>
                    </div>
                    <EntryControlsConfig entry={entry} onUpdate={onUpdate} />

                    {/* Schalter-Stil (nur wenn Darstellung Schalter oder Auto bool) */}
                    {isSwitch && (
                        <div>
                            <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                Schalter-Stil
                            </label>
                            <div className="flex gap-1">
                                {(['slide', 'icon'] as const).map((v) => {
                                    const lbl = v === 'slide' ? 'Schiebeschalter' : 'Icon';
                                    const active = (entry.switchStyle ?? 'slide') === v;
                                    return (
                                        <button
                                            key={v}
                                            onClick={() => onUpdate({ switchStyle: v === 'slide' ? undefined : v })}
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
                    )}

                    {/* Icons AN/AUS (nur bei Schalter-Stil Icon) */}
                    {isSwitch && (entry.switchStyle ?? 'slide') === 'icon' && (
                        <div className="grid grid-cols-2 gap-1.5">
                            <div>
                                <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                    Icon AN
                                </label>
                                <div className="relative">
                                    <button
                                        onClick={() => setTrueIconPickerOpen(true)}
                                        title={entry.trueIcon || 'Icon wählen'}
                                        className="w-full flex items-center justify-center rounded hover:opacity-80"
                                        style={{ ...iSty, height: 28 }}
                                    >
                                        {entry.trueIcon ? (
                                            <Icon icon={toIconifyId(entry.trueIcon)} width={16} height={16} />
                                        ) : (
                                            <Plus size={13} style={{ color: 'var(--text-secondary)', opacity: 0.6 }} />
                                        )}
                                    </button>
                                    {entry.trueIcon && (
                                        <button
                                            onClick={() => onUpdate({ trueIcon: undefined })}
                                            title="Icon entfernen"
                                            className="absolute -top-1 -right-1 flex items-center justify-center rounded-full hover:opacity-80"
                                            style={{
                                                width: 13,
                                                height: 13,
                                                background: 'var(--app-bg)',
                                                border: '1px solid var(--app-border)',
                                                color: 'var(--text-secondary)',
                                            }}
                                        >
                                            <X size={8} />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div>
                                <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                    Icon AUS
                                </label>
                                <div className="relative">
                                    <button
                                        onClick={() => setFalseIconPickerOpen(true)}
                                        title={entry.falseIcon || 'Icon wählen'}
                                        className="w-full flex items-center justify-center rounded hover:opacity-80"
                                        style={{ ...iSty, height: 28 }}
                                    >
                                        {entry.falseIcon ? (
                                            <Icon icon={toIconifyId(entry.falseIcon)} width={16} height={16} />
                                        ) : (
                                            <Plus size={13} style={{ color: 'var(--text-secondary)', opacity: 0.6 }} />
                                        )}
                                    </button>
                                    {entry.falseIcon && (
                                        <button
                                            onClick={() => onUpdate({ falseIcon: undefined })}
                                            title="Icon entfernen"
                                            className="absolute -top-1 -right-1 flex items-center justify-center rounded-full hover:opacity-80"
                                            style={{
                                                width: 13,
                                                height: 13,
                                                background: 'var(--app-bg)',
                                                border: '1px solid var(--app-border)',
                                                color: 'var(--text-secondary)',
                                            }}
                                        >
                                            <X size={8} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Icon-Größe (nur für Schalter-Darstellung) */}
                    {isSwitch && (
                        <div>
                            <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                Icon-Größe (px)
                            </label>
                            <input
                                type="number"
                                min={8}
                                max={96}
                                className="w-20 text-[10px] rounded px-2 py-0.5 focus:outline-none font-mono"
                                style={iSty}
                                placeholder="Auto"
                                value={entry.iconSize ?? ''}
                                onChange={(e) => {
                                    const n = parseInt(e.target.value, 10);
                                    onUpdate({ iconSize: isFinite(n) && n > 0 ? n : undefined });
                                }}
                            />
                        </div>
                    )}
                    {isSwitch && (
                        <div className="grid grid-cols-2 gap-1.5">
                            <ColorField
                                label="Textfarbe AN"
                                value={entry.activeColor}
                                fallback="#22c55e"
                                onChange={(v) => onUpdate({ activeColor: v })}
                            />
                            <ColorField
                                label="Textfarbe AUS"
                                value={entry.inactiveColor}
                                fallback="#94a3b8"
                                onChange={(v) => onUpdate({ inactiveColor: v })}
                            />
                            <ColorField
                                label="Hintergrund AN"
                                value={entry.activeBg}
                                fallback="#22c55e"
                                onChange={(v) => onUpdate({ activeBg: v })}
                            />
                            <ColorField
                                label="Hintergrund AUS"
                                value={entry.inactiveBg}
                                fallback="#1f2937"
                                onChange={(v) => onUpdate({ inactiveBg: v })}
                            />
                        </div>
                    )}
                    {/* Sicherheitsabfrage (nur für Schalter/Taster) */}
                    {isSwitchLike && (
                        <div>
                            <div className="flex items-center justify-between">
                                <label className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                    Sicherheitsabfrage
                                </label>
                                <button
                                    onClick={() => onUpdate({ confirm: !entry.confirm })}
                                    className="relative w-9 h-5 rounded-full transition-colors"
                                    style={{ background: entry.confirm ? 'var(--accent)' : 'var(--app-border)' }}
                                >
                                    <span
                                        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                                        style={{ left: entry.confirm ? '18px' : '2px' }}
                                    />
                                </button>
                            </div>
                            {entry.confirm && (
                                <input
                                    className="w-full text-[10px] rounded px-2 py-0.5 focus:outline-none mt-1"
                                    style={iSty}
                                    placeholder="Wirklich schalten?"
                                    value={entry.confirmText ?? ''}
                                    onChange={(e) => onUpdate({ confirmText: e.target.value || undefined })}
                                />
                            )}
                        </div>
                    )}

                    {/* Letzte Änderung anzeigen */}
                    <div className="flex items-center justify-between">
                        <label className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                            Letzte Änderung anzeigen
                        </label>
                        <button
                            onClick={() => onUpdate({ showLastChange: !entry.showLastChange })}
                            className="relative w-9 h-5 rounded-full transition-colors"
                            style={{ background: entry.showLastChange ? 'var(--accent)' : 'var(--app-border)' }}
                        >
                            <span
                                className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                                style={{ left: entry.showLastChange ? '18px' : '2px' }}
                            />
                        </button>
                    </div>

                    {/* Farbschwellen */}
                    <div style={{ borderTop: '1px solid var(--app-border)', paddingTop: 6, marginTop: 2 }}>
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>
                                Farbschwellen
                            </label>
                            <button
                                onClick={() =>
                                    onUpdate({ colorThresholds: [...(entry.colorThresholds ?? []), [100, '#22c55e']] })
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
                        {(entry.colorThresholds?.length ?? 0) > 0 && (
                            <p className="text-[9px] mb-1" style={{ color: 'var(--text-secondary)', opacity: 0.65 }}>
                                Wert &lt; Schwelle → Farbe · aufsteigend sortieren
                            </p>
                        )}
                        <div className="space-y-1">
                            {(entry.colorThresholds ?? []).map(([thresh, color], i) => (
                                <div key={i} className="flex items-center gap-1">
                                    <button
                                        onClick={() => {
                                            const next = (entry.colorThresholds ?? []).filter((_, j) => j !== i);
                                            onUpdate({ colorThresholds: next.length ? next : undefined });
                                        }}
                                        className="text-[11px] w-5 h-5 flex items-center justify-center rounded shrink-0"
                                        style={{
                                            color: 'var(--text-secondary)',
                                            background: 'var(--app-bg)',
                                            border: '1px solid var(--app-border)',
                                        }}
                                    >
                                        ×
                                    </button>
                                    <input
                                        type="color"
                                        value={color.match(/#[0-9a-fA-F]{6}/)?.[0] ?? '#22c55e'}
                                        onChange={(e) => {
                                            const n = [...(entry.colorThresholds ?? [])];
                                            n[i] = [thresh, e.target.value];
                                            onUpdate({ colorThresholds: n });
                                        }}
                                        className="w-7 h-6 rounded cursor-pointer shrink-0"
                                        style={{ border: '1px solid var(--app-border)', padding: '1px' }}
                                    />
                                    <span className="text-[9px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
                                        Wert &lt;
                                    </span>
                                    <input
                                        type="number"
                                        value={thresh}
                                        onChange={(e) => {
                                            const n = [...(entry.colorThresholds ?? [])];
                                            n[i] = [Number(e.target.value), color];
                                            onUpdate({ colorThresholds: n });
                                        }}
                                        className="flex-1 text-[10px] rounded px-1.5 py-0.5 focus:outline-none"
                                        style={{
                                            background: 'var(--app-bg)',
                                            color: 'var(--text-primary)',
                                            border: '1px solid var(--app-border)',
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                        {(entry.colorThresholds?.length ?? 0) === 0 && (
                            <p className="text-[9px] italic" style={{ color: 'var(--text-secondary)', opacity: 0.45 }}>
                                Keine Farbschwellen konfiguriert
                            </p>
                        )}
                    </div>
                </div>
            )}
            {iconPickerOpen && (
                <IconPickerModal
                    current={entry.icon ?? ''}
                    onSelect={(name) => {
                        onUpdate({ icon: name || undefined });
                        setIconPickerOpen(false);
                    }}
                    onClose={() => setIconPickerOpen(false)}
                />
            )}
            {trueIconPickerOpen && (
                <IconPickerModal
                    current={entry.trueIcon ?? ''}
                    onSelect={(name) => {
                        onUpdate({ trueIcon: name || undefined });
                        setTrueIconPickerOpen(false);
                    }}
                    onClose={() => setTrueIconPickerOpen(false)}
                />
            )}
            {falseIconPickerOpen && (
                <IconPickerModal
                    current={entry.falseIcon ?? ''}
                    onSelect={(name) => {
                        onUpdate({ falseIcon: name || undefined });
                        setFalseIconPickerOpen(false);
                    }}
                    onClose={() => setFalseIconPickerOpen(false)}
                />
            )}
            {dpPickerOpen && (
                <DatapointPicker
                    currentValue={entry.id}
                    onSelect={(id, unit, _name, role) => {
                        if (id && id !== entry.id) {
                            const dp = lookupDatapointEntry(id);
                            const writable = dp?.write !== false ? undefined : false;
                            onChangeId(id, unit, role ?? dp?.role, writable);
                        }
                        setDpPickerOpen(false);
                    }}
                    onClose={() => setDpPickerOpen(false)}
                />
            )}
        </div>
    );
}

// ── Main config panel ─────────────────────────────────────────────────────────

export function StaticListConfig({ config, onConfigChange }: Props) {
    const opts = (config.options ?? { entries: [] }) as unknown as StaticListOptions;
    const entries = opts.entries ?? [];
    const [showPicker, setShowPicker] = useState(false);
    const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});
    const [dragIdx, setDragIdx] = useState<number | null>(null);
    const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
    const { defaultDecimals } = useGlobalSettingsStore();

    useEffect(() => {
        ensureDatapointCache().then((cache) => {
            const map: Record<string, string> = {};
            for (const e of cache) map[e.id] = e.name;
            setResolvedNames(map);
        });
    }, []);

    const setOpts = (patch: Partial<StaticListOptions>) => {
        onConfigChange({ ...config, options: { ...opts, ...patch } });
    };

    const addEntry = (id: string, _name?: string, unit?: string) => {
        if (!id || entries.find((e) => e.id === id)) return;
        const dp = lookupDatapointEntry(id);
        const writable = dp?.write !== false ? undefined : false;
        setOpts({ entries: [...entries, { id, label: undefined, unit: unit || undefined, role: dp?.role, writable }] });
    };

    const removeEntry = (id: string) => setOpts({ entries: entries.filter((e) => e.id !== id) });

    const updateEntry = (id: string, patch: Partial<StaticListEntry>) =>
        setOpts({ entries: entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) });

    const changeEntryId = (oldId: string, newId: string, unit?: string, role?: string, writable?: boolean) => {
        if (!newId || oldId === newId) return;
        if (entries.some((e) => e.id === newId)) {
            window.alert(`Datenpunkt "${newId}" ist bereits in der Liste.`);
            return;
        }
        setOpts({
            entries: entries.map((e) =>
                e.id === oldId ? { ...e, id: newId, unit: unit ?? e.unit, role: role ?? e.role, writable } : e,
            ),
        });
    };

    const reorderEntries = (fromIdx: number, toIdx: number) => {
        if (fromIdx === toIdx) return;
        if (fromIdx < 0 || fromIdx >= entries.length) return;
        if (toIdx < 0 || toIdx >= entries.length) return;
        const next = [...entries];
        const [moved] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, moved);
        setOpts({ entries: next });
    };

    const handleDrop = (toIdx: number) => {
        if (dragIdx !== null && dragIdx !== toIdx) reorderEntries(dragIdx, toIdx);
        setDragIdx(null);
        setDragOverIdx(null);
    };

    return (
        <>
            {/* ── Add DP ── */}
            <button
                onClick={() => setShowPicker(true)}
                className="w-full flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg hover:opacity-80"
                style={{ background: 'var(--accent)', color: '#fff' }}
            >
                <Database size={12} /> Datenpunkt hinzufügen
            </button>

            {/* ── Entry list ── */}
            {entries.length > 0 && (
                <>
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                Datenpunkte ({entries.length})
                            </label>
                            <button
                                onClick={() => setOpts({ entries: [] })}
                                className="text-[10px] hover:opacity-70"
                                style={{ color: 'var(--accent-red, #ef4444)' }}
                            >
                                Alle löschen
                            </button>
                        </div>
                        <div className="aura-scroll space-y-1 max-h-72 overflow-y-auto">
                            {entries.map((e, idx) => (
                                <EntryRow
                                    key={e.id}
                                    entry={e}
                                    resolvedName={resolvedNames[e.id]}
                                    onUpdate={(patch) => updateEntry(e.id, patch)}
                                    onChangeId={(newId, unit, role, writable) =>
                                        changeEntryId(e.id, newId, unit, role, writable)
                                    }
                                    onRemove={() => removeEntry(e.id)}
                                    defaultDecimals={defaultDecimals}
                                    index={idx}
                                    isDragging={dragIdx === idx}
                                    isDragTarget={dragOverIdx === idx && dragIdx !== null && dragIdx !== idx}
                                    onDragStart={setDragIdx}
                                    onDragOver={setDragOverIdx}
                                    onDragEnd={() => {
                                        setDragIdx(null);
                                        setDragOverIdx(null);
                                    }}
                                    onDrop={handleDrop}
                                />
                            ))}
                        </div>
                        {(opts.sortBy ?? 'none') !== 'none' && (
                            <p className="text-[9px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                                {`Hinweis: Sortierung „${opts.sortBy === 'label' ? 'Name' : 'Wert'}“ ist aktiv — manuelle Reihenfolge wirkt erst, wenn Sortierung auf „Keine“ steht.`}
                            </p>
                        )}
                    </div>
                    <div style={{ height: 1, background: 'var(--app-border)' }} />
                </>
            )}

            {/* ── Settings ── */}
            <div className="flex items-center justify-between">
                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Anzahl anzeigen
                </label>
                <button
                    onClick={() => setOpts({ showCount: !(opts.showCount ?? true) })}
                    className="relative w-9 h-5 rounded-full transition-colors"
                    style={{ background: (opts.showCount ?? true) ? 'var(--accent)' : 'var(--app-border)' }}
                >
                    <span
                        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                        style={{ left: (opts.showCount ?? true) ? '18px' : '2px' }}
                    />
                </button>
            </div>

            <div>
                <div className="flex items-center justify-between">
                    <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        Summe anzeigen
                    </label>
                    <button
                        onClick={() => setOpts({ showSum: !(opts.showSum ?? false) })}
                        className="relative w-9 h-5 rounded-full transition-colors"
                        style={{ background: (opts.showSum ?? false) ? 'var(--accent)' : 'var(--app-border)' }}
                    >
                        <span
                            className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                            style={{ left: (opts.showSum ?? false) ? '18px' : '2px' }}
                        />
                    </button>
                </div>
                {opts.showSum && (
                    <div className="mt-1.5 space-y-1.5">
                        <div>
                            <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                Präfix (z.B. Σ, Summe, Gesamt)
                            </label>
                            <input
                                className="w-full text-[10px] rounded px-2 py-1 focus:outline-none"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--app-border)',
                                }}
                                placeholder="Σ"
                                value={opts.sumLabel ?? ''}
                                onChange={(e) => setOpts({ sumLabel: e.target.value || undefined })}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                            <div>
                                <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                    Ausrichtung
                                </label>
                                <div
                                    className="flex rounded-lg overflow-hidden"
                                    style={{ border: '1px solid var(--app-border)' }}
                                >
                                    {(['left', 'center', 'right'] as const).map((v) => {
                                        const lbl = v === 'left' ? 'Links' : v === 'center' ? 'Mitte' : 'Rechts';
                                        const active = (opts.sumAlign ?? 'left') === v;
                                        return (
                                            <button
                                                key={v}
                                                onClick={() => setOpts({ sumAlign: v === 'left' ? undefined : v })}
                                                className="flex-1 text-[10px] py-1 transition-colors"
                                                style={{
                                                    background: active ? 'var(--accent)' : 'var(--app-bg)',
                                                    color: active ? '#fff' : 'var(--text-secondary)',
                                                    borderRight:
                                                        v !== 'right' ? '1px solid var(--app-border)' : undefined,
                                                }}
                                            >
                                                {lbl}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div>
                                <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                    Schriftgröße (px)
                                </label>
                                <input
                                    type="number"
                                    min={8}
                                    max={96}
                                    className="w-full text-[10px] rounded px-2 py-1 focus:outline-none tabular-nums"
                                    style={{
                                        background: 'var(--app-bg)',
                                        color: 'var(--text-primary)',
                                        border: '1px solid var(--app-border)',
                                    }}
                                    placeholder="10"
                                    value={opts.sumFontSize ?? ''}
                                    onChange={(e) => {
                                        const n = parseInt(e.target.value, 10);
                                        setOpts({ sumFontSize: isFinite(n) && n > 0 ? n : undefined });
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between">
                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Raum anzeigen
                </label>
                <button
                    onClick={() => setOpts({ showRoom: !(opts.showRoom ?? false) })}
                    className="relative w-9 h-5 rounded-full transition-colors"
                    style={{ background: (opts.showRoom ?? false) ? 'var(--accent)' : 'var(--app-border)' }}
                >
                    <span
                        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                        style={{ left: (opts.showRoom ?? false) ? '18px' : '2px' }}
                    />
                </button>
            </div>

            <div className="flex items-center justify-between">
                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    DP-ID anzeigen
                </label>
                <button
                    onClick={() => setOpts({ showId: !(opts.showId ?? false) })}
                    className="relative w-9 h-5 rounded-full transition-colors"
                    style={{ background: (opts.showId ?? false) ? 'var(--accent)' : 'var(--app-border)' }}
                >
                    <span
                        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                        style={{ left: (opts.showId ?? false) ? '18px' : '2px' }}
                    />
                </button>
            </div>

            <div className="flex items-center justify-between">
                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Trennlinien anzeigen
                </label>
                <button
                    onClick={() => setOpts({ showDividers: !(opts.showDividers ?? true) })}
                    className="relative w-9 h-5 rounded-full transition-colors"
                    style={{ background: (opts.showDividers ?? true) ? 'var(--accent)' : 'var(--app-border)' }}
                >
                    <span
                        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                        style={{ left: (opts.showDividers ?? true) ? '18px' : '2px' }}
                    />
                </button>
            </div>

            <div>
                <div className="flex items-center justify-between">
                    <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        Lange Texte umbrechen
                    </label>
                    <button
                        onClick={() => setOpts({ wrapText: !(opts.wrapText ?? false) })}
                        className="relative w-9 h-5 rounded-full transition-colors"
                        style={{ background: (opts.wrapText ?? false) ? 'var(--accent)' : 'var(--app-border)' }}
                    >
                        <span
                            className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                            style={{ left: (opts.wrapText ?? false) ? '18px' : '2px' }}
                        />
                    </button>
                </div>
                {opts.wrapText && (
                    <div className="mt-1.5 flex items-center gap-2">
                        <label className="text-[10px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
                            Label-Mindestbreite
                        </label>
                        <input
                            type="range"
                            min={10}
                            max={90}
                            step={5}
                            value={Math.max(10, Math.min(90, opts.labelMinPercent ?? 50))}
                            onChange={(e) => setOpts({ labelMinPercent: Number(e.target.value) })}
                            className="flex-1 h-1"
                            style={{ accentColor: 'var(--accent)' }}
                        />
                        <span
                            className="text-[10px] tabular-nums w-9 text-right"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            {Math.max(10, Math.min(90, opts.labelMinPercent ?? 50))}%
                        </span>
                    </div>
                )}
            </div>

            <div>
                <div className="flex items-center justify-between">
                    <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        Anzahl im Backend veröffentlichen
                    </label>
                    <button
                        onClick={() => setOpts({ publishCount: !(opts.publishCount ?? false) })}
                        className="relative w-9 h-5 rounded-full transition-colors"
                        style={{ background: (opts.publishCount ?? false) ? 'var(--accent)' : 'var(--app-border)' }}
                    >
                        <span
                            className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                            style={{ left: (opts.publishCount ?? false) ? '18px' : '2px' }}
                        />
                    </button>
                </div>
                {opts.publishCount && (
                    <p
                        className="text-[9px] mt-1 font-mono truncate"
                        style={{ color: 'var(--text-secondary)', opacity: 0.7 }}
                    >
                        {NS}.lists.{config.id}.count
                    </p>
                )}
            </div>

            <div>
                <label className="text-[11px] mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
                    Anzeige-Filter (Backend)
                </label>
                <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
                    {(['all', 'active', 'inactive'] as const).map((v) => {
                        const label =
                            v === 'all'
                                ? 'Alle'
                                : v === 'active'
                                  ? opts.filterActiveLabel || 'Nur aktive'
                                  : opts.filterInactiveLabel || 'Nur inaktive';
                        const active = (opts.backendValueFilter ?? 'all') === v;
                        return (
                            <button
                                key={v}
                                onClick={() => setOpts({ backendValueFilter: v === 'all' ? undefined : v })}
                                className="flex-1 text-[11px] py-1.5 transition-colors"
                                style={{
                                    background: active ? 'var(--accent)' : 'var(--app-bg)',
                                    color: active ? '#fff' : 'var(--text-secondary)',
                                    borderRight: v !== 'inactive' ? '1px solid var(--app-border)' : undefined,
                                }}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div>
                <label className="text-[11px] mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
                    Anzeige-Filter (Frontend)
                </label>
                <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
                    {(['all', 'active', 'inactive'] as const).map((v) => {
                        const label =
                            v === 'all'
                                ? 'Alle'
                                : v === 'active'
                                  ? opts.filterActiveLabel || 'Nur aktive'
                                  : opts.filterInactiveLabel || 'Nur inaktive';
                        const active = (opts.valueFilter ?? 'all') === v;
                        return (
                            <button
                                key={v}
                                onClick={() => setOpts({ valueFilter: v })}
                                className="flex-1 text-[11px] py-1.5 transition-colors"
                                style={{
                                    background: active ? 'var(--accent)' : 'var(--app-bg)',
                                    color: active ? '#fff' : 'var(--text-secondary)',
                                    borderRight: v !== 'inactive' ? '1px solid var(--app-border)' : undefined,
                                }}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
                <div className="flex items-center justify-between mt-1.5">
                    <label className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                        Filter-Button im Frontend anzeigen
                    </label>
                    <button
                        onClick={() => setOpts({ hideFilterButton: !(opts.hideFilterButton ?? false) })}
                        className="relative w-9 h-5 rounded-full transition-colors"
                        style={{
                            background: !(opts.hideFilterButton ?? false) ? 'var(--accent)' : 'var(--app-border)',
                        }}
                    >
                        <span
                            className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                            style={{ left: !(opts.hideFilterButton ?? false) ? '18px' : '2px' }}
                        />
                    </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                    <div>
                        <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                            Label &quot;aktiv&quot;
                        </label>
                        <input
                            className="w-full text-[10px] rounded px-2 py-1 focus:outline-none"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--app-border)',
                            }}
                            placeholder="Nur aktive"
                            value={opts.filterActiveLabel ?? ''}
                            onChange={(e) => setOpts({ filterActiveLabel: e.target.value || undefined })}
                        />
                    </div>
                    <div>
                        <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                            Label &quot;inaktiv&quot;
                        </label>
                        <input
                            className="w-full text-[10px] rounded px-2 py-1 focus:outline-none"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--app-border)',
                            }}
                            placeholder="Nur inaktive"
                            value={opts.filterInactiveLabel ?? ''}
                            onChange={(e) => setOpts({ filterInactiveLabel: e.target.value || undefined })}
                        />
                    </div>
                </div>
            </div>

            {/* ── Darstellung AN/AUS (global) ── */}
            <div>
                <label className="text-[11px] mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
                    Darstellung AN/AUS (global)
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                    <div>
                        <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                            Text AN
                        </label>
                        <input
                            className="w-full text-[10px] rounded px-2 py-1 focus:outline-none"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--app-border)',
                            }}
                            placeholder="AN"
                            value={opts.trueText ?? ''}
                            onChange={(e) => setOpts({ trueText: e.target.value || undefined })}
                        />
                    </div>
                    <div>
                        <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                            Text AUS
                        </label>
                        <input
                            className="w-full text-[10px] rounded px-2 py-1 focus:outline-none"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--app-border)',
                            }}
                            placeholder="AUS"
                            value={opts.falseText ?? ''}
                            onChange={(e) => setOpts({ falseText: e.target.value || undefined })}
                        />
                    </div>
                    <ColorField
                        label="Textfarbe AN"
                        value={opts.activeColor}
                        fallback="#22c55e"
                        onChange={(v) => setOpts({ activeColor: v })}
                    />
                    <ColorField
                        label="Textfarbe AUS"
                        value={opts.inactiveColor}
                        fallback="#94a3b8"
                        onChange={(v) => setOpts({ inactiveColor: v })}
                    />
                    <ColorField
                        label="Hintergrund AN"
                        value={opts.activeBg}
                        fallback="#22c55e"
                        onChange={(v) => setOpts({ activeBg: v })}
                    />
                    <ColorField
                        label="Hintergrund AUS"
                        value={opts.inactiveBg}
                        fallback="#1f2937"
                        onChange={(v) => setOpts({ inactiveBg: v })}
                    />
                </div>
                <p className="text-[9px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.65 }}>
                    Defaults pro Widget. Pro DP überschreibbar.
                </p>
            </div>

            {/* ── Sortierung ── */}
            <div>
                <label className="text-[11px] mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
                    Sortierung
                </label>
                <div className="flex gap-1">
                    {(['none', 'label', 'value'] as const).map((v) => {
                        const lbl = v === 'none' ? 'Keine' : v === 'label' ? 'Name' : 'Wert';
                        const active = (opts.sortBy ?? 'none') === v;
                        return (
                            <button
                                key={v}
                                onClick={() =>
                                    setOpts({
                                        sortBy: v === 'none' ? undefined : v,
                                        ...(v === 'none' ? { sortBy2: undefined, sortOrder2: undefined } : {}),
                                    })
                                }
                                className="flex-1 text-[11px] py-1.5 rounded-lg transition-colors"
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
                {(opts.sortBy ?? 'none') !== 'none' && (
                    <div className="flex gap-1 mt-1">
                        {(['asc', 'desc'] as const).map((v) => {
                            const lbl = v === 'asc' ? '↑ Aufsteigend' : '↓ Absteigend';
                            const active = (opts.sortOrder ?? 'asc') === v;
                            return (
                                <button
                                    key={v}
                                    onClick={() => setOpts({ sortOrder: v })}
                                    className="flex-1 text-[11px] py-1.5 rounded-lg transition-colors"
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
                )}
                {(opts.sortBy ?? 'none') !== 'none' && (
                    <>
                        <label className="text-[10px] mt-2 mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            Danach sortieren <span className="opacity-60">(bei Gleichheit)</span>
                        </label>
                        <div className="flex gap-1">
                            {(['none', 'label', 'value'] as const).map((v) => {
                                const lbl = v === 'none' ? 'Keine' : v === 'label' ? 'Name' : 'Wert';
                                const disabled = v !== 'none' && v === opts.sortBy;
                                const active = (opts.sortBy2 ?? 'none') === v;
                                return (
                                    <button
                                        key={v}
                                        disabled={disabled}
                                        title={disabled ? 'Schon als 1. Sortierung gewählt' : undefined}
                                        onClick={() => setOpts({ sortBy2: v === 'none' ? undefined : v })}
                                        className="flex-1 text-[11px] py-1.5 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
                        {(opts.sortBy2 ?? 'none') !== 'none' && (
                            <div className="flex gap-1 mt-1">
                                {(['asc', 'desc'] as const).map((v) => {
                                    const lbl = v === 'asc' ? '↑ Aufsteigend' : '↓ Absteigend';
                                    const active = (opts.sortOrder2 ?? 'asc') === v;
                                    return (
                                        <button
                                            key={v}
                                            onClick={() => setOpts({ sortOrder2: v })}
                                            className="flex-1 text-[11px] py-1.5 rounded-lg transition-colors"
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
                        )}
                    </>
                )}
            </div>

            {/* ── DatapointPicker (multi-select) ── */}
            {showPicker && (
                <DatapointPicker
                    currentValue=""
                    onSelect={(id, unit, name) => {
                        addEntry(id, name, unit);
                        setShowPicker(false);
                    }}
                    onClose={() => setShowPicker(false)}
                    multiSelect
                    onMultiSelect={(picks) => {
                        const newEntries = picks
                            .filter((p) => !!p.id && !entries.find((e) => e.id === p.id))
                            .map((p) => ({
                                id: p.id,
                                label: undefined,
                                unit: p.unit || undefined,
                                role: p.role,
                                writable: p.write !== false ? undefined : false,
                            }));
                        if (newEntries.length > 0) setOpts({ entries: [...entries, ...newEntries] });
                        setShowPicker(false);
                    }}
                />
            )}
        </>
    );
}
