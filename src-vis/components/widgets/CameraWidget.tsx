import { useState, useEffect, useRef } from 'react';
import { Camera } from 'lucide-react';
import type { WidgetProps } from '../../types';
import { CustomGridView } from './CustomGridView';
import { setStateDirect } from '../../hooks/useIoBroker';

type StreamMode = 'img' | 'iframe' | 'rtsp-hint';

function detectMode(url: string): StreamMode {
  if (!url) return 'img';
  if (url.startsWith('rtsp://') || url.startsWith('rtsps://')) return 'rtsp-hint';
  const path = url.split('?')[0].toLowerCase();
  if (path.endsWith('.html') || path.endsWith('.htm')) return 'iframe';
  return 'img';
}

export function CameraWidget({ config, editMode }: WidgetProps) {
  const opts            = config.options ?? {};
  const streamUrl       = (opts.streamUrl       as string)              ?? '';
  const refreshInterval = (opts.refreshInterval as number)              ?? 5;
  const fitMode         = (opts.fitMode         as 'cover' | 'contain') ?? 'cover';
  const showTimestamp   = (opts.showTimestamp   as boolean)             ?? true;
  const wakeUpDp        = (opts.wakeUpDp        as string)              ?? '';
  const wakeUpDelay     = (opts.wakeUpDelay     as number)              ?? 3;
  const layout          = config.layout ?? 'default';

  const mode = detectMode(streamUrl);

  const [imgSrc, setImgSrc]       = useState<string>('');
  const [loadError, setLoadError] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [waking, setWaking]       = useState(false);
  const [streamReady, setStreamReady] = useState(!wakeUpDp);
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildSrc = (url: string) => {
    if (!url || mode !== 'img') return url;
    if (refreshInterval === 0) return url;
    return url.includes('?') ? `${url}&_t=${Date.now()}` : `${url}?_t=${Date.now()}`;
  };

  // Wake-up trigger: send true on mount, false on unmount
  useEffect(() => {
    if (!wakeUpDp || !streamUrl) {
      setStreamReady(true);
      return;
    }
    setWaking(true);
    setStreamReady(false);
    setStateDirect(wakeUpDp, true);
    wakeTimerRef.current = setTimeout(() => {
      setWaking(false);
      setStreamReady(true);
    }, wakeUpDelay * 1000);
    return () => {
      if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current);
      setStateDirect(wakeUpDp, false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wakeUpDp, streamUrl, wakeUpDelay]);

  // Image refresh loop (img mode only)
  useEffect(() => {
    if (!streamUrl || !streamReady || mode !== 'img') return;
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
  }, [streamUrl, refreshInterval, streamReady, mode]);

  if (layout === 'custom') return <CustomGridView config={config} value="" />;

  const showTitle = (layout === 'default' || layout === 'card') && config.title;

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

  if (mode === 'rtsp-hint') {
    return (
      <div
        className="flex flex-col items-center justify-center h-full gap-2 p-3"
        style={{ background: 'var(--app-bg)', borderRadius: 'var(--widget-radius)' }}
      >
        <Camera size={28} style={{ color: 'var(--text-secondary)' }} />
        <p className="text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
          RTSP wird im Browser nicht unterstützt.
          <br />
          <span className="text-[10px] opacity-60">go2rtc als Proxy verwenden → MJPEG-URL eintragen.</span>
        </p>
      </div>
    );
  }

  if (waking) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full gap-2"
        style={{ background: 'var(--app-bg)', borderRadius: 'var(--widget-radius)' }}
      >
        <Camera size={28} style={{ color: 'var(--accent)' }} />
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Kamera wird aktiviert…</p>
      </div>
    );
  }

  const hasError = loadError && mode === 'img';

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[inherit]">
      {mode === 'iframe' ? (
        <iframe
          src={streamUrl}
          title={config.title || 'Kamera'}
          allow="autoplay"
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        />
      ) : (
        <img
          src={imgSrc}
          alt={config.title || 'Kamera'}
          onError={() => setLoadError(true)}
          onLoad={() => setLoadError(false)}
          style={{ width: '100%', height: '100%', objectFit: fitMode, display: 'block' }}
        />
      )}

      {hasError && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2"
          style={{ background: 'rgba(0,0,0,0.6)' }}
        >
          <Camera size={28} style={{ color: '#ef4444' }} />
          <p className="text-xs text-white opacity-80">Verbindungsfehler</p>
        </div>
      )}

      {showTitle && !hasError && (
        <div
          className="absolute bottom-0 left-0 right-0 px-2 py-1.5"
          style={{ background: 'rgba(0,0,0,0.55)' }}
        >
          <p className="text-xs font-medium text-white truncate">{config.title}</p>
        </div>
      )}

      {showTimestamp && lastRefresh && !hasError && mode === 'img' && (
        <div
          className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[9px] font-mono"
          style={{ background: 'rgba(0,0,0,0.5)', color: 'rgba(255,255,255,0.8)' }}
        >
          {lastRefresh.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
      )}

      {editMode && (
        <div
          className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
          style={{
            background: mode === 'iframe' ? '#3b82f6' : refreshInterval === 0 ? '#ef4444' : 'rgba(0,0,0,0.6)',
            color: '#fff',
          }}
        >
          {mode === 'iframe' ? 'HTML' : refreshInterval === 0 ? 'LIVE' : 'CAM'}
        </div>
      )}
    </div>
  );
}
