import { useState, useEffect, useRef } from 'react';
import { Camera } from 'lucide-react';
import type { WidgetProps } from '../../types';
import { CustomGridView } from './CustomGridView';

export function CameraWidget({ config, editMode }: WidgetProps) {
  const opts            = config.options ?? {};
  const streamUrl       = (opts.streamUrl       as string)            ?? '';
  const refreshInterval = (opts.refreshInterval as number)            ?? 5;
  const fitMode         = (opts.fitMode         as 'cover' | 'contain') ?? 'cover';
  const showTimestamp   = (opts.showTimestamp   as boolean)           ?? true;
  const layout          = config.layout ?? 'default';

  const [imgSrc, setImgSrc]           = useState<string>('');
  const [loadError, setLoadError]     = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Build the URL — append cache-bust for snapshot mode
  const buildSrc = (url: string) => {
    if (!url) return '';
    if (refreshInterval === 0) return url; // MJPEG: no cache-bust
    return url.includes('?') ? `${url}&_t=${Date.now()}` : `${url}?_t=${Date.now()}`;
  };

  useEffect(() => {
    if (!streamUrl) return;
    setLoadError(false);
    setImgSrc(buildSrc(streamUrl));
    setLastRefresh(new Date());

    if (refreshInterval > 0) {
      intervalRef.current = setInterval(() => {
        setImgSrc(buildSrc(streamUrl));
        setLastRefresh(new Date());
      }, refreshInterval * 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamUrl, refreshInterval]);

  if (layout === 'custom') return <CustomGridView config={config} value="" />;

  const showTitle = (layout === 'default' || layout === 'card') && config.title;
  const showOverlayBadge = editMode;

  // No URL — placeholder
  if (!streamUrl) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full gap-2"
        style={{ background: 'var(--app-bg)', borderRadius: 'var(--widget-radius)' }}
      >
        <Camera size={32} style={{ color: 'var(--text-secondary)' }} />
        <p className="text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
          {config.title || 'Kamera'}
          <br />
          <span className="text-[10px] opacity-60">Keine URL konfiguriert</span>
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[inherit]">
      {/* Image */}
      <img
        src={imgSrc}
        alt={config.title || 'Kamera'}
        onError={() => setLoadError(true)}
        onLoad={() => setLoadError(false)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: fitMode,
          display: 'block',
        }}
      />

      {/* Error overlay */}
      {loadError && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2"
          style={{ background: 'rgba(0,0,0,0.6)' }}
        >
          <Camera size={28} style={{ color: '#ef4444' }} />
          <p className="text-xs text-white opacity-80">Verbindungsfehler</p>
        </div>
      )}

      {/* Title overlay */}
      {showTitle && !loadError && (
        <div
          className="absolute bottom-0 left-0 right-0 px-2 py-1.5"
          style={{ background: 'rgba(0,0,0,0.55)' }}
        >
          <p className="text-xs font-medium text-white truncate">{config.title}</p>
        </div>
      )}

      {/* Timestamp badge */}
      {showTimestamp && lastRefresh && !loadError && (
        <div
          className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[9px] font-mono"
          style={{ background: 'rgba(0,0,0,0.5)', color: 'rgba(255,255,255,0.8)' }}
        >
          {lastRefresh.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
      )}

      {/* LIVE / CAM badge in edit mode */}
      {showOverlayBadge && (
        <div
          className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
          style={{ background: refreshInterval === 0 ? '#ef4444' : 'rgba(0,0,0,0.6)', color: '#fff' }}
        >
          {refreshInterval === 0 ? 'LIVE' : 'CAM'}
        </div>
      )}
    </div>
  );
}
