import type { WidgetProps } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { contentPositionClass } from '../../utils/widgetUtils';
import { CustomGridView } from './CustomGridView';

export function ButtonWidget({ config }: WidgetProps) {
  const o = config.options ?? {};
  const label     = (o.buttonLabel as string) || config.title || 'Button';
  const color     = (o.buttonColor as string) || 'var(--accent)';
  const iconSize  = (o.iconSize    as number) || 28;
  const showTitle  = o.showTitle  !== false;
  const showIcon   = o.showIcon   !== false;
  const titleAlign = (o.titleAlign as string) ?? 'left';
  const layout     = config.layout ?? 'default';

  const iconName  = o.icon as string | undefined;
  const WidgetIcon = iconName ? getWidgetIcon(iconName, (() => null) as never) : null;

  if (layout === 'custom') {
    const iconEl = showIcon && WidgetIcon
      ? <WidgetIcon size={iconSize} style={{ color }} />
      : null;
    return (
      <div className="relative w-full h-full">
        <CustomGridView
          config={config}
          value={label}
          extraComponents={iconEl ? { icon: iconEl } : {}}
        />
      </div>
    );
  }

  if (layout === 'compact') {
    return (
      <div className="flex items-center gap-2.5 h-full px-1">
        {showIcon && WidgetIcon && <WidgetIcon size={iconSize} style={{ color, flexShrink: 0 }} />}
        <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{label}</span>
        <span className="ml-auto text-xs" style={{ color: 'var(--text-secondary)' }}>›</span>
      </div>
    );
  }

  if (layout === 'minimal') {
    return (
      <div className="flex items-center justify-center h-full">
        {showIcon && WidgetIcon
          ? <WidgetIcon size={iconSize} style={{ color }} />
          : <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</span>
        }
      </div>
    );
  }

  // default / card — title at top, then centered icon + label
  const posClass = contentPositionClass(o.contentPosition as string | undefined);
  return (
    <div className="flex flex-col h-full gap-1">
      {showTitle && (
        <p className="text-xs truncate flex-1 min-w-0 shrink-0" style={{ color: 'var(--text-secondary)', textAlign: titleAlign as React.CSSProperties['textAlign'] }}>{config.title}</p>
      )}
      <div className={`flex flex-col gap-2 flex-1 ${posClass}`}>
        {showIcon && WidgetIcon && <WidgetIcon size={iconSize} style={{ color }} />}
        <span className="text-sm font-medium text-center leading-tight" style={{ color: 'var(--text-primary)' }}>
          {label}
        </span>
      </div>
    </div>
  );
}
