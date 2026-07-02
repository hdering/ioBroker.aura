import { ListChecks } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import type { WidgetProps } from '../../types';
import { contentPositionClass, titlePositionStyle } from '../../utils/widgetUtils';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { resolveAssetUrl } from '../../utils/assetUrl';
import { StatusBadges } from './StatusBadges';
import { CustomGridView } from './CustomGridView';
import { SafeHtml } from '../common/SafeHtml';
import { HtmlSelect } from '../common/HtmlSelect';

export type EnumRender = 'text' | 'image' | 'html' | 'icon';

export interface EnumEntry {
    value: string; // stored as string; parsed to number if numeric
    label: string; // text/HTML content, and the name/alt for image+icon entries
    color?: string;
    /** How the entry is rendered. Defaults to text (or html for legacy HTML labels). */
    render?: EnumRender;
    image?: string; // image URL or aura-file: path (render === 'image')
    icon?: string; // iconify id (render === 'icon')
    size?: number; // px size for image/icon
}

const HTML_RE = /<[a-z][\s\S]*>/i;

/** Resolve the effective render mode, keeping legacy HTML-in-label entries working. */
export function entryRenderMode(e: EnumEntry): EnumRender {
    if (e.render) return e.render;
    return e.label && HTML_RE.test(e.label) ? 'html' : 'text';
}

/**
 * Renders a single enum entry's content according to its render mode:
 * plain text, an <img>, sanitised HTML, or an icon. className/style are
 * applied to the produced element (style.color overrides entry.color).
 */
export function EnumEntryLabel({
    entry,
    className,
    style,
}: {
    entry: EnumEntry;
    className?: string;
    style?: React.CSSProperties;
}) {
    const mode = entryRenderMode(entry);
    const merged: React.CSSProperties = { color: entry.color, ...style };

    if (mode === 'image' && entry.image) {
        const px = entry.size ?? 28;
        return (
            <img
                src={resolveAssetUrl(entry.image)}
                alt={entry.label}
                title={entry.label}
                className={className}
                style={{ width: px, height: px, objectFit: 'contain', ...style }}
            />
        );
    }

    if (mode === 'icon' && entry.icon) {
        const Icon = getWidgetIcon(entry.icon, ListChecks);
        return <Icon size={entry.size ?? 22} className={className} style={merged} />;
    }

    if (mode === 'html') {
        return <SafeHtml html={entry.label} className={className} style={merged} />;
    }

    return (
        <span className={className} style={merged}>
            {entry.label || '–'}
        </span>
    );
}

function parseValue(raw: string): boolean | number | string {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    const n = Number(raw);
    return raw !== '' && Number.isFinite(n) ? n : raw;
}

function findEntry(entries: EnumEntry[], current: unknown): EnumEntry | undefined {
    if (current === null || current === undefined) return undefined;
    const s = String(current);
    return entries.find((e) => e.value === s);
}

export function EnumWidget({ config }: WidgetProps) {
    const { value } = useDatapoint(config.datapoint);
    const { setState } = useIoBroker();

    const o = config.options ?? {};
    const layout = config.layout ?? 'default';
    const showTitle = o.showTitle !== false;
    const showIcon = o.showIcon !== false;
    const showValue = o.showValue !== false; // current label
    const showSelect = o.showSelect !== false; // dropdown
    // How the current selection is rendered: plain text, icon + text, or icon only.
    const entryDisplay = (o.entryDisplay as 'text' | 'icon-text' | 'icon' | undefined) ?? 'text';
    const titleAlign = (o.titleAlign as string) ?? 'left';
    const iconSize = (o.iconSize as number) || 20;
    const entries = (o.entries as EnumEntry[] | undefined) ?? [];

    const WidgetIcon = getWidgetIcon(o.icon as string | undefined, ListChecks);

    const current = findEntry(entries, value);
    const currentLabel = current?.label ?? (value === null || value === undefined ? '–' : String(value));
    const currentColor = current?.color;

    const onPick = (raw: string) => {
        setState(config.datapoint, parseValue(raw));
    };

    // Render the current selection honoring the entryDisplay option
    // (text / icon+text / icon). Legacy rich entries (image/HTML) always render
    // via their own mode; plain text/icon entries follow entryDisplay.
    const renderCurrent = (className: string, style: React.CSSProperties) => {
        if (!current) {
            return (
                <span className={className} style={style}>
                    {currentLabel}
                </span>
            );
        }
        const rm = entryRenderMode(current);
        if (rm === 'image' || rm === 'html') {
            return <EnumEntryLabel entry={current} className={className} style={style} />;
        }
        const CurIcon = current.icon ? getWidgetIcon(current.icon, ListChecks) : null;
        const wantIcon = (entryDisplay === 'icon' || entryDisplay === 'icon-text') && !!CurIcon;
        const wantText = entryDisplay === 'text' || entryDisplay === 'icon-text' || !wantIcon;
        const color = (style.color as string) ?? currentColor ?? 'var(--text-primary)';
        if (wantIcon && !wantText && CurIcon) {
            return <CurIcon size={current.size ?? 22} className={className} style={{ ...style, color }} />;
        }
        if (wantIcon && wantText && CurIcon) {
            return (
                <span
                    className={className}
                    style={{ ...style, display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}
                >
                    <CurIcon size={current.size ?? 18} style={{ color, flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                        {current.label || '–'}
                    </span>
                </span>
            );
        }
        return (
            <span className={className} style={style}>
                {current.label || currentLabel}
            </span>
        );
    };

    // Dropdown option content: icon + label when an entry has an icon, otherwise
    // its own rich render mode.
    const renderOption = (e: EnumEntry) => {
        const rm = entryRenderMode(e);
        if (rm !== 'text' || !e.icon) return <EnumEntryLabel entry={e} />;
        const OptIcon = getWidgetIcon(e.icon, ListChecks);
        return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: e.color }}>
                <OptIcon size={16} style={{ color: e.color, flexShrink: 0 }} />
                <span>{e.label || e.value}</span>
            </span>
        );
    };

    const selectEl = showSelect ? (
        <HtmlSelect
            value={current?.value ?? ''}
            onPick={onPick}
            entries={entries.map((e) => ({ value: e.value, content: renderOption(e) }))}
        />
    ) : null;

    // --- CUSTOM (3×3 Standard-Grid, vordefinierte Component-Slots: icon / select / label) ---
    if (layout === 'custom') {
        return (
            <CustomGridView
                config={config}
                value={currentLabel}
                valueColor={currentColor}
                extraComponents={{
                    icon: showIcon ? (
                        <WidgetIcon
                            className="aura-widget-icon"
                            size={iconSize}
                            style={{ color: currentColor ?? 'var(--accent)', flexShrink: 0 }}
                        />
                    ) : null,
                    select: selectEl,
                    label: showValue
                        ? renderCurrent('aura-widget-value text-base font-semibold truncate', {
                              color: currentColor ?? 'var(--text-primary)',
                          })
                        : null,
                }}
            />
        );
    }

    // --- COMPACT ---
    if (layout === 'compact') {
        return (
            <div
                className="aura-widget-row flex items-center justify-between h-full gap-2"
                style={{ position: 'relative' }}
            >
                {(showTitle || showIcon) && (
                    <div className="flex items-center gap-2 min-w-0">
                        {showIcon && (
                            <WidgetIcon
                                className="aura-widget-icon"
                                size={iconSize}
                                style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
                            />
                        )}
                        {showTitle && (
                            <span
                                className="aura-widget-title text-sm truncate"
                                style={{
                                    color: 'var(--text-secondary)',
                                    textAlign: titleAlign as React.CSSProperties['textAlign'],
                                    flex: '1',
                                    minWidth: 0,
                                }}
                            >
                                {config.title}
                            </span>
                        )}
                    </div>
                )}
                <div className="flex items-center gap-2 shrink-0 min-w-0">
                    {showValue &&
                        renderCurrent('aura-widget-value text-base font-semibold truncate', {
                            color: currentColor ?? 'var(--text-primary)',
                        })}
                    {selectEl}
                </div>
                <StatusBadges config={config} />
            </div>
        );
    }

    // --- MINIMAL: Label groß zentriert, Dropdown darunter ---
    if (layout === 'minimal') {
        return (
            <div
                className="aura-widget-row flex flex-col items-center justify-center h-full gap-2"
                style={{ position: 'relative' }}
            >
                {showValue &&
                    renderCurrent('aura-widget-value text-xl font-bold truncate max-w-full', {
                        color: currentColor ?? 'var(--accent)',
                    })}
                {selectEl}
                {showTitle && (
                    <span
                        className="aura-widget-title text-xs mt-1 truncate max-w-full"
                        style={{
                            color: 'var(--text-secondary)',
                            textAlign: titleAlign as React.CSSProperties['textAlign'],
                        }}
                    >
                        {config.title}
                    </span>
                )}
                <StatusBadges config={config} />
            </div>
        );
    }

    // --- CARD ---
    if (layout === 'card') {
        const accent = currentColor ?? 'var(--accent)';
        return (
            <div className="aura-widget-row flex h-full gap-3" style={{ position: 'relative' }}>
                <div className="w-1 rounded-full self-stretch" style={{ background: accent }} />
                <div className="flex flex-col justify-between flex-1 min-w-0">
                    {(showTitle || showIcon) && (
                        <div className="flex items-center gap-2">
                            {showIcon && (
                                <WidgetIcon className="aura-widget-icon" size={iconSize} style={{ color: accent }} />
                            )}
                            {showTitle && (
                                <p
                                    className="aura-widget-title text-xs truncate"
                                    style={{
                                        color: 'var(--text-secondary)',
                                        textAlign: titleAlign as React.CSSProperties['textAlign'],
                                        flex: '1',
                                        minWidth: 0,
                                    }}
                                >
                                    {config.title}
                                </p>
                            )}
                        </div>
                    )}
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                        {showValue && renderCurrent('aura-widget-value text-xl font-bold truncate', { color: accent })}
                        {selectEl}
                    </div>
                </div>
                <StatusBadges config={config} />
            </div>
        );
    }

    // --- DEFAULT ---
    const posClass = contentPositionClass(o.contentPosition as string | undefined);
    const titlePos = o.titlePosition as string | undefined;
    const titleStyle = titlePositionStyle(titlePos);

    return (
        <div className={`aura-widget-row flex flex-col h-full gap-2 ${posClass}`} style={{ position: 'relative' }}>
            {(showTitle || showIcon) && (
                <div className="flex items-center gap-2" style={titleStyle}>
                    {showIcon && (
                        <WidgetIcon
                            className="aura-widget-icon"
                            size={iconSize}
                            style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
                        />
                    )}
                    {showTitle && (
                        <p
                            className="aura-widget-title text-xs"
                            style={{
                                color: 'var(--text-secondary)',
                                textAlign: titleAlign as React.CSSProperties['textAlign'],
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                flex: '1',
                                minWidth: 0,
                            }}
                        >
                            {config.title}
                        </p>
                    )}
                </div>
            )}
            <div className="flex items-center gap-2 flex-wrap min-w-0">
                {showValue &&
                    renderCurrent('aura-widget-value text-base font-semibold truncate', {
                        color: currentColor ?? 'var(--text-primary)',
                    })}
                {selectEl}
            </div>
            <StatusBadges config={config} />
        </div>
    );
}
