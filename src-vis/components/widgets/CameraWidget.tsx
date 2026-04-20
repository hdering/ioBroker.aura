import { useState, useEffect, useRef } from 'react';
import { Camera } from 'lucide-react';
import type { WidgetProps } from '../../types';
import { CustomGridView } from './CustomGridView';
import { setStateDirect } from '../../hooks/useIoBroker';

type StreamMode  = 'img' | 'iframe' | 'rtsp-hint';
type WakeUpMode  = 'auto' | 'onView' | 'onClick';

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
  const wakeUpMode      = (opts.wakeUpMode      as WakeUpMode)          ?? 'auto';
  const layout          = config.layout ?? 'default';

  const mode = detectMode(streamUrl);

  const [imgSrc, setImgSrc]           = useState<string>('');
  const [loadError, setLoadError]     = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [waking, setWaking]           = useState(false);
  const [streamReady, setStreamReady] = useState(!wakeUpDp || wakeUpMode === 'auto' ? false : false);

  const containerRef  = useRef<HTMLDivElement>(null);
  const intervalRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep latest values accessible in callbacks without re-creating effects
  const wakeUpDpRef    = useRef(wakeUpDp);
  const wakeUpDelayRef = useRef(wakeUpDelay);
  wakeUpDpRef.current    = wakeUpDp;
  wakeUpDelayRef.current = wakeUpDelay;

  const buildSrc = (url: string) => {
    if (!url || mode !== 'img') return url;
    if (refreshInterval === 0) return url;
    return url.includes('?') ? `${url}&_t=${Date.now()}` : `${url}?_t=${Date.now()}`;
  };

  function doWake() {
    if (!wakeUpDpRef.current) return;
    if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current);
    setStateDirect(wakeUpDpRef.current, true);
    setWaking(true);
    setStreamReady(false);
    wakeTimerRef.current = setTimeout(() => {
      setWaking(false);
      setStreamReady(true);
    }, wakeUpDelayRef.current * 1000);
  }

  function doSleep() {
    if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current);
    if (wakeUpDpRef.current) setStateDirect(wakeUpDpRef.current, false);
    setWaking(false);
    setStreamReady(false);
  }

  // auto mode: wake on mount, sleep on unmount
  useEffect(() => {
    if (!wakeUpDp || !streamUrl) {
      setStreamReady(true);
      return;
    }
    if (wakeUpMode !== 'auto') return;
    doWake();
    return () => doSleep();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wakeUpDp, streamUrl, wakeUpDelay, wakeUpMode]);

  // onClick mode: sleep on unmount (wake is triggered by user click)
  useEffect(() => {
    if (!wakeUpDp || !streamUrl || wakeUpMode !== 'onClick') return;
    return () => doSleep();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wakeUpDp, streamUrl, wakeUpMode]);

  // onView mode: wake when widget enters viewport, sleep when it leaves
  useEffect(() => {
    if (!wakeUpDp || !streamUrl || wakeUpMode !== 'onView') return;
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) doWake();
        else doSleep();
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      doSleep();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wakeUpDp, streamUrl, wakeUpMode]);

  // Image refresh loop (img mode only, runs once stream is ready)
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

  // onView + not yet visible: neutral placeholder (IntersectionObserver still attached via ref)
  if (wakeUpDp && wakeUpMode === 'onView' && !waking && !streamReady) {
    return (
      <div
        ref={containerRef}
        className="flex flex-col items-center justify-center h-full gap-2"
        style={{ background: 'var(--app-bg)', borderRadius: 'var(--widget-radius)' }}
      >
        <Camera size={28} style={{ color: 'var(--text-secondary)' }} />
        {config.title && (
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>
        )}
      </div>
    );
  }

  // onClick + not yet triggered: clickable placeholder
  if (wakeUpDp && wakeUpMode === 'onClick' && !waking && !streamReady) {
    return (
      <div
        ref={containerRef}
        onClick={editMode ? undefined : doWake}
        className="flex flex-col items-center justify-center h-full gap-2 select-none"
        style={{
          background: 'var(--app-bg)',
          borderRadius: 'var(--widget-radius)',
          cursor: editMode ? 'default' : 'pointer',
        }}
      >
        <div
          className="flex items-center justify-center rounded-full w-10 h-10"
          style={{ background: 'var(--accent)', opacity: 0.85 }}
        >
          <Camera size={20} color="#fff" />
        </div>
        {config.title && (
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>
        )}
        {!editMode && (
          <p className="text-[10px] opacity-50" style={{ color: 'var(--text-secondary)' }}>Tippen zum Aktivieren</p>
        )}
      </div>
    );
  }

  if (waking) {
    return (
      <div
        ref={containerRef}
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
    <div ref={containerRef} className="relative h-full w-full overflow-hidden rounded-[inherit]">
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
