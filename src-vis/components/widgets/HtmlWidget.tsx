import { Code2 } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import type { WidgetProps } from '../../types';

export function HtmlWidget({ config }: WidgetProps) {
  const opts           = config.options ?? {};
  const htmlContent    = (opts.htmlContent    as string)  ?? '';
  const htmlDatapoint  = (opts.htmlDatapoint  as string)  ?? '';
  const scrollable     = (opts.scrollable     as boolean) ?? true;
  const hideTitle      = (opts.hideTitle      as boolean) ?? false;

  const { value: dpValue } = useDatapoint(htmlDatapoint);

  const html = (() => {
    if (htmlDatapoint && dpValue != null && dpValue !== '') return String(dpValue);
    return htmlContent;
  })();

  const WidgetIcon = getWidgetIcon(opts.icon as string | undefined, Code2);
  const showHeader = !hideTitle && (!!config.title || !!opts.icon);

  if (!html) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2"
        style={{ color: 'var(--text-secondary)' }}>
        <WidgetIcon size={32} strokeWidth={1} />
        <p className="text-xs text-center">
          {config.title || 'HTML'}
          <br />
          <span className="text-[10px] opacity-60">Kein HTML oder Datenpunkt konfiguriert</span>
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {showHeader && (
        <div className="shrink-0 flex items-center gap-1.5 pb-1" style={{ color: 'var(--text-secondary)' }}>
          <WidgetIcon size={13} strokeWidth={1.5} style={{ flexShrink: 0 }} />
          {config.title && (
            <span className="text-xs truncate">{config.title}</span>
          )}
        </div>
      )}
      <iframe
        srcDoc={html}
        sandbox="allow-scripts allow-same-origin"
        title={config.title || 'HTML'}
        className="flex-1 min-h-0 w-full block"
        style={{ border: 'none' }}
        scrolling={scrollable ? 'auto' : 'no'}
      />
    </div>
  );
}
