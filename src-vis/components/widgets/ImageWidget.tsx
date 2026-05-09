import { useState, useEffect, useRef } from 'react';
import { ImageIcon } from 'lucide-react';
import type { WidgetProps } from '../../types';
import { useDatapoint } from '../../hooks/useDatapoint';
import { CustomGridView } from './CustomGridView';
import { resolveAssetUrl } from '../../utils/assetUrl';
import { getWidgetIcon } from '../../utils/widgetIconMap';

type FitMode = 'none' | 'contain' | 'width' | 'height';

export function ImageWidget({ config }: WidgetProps) {
  const opts            = config.options ?? {};
  const imageUrl        = resolveAssetUrl((opts.imageUrl as string) ?? '');
  const datapointId     = (opts.imageDatapoint  as string)   ?? '';
  const fit             = (opts.fit             as FitMode)  ?? 'contain';
  const refreshSeconds  = (opts.refreshInterval as number)   ?? 0;

  const { value: dpValue } = useDatapoint(datapointId);

  const showTitle  = opts.showTitle !== false;
  const showIcon   = opts.showIcon  !== false;
  const iconSize   = (opts.iconSize  as number) || 20;
  const titleAlign = (opts.titleAlign as string) ?? 'left';
  const WidgetIcon = getWidgetIcon(opts.icon as string | undefined, ImageIcon);
  const layout = config.layout ?? 'default';

  // Incrementing key forces <img> reload on refresh tick
  const [tick, setTick]       = useState(0);
  const [loadError, setLoadError] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setLoadError(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!imageUrl || refreshSeconds < 1) return;
    intervalRef.current = setInterval(() => setTick((n) => n + 1), refreshSeconds * 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [imageUrl, refreshSeconds]);

  if (layout === 'custom') return (
    <CustomGridView
      config={config}
      value={imageUrl || (dpValue ? String(dpValue) : '')}
      extraFields={{
        url:   imageUrl || '–',
        dp:    datapointId || '–',
      }}
    />
  );

  // Build src from datapoint value (base64 or URL) or from static URL
  const src = (() => {
    if (datapointId && dpValue != null) {
      const str = String(dpValue);
      if (!str) return '';
      if (str.startsWith('data:') || str.startsWith('http://') || str.startsWith('https://')) return str;
      return `data:image/jpeg;base64,${str}`;
    }
    if (!imageUrl) return '';
    // base64 or data URI in URL field – use as-is, no cache-bust
    if (imageUrl.startsWith('data:')) return imageUrl;
    // Relative paths (e.g. /fs/read?path=…) are real URLs, not base64
    if (!imageUrl.startsWith('http') && !imageUrl.startsWith('/') && imageUrl.length > 64) {
      return `data:image/jpeg;base64,${imageUrl}`;
    }
    const sep = imageUrl.includes('?') ? '&' : '?';
    return tick > 0 ? `${imageUrl}${sep}_t=${tick}` : imageUrl;
  })();

  if (!src) {
    return (
      <div className="flex flex-col h-full">
        {(showTitle || showIcon) && (
          <div className="flex items-center gap-1 shrink-0 mb-1 min-w-0">
            {showIcon && <WidgetIcon size={iconSize} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />}
            {showTitle && <p className="text-xs truncate flex-1 min-w-0" style={{ color: 'var(--text-secondary)', textAlign: titleAlign as React.CSSProperties['textAlign'] }}>{config.title}</p>}
          </div>
        )}
        <div className="flex flex-col items-center justify-center flex-1 gap-2" style={{ color: 'var(--text-secondary)' }}>
          <WidgetIcon size={iconSize} strokeWidth={1} />
          <span className="text-xs opacity-60">Keine URL oder Datenpunkt konfiguriert</span>
        </div>
      </div>
    );
  }

  const imgStyle: React.CSSProperties = (() => {
    switch (fit) {
      case 'none':    return { display: 'block', flexShrink: 0 };
      case 'contain': return { width: '100%', height: '100%', objectFit: 'contain', display: 'block' };
      case 'width':   return { width: '100%', height: 'auto', display: 'block' };
      case 'height':  return { height: '100%', width: 'auto', display: 'block' };
    }
  })();

  return (
    <div className="flex flex-col h-full">
      {(showTitle || showIcon) && (
        <div className="flex items-center gap-1 shrink-0 mb-1 min-w-0">
          {showIcon && <WidgetIcon size={iconSize} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />}
          {showTitle && <p className="text-xs truncate flex-1 min-w-0" style={{ color: 'var(--text-secondary)', textAlign: titleAlign as React.CSSProperties['textAlign'] }}>{config.title}</p>}
        </div>
      )}
      <div style={{
        flex: '1 1 0',
        minHeight: 0,
        overflow: fit === 'none' ? 'auto' : 'hidden',
        display: 'flex',
        alignItems: fit === 'none' ? 'flex-start' : 'center',
        justifyContent: fit === 'none' ? 'flex-start' : 'center',
        position: 'relative',
      }}>
        <img
          src={src}
          alt={config.title || ''}
          style={imgStyle}
          onLoad={() => setLoadError(false)}
          onError={() => setLoadError(true)}
        />
        {loadError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2"
            style={{ background: 'rgba(0,0,0,0.55)' }}>
            <ImageIcon size={28} style={{ color: '#ef4444' }} />
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.8)' }}>Ladefehler</p>
          </div>
        )}
      </div>
    </div>
  );
}
