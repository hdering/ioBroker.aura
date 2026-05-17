import { useMemo, useState, useRef, useEffect } from 'react';
import { Table2, Search, X } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useDashboardStore } from '../../store/dashboardStore';
import { useConfigStore } from '../../store/configStore';
import type { WidgetProps } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { resolveAssetUrl } from '../../utils/assetUrl';

// ── Column definition (stored in options.columns) ─────────────────────────────
export interface JsonColumnDef {
  key: string;       // original key from JSON
  label?: string;    // display name override
  hidden?: boolean;
  html?: boolean;    // render as HTML
  image?: boolean;   // render as <img> (value = url, data: URI, or ioBroker path)
  imageSize?: number;
  order?: number;    // lower = further left
}

function resolveImageSrc(v: unknown): string {
  if (typeof v !== 'string' || !v) return '';
  if (/^(https?:)?\/\//i.test(v) || v.startsWith('data:')) return v;
  if (v.startsWith('aura-file:')) return resolveAssetUrl(v);
  return resolveAssetUrl('aura-file:' + v.replace(/^\/+/, ''));
}

// ── Raw table shape after parsing ─────────────────────────────────────────────
interface TableData {
  headers: string[];
  rows: Record<string, unknown>[];
}

function parseJson(raw: unknown): TableData | null {
  let data: unknown;
  if (typeof raw === 'string') {
    try { data = JSON.parse(raw); } catch { return null; }
  } else {
    data = raw;
  }
  if (data === null || data === undefined) return null;

  // Array of objects: [{col: val}, ...]
  if (
    Array.isArray(data) && data.length > 0 &&
    typeof data[0] === 'object' && data[0] !== null && !Array.isArray(data[0])
  ) {
    const headers = Object.keys(data[0] as object);
    return { headers, rows: data as Record<string, unknown>[] };
  }

  // Array of arrays: [[header1, header2], [val1, val2], ...]
  if (Array.isArray(data) && data.length > 1 && Array.isArray(data[0])) {
    const [headerRow, ...dataRows] = data as unknown[][];
    const headers = (headerRow as unknown[]).map(String);
    const rows = (dataRows as unknown[][]).map((r) =>
      Object.fromEntries(headers.map((h, i) => [h, r[i] ?? null])),
    );
    return { headers, rows };
  }

  // {headers: [...], rows: [[...]]}
  if (!Array.isArray(data) && typeof data === 'object' && 'headers' in data && 'rows' in data) {
    const d = data as { headers: unknown[]; rows: unknown[][] };
    const headers = d.headers.map(String);
    const rows = (d.rows as unknown[][]).map((r) =>
      Object.fromEntries(headers.map((h, i) => [h, r[i] ?? null])),
    );
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

  const headerBg       = (opts.headerBg      as string)  ?? 'var(--accent)';
  const headerColor    = (opts.headerColor    as string)  ?? '#ffffff';
  const firstColHeader = (opts.firstColHeader as boolean) ?? false;
  const firstColBg     = (opts.firstColBg     as string)  ?? 'var(--app-bg)';
  const firstColColor  = (opts.firstColColor  as string)  ?? 'var(--text-secondary)';
  const striped        = (opts.striped        as boolean) ?? true;
  const showHeader     = (opts.showHeader     as boolean) ?? true;
  const showSearch     = (opts.showSearch     as boolean) ?? false;
  const fontSize       = (opts.fontSize       as number)  ?? 12;
  const autoHeight     = (opts.autoHeight     as boolean) ?? false;
  const showTitle      = opts.showTitle !== false;
  const showIcon       = opts.showIcon  !== false;
  const iconSize       = (opts.iconSize  as number) || 20;
  const titleAlign     = (opts.titleAlign     as string)  ?? 'left';
  const WidgetIcon     = getWidgetIcon(opts.icon as string | undefined, Table2);
  const [query, setQuery] = useState('');

  const contentRef = useRef<HTMLDivElement>(null);

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
    return all
      .filter((c) => !c.hidden)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [tableData, opts.columns]);

  // Filter rows by search query (searches all visible column values)
  const filteredRows = useMemo(() => {
    if (!tableData) return [];
    if (!query.trim()) return tableData.rows;
    const q = query.toLowerCase();
    return tableData.rows.filter((row) =>
      columns.some((col) => cellText(row[col.key]).toLowerCase().includes(q)),
    );
  }, [tableData, columns, query]);

  // Auto-height: measure content and update gridPos.h when data changes.
  // We compare against config.gridPos.h (not a ref) and include it in deps so
  // the effect re-runs when external writes (e.g. delayed loadConfigFromIoBroker
  // after socket connect in the frontend) revert the height — otherwise the
  // last computed value would silently lose to the persisted one.
  useEffect(() => {
    if (!autoHeight || !contentRef.current) return;
    const el = contentRef.current;
    const update = () => {
      // Match Dashboard's effective-settings resolution: per-layout override
      // wins, otherwise fall back to global frontend settings, then hardcoded
      // defaults. Reading layout-only would miss user-customized global
      // gridGap/gridRowHeight and produce a wrong (too small) gridPos.h.
      const { layouts } = useDashboardStore.getState();
      const { frontend } = useConfigStore.getState();
      const layout = layouts.find((l) => l.tabs.some((t) => (t.widgets ?? []).some((w) => w.id === config.id)));
      const cellSize = layout?.settings?.gridRowHeight ?? frontend.gridRowHeight ?? 20;
      const margin   = layout?.settings?.gridGap       ?? frontend.gridGap       ?? 10;
      // The outer .aura-widget wrapper adds vertical padding (widgetPadding)
      // and a border that sit OUTSIDE contentRef.scrollHeight.
      const widgetEl = el.closest('.aura-widget') as HTMLElement | null;
      let parentOverhead = 0;
      if (widgetEl) {
        const cs = getComputedStyle(widgetEl);
        parentOverhead =
          parseFloat(cs.paddingTop || '0') + parseFloat(cs.paddingBottom || '0') +
          parseFloat(cs.borderTopWidth || '0') + parseFloat(cs.borderBottomWidth || '0');
      }
      const naturalH = el.scrollHeight + parentOverhead;
      const newH = Math.max(1, Math.ceil((naturalH + margin) / (cellSize + margin)));
      if (newH !== config.gridPos.h) {
        onConfigChange({ ...config, gridPos: { ...config.gridPos, h: newH } });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoHeight, filteredRows.length, columns.length, showHeader, showSearch, fontSize, config.id, config.gridPos.h]);

  const fs = fontSize;
  const pad = `${Math.round(fs * 0.35)}px ${Math.round(fs * 0.6)}px`;

  if (!config.datapoint) {
    return (
      <div className="flex flex-col h-full">
        {(showTitle || showIcon) && (
          <div className="flex items-center gap-1 shrink-0 mb-1 min-w-0">
            {showIcon && <WidgetIcon size={iconSize} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />}
            {showTitle && <p className="text-xs truncate flex-1 min-w-0" style={{ color: 'var(--text-secondary)', textAlign: titleAlign as React.CSSProperties['textAlign'] }}>{config.title}</p>}
          </div>
        )}
        <div className="flex flex-col items-center justify-center flex-1 gap-2" style={{ color: 'var(--text-secondary)' }}>
          <Table2 size={32} strokeWidth={1} />
          <span className="text-xs opacity-60">Kein Datenpunkt konfiguriert</span>
        </div>
      </div>
    );
  }

  if (!tableData) {
    return (
      <div className="flex flex-col h-full">
        {(showTitle || showIcon) && (
          <div className="flex items-center gap-1 shrink-0 mb-1 min-w-0">
            {showIcon && <WidgetIcon size={iconSize} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />}
            {showTitle && <p className="text-xs truncate flex-1 min-w-0" style={{ color: 'var(--text-secondary)', textAlign: titleAlign as React.CSSProperties['textAlign'] }}>{config.title}</p>}
          </div>
        )}
        <div className="flex flex-col items-center justify-center flex-1 gap-2" style={{ color: 'var(--text-secondary)' }}>
          <Table2 size={24} strokeWidth={1} />
          <span className="text-xs opacity-60">
            {value !== undefined && value !== null ? 'Ungültiges JSON' : 'Warte auf Daten…'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div ref={contentRef} className={`flex flex-col gap-1 ${autoHeight ? '' : 'h-full'}`}>
      {/* Title */}
      {(showTitle || showIcon) && (
        <div className="flex items-center gap-1 shrink-0 min-w-0">
          {showIcon && <WidgetIcon size={iconSize} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />}
          {showTitle && <p className="text-xs truncate flex-1 min-w-0" style={{ color: 'var(--text-secondary)', textAlign: titleAlign as React.CSSProperties['textAlign'] }}>{config.title}</p>}
        </div>
      )}

      {/* Search bar */}
      {showSearch && (
        <div className="shrink-0 flex items-center gap-1 px-2 rounded-lg"
          style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}>
          <Search size={11} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Suchen…"
            className="flex-1 min-w-0 py-1.5 bg-transparent focus:outline-none"
            style={{ fontSize: fs - 1, color: 'var(--text-primary)' }}
          />
          {query && (
            <button onClick={() => setQuery('')} className="shrink-0 hover:opacity-70"
              style={{ color: 'var(--text-secondary)' }}>
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
                {columns.map((col, ci) => (
                  <th key={col.key}
                    className="text-left whitespace-nowrap sticky top-0"
                    style={{
                      padding: `${Math.round(fs * 0.4)}px ${Math.round(fs * 0.6)}px`,
                      background: firstColHeader && ci === 0 ? firstColBg : headerBg,
                      color:      firstColHeader && ci === 0 ? firstColColor : headerColor,
                      fontWeight: 600,
                      borderBottom: '2px solid var(--app-border)',
                      zIndex: 1,
                    }}>
                    {col.label ?? col.key}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length}
                  className="text-center py-4"
                  style={{ color: 'var(--text-secondary)', fontSize: fs - 1 }}>
                  {query ? 'Keine Treffer' : 'Keine Daten'}
                </td>
              </tr>
            ) : filteredRows.map((row, ri) => (
              <tr key={ri}
                style={{ background: striped && ri % 2 === 1 ? 'color-mix(in srgb, var(--app-bg) 60%, transparent)' : 'transparent' }}>
                {columns.map((col, ci) => {
                  const isLabel = firstColHeader && ci === 0;
                  const raw = row[col.key];
                  const isImage = col.image ?? false;
                  const isHtml = !isImage && (col.html ?? false);
                  const imgSize = col.imageSize && col.imageSize > 0 ? col.imageSize : Math.round(fs * 2.4);
                  return (
                    <td key={col.key}
                      style={{
                        padding: pad,
                        color:      isLabel ? firstColColor : 'var(--text-primary)',
                        background: isLabel ? firstColBg : undefined,
                        fontWeight: isLabel ? 600 : 400,
                        borderRight:  isLabel ? '2px solid var(--app-border)' : undefined,
                        borderBottom: `1px solid color-mix(in srgb, var(--app-border) 50%, transparent)`,
                        maxWidth: (isHtml || isImage) ? undefined : '20em',
                        overflow: 'hidden',
                        textOverflow: (isHtml || isImage) ? undefined : 'ellipsis',
                        whiteSpace: (isHtml || isImage) ? undefined : 'nowrap',
                      }}>
                      {isImage
                        ? (resolveImageSrc(raw)
                            ? <img src={resolveImageSrc(raw)} alt=""
                                style={{ width: imgSize, height: imgSize, objectFit: 'contain', display: 'block' }} />
                            : <span style={{ opacity: 0.5 }}>–</span>)
                        : isHtml
                          ? <span dangerouslySetInnerHTML={{ __html: cellText(raw) }} />
                          : cellText(raw)}
                    </td>
                  );
                })}
              </tr>
            ))}
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
