import { useState, useCallback } from 'react';
import { Globe } from 'lucide-react';
import { useIoBroker } from '../../hooks/useIoBroker';
import { useConfirmAction } from '../../hooks/useConfirmAction';
import type { WidgetProps } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { contentPositionClass } from '../../utils/widgetUtils';
import { ConfirmOverlay } from './ConfirmOverlay';
import { CustomGridView } from './CustomGridView';

type RequestStatus = 'idle' | 'loading' | 'ok' | 'error';

export function HttpRequestWidget({ config }: WidgetProps) {
  const o = config.options ?? {};
  const { setState } = useIoBroker();
  const layout = config.layout ?? 'default';

  const method          = (o.method          as string)  || 'GET';
  const url             = (o.url             as string)  || '';
  const body            = (o.body            as string)  || '';
  const contentType     = (o.contentType     as string)  || 'application/json';
  const responseDatapoint = (o.responseDatapoint as string) || '';
  const buttonLabel     = (o.buttonLabel     as string)  || config.title || 'Senden';
  const buttonColor     = (o.buttonColor     as string)  || 'var(--accent)';
  const showStatus      = (o.showStatus      as boolean) ?? true;
  const confirmAction   = (o.confirmAction   as boolean) ?? false;
  const confirmText     = (o.confirmText     as string)  ?? '';
  const showTitle       = o.showTitle  !== false;
  const showIcon        = o.showIcon   !== false;
  const titleAlign      = (o.titleAlign as string) ?? 'left';
  const iconSize        = (o.iconSize   as number)  || 32;

  const [status, setStatus]   = useState<RequestStatus>('idle');
  const [statusText, setStatusText] = useState('');

  const doRequest = useCallback(async () => {
    if (!url) return;
    setStatus('loading');
    try {
      const init: RequestInit = { method };
      if (method === 'POST' && body) {
        init.body = body;
        init.headers = { 'Content-Type': contentType };
      }
      const proxyUrl = '/proxy?url=' + encodeURIComponent(url);
      const res  = await fetch(proxyUrl, init);
      const text = await res.text();
      if (responseDatapoint) setState(responseDatapoint, text);
      if (res.ok) {
        setStatus('ok');
        setStatusText(`${res.status} OK`);
      } else {
        setStatus('error');
        setStatusText(`${res.status} ${res.statusText}`);
      }
    } catch (e) {
      setStatus('error');
      setStatusText(e instanceof Error ? e.message : 'Fehler');
    }
  }, [url, method, body, contentType, responseDatapoint, setState]);

  const { run: handleClick, pending, confirm, cancel } = useConfirmAction(doRequest, confirmAction);

  const WidgetIcon = getWidgetIcon(o.icon as string | undefined, Globe);

  const statusColor =
    status === 'ok'      ? 'var(--accent-green)' :
    status === 'error'   ? 'var(--accent-red)'   :
    'var(--text-secondary)';

  const statusLabel =
    status === 'loading' ? 'Sende…' :
    status !== 'idle'    ? statusText : '';

  const btn = (
    <button
      onClick={handleClick}
      disabled={status === 'loading' || !url}
      className="nodrag flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-all active:scale-95 focus:outline-none disabled:opacity-40 shrink-0"
      style={{ background: buttonColor, color: '#fff' }}
    >
      <Globe size={14} />
      <span className="text-sm font-medium whitespace-nowrap">{buttonLabel}</span>
    </button>
  );

  // ── CUSTOM ───────────────────────────────────────────────────────────────
  if (layout === 'custom') {
    return (
      <div className="relative w-full h-full">
        <CustomGridView
          config={config}
          value={statusLabel}
          extraFields={{ status: statusLabel }}
          extraComponents={{ button: btn }}
        />
        {pending && <ConfirmOverlay text={confirmText} onConfirm={confirm} onCancel={cancel} />}
      </div>
    );
  }

  // ── MINIMAL ───────────────────────────────────────────────────────────────
  if (layout === 'minimal') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1" style={{ position: 'relative' }}>
        {btn}
        {showStatus && statusLabel && (
          <span className="text-[10px]" style={{ color: statusColor }}>{statusLabel}</span>
        )}
        {pending && <ConfirmOverlay text={confirmText} onConfirm={confirm} onCancel={cancel} />}
      </div>
    );
  }

  // ── COMPACT ───────────────────────────────────────────────────────────────
  if (layout === 'compact') {
    return (
      <div className="flex items-center gap-2 h-full" style={{ position: 'relative' }}>
        {showTitle && (
          <p className="flex-1 min-w-0 text-sm truncate" style={{ color: 'var(--text-primary)', textAlign: titleAlign as React.CSSProperties['textAlign'] }}>{config.title}</p>
        )}
        {!showTitle && <span className="flex-1" />}
        {showStatus && statusLabel && (
          <span className="text-[10px] shrink-0" style={{ color: statusColor }}>{statusLabel}</span>
        )}
        {btn}
        {pending && <ConfirmOverlay text={confirmText} onConfirm={confirm} onCancel={cancel} />}
      </div>
    );
  }

  // ── DEFAULT / CARD ────────────────────────────────────────────────────────
  const posClass = contentPositionClass(o.contentPosition as string | undefined);
  return (
    <div className={`flex flex-col h-full gap-3 ${posClass}`} style={{ position: 'relative' }}>
      {(showTitle || showIcon) && (
        <div className="flex items-center gap-2">
          {showIcon && <WidgetIcon size={iconSize} style={{ color: buttonColor, flexShrink: 0 }} />}
          {showTitle && <p className="text-xs truncate flex-1 min-w-0" style={{ color: 'var(--text-secondary)', textAlign: titleAlign as React.CSSProperties['textAlign'] }}>{config.title}</p>}
        </div>
      )}
      {btn}
      {showStatus && statusLabel && (
        <span className="text-xs" style={{ color: statusColor }}>{statusLabel}</span>
      )}
      {pending && <ConfirmOverlay text={confirmText} onConfirm={confirm} onCancel={cancel} />}
    </div>
  );
}
