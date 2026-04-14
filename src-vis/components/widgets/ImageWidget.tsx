import { useState, useEffect, useRef } from 'react';
import { ImageIcon } from 'lucide-react';
import type { WidgetProps } from '../../types';
import { useDatapoint } from '../../hooks/useDatapoint';

type FitMode = 'none' | 'contain' | 'width' | 'height';

export function ImageWidget({ config }: WidgetProps) {
  const opts            = config.options ?? {};
  const imageUrl        = (opts.imageUrl        as string)   ?? '';
  const datapointId     = (opts.imageDatapoint  as string)   ?? '';
  const fit             = (opts.fit             as FitMode)  ?? 'contain';
  const refreshSeconds  = (opts.refreshInterval as number)   ?? 0;

  const { value: dpValue } = useDatapoint(datapointId);

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
    if (imageUrl.startsWith('data:') || (!imageUrl.startsWith('http') && imageUrl.length > 64)) {
      if (imageUrl.startsWith('data:')) return imageUrl;
      return `data:image/jpeg;base64,${imageUrl}`;
    }
    const sep = imageUrl.includes('?') ? '&' : '?';
    return tick > 0 ? `${imageUrl}${sep}_t=${tick}` : imageUrl;
  })();

  if (!src) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2"
        style={{ color: 'var(--text-secondary)' }}>
        <ImageIcon size={32} strokeWidth={1} />
        <p className="text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
          {config.title || 'Bild'}
          <br />
          <span className="text-[10px] opacity-60">Keine URL oder Datenpunkt konfiguriert</span>
        </p>
      </div>
    );
  }

  // Container style depends on fit mode
  const wrapStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    overflow: fit === 'none' ? 'auto' : 'hidden',
    display: 'flex',
    alignItems: fit === 'none' ? 'flex-start' : 'center',
    justifyContent: fit === 'none' ? 'flex-start' : 'center',
    position: 'relative',
  };

  const imgStyle: React.CSSProperties = (() => {
    switch (fit) {
      case 'none':    return { display: 'block', flexShrink: 0 };
      case 'contain': return { width: '100%', height: '100%', objectFit: 'contain', display: 'block' };
      case 'width':   return { width: '100%', height: 'auto', display: 'block' };
      case 'height':  return { height: '100%', width: 'auto', display: 'block' };
    }
  })();

  return (
    <div style={wrapStyle}>
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
  );
}
