/**
 * Shared custom-grid layout renderer used by all widgets that support layout='custom'.
 * Default 3×3 grid, but parameterized via CustomGridDef for arbitrary cols/rows (used by Universal Widget).
 */
import React, { useEffect, useState } from 'react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import { useConfirmAction } from '../../hooks/useConfirmAction';
import type { WidgetConfig, CustomCell, CustomGrid, CustomGridDef } from '../../types';
import { resolveAssetUrl } from '../../utils/assetUrl';
import { useGlobalSettingsStore } from '../../store/globalSettingsStore';
import { formatNum } from '../../utils/formatValue';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { HelpCircle } from 'lucide-react';
import { parseValue, formatDate, toDateInputValue, toTimeInputValue, type DateOutputFormat } from './DatePickerWidget';
import { ConfirmOverlay } from './ConfirmOverlay';

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

/** Default for the Universal Widget — empty 3×3. */
export const DEFAULT_UNIVERSAL_GRID: CustomGridDef = {
  cols: 3,
  rows: 3,
  cells: Array.from({ length: 9 }, () => ({ type: 'empty' as const })),
};

/**
 * Normalize an arbitrary stored value to a CustomGridDef.
 * Accepts legacy array (assumes 3×3) or the new object form.
 */
export function normalizeGrid(raw: unknown, fallback?: CustomGrid | CustomGridDef): CustomGridDef {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'cells' in raw) {
    const def = raw as CustomGridDef;
    const cols = Math.max(1, Math.min(8, def.cols || 3));
    const rows = Math.max(1, Math.min(8, def.rows || 3));
    const need = cols * rows;
    const cells = (def.cells ?? []).slice(0, need);
    while (cells.length < need) cells.push({ type: 'empty' });
    return { cols, rows, cells };
  }
  if (Array.isArray(raw)) {
    const cells = raw.slice(0, 9);
    while (cells.length < 9) cells.push({ type: 'empty' });
    return { cols: 3, rows: 3, cells };
  }
  if (fallback) {
    if (Array.isArray(fallback)) return { cols: 3, rows: 3, cells: [...fallback] };
    return fallback;
  }
  return { cols: 3, rows: 3, cells: [...DEFAULT_CUSTOM_GRID] };
}

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

function cellWrapStyle(cell: CustomCell, index: number, cols: number, rows: number): React.CSSProperties {
  const col = (index % cols) + 1;
  const row = Math.floor(index / cols) + 1;
  const colSpan = Math.max(1, Math.min(cell.colSpan ?? 1, cols + 1 - col));
  const rowSpan = Math.max(1, Math.min(cell.rowSpan ?? 1, rows + 1 - row));
  return {
    display:        'flex',
    overflow:       cell.allowOverflow ? 'visible' : 'hidden',
    alignItems:     cell.valign === 'top' ? 'flex-start' : cell.valign === 'bottom' ? 'flex-end' : 'center',
    justifyContent: cell.align === 'center' ? 'center' : cell.align === 'right' ? 'flex-end' : 'flex-start',
    padding:        '2px',
    gridRow:        rowSpan > 1 ? `${row} / span ${rowSpan}` : row,
    gridColumn:     colSpan > 1 ? `${col} / span ${colSpan}` : col,
    position:       (colSpan > 1 || rowSpan > 1) ? 'relative' : undefined,
    zIndex:         (colSpan > 1 || rowSpan > 1) ? 1 : undefined,
  };
}

function emptyCellStyle(index: number, cols: number): React.CSSProperties {
  return { gridRow: Math.floor(index / cols) + 1, gridColumn: (index % cols) + 1 };
}

// ── Read-only cell sub-components ─────────────────────────────────────────────

/** Subscribes to an arbitrary ioBroker DP and renders its value. */
function DpCellView({ cell, index, cols, rows, defaultDecimals }: { cell: CustomCell; index: number; cols: number; rows: number; defaultDecimals: number }) {
  const { value } = useDatapoint(cell.dpId ?? '');
  const decimals = cell.decimals ?? defaultDecimals;
  const formatted = value === null ? '–'
    : typeof value === 'number' ? formatNum(value, decimals)
    : String(value);
  const content = `${cell.prefix ?? ''}${formatted}${cell.suffix ?? ''}`;
  if (!cell.dpId) return <div className={`aura-custom-cell-${index}`} style={emptyCellStyle(index, cols)} />;
  return (
    <div className={`aura-custom-cell-${index}`} style={cellWrapStyle(cell, index, cols, rows)}>
      <span style={cellTextStyle(cell, 'var(--text-primary)')}>{content}</span>
    </div>
  );
}

/** Renders an image from a URL or base64 data URI. */
function ImageCellView({ cell, index, cols, rows }: { cell: CustomCell; index: number; cols: number; rows: number }) {
  if (!cell.imageUrl) return <div className={`aura-custom-cell-${index}`} style={emptyCellStyle(index, cols)} />;
  return (
    <div className={`aura-custom-cell-${index}`} style={{ ...cellWrapStyle(cell, index, cols, rows), padding: 0 }}>
      <img
        src={resolveAssetUrl(cell.imageUrl)}
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
function ComponentCellView({ cell, index, cols, rows, extraComponents }: {
  cell: CustomCell;
  index: number;
  cols: number;
  rows: number;
  extraComponents?: Record<string, React.ReactNode>;
}) {
  const node = extraComponents?.[cell.componentKey ?? ''];
  if (!node) return <div className={`aura-custom-cell-${index}`} style={emptyCellStyle(index, cols)} />;
  return (
    <div className={`aura-custom-cell-${index}`} style={{ ...cellWrapStyle(cell, index, cols, rows), padding: '2px' }}>
      {node}
    </div>
  );
}

/** Renders static / widget-derived content (title, value, unit, free text, extra field). */
function StaticCellView({
  cell, index, cols, rows, title, value, rawValue, unit, extraFields,
}: {
  cell: CustomCell;
  index: number;
  cols: number;
  rows: number;
  title: string;
  value: string;
  rawValue?: number | null;
  unit?: string;
  extraFields?: Record<string, string>;
}) {
  const content = (() => {
    switch (cell.type) {
      case 'title': return title;
      case 'value': {
        const displayVal = cell.decimals !== undefined && rawValue != null
          ? formatNum(rawValue, cell.decimals)
          : value;
        return `${cell.prefix ?? ''}${displayVal}${cell.suffix ?? ''}`;
      }
      case 'unit':  return unit ?? '';
      case 'text':  return cell.text ?? '';
      case 'field': return extraFields?.[cell.fieldKey ?? ''] ?? '';
      default:      return '';
    }
  })();

  if (cell.type === 'empty' || !content) return <div className={`aura-custom-cell-${index}`} style={emptyCellStyle(index, cols)} />;

  return (
    <div className={`aura-custom-cell-${index}`} style={cellWrapStyle(cell, index, cols, rows)}>
      <span style={cellTextStyle(cell, 'var(--text-primary)')}>{content}</span>
    </div>
  );
}

// ── Interactive cell sub-components (Universal Widget) ────────────────────────

/** Boolean toggle bound to a DP. */
function SwitchCellView({ cell, index, cols, rows }: { cell: CustomCell; index: number; cols: number; rows: number }) {
  const { value, setValue } = useDatapoint(cell.dpId ?? '');
  const on = value === true || value === 1 || value === 'true' || value === '1';
  const doToggle = () => {
    if (cell.momentary) {
      const delay = cell.momentaryDelay ?? 500;
      setValue(true);
      setTimeout(() => setValue(false), delay);
    } else {
      setValue(!on);
    }
  };
  const { run: handleClick, pending, confirm, cancel } = useConfirmAction(doToggle, !!cell.confirmAction);
  if (!cell.dpId) return <div className={`aura-custom-cell-${index}`} style={emptyCellStyle(index, cols)} />;
  const wrap = { ...cellWrapStyle(cell, index, cols, rows), position: 'relative' as const };
  if (cell.controlMode === 'icon') {
    const iconName = on ? (cell.trueIcon || cell.iconName) : (cell.falseIcon || cell.iconName);
    const color    = on ? (cell.trueColor || cell.color || 'var(--accent-green)')
                        : (cell.falseColor || 'var(--text-secondary)');
    const Icon = getWidgetIcon(iconName, HelpCircle);
    const size = cell.fontSize ?? 28;
    return (
      <div className={`aura-custom-cell-${index}`} style={wrap}>
        <button
          onClick={handleClick}
          className="nodrag flex items-center justify-center transition-transform hover:scale-110"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
          aria-label={cell.text || (on ? 'AN' : 'AUS')}
        >
          <Icon size={size} style={{ color }} />
        </button>
        {pending && <ConfirmOverlay text={cell.confirmText} onConfirm={confirm} onCancel={cancel} />}
      </div>
    );
  }
  return (
    <div className={`aura-custom-cell-${index}`} style={wrap}>
      <button
        onClick={handleClick}
        className="nodrag relative rounded-full transition-colors"
        style={{
          width: 44, height: 24,
          background: on ? (cell.color || 'var(--accent)') : 'var(--app-border)',
          border: 'none',
          cursor: 'pointer',
        }}
        aria-label={cell.text || 'toggle'}
      >
        <span
          className="absolute top-0.5 bg-white rounded-full shadow transition-transform"
          style={{ width: 20, height: 20, left: on ? '22px' : '2px' }}
        />
      </button>
      {pending && <ConfirmOverlay text={cell.confirmText} onConfirm={confirm} onCancel={cancel} />}
    </div>
  );
}

/** Range slider bound to a numeric DP. Supports bar-style rendering. */
function SliderCellView({ cell, index, cols, rows }: { cell: CustomCell; index: number; cols: number; rows: number }) {
  const { value, setValue } = useDatapoint(cell.dpId ?? '');
  const [pending, setPending] = useState<number | null>(null);
  const min        = cell.min  ?? 0;
  const max        = cell.max  ?? 100;
  const step       = cell.step ?? 1;
  const isVertical = cell.orientation === 'vertical';
  const barStyle   = !!cell.barStyle;
  const barSize    = cell.barSize ?? 100;
  const color      = cell.color || 'var(--accent)';
  const num        = typeof value === 'number' ? value : Number(value ?? min);
  const displayVal = pending ?? (Number.isFinite(num) ? num : min);
  const fillRatio  = Math.max(0, Math.min(1, (displayVal - min) / (max - min)));

  const writeStepped = (v: number) => {
    const stepped = Math.round(v / step) * step;
    setValue(Math.max(min, Math.min(max, stepped)));
  };

  const getBarValue = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect  = e.currentTarget.getBoundingClientRect();
    const ratio = isVertical
      ? 1 - (e.clientY - rect.top)  / rect.height
      :     (e.clientX - rect.left) / rect.width;
    return min + Math.max(0, Math.min(1, ratio)) * (max - min);
  };

  const onBarPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    writeStepped(getBarValue(e));
  };

  const onBarPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!(e.buttons & 1)) return;
    writeStepped(getBarValue(e));
  };

  if (!cell.dpId) return <div className={`aura-custom-cell-${index}`} style={emptyCellStyle(index, cols)} />;

  if (barStyle) {
    return (
      <div className={`aura-custom-cell-${index}`} style={{ ...cellWrapStyle(cell, index, cols, rows), padding: '4px' }}>
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            className="nodrag relative rounded-2xl overflow-hidden select-none cursor-pointer"
            style={{
              width:      isVertical ? `${barSize}%` : '100%',
              height:     isVertical ? '100%'        : `${barSize}%`,
              background: `color-mix(in srgb, ${color} 20%, var(--app-bg))`,
            }}
            onPointerDown={onBarPointerDown}
            onPointerMove={onBarPointerMove}
            onPointerUp={() => setPending(null)}
          >
            {isVertical ? (
              <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl"
                style={{ height: `${fillRatio * 100}%`, background: color }} />
            ) : (
              <div className="absolute top-0 left-0 bottom-0 rounded-r-2xl"
                style={{ width: `${fillRatio * 100}%`, background: color }} />
            )}
            {isVertical ? (
              <div className="absolute pointer-events-none rounded-full"
                style={{ top: `${(1 - fillRatio) * 100}%`, transform: 'translateY(6px)', left: '20%', right: '20%', height: '3px', background: 'rgba(255,255,255,0.85)' }} />
            ) : (
              <div className="absolute pointer-events-none rounded-full"
                style={{ left: `${fillRatio * 100}%`, transform: 'translateX(-9px)', top: '20%', bottom: '20%', width: '3px', background: 'rgba(255,255,255,0.85)' }} />
            )}
          </div>
        </div>
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vertAttrs: any = isVertical ? { orient: 'vertical' } : {};
  return (
    <div className={`aura-custom-cell-${index}`} style={{ ...cellWrapStyle(cell, index, cols, rows), padding: '4px 8px' }}>
      <input
        {...vertAttrs}
        type="range"
        min={min} max={max} step={step}
        value={displayVal}
        onChange={(e) => setValue(Number(e.target.value))}
        className="nodrag w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{
          accentColor: color,
          ...(isVertical ? { writingMode: 'vertical-lr' as React.CSSProperties['writingMode'], direction: 'rtl', height: '100%', width: 'auto' } : {}),
        }}
      />
    </div>
  );
}

/** Button that writes a fixed payload to a DP on click. */
function ButtonCellView({ cell, index, cols, rows }: { cell: CustomCell; index: number; cols: number; rows: number }) {
  const { setValue } = useDatapoint(cell.dpId ?? '');
  if (!cell.dpId) return <div className={`aura-custom-cell-${index}`} style={emptyCellStyle(index, cols)} />;
  const onClick = () => {
    const raw = cell.sendValue ?? '';
    if (raw === 'true')  return setValue(true);
    if (raw === 'false') return setValue(false);
    const num = Number(raw);
    if (raw !== '' && Number.isFinite(num)) return setValue(num);
    setValue(raw);
  };
  return (
    <div className={`aura-custom-cell-${index}`} style={cellWrapStyle(cell, index, cols, rows)}>
      <button
        onClick={onClick}
        className="nodrag px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-85 transition-opacity"
        style={{
          background: cell.color || 'var(--accent)',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          fontSize: cell.fontSize ? `${cell.fontSize}px` : undefined,
          fontWeight: cell.bold ? 'bold' : undefined,
        }}
      >
        {cell.text || '⏵'}
      </button>
    </div>
  );
}

/** Static Lucide / Iconify icon. */
function IconCellView({ cell, index, cols, rows }: { cell: CustomCell; index: number; cols: number; rows: number }) {
  const Icon = getWidgetIcon(cell.iconName, HelpCircle);
  const size = cell.fontSize ?? 28;
  return (
    <div className={`aura-custom-cell-${index}`} style={cellWrapStyle(cell, index, cols, rows)}>
      <Icon size={size} style={{ color: cell.color || 'var(--text-primary)' }} />
    </div>
  );
}

/** Icon whose symbol+color depend on the DP value (binary). */
function StateIconCellView({ cell, index, cols, rows }: { cell: CustomCell; index: number; cols: number; rows: number }) {
  const { value } = useDatapoint(cell.dpId ?? '');
  const truthy = value === true || value === 1 || value === 'true' || value === '1';
  const iconName = truthy ? (cell.trueIcon || cell.iconName) : (cell.falseIcon || cell.iconName);
  const color    = truthy ? (cell.trueColor || cell.color || 'var(--accent)') : (cell.falseColor || cell.color || 'var(--text-secondary)');
  const Icon = getWidgetIcon(iconName, HelpCircle);
  const size = cell.fontSize ?? 28;
  return (
    <div className={`aura-custom-cell-${index}`} style={cellWrapStyle(cell, index, cols, rows)}>
      <Icon size={size} style={{ color }} />
    </div>
  );
}

/** +/− stepper that increments / decrements a numeric DP by `step`, clamped to [min, max]. */
function StepperCellView({ cell, index, cols, rows, defaultDecimals }: { cell: CustomCell; index: number; cols: number; rows: number; defaultDecimals: number }) {
  const { value, setValue } = useDatapoint(cell.dpId ?? '');
  if (!cell.dpId) return <div className={`aura-custom-cell-${index}`} style={emptyCellStyle(index, cols)} />;
  const min  = cell.min  ?? -Infinity;
  const max  = cell.max  ??  Infinity;
  const step = cell.step ?? 1;
  const num  = typeof value === 'number' ? value : Number(value ?? 0);
  const cur  = Number.isFinite(num) ? num : 0;
  const decimals = cell.decimals ?? defaultDecimals;
  const display = Number.isFinite(num) ? formatNum(num, decimals) : '–';
  const color = cell.color || 'var(--accent)';
  const btnSize = cell.fontSize ?? 14;
  const change = (delta: number) => {
    const next = Math.max(min, Math.min(max, cur + delta));
    setValue(next);
  };
  return (
    <div className={`aura-custom-cell-${index}`} style={cellWrapStyle(cell, index, cols, rows)}>
      <div className="nodrag flex items-center gap-1 w-full">
        <button onClick={() => change(-step)}
          className="rounded-lg flex items-center justify-center hover:opacity-85"
          style={{ background: color, color: '#fff', border: 'none', minWidth: 22, height: 22, fontSize: btnSize, cursor: 'pointer' }}>−</button>
        <span className="flex-1 text-center tabular-nums"
          style={{ ...cellTextStyle(cell, 'var(--text-primary)'), whiteSpace: 'nowrap' }}>
          {`${cell.prefix ?? ''}${display}${cell.suffix ?? ''}`}
        </span>
        <button onClick={() => change(step)}
          className="rounded-lg flex items-center justify-center hover:opacity-85"
          style={{ background: color, color: '#fff', border: 'none', minWidth: 22, height: 22, fontSize: btnSize, cursor: 'pointer' }}>+</button>
      </div>
    </div>
  );
}

/** Free text / number input bound to a DP. Writes on Enter / blur. */
function InputCellView({ cell, index, cols, rows }: { cell: CustomCell; index: number; cols: number; rows: number }) {
  const { value, setValue } = useDatapoint(cell.dpId ?? '');
  const isNumber = cell.inputMode === 'number';
  const externalStr = value == null ? '' : String(value);
  const [draft, setDraft] = useState(externalStr);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setDraft(externalStr); }, [externalStr, focused]);

  if (!cell.dpId) return <div className={`aura-custom-cell-${index}`} style={emptyCellStyle(index, cols)} />;

  const commit = () => {
    if (isNumber) {
      if (draft === '') return;
      const n = Number(draft);
      if (!Number.isFinite(n)) return;
      const min = cell.min ?? -Infinity;
      const max = cell.max ??  Infinity;
      setValue(Math.max(min, Math.min(max, n)));
    } else {
      setValue(draft);
    }
  };

  const inputSty: React.CSSProperties = {
    background: 'var(--app-bg)',
    color:      cell.color || 'var(--text-primary)',
    border:     '1px solid var(--app-border)',
    borderRadius: 8,
    padding:    '4px 6px',
    fontSize:   cell.fontSize ? `${cell.fontSize}px` : 12,
    fontWeight: cell.bold ? 'bold' : undefined,
    fontStyle:  cell.italic ? 'italic' : undefined,
    width:      '100%',
    minWidth:   0,
    textAlign:  cell.align === 'center' ? 'center' : cell.align === 'right' ? 'right' : 'left',
  };

  return (
    <div className={`aura-custom-cell-${index}`} style={{ ...cellWrapStyle(cell, index, cols, rows), padding: '2px 4px' }}>
      <input
        type={isNumber ? 'number' : 'text'}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); commit(); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
        min={isNumber ? cell.min : undefined}
        max={isNumber ? cell.max : undefined}
        step={isNumber ? cell.step : undefined}
        placeholder={cell.text || ''}
        className="nodrag focus:outline-none"
        style={inputSty}
      />
    </div>
  );
}

/** Read-only progress bar visualising a numeric DP in [min, max]. */
function ProgressCellView({ cell, index, cols, rows, defaultDecimals }: { cell: CustomCell; index: number; cols: number; rows: number; defaultDecimals: number }) {
  const { value } = useDatapoint(cell.dpId ?? '');
  if (!cell.dpId) return <div className={`aura-custom-cell-${index}`} style={emptyCellStyle(index, cols)} />;
  const min = cell.min ?? 0;
  const max = cell.max ?? 100;
  const isVertical = cell.orientation === 'vertical';
  const barSize    = cell.barSize ?? 100;
  const color      = cell.color || 'var(--accent)';
  const num        = typeof value === 'number' ? value : Number(value ?? min);
  const cur        = Number.isFinite(num) ? num : min;
  const ratio      = Math.max(0, Math.min(1, (cur - min) / (max - min)));
  const decimals   = cell.decimals ?? defaultDecimals;
  const label      = `${cell.prefix ?? ''}${Number.isFinite(num) ? formatNum(num, decimals) : '–'}${cell.suffix ?? ''}`;
  return (
    <div className={`aura-custom-cell-${index}`} style={{ ...cellWrapStyle(cell, index, cols, rows), padding: '4px' }}>
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          className="relative rounded-2xl overflow-hidden"
          style={{
            width:      isVertical ? `${barSize}%` : '100%',
            height:     isVertical ? '100%'        : `${barSize}%`,
            background: `color-mix(in srgb, ${color} 20%, var(--app-bg))`,
          }}
        >
          {isVertical ? (
            <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl"
              style={{ height: `${ratio * 100}%`, background: color, transition: 'height 200ms ease' }} />
          ) : (
            <div className="absolute top-0 left-0 bottom-0 rounded-r-2xl"
              style={{ width: `${ratio * 100}%`, background: color, transition: 'width 200ms ease' }} />
          )}
          {cell.showValue && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none"
              style={{ ...cellTextStyle(cell, '#fff'), mixBlendMode: 'difference' }}>
              <span>{label}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Text label whose content + color depend on a binary DP value. */
function StateTextCellView({ cell, index, cols, rows }: { cell: CustomCell; index: number; cols: number; rows: number }) {
  const { value } = useDatapoint(cell.dpId ?? '');
  if (!cell.dpId) return <div className={`aura-custom-cell-${index}`} style={emptyCellStyle(index, cols)} />;
  const truthy = value === true || value === 1 || value === 'true' || value === '1';
  const label  = truthy ? (cell.trueText  ?? '') : (cell.falseText ?? '');
  const color  = truthy ? (cell.trueColor || cell.color || 'var(--accent)')
                        : (cell.falseColor || cell.color || 'var(--text-secondary)');
  return (
    <div className={`aura-custom-cell-${index}`} style={cellWrapStyle(cell, index, cols, rows)}>
      <span style={{ ...cellTextStyle(cell, color), color }}>{label}</span>
    </div>
  );
}

/** Date/time picker bound to a DP. Writes back in the configured `dateFormat`. */
function DatePickerCellView({ cell, index, cols, rows }: { cell: CustomCell; index: number; cols: number; rows: number }) {
  const { value } = useDatapoint(cell.dpId ?? '');
  const { setState } = useIoBroker();
  const timeOnly  = cell.timeOnly === true;
  const showTime  = timeOnly || cell.showTime === true;
  const outputFmt = (cell.dateFormat as DateOutputFormat) ?? 'timestamp_ms';

  const currentDate = parseValue(value);
  const [dateVal, setDateVal] = useState(() => currentDate ? toDateInputValue(currentDate) : '');
  const [timeVal, setTimeVal] = useState(() => {
    if (currentDate) return toTimeInputValue(currentDate);
    if (timeOnly && typeof value === 'string' && /^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);
    return '00:00';
  });

  useEffect(() => {
    if (timeOnly) {
      if (typeof value === 'string' && /^\d{2}:\d{2}/.test(value)) setTimeVal(value.slice(0, 5));
      else if (currentDate) setTimeVal(toTimeInputValue(currentDate));
      return;
    }
    if (!currentDate) return;
    setDateVal(toDateInputValue(currentDate));
    setTimeVal(toTimeInputValue(currentDate));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const writeValue = (date: string, time: string) => {
    if (!cell.dpId) return;
    if (timeOnly) {
      if (!time) return;
      const [h, mi] = time.split(':').map(Number);
      const dt = new Date(1970, 0, 1, h ?? 0, mi ?? 0);
      setState(cell.dpId, formatDate(dt, outputFmt));
      return;
    }
    if (!date) return;
    const [y, mo, d] = date.split('-').map(Number);
    const [h, mi]    = time.split(':').map(Number);
    const dt = showTime
      ? new Date(y, mo - 1, d, h ?? 0, mi ?? 0)
      : new Date(y, mo - 1, d, 0, 0, 0, 0);
    if (isNaN(dt.getTime())) return;
    setState(cell.dpId, formatDate(dt, outputFmt));
  };

  if (!cell.dpId) return <div className={`aura-custom-cell-${index}`} style={emptyCellStyle(index, cols)} />;

  const inputSty: React.CSSProperties = {
    background:  'var(--app-bg)',
    color:       'var(--text-primary)',
    border:      '1px solid var(--app-border)',
    borderRadius: 8,
    padding:     '4px 6px',
    fontSize:    cell.fontSize ? `${cell.fontSize}px` : 12,
    colorScheme: 'dark' as never,
    flexShrink:  0,
    minWidth:    0,
  };

  return (
    <div className={`aura-custom-cell-${index}`} style={{ ...cellWrapStyle(cell, index, cols, rows), padding: '2px 4px' }}>
      <div className="flex flex-wrap gap-1 items-center w-full">
        {!timeOnly && (
          <input
            type="date"
            value={dateVal}
            onChange={(e) => { setDateVal(e.target.value); writeValue(e.target.value, timeVal); }}
            className="nodrag focus:outline-none flex-1 min-w-0"
            style={inputSty}
          />
        )}
        {showTime && (
          <input
            type="time"
            value={timeVal}
            onChange={(e) => { setTimeVal(e.target.value); writeValue(dateVal, e.target.value); }}
            className="nodrag focus:outline-none flex-1 min-w-0"
            style={inputSty}
          />
        )}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface CustomGridViewProps {
  config: WidgetConfig;
  /** Widget's main display value (formatted string). Pass '' for complex widgets. */
  value: string;
  /** Raw numeric value before formatting — enables per-cell decimals override on 'value' cells. */
  rawValue?: number | null;
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
  /** Fallback grid when config has none. Defaults to DEFAULT_CUSTOM_GRID (3×3 title/value/unit). */
  fallback?: CustomGrid | CustomGridDef;
}

export function CustomGridView({ config, value, rawValue, unit, extraFields, extraComponents, fallback }: CustomGridViewProps) {
  const grid = normalizeGrid(config.options?.customGrid, fallback);
  const { cols, rows, cells } = grid;
  const { defaultDecimals } = useGlobalSettingsStore();
  return (
    <div
      className="aura-custom-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        width: '100%', height: '100%', gap: '2px',
      }}
    >
      {cells.map((cell, i) => {
        switch (cell.type) {
          case 'dp':         return <DpCellView         key={i} cell={cell} index={i} cols={cols} rows={rows} defaultDecimals={defaultDecimals} />;
          case 'image':      return <ImageCellView      key={i} cell={cell} index={i} cols={cols} rows={rows} />;
          case 'component':  return <ComponentCellView  key={i} cell={cell} index={i} cols={cols} rows={rows} extraComponents={extraComponents} />;
          case 'switch':     return <SwitchCellView     key={i} cell={cell} index={i} cols={cols} rows={rows} />;
          case 'slider':     return <SliderCellView     key={i} cell={cell} index={i} cols={cols} rows={rows} />;
          case 'button':     return <ButtonCellView     key={i} cell={cell} index={i} cols={cols} rows={rows} />;
          case 'icon':       return <IconCellView       key={i} cell={cell} index={i} cols={cols} rows={rows} />;
          case 'state-icon': return <StateIconCellView  key={i} cell={cell} index={i} cols={cols} rows={rows} />;
          case 'datepicker': return <DatePickerCellView key={i} cell={cell} index={i} cols={cols} rows={rows} />;
          case 'stepper':    return <StepperCellView    key={i} cell={cell} index={i} cols={cols} rows={rows} defaultDecimals={defaultDecimals} />;
          case 'input':      return <InputCellView      key={i} cell={cell} index={i} cols={cols} rows={rows} />;
          case 'progress':   return <ProgressCellView   key={i} cell={cell} index={i} cols={cols} rows={rows} defaultDecimals={defaultDecimals} />;
          case 'state-text': return <StateTextCellView  key={i} cell={cell} index={i} cols={cols} rows={rows} />;
          default:           return <StaticCellView     key={i} cell={cell} index={i} cols={cols} rows={rows} title={config.title} value={value} rawValue={rawValue} unit={unit} extraFields={extraFields} />;
        }
      })}
    </div>
  );
}
