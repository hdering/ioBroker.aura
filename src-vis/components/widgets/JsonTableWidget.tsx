import { useMemo, useState } from 'react';
import { Table2, Search, X } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import type { WidgetProps } from '../../types';

// ── Column definition (stored in options.columns) ─────────────────────────────
export interface JsonColumnDef {
  key: string;       // original key from JSON
  label?: string;    // display name override
  hidden?: boolean;
  html?: boolean;    // render as HTML
  order?: number;    // lower = further left
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
export function JsonTableWidget({ config }: WidgetProps) {
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
  const [query, setQuery] = useState('');

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

  const fs = fontSize;
  const pad = `${Math.round(fs * 0.35)}px ${Math.round(fs * 0.6)}px`;

  if (!config.datapoint) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2"
        style={{ color: 'var(--text-secondary)' }}>
        <Table2 size={32} strokeWidth={1} />
        <p className="text-xs text-center">
          {config.title || 'JSON-Tabelle'}<br />
          <span className="text-[10px] opacity-60">Kein Datenpunkt konfiguriert</span>
        </p>
      </div>
    );
  }

  if (!tableData) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2"
        style={{ color: 'var(--text-secondary)' }}>
        <Table2 size={24} strokeWidth={1} />
        <p className="text-xs text-center opacity-60">
          {value !== undefined && value !== null ? 'Ungültiges JSON' : 'Warte auf Daten…'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-1">
      {/* Title */}
      {config.title && !opts.hideTitle && (
        <p className="shrink-0 truncate" style={{ fontSize: fs - 1, color: 'var(--text-secondary)' }}>
          {config.title}
        </p>
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
      <div className="flex-1 overflow-auto min-h-0 min-w-0">
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
                  const isHtml = col.html ?? false;
                  return (
                    <td key={col.key}
                      style={{
                        padding: pad,
                        color:      isLabel ? firstColColor : 'var(--text-primary)',
                        background: isLabel ? firstColBg : undefined,
                        fontWeight: isLabel ? 600 : 400,
                        borderRight:  isLabel ? '2px solid var(--app-border)' : undefined,
                        borderBottom: `1px solid color-mix(in srgb, var(--app-border) 50%, transparent)`,
                        maxWidth: isHtml ? undefined : '20em',
                        overflow: 'hidden',
                        textOverflow: isHtml ? undefined : 'ellipsis',
                        whiteSpace: isHtml ? undefined : 'nowrap',
                      }}>
                      {isHtml
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
