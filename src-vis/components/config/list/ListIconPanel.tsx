/**
 * The dynamic list's row icon, configured ONCE for every row.
 *
 * The static list configures an icon per entry — the right shape there, because those
 * entries are hand-picked. Here the rows come from a filter and change on every sync,
 * so a per-datapoint icon can only ever cover the rows that happen to exist right now.
 * This panel sets the default every discovered row starts with.
 *
 * Precedence in the widget (all four layouts): a condition rule beats the entry's own
 * icon, which beats this default — `cIcon.icon ?? entry.icon ?? opts.entryIcon`. The
 * colour has no per-entry step, so there a rule beats `opts.entryIconColor` directly.
 */
import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Icon } from '@iconify/react';
import { IconPickerModal } from '../IconPickerModal';
import { ColorField } from './listFieldUi';
import { lucidePascalToIconify } from '../../../utils/iconifyLoader';
import type { AutoListOptions } from '../../widgets/AutoListWidget';

const PREVIEW_ROWS = 6;
const DEFAULT_SIZE = 13;
/** What an icon without a colour renders as — the picker starts there. */
const DEFAULT_COLOR = '#6b7280';

function toIconifyId(name: string): string {
    return name.includes(':') ? name : lucidePascalToIconify(name);
}

export function ListIconPanel({
    opts,
    onOptsChange,
    resolvedNames,
}: {
    opts: AutoListOptions;
    onOptsChange: (patch: Partial<AutoListOptions>) => void;
    /** `id → name` from the config panel's datapoint cache, for the preview labels. */
    resolvedNames: Record<string, string>;
}) {
    const [pickerOpen, setPickerOpen] = useState(false);

    const entries = (opts.entries ?? []).filter((e) => !!e?.id);
    const icon = opts.entryIcon;
    const size = opts.entryIconSize;
    const color = opts.entryIconColor;
    const ownIconCount = entries.filter((e) => !!e.icon).length;

    const previewKey = entries.map((e) => `${e.id}|${e.icon ?? ''}|${e.iconSize ?? ''}`).join(',');
    const preview = useMemo(
        () =>
            entries.slice(0, PREVIEW_ROWS).map((e) => ({
                id: e.id,
                name: e.label || resolvedNames[e.id] || e.id.split('.').pop() || e.id,
                icon: e.icon ?? icon,
                size: e.iconSize ?? size ?? DEFAULT_SIZE,
                own: !!e.icon,
            })),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [previewKey, icon, size, resolvedNames],
    );

    const label = { color: 'var(--text-secondary)' } as React.CSSProperties;
    const box: React.CSSProperties = {
        background: 'var(--app-bg)',
        color: 'var(--text-primary)',
        border: '1px solid var(--app-border)',
    };

    /** Drop every per-datapoint icon, so the list-wide default is what shows. */
    const clearOwnIcons = () =>
        onOptsChange({
            entries: (opts.entries ?? []).map((e) => ({ ...e, icon: undefined, iconSize: undefined })),
        });

    return (
        <div className="space-y-3">
            <p className="text-[11px]" style={{ ...label, opacity: 0.85 }}>
                Icon vor dem Namen — für <strong>alle</strong> Einträge der Liste. Die Datenpunkte kommen aus einem
                Filter und ändern sich beim Abgleich, deshalb wird das Icon hier einmal zentral gesetzt. Ein Datenpunkt
                mit eigenem Icon (Tab {'„Einträge“'}) behält seins, und Bedingungen überschreiben Icon, Größe und Farbe
                pro Zeile.
            </p>

            <div className="flex items-end gap-2">
                <div>
                    <label className="text-[10px] block mb-0.5" style={label}>
                        Icon
                    </label>
                    <div className="relative" style={{ width: 52 }}>
                        <button
                            onClick={() => setPickerOpen(true)}
                            title={icon || 'Icon wählen'}
                            className="w-full flex items-center justify-center rounded-lg hover:opacity-80"
                            style={{ ...box, height: 32 }}
                        >
                            {icon ? (
                                <Icon icon={toIconifyId(icon)} width={18} height={18} />
                            ) : (
                                <Plus size={15} style={{ color: 'var(--text-secondary)', opacity: 0.6 }} />
                            )}
                        </button>
                        {icon && (
                            <button
                                onClick={() =>
                                    onOptsChange({
                                        entryIcon: undefined,
                                        entryIconSize: undefined,
                                        entryIconColor: undefined,
                                    })
                                }
                                title="Icon entfernen"
                                className="absolute -top-1.5 -right-1.5 flex items-center justify-center rounded-full hover:opacity-80"
                                style={{
                                    width: 15,
                                    height: 15,
                                    background: 'var(--app-bg)',
                                    border: '1px solid var(--app-border)',
                                    color: 'var(--text-secondary)',
                                }}
                            >
                                <X size={9} />
                            </button>
                        )}
                    </div>
                </div>
                {icon && (
                    <div style={{ width: 64 }}>
                        <label className="text-[10px] block mb-0.5" style={label}>
                            Größe (px)
                        </label>
                        <input
                            type="number"
                            min={8}
                            max={64}
                            className="w-full text-[11px] rounded-lg px-2 py-1.5 focus:outline-none"
                            style={box}
                            placeholder={String(DEFAULT_SIZE)}
                            value={size ?? ''}
                            onChange={(e) =>
                                onOptsChange({
                                    entryIconSize: e.target.value === '' ? undefined : Number(e.target.value),
                                })
                            }
                        />
                    </div>
                )}
                {icon && (
                    <div className="pb-0.5">
                        <ColorField
                            label="Farbe"
                            value={color}
                            fallback={DEFAULT_COLOR}
                            onChange={(v) => onOptsChange({ entryIconColor: v })}
                        />
                    </div>
                )}
                <p className="text-[10px] flex-1 min-w-0 pb-1.5" style={{ ...label, opacity: 0.7 }}>
                    {icon ? icon : 'Ohne Icon bleibt der Platz vor dem Namen leer.'}
                </p>
            </div>

            {ownIconCount > 0 && (
                <div className="rounded-lg px-2.5 py-2 space-y-1.5" style={{ border: '1px solid var(--app-border)' }}>
                    <p className="text-[10px]" style={{ ...label, opacity: 0.85 }}>
                        {ownIconCount} von {entries.length} Datenpunkten haben ein eigenes Icon und ignorieren die
                        Vorgabe oben.
                    </p>
                    <button
                        onClick={clearOwnIcons}
                        className="text-[10px] rounded px-2 py-1 hover:opacity-80"
                        style={box}
                    >
                        Eigene Icons entfernen ({ownIconCount})
                    </button>
                </div>
            )}

            {preview.length > 0 && (
                <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
                    <div
                        className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide"
                        style={{ ...label, borderBottom: '1px solid var(--app-border)' }}
                    >
                        Vorschau ({preview.length} von {entries.length})
                    </div>
                    <div>
                        {preview.map((p, i) => (
                            <div
                                key={p.id}
                                className="px-2 py-1 flex items-center gap-1.5"
                                style={{ borderTop: i ? '1px solid var(--app-border)' : undefined }}
                            >
                                {p.icon ? (
                                    <Icon
                                        icon={toIconifyId(p.icon)}
                                        width={p.size}
                                        height={p.size}
                                        style={{ color: color ?? 'var(--text-secondary)', flexShrink: 0 }}
                                    />
                                ) : (
                                    <span style={{ width: DEFAULT_SIZE, flexShrink: 0 }} />
                                )}
                                <span className="text-[10px] truncate" style={{ color: 'var(--text-primary)' }}>
                                    {p.name}
                                </span>
                                {p.own && (
                                    <span className="text-[9px] shrink-0" style={{ ...label, opacity: 0.7 }}>
                                        eigenes Icon
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {entries.length === 0 && (
                <p className="text-[11px]" style={label}>
                    Noch keine Datenpunkte – im Tab {'„Suchen & Filter“'} welche finden.
                </p>
            )}

            {pickerOpen && (
                <IconPickerModal
                    current={icon ?? ''}
                    onSelect={(name) => {
                        onOptsChange({ entryIcon: name || undefined });
                        setPickerOpen(false);
                    }}
                    onClose={() => setPickerOpen(false)}
                />
            )}
        </div>
    );
}
