import { Activity, TrendingUp, Hash } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import type { WidgetProps } from '../../types';
import { contentPositionClass, titlePositionStyle, titleTextAlign } from '../../utils/widgetUtils';
import { getWidgetIcon } from '../../utils/widgetIconMap';

export function ValueWidget({ config }: WidgetProps) {
  const { value } = useDatapoint(config.datapoint);
  const unit         = config.options?.unit as string | undefined;
  const htmlTemplate = config.options?.htmlTemplate as string | undefined;
  const layout       = config.layout ?? 'default';
  const CardIcon    = getWidgetIcon(config.options?.icon as string | undefined, Activity);
  const CompactIcon = getWidgetIcon(config.options?.icon as string | undefined, Hash);
  const DefaultIcon = getWidgetIcon(config.options?.icon as string | undefined, TrendingUp);

  const o = config.options ?? {};
  const showTitle = o.showTitle !== false;
  const showValue = o.showValue !== false;
  const showUnit  = o.showUnit  !== false;

  const displayValue = value === null ? '–'
    : typeof value === 'number' ? value.toLocaleString('de-DE')
    : String(value);

  // HTML template mode: replaces the entire widget content
  if (htmlTemplate) {
    return (
      <div
        className="h-full w-full"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: htmlTemplate.replace(/\{dp\}/g, displayValue) }}
      />
    );
  }

  // --- CARD: Akzent-Leiste links, großer Wert zentriert ---
  if (layout === 'card') {
    return (
      <div className="flex h-full gap-3">
        <div className="w-1 rounded-full self-stretch" style={{ background: 'var(--accent)' }} />
        <div className="flex flex-col justify-between flex-1">
          {showTitle && (
            <div className="flex items-center gap-2">
              <CardIcon size={14} style={{ color: 'var(--accent)' }} />
              <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>
            </div>
          )}
          {showValue && (
            <div>
              <span className="text-4xl font-black" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{displayValue}</span>
              {showUnit && unit && <span className="text-lg ml-1 font-medium" style={{ color: 'var(--accent)' }}>{unit}</span>}
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- COMPACT: Inline-Darstellung ---
  if (layout === 'compact') {
    return (
      <div className="flex items-center justify-between h-full gap-2">
        {showTitle && (
          <div className="flex items-center gap-2 min-w-0">
            <CompactIcon size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
            <span className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{config.title}</span>
          </div>
        )}
        {showValue && (
          <span className="text-xl font-bold shrink-0" style={{ color: 'var(--text-primary)' }}>
            {displayValue}{showUnit && unit && <span className="text-sm ml-0.5" style={{ color: 'var(--text-secondary)' }}>{unit}</span>}
          </span>
        )}
      </div>
    );
  }

  // --- MINIMAL: Nur Zahl, sehr groß ---
  if (layout === 'minimal') {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        {showValue && (
          <div className="flex items-baseline gap-1 leading-none">
            <span className="font-black" style={{ color: 'var(--accent)', fontSize: 'calc(clamp(2rem, 4vw, 3.5rem) * var(--font-scale, 1))' }}>{displayValue}</span>
            {showUnit && unit && <span className="text-lg font-medium" style={{ color: 'var(--text-secondary)' }}>{unit}</span>}
          </div>
        )}
        {showTitle && <span className="text-xs mt-2 truncate max-w-full" style={{ color: 'var(--text-secondary)' }}>{config.title}</span>}
      </div>
    );
  }

  // --- DEFAULT ---
  const posClass = contentPositionClass(config.options?.contentPosition as string | undefined);
  const titlePos = config.options?.titlePosition as string | undefined;
  const titleStyle = titlePositionStyle(titlePos);
  const titleAlign = titleTextAlign(titlePos);

  return (
    <div className={`flex flex-col h-full gap-2 ${posClass}`} style={{ position: 'relative' }}>
      {showTitle && (
        <div className="flex items-center gap-2" style={titleStyle}>
          <DefaultIcon size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
          <p className="text-xs" style={{ color: 'var(--text-secondary)', textAlign: titleAlign, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{config.title}</p>
        </div>
      )}
      {showValue && (
        <div className="flex items-end gap-1.5">
          <span className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{displayValue}</span>
          {showUnit && unit && <span className="text-sm mb-0.5" style={{ color: 'var(--text-secondary)' }}>{unit}</span>}
        </div>
      )}
    </div>
  );
}
