import { useState, useEffect, useRef } from 'react';
import { MonitorDot } from 'lucide-react';
import type { WidgetProps } from '../../types';

export function IframeWidget({ config }: WidgetProps) {
  const opts             = config.options ?? {};
  const url              = (opts.iframeUrl        as string)  ?? '';
  const keepAlive        = (opts.keepAlive         as boolean) ?? false;
  const allowInteraction = !!(opts.allowInteraction ?? true);
  const refreshSeconds   = (opts.refreshInterval   as number)  ?? 0;
  const sandboxEnabled   = (opts.sandbox           as boolean) ?? false;

  const [tick, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!url || refreshSeconds < 1 || keepAlive) return;
    intervalRef.current = setInterval(() => setTick((n) => n + 1), refreshSeconds * 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [url, refreshSeconds, keepAlive]);

  if (!url) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2"
        style={{ color: 'var(--text-secondary)' }}>
        <MonitorDot size={32} strokeWidth={1} />
        <p className="text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
          {config.title || 'iFrame'}<br />
          <span className="text-[10px] opacity-60">Keine URL konfiguriert</span>
        </p>
      </div>
    );
  }

  // Stable key = never remount (keepAlive); incrementing key = reload on tick
  const iframeKey = keepAlive ? `ka-${url}` : `${url}-${tick}`;

  const sandboxAttr = sandboxEnabled
    ? 'allow-scripts allow-same-origin allow-forms allow-popups allow-presentation'
    : undefined;

  const showTitle = config.title && !config.options?.hideTitle;

  return (
    <div className="flex flex-col h-full">
      {showTitle && (
        <p className="text-xs truncate shrink-0 pb-1" style={{ color: 'var(--text-secondary)' }}>
          {config.title}
        </p>
      )}
      <div className="relative flex-1 overflow-hidden" style={{ borderRadius: 'inherit' }}>
        <iframe
          key={iframeKey}
          src={url}
          sandbox={sandboxAttr}
          allow="autoplay; fullscreen; picture-in-picture; web-share"
          title={config.title || 'iFrame'}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        />
        {/* Interaction blocker – pointer-events overlay */}
        {!allowInteraction && (
          <div className="absolute inset-0" style={{ pointerEvents: 'all', cursor: 'default' }} />
        )}
      </div>
    </div>
  );
}
