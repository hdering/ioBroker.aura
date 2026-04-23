/**
 * Shared custom-grid layout renderer used by all widgets that support layout='custom'.
 * A 3×3 grid of independently configurable cells.
 */
import React from 'react';
import { useDatapoint } from '../../hooks/useDatapoint';
import type { WidgetConfig, CustomCell, CustomGrid } from '../../types';

// ── Default grid (title top-left, large value + unit in middle row) ──────────

export const DEFAULT_CUSTOM_GRID: CustomGrid = [
  { type: 'title', align: 'left', valign: 'top' },
  { type: 'empty' },
  { type: 'empty' },
  { type: 'value', fontSize: 32, bold: true, align: 'left', valign: 'middle' },
  { type: 'unit',  fontSize: 14,             align: 'left', valign: 'middle' },
  { type: 'empty' },
  { type: 'empty' },
  { type: 'empty' },
  { type: 'empty' },
];

// ── Style helpers ─────────────────────────────────────────────────────────────

function cellTextStyle(cell: CustomCell, defaultColor: string): React.CSSProperties {
  return {
    fontSize:     cell.fontSize ? `${cell.fontSize}px` : undefined,
    fontWeight:   cell.bold   ? 'bold'   : undefined,
    fontStyle:    cell.italic ? 'italic' : undefined,
    color:        cell.color || defaultColor,
    overflow:     cell.allowOverflow ? 'visible' : 'hidden',
    textOverflow: cell.allowOverflow ? undefined  : 'ellipsis',
    whiteSpace:   'nowrap',
    lineHeight:   1.15,
    position:     cell.allowOverflow ? 'relative' : undefined,
    zIndex:       cell.allowOverflow ? 1           : undefined,
  };
}

function cellWrapStyle(cell: CustomCell): React.CSSProperties {
  return {
    display:        'flex',
    overflow:       cell.allowOverflow ? 'visible' : 'hidden',
    alignItems:     cell.valign === 'top' ? 'flex-start' : cell.valign === 'bottom' ? 'flex-end' : 'center',
    justifyContent: cell.align === 'center' ? 'center' : cell.align === 'right' ? 'flex-end' : 'flex-start',
    padding:        '2px',
  };
}

// ── Cell sub-components ───────────────────────────────────────────────────────

/** Subscribes to an arbitrary ioBroker DP and renders its value. */
function DpCellView({ cell, index }: { cell: CustomCell; index: number }) {
  const { value } = useDatapoint(cell.dpId ?? '');
  const formatted = value === null ? '–'
    : typeof value === 'number' ? value.toLocaleString('de-DE')
    : String(value);
  const content = `${cell.prefix ?? ''}${formatted}${cell.suffix ?? ''}`;
  if (!cell.dpId) return <div className={`aura-custom-cell-${index}`} />;
  return (
    <div className={`aura-custom-cell-${index}`} style={cellWrapStyle(cell)}>
      <span style={cellTextStyle(cell, 'var(--text-primary)')}>{content}</span>
    </div>
  );
}

/** Renders an image from a URL or base64 data URI. */
function ImageCellView({ cell, index }: { cell: CustomCell; index: number }) {
  if (!cell.imageUrl) return <div className={`aura-custom-cell-${index}`} />;
  return (
    <div className={`aura-custom-cell-${index}`} style={{ ...cellWrapStyle(cell), padding: 0 }}>
      <img
        src={cell.imageUrl}
        alt=""
        style={{
          width: '100%',
          height: '100%',
          objectFit: cell.objectFit ?? 'contain',
          display: 'block',
        }}
      />
    </div>
  );
}

/** Renders a widget-supplied React node (interactive element or icon). */
function ComponentCellView({ cell, index, extraComponents }: {
  cell: CustomCell;
  index: number;
  extraComponents?: Record<string, React.ReactNode>;
}) {
  const node = extraComponents?.[cell.componentKey ?? ''];
  if (!node) return <div className={`aura-custom-cell-${index}`} />;
  return (
    <div className={`aura-custom-cell-${index}`} style={{ ...cellWrapStyle(cell), padding: '2px' }}>
      {node}
    </div>
  );
}

/** Renders static / widget-derived content (title, value, unit, free text, extra field). */
function StaticCellView({
  cell, index, title, value, unit, extraFields,
}: {
  cell: CustomCell;
  index: number;
  title: string;
  value: string;
  unit?: string;
  extraFields?: Record<string, string>;
}) {
  const content = (() => {
    switch (cell.type) {
      case 'title': return title;
      case 'value': return `${cell.prefix ?? ''}${value}${cell.suffix ?? ''}`;
      case 'unit':  return unit ?? '';
      case 'text':  return cell.text ?? '';
      case 'field': return extraFields?.[cell.fieldKey ?? ''] ?? '';
      default:      return '';
    }
  })();

  if (cell.type === 'empty' || !content) return <div className={`aura-custom-cell-${index}`} />;

  const defaultColor = cell.type === 'value' ? 'var(--text-primary)' : 'var(--text-secondary)';
  return (
    <div className={`aura-custom-cell-${index}`} style={cellWrapStyle(cell)}>
      <span style={cellTextStyle(cell, defaultColor)}>{content}</span>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface CustomGridViewProps {
  config: WidgetConfig;
  /** Widget's main display value (formatted string). Pass '' for complex widgets. */
  value: string;
  /** Optional unit for 'unit' type cells. */
  unit?: string;
  /**
   * Optional extra named fields for 'field' type cells.
   * Keys are widget-specific (e.g. 'summary', 'date', 'time', 'calname' for calendar;
   * 'time', 'date' for clock).
   */
  extraFields?: Record<string, string>;
  /**
   * Optional pre-rendered React nodes for 'component' type cells.
   * Keys are widget-specific (e.g. 'slider' for dimmer, 'toggle' for switch).
   */
  extraComponents?: Record<string, React.ReactNode>;
}

export function CustomGridView({ config, value, unit, extraFields, extraComponents }: CustomGridViewProps) {
  const cells: CustomGrid = (config.options?.customGrid as CustomGrid | undefined) ?? DEFAULT_CUSTOM_GRID;
  return (
    <div
      className="aura-custom-grid"
      style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: '1fr 1fr 1fr', width: '100%', height: '100%', gap: '2px' }}
    >
      {cells.map((cell, i) =>
        cell.type === 'dp'
          ? <DpCellView key={i} cell={cell} index={i} />
          : cell.type === 'image'
            ? <ImageCellView key={i} cell={cell} index={i} />
            : cell.type === 'component'
              ? <ComponentCellView key={i} cell={cell} index={i} extraComponents={extraComponents} />
              : <StaticCellView key={i} cell={cell} index={i} title={config.title} value={value} unit={unit} extraFields={extraFields} />
      )}
    </div>
  );
}
