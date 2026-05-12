import { ListChecks, ChevronDown } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import type { WidgetProps } from '../../types';
import { contentPositionClass, titlePositionStyle } from '../../utils/widgetUtils';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { StatusBadges } from './StatusBadges';
import { CustomGridView } from './CustomGridView';

export interface EnumEntry {
  value: string;     // stored as string; parsed to number if numeric
  label: string;
  color?: string;
}

function parseValue(raw: string): boolean | number | string {
  if (raw === 'true')  return true;
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
  const layout      = config.layout ?? 'default';
  const showTitle   = o.showTitle !== false;
  const showIcon    = o.showIcon  !== false;
  const showValue   = o.showValue !== false;   // current label
  const showSelect  = o.showSelect !== false;  // dropdown
  const titleAlign  = (o.titleAlign as string) ?? 'left';
  const iconSize    = (o.iconSize as number) || 20;
  const entries     = (o.entries as EnumEntry[] | undefined) ?? [];

  const WidgetIcon = getWidgetIcon(o.icon as string | undefined, ListChecks);

  const current = findEntry(entries, value);
  const currentLabel = current?.label ?? (value === null || value === undefined ? '–' : String(value));
  const currentColor = current?.color;

  const onPick = (raw: string) => {
    setState(config.datapoint, parseValue(raw));
  };

  const selectEl = showSelect ? (
    <div className="relative inline-flex items-center" style={{ minWidth: 0 }}>
      <select
        value={current?.value ?? ''}
        onChange={(e) => onPick(e.target.value)}
        className="nodrag text-xs rounded-lg pl-2.5 pr-7 py-1.5 focus:outline-none appearance-none truncate"
        style={{
          background: 'var(--app-bg)',
          color: 'var(--text-primary)',
          border: '1px solid var(--app-border)',
          maxWidth: '100%',
        }}
      >
        {!current && <option value="">–</option>}
        {entries.map((e) => (
          <option key={e.value} value={e.value}>{e.label}</option>
        ))}
      </select>
      <ChevronDown size={12} className="absolute right-2 pointer-events-none" style={{ color: 'var(--text-secondary)' }} />
    </div>
  ) : null;

  // --- CUSTOM (3×3 Standard-Grid, vordefinierte Component-Slots: icon / select / label) ---
  if (layout === 'custom') {
    return (
      <CustomGridView
        config={config}
        value={currentLabel}
        extraComponents={{
          icon:   showIcon  ? <WidgetIcon size={iconSize} style={{ color: currentColor ?? 'var(--accent)', flexShrink: 0 }} /> : null,
          select: selectEl,
          label:  showValue ? <span className="text-base font-semibold truncate" style={{ color: currentColor ?? 'var(--text-primary)' }}>{currentLabel}</span> : null,
        }}
      />
    );
  }

  // --- COMPACT ---
  if (layout === 'compact') {
    return (
      <div className="flex items-center justify-between h-full gap-2" style={{ position: 'relative' }}>
        {(showTitle || showIcon) && (
          <div className="flex items-center gap-2 min-w-0">
            {showIcon && <WidgetIcon size={iconSize} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />}
            {showTitle && <span className="text-sm truncate" style={{ color: 'var(--text-secondary)', textAlign: titleAlign as React.CSSProperties['textAlign'], flex: '1', minWidth: 0 }}>{config.title}</span>}
          </div>
        )}
        <div className="flex items-center gap-2 shrink-0 min-w-0">
          {showValue && (
            <span className="text-base font-semibold truncate" style={{ color: currentColor ?? 'var(--text-primary)' }}>{currentLabel}</span>
          )}
          {selectEl}
        </div>
        <StatusBadges config={config} />
      </div>
    );
  }

  // --- MINIMAL: Label groß zentriert, Dropdown darunter ---
  if (layout === 'minimal') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2" style={{ position: 'relative' }}>
        {showValue && (
          <span className="text-xl font-bold truncate max-w-full" style={{ color: currentColor ?? 'var(--accent)' }}>{currentLabel}</span>
        )}
        {selectEl}
        {showTitle && <span className="text-xs mt-1 truncate max-w-full" style={{ color: 'var(--text-secondary)', textAlign: titleAlign as React.CSSProperties['textAlign'] }}>{config.title}</span>}
        <StatusBadges config={config} />
      </div>
    );
  }

  // --- CARD ---
  if (layout === 'card') {
    const accent = currentColor ?? 'var(--accent)';
    return (
      <div className="flex h-full gap-3" style={{ position: 'relative' }}>
        <div className="w-1 rounded-full self-stretch" style={{ background: accent }} />
        <div className="flex flex-col justify-between flex-1 min-w-0">
          {(showTitle || showIcon) && (
            <div className="flex items-center gap-2">
              {showIcon && <WidgetIcon size={iconSize} style={{ color: accent }} />}
              {showTitle && <p className="text-xs truncate" style={{ color: 'var(--text-secondary)', textAlign: titleAlign as React.CSSProperties['textAlign'], flex: '1', minWidth: 0 }}>{config.title}</p>}
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {showValue && (
              <span className="text-xl font-bold truncate" style={{ color: accent }}>{currentLabel}</span>
            )}
            {selectEl}
          </div>
        </div>
        <StatusBadges config={config} />
      </div>
    );
  }

  // --- DEFAULT ---
  const posClass  = contentPositionClass(o.contentPosition as string | undefined);
  const titlePos  = o.titlePosition as string | undefined;
  const titleStyle = titlePositionStyle(titlePos);

  return (
    <div className={`flex flex-col h-full gap-2 ${posClass}`} style={{ position: 'relative' }}>
      {(showTitle || showIcon) && (
        <div className="flex items-center gap-2" style={titleStyle}>
          {showIcon && <WidgetIcon size={iconSize} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />}
          {showTitle && <p className="text-xs" style={{ color: 'var(--text-secondary)', textAlign: titleAlign as React.CSSProperties['textAlign'], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1', minWidth: 0 }}>{config.title}</p>}
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        {showValue && (
          <span className="text-base font-semibold truncate" style={{ color: currentColor ?? 'var(--text-primary)' }}>{currentLabel}</span>
        )}
        {selectEl}
      </div>
      <StatusBadges config={config} />
    </div>
  );
}
