import { useMemo, useState, useRef, useEffect } from 'react';
import { Table2, Search, X, ArrowUp, ArrowDown } from 'lucide-react';
import { Icon } from '@iconify/react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useDashboardStore } from '../../store/dashboardStore';
import { useConfigStore } from '../../store/configStore';
import type { WidgetProps } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { resolveAssetUrl, proxifyIfMixed, resolveHtmlAssets } from '../../utils/assetUrl';

// ── Column definition (stored in options.columns) ─────────────────────────────
export interface JsonColumnDef {
    key: string; // original key from JSON
    label?: string; // display name override
    hidden?: boolean;
    html?: boolean; // render as HTML
    image?: boolean; // render as <img> (value = url, data: URI, or ioBroker path)
    imageSize?: number;
    /** Optional prefix prepended to relative image paths in this column.
     * If set, overrides global adminBaseUrl auto-rewrite for /<adapter>.admin/ paths. */
    imagePathPrefix?: string;
    /** Render Iconify tokens (e.g. "mdi:window-open-variant") inline as SVG icons. */
    iconify?: boolean;
    /** Fixed column width in px. Unset → auto. */
    width?: number;
    /** Allow the cell text to wrap onto multiple lines (default: single line, ellipsis). */
    wrap?: boolean;
    /** Horizontal alignment of header + cells. Default 'left'. */
    align?: 'left' | 'center' | 'right';
    order?: number; // lower = further left
}

/** Compare two raw cell values: numeric when both look like numbers, else a
 *  locale-aware string compare (with numeric collation so "9" < "10"). */
function compareCellValues(a: unknown, b: unknown): number {
    const aEmpty = a === null || a === undefined || a === '';
    const bEmpty = b === null || b === undefined || b === '';
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return -1;
    if (bEmpty) return 1;
    const na = typeof a === 'number' ? a : Number(a);
    const nb = typeof b === 'number' ? b : Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return cellText(a).localeCompare(cellText(b), undefined, { numeric: true, sensitivity: 'base' });
}

// Iconify token pattern: <set>:<name>, e.g. "mdi:home", "material-symbols:lock".
// Restricted to lowercase letters/digits/dashes to avoid matching arbitrary "x:y" text.
const ICONIFY_TOKEN = /([a-z][a-z0-9-]+:[a-z0-9-]+)/g;

function renderTextWithIcons(text: string, fontSize: number): React.ReactNode {
    if (!ICONIFY_TOKEN.test(text)) return text;
    ICONIFY_TOKEN.lastIndex = 0;
    const parts: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    const size = Math.round(fontSize * 1.25);
    while ((m = ICONIFY_TOKEN.exec(text)) !== null) {
        if (m.index > last) parts.push(text.slice(last, m.index));
        parts.push(
            <Icon
                key={`${m.index}-${m[1]}`}
                icon={m[1]}
                width={size}
                height={size}
                style={{ display: 'inline-block', verticalAlign: '-0.18em' }}
            />,
        );
        last = m.index + m[1].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
}

/** Derive admin base URL: explicit setting wins, else same host on port 8081. */
function effectiveAdminBaseUrl(adminBaseUrl: string | undefined): string {
    const explicit = (adminBaseUrl ?? '').trim();
    if (explicit) return explicit.replace(/\/+$/, '');
    if (typeof window === 'undefined') return '';
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:8081`;
}

/** Resolve image URL for a cell.
 *  - http(s)://, //, data: → as-is (http proxied on HTTPS pages, see proxifyIfMixed)
 *  - aura-file:… → fs/read endpoint
 *  - /<adapter>.admin/… → prepend adminBaseUrl (global) or columnPrefix (override)
 *  - everything else → fall back to aura-file: (legacy behaviour) */
function resolveImageSrc(v: unknown, adminBaseUrl: string, columnPrefix?: string): string {
    if (typeof v !== 'string' || !v) return '';
    if (/^(https?:)?\/\//i.test(v) || v.startsWith('data:')) return proxifyIfMixed(v);
    if (v.startsWith('aura-file:')) return resolveAssetUrl(v);
    // Per-column prefix overrides global handling
    if (columnPrefix && columnPrefix.trim()) {
        const prefix = columnPrefix.trim().replace(/\/+$/, '');
        const path = v.startsWith('/') ? v : `/${v}`;
        return proxifyIfMixed(prefix + path);
    }
    // ioBroker admin asset path: /<adapter>.admin/...
    if (/^\/[^/]+\.admin\//.test(v) && adminBaseUrl) {
        return proxifyIfMixed(adminBaseUrl + v);
    }
    return resolveAssetUrl(`aura-file:${v.replace(/^\/+/, '')}`);
}

// ── Raw table shape after parsing ─────────────────────────────────────────────
interface TableData {
    headers: string[];
    rows: Record<string, unknown>[];
}

function parseJson(raw: unknown): TableData | null {
    let data: unknown;
    if (typeof raw === 'string') {
        try {
            data = JSON.parse(raw);
        } catch {
            return null;
        }
    } else {
        data = raw;
    }
    if (data === null || data === undefined) return null;

    // Array of objects: [{col: val}, ...]
    if (
        Array.isArray(data) &&
        data.length > 0 &&
        typeof data[0] === 'object' &&
        data[0] !== null &&
        !Array.isArray(data[0])
    ) {
        const headers = Object.keys(data[0] as object);
        return { headers, rows: data as Record<string, unknown>[] };
    }

    // Array of arrays: [[header1, header2], [val1, val2], ...]
    if (Array.isArray(data) && data.length > 1 && Array.isArray(data[0])) {
        const [headerRow, ...dataRows] = data as unknown[][];
        const headers = (headerRow as unknown[]).map(String);
        const rows = (dataRows as unknown[][]).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? null])));
        return { headers, rows };
    }

    // {headers: [...], rows: [[...]]}
    if (!Array.isArray(data) && typeof data === 'object' && 'headers' in data && 'rows' in data) {
        const d = data as { headers: unknown[]; rows: unknown[][] };
        const headers = d.headers.map(String);
        const rows = (d.rows as unknown[][]).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? null])));
        return { headers, rows };
    }

    return null;
}

function cellText(v: unknown): string {
    if (v === null || v === undefined) return '–';
    if (typeof v === 'boolean') return v ? '✓' : '✗';
    return String(v);
}

// ── Main widget ────────────────────────────────────────────────────────────────
export function JsonTableWidget({ config, onConfigChange }: WidgetProps) {
    const opts = config.options ?? {};
    const { value } = useDatapoint(config.datapoint);

    const headerBg = (opts.headerBg as string) ?? 'var(--accent)';
    const headerColor = (opts.headerColor as string) ?? '#ffffff';
    const firstColHeader = (opts.firstColHeader as boolean) ?? false;
    const firstColBg = (opts.firstColBg as string) ?? 'var(--app-bg)';
    const firstColColor = (opts.firstColColor as string) ?? 'var(--text-secondary)';
    const striped = (opts.striped as boolean) ?? true;
    const showHeader = (opts.showHeader as boolean) ?? true;
    const showSearch = (opts.showSearch as boolean) ?? false;
    const fontSize = (opts.fontSize as number) ?? 12;
    const autoHeight = (opts.autoHeight as boolean) ?? false;
    const sortable = (opts.sortable as boolean) ?? false;
    const maxRows = (opts.maxRows as number) ?? 0;
    const transparent = !!opts.transparent;
    const showTitle = opts.showTitle !== false;
    const showIcon = opts.showIcon !== false;
    const iconSize = (opts.iconSize as number) || 20;
    const titleAlign = (opts.titleAlign as string) ?? 'left';
    const WidgetIcon = getWidgetIcon(opts.icon as string | undefined, Table2);
    const adminBaseUrl = useConfigStore((s) => effectiveAdminBaseUrl(s.frontend.adminBaseUrl));
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);

    const contentRef = useRef<HTMLDivElement>(null);

    // Latest config + onConfigChange — read by the auto-height effect so its
    // write doesn't clobber sibling option changes (showTitle, showIcon,
    // transparent, …) that happened between effect setups.
    const configRef = useRef(config);
    configRef.current = config;
    const onConfigChangeRef = useRef(onConfigChange);
    onConfigChangeRef.current = onConfigChange;

    const tableData = useMemo(() => parseJson(value), [value]);

    // Build ordered, filtered column list from raw headers + colDefs
    const columns = useMemo<JsonColumnDef[]>(() => {
        if (!tableData) return [];
        const colDefs = (opts.columns as JsonColumnDef[] | undefined) ?? [];
        const defMap = new Map(colDefs.map((d) => [d.key, d]));
        // Start from all raw headers, apply colDef overrides
        const all: JsonColumnDef[] = tableData.headers.map((h, i) => ({
            key: h,
            label: undefined,
            hidden: false,
            html: false,
            order: i,
            ...defMap.get(h),
        }));
        return all.filter((c) => !c.hidden).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }, [tableData, opts.columns]);

    // Filter rows by search query (searches all visible column values)
    const filteredRows = useMemo(() => {
        if (!tableData) return [];
        if (!query.trim()) return tableData.rows;
        const q = query.toLowerCase();
        return tableData.rows.filter((row) => columns.some((col) => cellText(row[col.key]).toLowerCase().includes(q)));
    }, [tableData, columns, query]);

    // Sort by the clicked column header (only when sorting is enabled and the
    // referenced column is still present).
    const sortedRows = useMemo(() => {
        if (!sortable || !sort || !columns.some((c) => c.key === sort.key)) return filteredRows;
        const arr = [...filteredRows];
        arr.sort((r1, r2) => {
            const cmp = compareCellValues(r1[sort.key], r2[sort.key]);
            return sort.dir === 'asc' ? cmp : -cmp;
        });
        return arr;
    }, [filteredRows, columns, sortable, sort]);

    // Optional hard cap on the number of displayed rows.
    const displayedRows = useMemo(
        () => (maxRows > 0 ? sortedRows.slice(0, maxRows) : sortedRows),
        [sortedRows, maxRows],
    );

    // Cycle a header through asc → desc → unsorted.
    const toggleSort = (key: string) => {
        setSort((prev) => {
            if (!prev || prev.key !== key) return { key, dir: 'asc' };
            if (prev.dir === 'asc') return { key, dir: 'desc' };
            return null;
        });
    };

    // Auto-height: measure content and update gridPos.h when data changes.
    // We compare against config.gridPos.h (not a ref) and include it in deps so
    // the effect re-runs when external writes (e.g. delayed loadConfigFromIoBroker
    // after socket connect in the frontend) revert the height — otherwise the
    // last computed value would silently lose to the persisted one.
    useEffect(() => {
        if (!autoHeight || !contentRef.current) return;
        const el = contentRef.current;
        const update = () => {
            // Always read the freshest config — the effect's deps intentionally
            // exclude `config`, so a stale closure would overwrite sibling option
            // toggles (showTitle, showIcon, transparent, …) made between setups.
            const latest = configRef.current;
            // Match Dashboard's effective-settings resolution: per-layout override
            // wins, otherwise fall back to global frontend settings, then hardcoded
            // defaults. Reading layout-only would miss user-customized global
            // gridGap/gridRowHeight and produce a wrong (too small) gridPos.h.
            const { layouts } = useDashboardStore.getState();
            const { frontend } = useConfigStore.getState();
            const layout = layouts.find((l) =>
                l.sections.some((sec) => sec.tabs.some((t) => (t.widgets ?? []).some((w) => w.id === latest.id))),
            );
            const cellSize = layout?.settings?.gridRowHeight ?? frontend.gridRowHeight ?? 20;
            const margin = layout?.settings?.gridGap ?? frontend.gridGap ?? 10;
            // The outer .aura-widget wrapper adds vertical padding (widgetPadding)
            // and a border that sit OUTSIDE contentRef.scrollHeight.
            const widgetEl = el.closest('.aura-widget') as HTMLElement | null;
            let parentOverhead = 0;
            if (widgetEl) {
                const cs = getComputedStyle(widgetEl);
                parentOverhead =
                    parseFloat(cs.paddingTop || '0') +
                    parseFloat(cs.paddingBottom || '0') +
                    parseFloat(cs.borderTopWidth || '0') +
                    parseFloat(cs.borderBottomWidth || '0');
            }
            const naturalH = el.scrollHeight + parentOverhead;
            const newH = Math.max(1, Math.ceil((naturalH + margin) / (cellSize + margin)));
            if (newH !== latest.gridPos.h) {
                onConfigChangeRef.current({ ...latest, gridPos: { ...latest.gridPos, h: newH } });
            }
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, [
        autoHeight,
        displayedRows.length,
        columns.length,
        showHeader,
        showSearch,
        fontSize,
        config.id,
        config.gridPos.h,
    ]);

    const fs = fontSize;
    const pad = `${Math.round(fs * 0.35)}px ${Math.round(fs * 0.6)}px`;

    if (!config.datapoint) {
        return (
            <div className="aura-widget-row flex flex-col h-full">
                {(showTitle || showIcon) && (
                    <div className="flex items-center gap-1 shrink-0 mb-1 min-w-0">
                        {showIcon && (
                            <WidgetIcon
                                className="aura-widget-icon"
                                size={iconSize}
                                style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
                            />
                        )}
                        {showTitle && (
                            <p
                                className="aura-widget-title text-xs truncate flex-1 min-w-0"
                                style={{
                                    color: 'var(--text-secondary)',
                                    textAlign: titleAlign as React.CSSProperties['textAlign'],
                                }}
                            >
                                {config.title}
                            </p>
                        )}
                    </div>
                )}
                <div
                    className="flex flex-col items-center justify-center flex-1 gap-2"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <Table2 size={32} strokeWidth={1} />
                    <span className="text-xs opacity-60">Kein Datenpunkt konfiguriert</span>
                </div>
            </div>
        );
    }

    if (!tableData) {
        return (
            <div className="aura-widget-row flex flex-col h-full">
                {(showTitle || showIcon) && (
                    <div className="flex items-center gap-1 shrink-0 mb-1 min-w-0">
                        {showIcon && (
                            <WidgetIcon
                                className="aura-widget-icon"
                                size={iconSize}
                                style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
                            />
                        )}
                        {showTitle && (
                            <p
                                className="aura-widget-title text-xs truncate flex-1 min-w-0"
                                style={{
                                    color: 'var(--text-secondary)',
                                    textAlign: titleAlign as React.CSSProperties['textAlign'],
                                }}
                            >
                                {config.title}
                            </p>
                        )}
                    </div>
                )}
                <div
                    className="flex flex-col items-center justify-center flex-1 gap-2"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <Table2 size={24} strokeWidth={1} />
                    <span className="text-xs opacity-60">
                        {value !== undefined && value !== null ? 'Ungültiges JSON' : 'Warte auf Daten…'}
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div ref={contentRef} className={`aura-widget-row flex flex-col gap-1 ${autoHeight ? '' : 'h-full'}`}>
            {/* Title */}
            {(showTitle || showIcon) && (
                <div className="flex items-center gap-1 shrink-0 min-w-0">
                    {showIcon && (
                        <WidgetIcon
                            className="aura-widget-icon"
                            size={iconSize}
                            style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
                        />
                    )}
                    {showTitle && (
                        <p
                            className="aura-widget-title text-xs truncate flex-1 min-w-0"
                            style={{
                                color: 'var(--text-secondary)',
                                textAlign: titleAlign as React.CSSProperties['textAlign'],
                            }}
                        >
                            {config.title}
                        </p>
                    )}
                </div>
            )}

            {/* Search bar */}
            {showSearch && (
                <div
                    className="shrink-0 flex items-center gap-1 px-2 rounded-lg"
                    style={{
                        background: transparent ? 'transparent' : 'var(--app-bg)',
                        border: '1px solid var(--app-border)',
                    }}
                >
                    <Search size={11} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Suchen…"
                        className="flex-1 min-w-0 py-1.5 bg-transparent focus:outline-none"
                        style={{ fontSize: fs - 1, color: 'var(--text-primary)' }}
                    />
                    {query && (
                        <button
                            onClick={() => setQuery('')}
                            className="shrink-0 hover:opacity-70"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            <X size={10} />
                        </button>
                    )}
                </div>
            )}

            {/* Table */}
            <div className={autoHeight ? 'overflow-x-auto min-w-0' : 'flex-1 overflow-auto min-h-0 min-w-0'}>
                <table className="border-collapse" style={{ fontSize: fs, width: '100%', tableLayout: 'auto' }}>
                    {showHeader && columns.length > 0 && (
                        <thead>
                            <tr>
                                {columns.map((col, ci) => {
                                    const align = col.align ?? 'left';
                                    const isSorted = sortable && sort?.key === col.key;
                                    return (
                                        <th
                                            key={col.key}
                                            onClick={sortable ? () => toggleSort(col.key) : undefined}
                                            className="whitespace-nowrap sticky top-0"
                                            style={{
                                                padding: `${Math.round(fs * 0.4)}px ${Math.round(fs * 0.6)}px`,
                                                textAlign: align,
                                                width: col.width && col.width > 0 ? col.width : undefined,
                                                cursor: sortable ? 'pointer' : undefined,
                                                userSelect: sortable ? 'none' : undefined,
                                                background: transparent
                                                    ? 'transparent'
                                                    : firstColHeader && ci === 0
                                                      ? firstColBg
                                                      : headerBg,
                                                color: firstColHeader && ci === 0 ? firstColColor : headerColor,
                                                fontWeight: 600,
                                                borderBottom: '2px solid var(--app-border)',
                                                zIndex: 1,
                                            }}
                                        >
                                            <span
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: 3,
                                                    justifyContent:
                                                        align === 'right'
                                                            ? 'flex-end'
                                                            : align === 'center'
                                                              ? 'center'
                                                              : 'flex-start',
                                                }}
                                            >
                                                {col.label ?? col.key}
                                                {isSorted &&
                                                    (sort?.dir === 'asc' ? (
                                                        <ArrowUp size={Math.round(fs * 0.9)} />
                                                    ) : (
                                                        <ArrowDown size={Math.round(fs * 0.9)} />
                                                    ))}
                                            </span>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                    )}
                    <tbody>
                        {displayedRows.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={columns.length}
                                    className="text-center py-4"
                                    style={{ color: 'var(--text-secondary)', fontSize: fs - 1 }}
                                >
                                    {query ? 'Keine Treffer' : 'Keine Daten'}
                                </td>
                            </tr>
                        ) : (
                            displayedRows.map((row, ri) => (
                                <tr
                                    key={ri}
                                    style={{
                                        background:
                                            striped && ri % 2 === 1
                                                ? 'color-mix(in srgb, var(--app-bg) 60%, transparent)'
                                                : 'transparent',
                                    }}
                                >
                                    {columns.map((col, ci) => {
                                        const isLabel = firstColHeader && ci === 0;
                                        const raw = row[col.key];
                                        const isImage = col.image ?? false;
                                        const isHtml = !isImage && (col.html ?? false);
                                        const useIconify = !isImage && !isHtml && (col.iconify ?? false);
                                        const imgSize =
                                            col.imageSize && col.imageSize > 0 ? col.imageSize : Math.round(fs * 2.4);
                                        const wrap = col.wrap ?? false;
                                        const hasWidth = !!(col.width && col.width > 0);
                                        return (
                                            <td
                                                key={col.key}
                                                style={{
                                                    padding: pad,
                                                    color: isLabel ? firstColColor : 'var(--text-primary)',
                                                    background: isLabel ? firstColBg : undefined,
                                                    fontWeight: isLabel ? 600 : 400,
                                                    textAlign: col.align ?? 'left',
                                                    width: hasWidth ? col.width : undefined,
                                                    borderRight: isLabel ? '2px solid var(--app-border)' : undefined,
                                                    borderBottom: `1px solid color-mix(in srgb, var(--app-border) 50%, transparent)`,
                                                    maxWidth:
                                                        isHtml || isImage || wrap || hasWidth ? undefined : '20em',
                                                    overflow: isHtml || isImage || wrap ? undefined : 'hidden',
                                                    textOverflow: isHtml || isImage || wrap ? undefined : 'ellipsis',
                                                    whiteSpace: isHtml || isImage || wrap ? undefined : 'nowrap',
                                                }}
                                            >
                                                {isImage ? (
                                                    resolveImageSrc(raw, adminBaseUrl, col.imagePathPrefix) ? (
                                                        <img
                                                            src={resolveImageSrc(
                                                                raw,
                                                                adminBaseUrl,
                                                                col.imagePathPrefix,
                                                            )}
                                                            alt=""
                                                            style={{
                                                                width: imgSize,
                                                                height: imgSize,
                                                                objectFit: 'contain',
                                                                display: 'block',
                                                            }}
                                                        />
                                                    ) : (
                                                        <span style={{ opacity: 0.5 }}>–</span>
                                                    )
                                                ) : isHtml ? (
                                                    <span
                                                        dangerouslySetInnerHTML={{
                                                            __html: resolveHtmlAssets(cellText(raw)),
                                                        }}
                                                    />
                                                ) : useIconify ? (
                                                    renderTextWithIcons(cellText(raw), fs)
                                                ) : (
                                                    cellText(raw)
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Row count when search active */}
            {showSearch && query && (
                <p className="shrink-0 text-right" style={{ fontSize: fs - 2, color: 'var(--text-secondary)' }}>
                    {filteredRows.length} / {tableData.rows.length}
                </p>
            )}
        </div>
    );
}
