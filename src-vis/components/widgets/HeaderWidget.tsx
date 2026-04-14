import type { WidgetConfig } from '../../types';

interface Props {
  config: WidgetConfig;
}

export function HeaderWidget({ config }: Props) {
  const subtitle = config.options?.subtitle as string | undefined;
  const align = (config.options?.align as string) ?? 'left';
  const layout = config.layout ?? 'default';

  if (layout === 'minimal') {
    return (
      <div className="flex items-center gap-3 h-full px-1">
        <span
          className="text-xs font-semibold tracking-widest uppercase shrink-0"
          style={{ color: 'var(--text-secondary)' }}
        >
          {config.title}
        </span>
        <div className="flex-1 h-px" style={{ background: 'var(--app-border)' }} />
      </div>
    );
  }

  if (layout === 'compact') {
    return (
      <div className="flex items-center gap-3 h-full">
        <div className="w-1 self-stretch rounded-full" style={{ background: 'var(--accent)' }} />
        <span className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
          {config.title}
        </span>
      </div>
    );
  }

  // default / card
  return (
    <div
      className="flex flex-col justify-center h-full gap-0.5"
      style={{ textAlign: align as React.CSSProperties['textAlign'] }}
    >
      <div className="flex items-center gap-3">
        {align === 'left' && (
          <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: 'var(--accent)' }} />
        )}
        <h2 className="font-bold text-xl leading-tight" style={{ color: 'var(--text-primary)' }}>
          {config.title}
        </h2>
      </div>
      {subtitle && (
        <p className="text-xs mt-0.5 pl-4" style={{ color: 'var(--text-secondary)' }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
