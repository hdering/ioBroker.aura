/**
 * Bausteine fuer Auswahl-Eintraege (Wert -> Label/Farbe/Icon/Bild/HTML).
 *
 * Eigenes Modul, damit sowohl das Auswahlfeld-Widget als auch die Zellen des
 * Universal-Widgets und die Listen-Zeilen dieselben Renderer benutzen koennen,
 * ohne dass CustomGridView und EnumWidget sich gegenseitig importieren.
 */
import { ListChecks } from 'lucide-react';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { resolveImageSource } from '../../utils/assetUrl';
import { SafeHtml } from '../common/SafeHtml';

export type EnumRender = 'text' | 'image' | 'html' | 'icon';

/** How the CURRENT selection is printed: plain text, icon + text, or icon only. */
export type EnumEntryDisplay = 'text' | 'icon-text' | 'icon';

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
                src={resolveImageSource(entry.image)}
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

/**
 * The current selection of an Auswahlfeld, honoring the `entryDisplay` option
 * (text / icon + text / icon only). Rich entries (image, HTML) always render in
 * their own mode. Shared by the widget and the list widgets' select control, so
 * a row looks exactly like the standalone widget.
 */
export function EnumCurrent({
    entry,
    display = 'text',
    fallback,
    className,
    style = {},
}: {
    /** The matched entry; undefined prints the fallback text. */
    entry?: EnumEntry;
    display?: EnumEntryDisplay;
    /** Printed when no entry matches the value (usually the raw value). */
    fallback: string;
    className?: string;
    style?: React.CSSProperties;
}) {
    if (!entry) {
        return (
            <span className={className} style={style}>
                {fallback}
            </span>
        );
    }
    const rm = entryRenderMode(entry);
    if (rm === 'image' || rm === 'html') {
        return <EnumEntryLabel entry={entry} className={className} style={style} />;
    }
    const CurIcon = entry.icon ? getWidgetIcon(entry.icon, ListChecks) : null;
    const wantIcon = (display === 'icon' || display === 'icon-text') && !!CurIcon;
    const wantText = display === 'text' || display === 'icon-text' || !wantIcon;
    const color = (style.color as string) ?? entry.color ?? 'var(--text-primary)';
    if (wantIcon && !wantText && CurIcon) {
        return <CurIcon size={entry.size ?? 22} className={className} style={{ ...style, color }} />;
    }
    if (wantIcon && wantText && CurIcon) {
        return (
            <span
                className={className}
                style={{ ...style, display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}
            >
                <CurIcon size={entry.size ?? 18} style={{ color, flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{entry.label || '–'}</span>
            </span>
        );
    }
    return (
        <span className={className} style={style}>
            {entry.label || fallback}
        </span>
    );
}

/**
 * One dropdown option: icon + label when the entry has an icon, otherwise its
 * own rich render mode. Shared with the list widgets' select control.
 */
export function EnumOptionLabel({ entry, size = 16 }: { entry: EnumEntry; size?: number }) {
    const rm = entryRenderMode(entry);
    if (rm !== 'text' || !entry.icon) return <EnumEntryLabel entry={entry} />;
    const OptIcon = getWidgetIcon(entry.icon, ListChecks);
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: entry.color }}>
            <OptIcon size={size} style={{ color: entry.color, flexShrink: 0 }} />
            <span>{entry.label || entry.value}</span>
        </span>
    );
}
