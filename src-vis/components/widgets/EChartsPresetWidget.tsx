import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { BarChart2, Maximize2, X } from 'lucide-react';
import type { WidgetProps } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';

function getIoBrokerBase(): string {
  const injected = (window as unknown as { __AURA_SOCKET_URL__?: string }).__AURA_SOCKET_URL__;
  if (injected) {
    try { return new URL(injected).origin; } catch { /* ignore */ }
  }
  return window.location.origin;
}

export function EChartsPresetWidget({ config, editMode }: WidgetProps) {
  const opts       = config.options ?? {};
  const presetId   = (opts.presetId  as string)  ?? '';
  const darkMode   = (opts.darkMode  as boolean) ?? true;
  const manualBase = (opts.baseUrl   as string | undefined)?.replace(/\/$/, '');
  const showTitle  = opts.showTitle  !== false;
  const showIcon   = opts.showIcon   !== false;
  const iconSize   = (opts.iconSize  as number) || 20;
  const titleAlign = (opts.titleAlign as string) ?? 'left';
  const WidgetIcon = getWidgetIcon(opts.icon as string | undefined, BarChart2);

  const [autoBase] = useState(getIoBrokerBase);
  const [fullscreen, setFullscreen] = useState(false);

  const closeFullscreen = useCallback(() => setFullscreen(false), []);

  useEffect(() => {
    if (!fullscreen) return;

    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeFullscreen(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [fullscreen, closeFullscreen]);

  if (!presetId) {
    return (
      <div className="flex flex-col h-full">
        {(showTitle || showIcon) && (
          <div className="flex items-center gap-1 shrink-0 mb-1 min-w-0">
            {showIcon && <WidgetIcon size={iconSize} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />}
            {showTitle && <p className="text-xs truncate flex-1 min-w-0" style={{ color: 'var(--text-secondary)', textAlign: titleAlign as React.CSSProperties['textAlign'] }}>{config.title}</p>}
          </div>
        )}
        <div className="flex flex-col items-center justify-center flex-1 gap-2" style={{ color: 'var(--text-secondary)' }}>
          <BarChart2 size={28} strokeWidth={1.5} />
          <span className="text-xs">Kein Preset konfiguriert</span>
        </div>
      </div>
    );
  }

  const baseUrl = manualBase ?? autoBase;
  const url = `${baseUrl}/echarts/index.html?preset=${encodeURIComponent(presetId)}${darkMode ? '&theme=dark' : ''}`;

  return (
    <>
      <div className="flex flex-col w-full h-full">
        {(showTitle || showIcon) && (
          <div className="flex items-center gap-1 shrink-0 mb-1 min-w-0">
            {showIcon && <WidgetIcon size={iconSize} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />}
            {showTitle && <p className="text-xs truncate flex-1 min-w-0" style={{ color: 'var(--text-secondary)', textAlign: titleAlign as React.CSSProperties['textAlign'] }}>{config.title}</p>}
          </div>
        )}
        <div className="flex-1 overflow-hidden relative min-h-0" style={{ borderRadius: 'inherit' }}>
          <iframe
            src={url}
            title={config.title || 'eCharts'}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            allow="fullscreen"
          />
          {!editMode && (
            <button
              onClick={(e) => { e.stopPropagation(); setFullscreen(true); }}
              className="absolute bottom-2 right-2 p-1 rounded"
              style={{ background: 'rgba(0,0,0,0.5)', border: 'none', cursor: 'pointer', color: '#fff', lineHeight: 0, zIndex: 2 }}
            >
              <Maximize2 size={14} />
            </button>
          )}
        </div>
      </div>

      {fullscreen && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: 9999, background: 'rgba(0,0,0,0.95)' }}
          onClick={closeFullscreen}
        >
          <button
            onClick={closeFullscreen}
            className="absolute top-3 right-3 p-2 rounded-full"
            style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer', color: '#fff', lineHeight: 0, zIndex: 1 }}
          >
            <X size={22} />
          </button>
          <div className="w-full h-full" onClick={(e) => e.stopPropagation()}>
            <iframe
              src={url}
              title={config.title || 'eCharts'}
              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
              allow="fullscreen"
            />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
