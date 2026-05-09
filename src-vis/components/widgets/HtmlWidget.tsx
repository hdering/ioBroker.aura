import { Code2 } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import type { WidgetProps } from '../../types';

export function HtmlWidget({ config }: WidgetProps) {
  const opts          = config.options ?? {};
  const htmlContent   = (opts.htmlContent   as string)  ?? '';
  const htmlDatapoint = (opts.htmlDatapoint as string)  ?? '';
  const scrollable    = (opts.scrollable    as boolean) ?? true;
  const showTitle     = opts.showTitle  !== false;
  const showIcon      = opts.showIcon   !== false;
  const iconSize      = (opts.iconSize  as number) || 36;
  const titleAlign    = (opts.titleAlign as string) ?? 'left';
  const WidgetIcon    = getWidgetIcon(opts.icon as string | undefined, Code2);

  const { value: dpValue } = useDatapoint(htmlDatapoint);

  const html = (() => {
    if (htmlDatapoint && dpValue != null && dpValue !== '') return String(dpValue);
    return htmlContent;
  })();

  if (!html) {
    return (
      <div className="flex flex-col h-full">
        {(showTitle || showIcon) && (
          <div className="flex items-center gap-1 shrink-0 mb-1 min-w-0">
            {showIcon && <WidgetIcon size={iconSize} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />}
            {showTitle && <p className="text-xs truncate flex-1 min-w-0" style={{ color: 'var(--text-secondary)', textAlign: titleAlign as React.CSSProperties['textAlign'] }}>{config.title}</p>}
          </div>
        )}
        <div className="flex flex-col items-center justify-center flex-1 gap-2" style={{ color: 'var(--text-secondary)' }}>
          <WidgetIcon size={32} strokeWidth={1} />
          <span className="text-xs opacity-60">Kein HTML oder Datenpunkt konfiguriert</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {(showTitle || showIcon) && (
        <div className="flex items-center gap-1 shrink-0 mb-1 min-w-0">
          {showIcon && <WidgetIcon size={iconSize} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />}
          {showTitle && <p className="text-xs truncate flex-1 min-w-0" style={{ color: 'var(--text-secondary)', textAlign: titleAlign as React.CSSProperties['textAlign'] }}>{config.title}</p>}
        </div>
      )}
      <iframe
        srcDoc={html}
        sandbox="allow-scripts"
        title={config.title || 'HTML'}
        className="flex-1 min-h-0 w-full block"
        style={{ border: 'none' }}
        scrolling={scrollable ? 'auto' : 'no'}
      />
    </div>
  );
}
