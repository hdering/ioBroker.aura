import { Heading2 } from 'lucide-react';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import type { WidgetConfig } from '../../types';

interface Props {
  config: WidgetConfig;
}

export function HeaderWidget({ config }: Props) {
  const opts        = config.options ?? {};
  const subtitle    = opts.subtitle    as string | undefined;
  const showTitle   = opts.showTitle   !== false;
  const showSubtitle = opts.showSubtitle !== false;
  const showIcon    = opts.showIcon    !== false;
  const iconSize    = (opts.iconSize   as number) || 20;
  const titleAlign  = (opts.titleAlign as string) ?? 'left';
  const WidgetIcon  = getWidgetIcon(opts.icon as string | undefined, Heading2);
  const layout      = config.layout ?? 'default';

  const justifyContent = titleAlign === 'center' ? 'center' : titleAlign === 'right' ? 'flex-end' : 'flex-start';

  if (layout === 'minimal') {
    return (
      <div className="aura-widget-row flex items-center gap-3 h-full px-1">
        {showIcon && <WidgetIcon className="aura-widget-icon" size={iconSize} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />}
        {showTitle && (
          <span className="aura-widget-title text-xs font-semibold tracking-widest uppercase shrink-0" style={{ color: 'var(--text-secondary)' }}>
            {config.title}
          </span>
        )}
        <div className="flex-1 h-px" style={{ background: 'var(--app-border)' }} />
      </div>
    );
  }

  if (layout === 'compact') {
    return (
      <div className="aura-widget-row flex items-center gap-3 h-full">
        <div className="w-1 self-stretch rounded-full" style={{ background: 'var(--accent)' }} />
        {showIcon && <WidgetIcon className="aura-widget-icon" size={iconSize} style={{ color: 'var(--text-primary)', flexShrink: 0 }} />}
        {showTitle && (
          <span className="aura-widget-title font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
            {config.title}
          </span>
        )}
      </div>
    );
  }

  // default / card
  return (
    <div className="aura-widget-row flex flex-col justify-center h-full gap-0.5">
      <div className="flex items-center gap-3" style={{ justifyContent }}>
        {titleAlign === 'left' && (
          <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: 'var(--accent)' }} />
        )}
        {showIcon && <WidgetIcon className="aura-widget-icon" size={iconSize} style={{ color: 'var(--text-primary)', flexShrink: 0 }} />}
        {showTitle && (
          <h2 className="aura-widget-title font-bold text-xl leading-tight" style={{ color: 'var(--text-primary)' }}>
            {config.title}
          </h2>
        )}
      </div>
      {subtitle && showSubtitle && (
        <p
          className={`aura-widget-value text-xs mt-0.5 ${titleAlign === 'left' ? 'pl-4' : ''}`}
          style={{ color: 'var(--text-secondary)', textAlign: titleAlign as React.CSSProperties['textAlign'] }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
