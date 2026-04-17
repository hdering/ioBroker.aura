import { useState, useEffect, useRef } from 'react';
import { MonitorDot, Maximize2, AlertTriangle, ExternalLink, X } from 'lucide-react';
import { useIframeStore } from '../../store/iframeStore';
import type { WidgetProps } from '../../types';

const LOAD_TIMEOUT_MS = 8000;

export function IframeWidget({ config }: WidgetProps) {
  const opts             = config.options ?? {};
  const url              = (opts.iframeUrl        as string)  ?? '';
  const keepAlive        = (opts.keepAlive         as boolean) ?? false;
  const allowInteraction = !!(opts.allowInteraction ?? true);
  const refreshSeconds   = (opts.refreshInterval   as number)  ?? 0;
  const sandboxEnabled   = (opts.sandbox           as boolean) ?? false;
  const fullscreenButton = (opts.fullscreenButton  as boolean) ?? false;

  const [tick, setTick]           = useState(0);
  const [loaded, setLoaded]       = useState(false);
  const [timedOut, setTimedOut]   = useState(false);
  const [hintDismissed, setHintDismissed] = useState(false);
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setFullscreen = useIframeStore((s) => s.setFullscreen);

  // Reset load state whenever URL or tick changes
  useEffect(() => {
    setLoaded(false);
    setTimedOut(false);
    setHintDismissed(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (!url) return;
    timeoutRef.current = setTimeout(() => setTimedOut(true), LOAD_TIMEOUT_MS);
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [url, tick]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!url || refreshSeconds < 1 || keepAlive) return;
    intervalRef.current = setInterval(() => setTick((n) => n + 1), refreshSeconds * 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [url, refreshSeconds, keepAlive]);

  // Clear fullscreen when widget unmounts (e.g. tab switch)
  useEffect(() => () => { setFullscreen(null); }, [setFullscreen]);

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
      <div className="relative flex-1 overflow-hidden group" style={{ borderRadius: 'inherit' }}>
        <iframe
          key={iframeKey}
          src={url}
          sandbox={sandboxAttr}
          allow="autoplay; fullscreen; picture-in-picture; web-share"
          title={config.title || 'iFrame'}
          onLoad={() => { setLoaded(true); if (timeoutRef.current) clearTimeout(timeoutRef.current); }}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        />
        {/* Interaction blocker */}
        {!allowInteraction && (
          <div className="absolute inset-0 z-[1]" style={{ pointerEvents: 'all', cursor: 'default' }} />
        )}
        {/* Fullscreen button – shown on hover */}
        {fullscreenButton && (
          <button
            onClick={() => setFullscreen({
              url,
              sandboxAttr,
              iframeKey: `fs-${iframeKey}`,
              title: config.title || 'iFrame',
            })}
            className="nodrag absolute top-1.5 right-1.5 z-[2] w-7 h-7 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', backdropFilter: 'blur(4px)' }}
            title="Vollbild"
          >
            <Maximize2 size={13} />
          </button>
        )}
        {/* Load-failure hint – shown after timeout if iframe never fired onLoad */}
        {timedOut && !loaded && !hintDismissed && (
          <div className="absolute inset-0 z-[3] flex items-center justify-center p-3"
            style={{ background: 'color-mix(in srgb, var(--app-surface) 92%, transparent)', backdropFilter: 'blur(2px)' }}>
            <div className="w-full max-w-xs rounded-xl p-4 space-y-3"
              style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', boxShadow: '0 4px 24px rgba(0,0,0,0.2)' }}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} style={{ color: '#f59e0b', flexShrink: 0 }} />
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Inhalt nicht geladen
                  </span>
                </div>
                <button onClick={() => setHintDismissed(true)} className="hover:opacity-70 shrink-0"
                  style={{ color: 'var(--text-secondary)' }}>
                  <X size={14} />
                </button>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Mögliche Ursachen:
              </p>
              <ul className="text-xs space-y-1.5" style={{ color: 'var(--text-secondary)' }}>
                <li className="flex items-start gap-1.5">
                  <span className="mt-0.5 shrink-0" style={{ color: '#f59e0b' }}>•</span>
                  <span>
                    <strong style={{ color: 'var(--text-primary)' }}>Self-signed Zertifikat</strong>
                    {' '}– URL einmalig direkt im Browser öffnen und Ausnahme bestätigen
                  </span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="mt-0.5 shrink-0" style={{ color: '#f59e0b' }}>•</span>
                  <span>
                    <strong style={{ color: 'var(--text-primary)' }}>Gemischte Inhalte</strong>
                    {' '}– HTTPS-Seite kann kein HTTP-iFrame laden
                  </span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="mt-0.5 shrink-0" style={{ color: '#f59e0b' }}>•</span>
                  <span>
                    <strong style={{ color: 'var(--text-primary)' }}>X-Frame-Options</strong>
                    {' '}– Zielseite erlaubt keine Einbettung
                  </span>
                </li>
              </ul>
              <a href={url} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 w-full text-xs py-2 rounded-lg hover:opacity-80"
                style={{ background: 'var(--accent)', color: '#fff' }}>
                <ExternalLink size={12} />
                URL direkt öffnen
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
