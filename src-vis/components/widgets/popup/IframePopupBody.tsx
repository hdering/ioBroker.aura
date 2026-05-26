import { useState } from 'react';
import { MonitorDot, AlertTriangle } from 'lucide-react';
import type { ClickAction } from '../../../types';
import { resolveSandboxAttr } from '../../../utils/iframeSandbox';

interface Props {
  action: Extract<ClickAction, { kind: 'popup-iframe' }>;
}

export function IframePopupBody({ action }: Props) {
  const [timedOut, setTimedOut] = useState(false);

  if (!action.url) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2" style={{ color: 'var(--text-secondary)' }}>
        <MonitorDot size={32} strokeWidth={1} />
        <span className="text-xs">Keine URL konfiguriert</span>
      </div>
    );
  }

  const sandboxAttr = resolveSandboxAttr(
    action.sandboxPreset,
    action.sandboxCustom,
    action.sandbox ? 'extended' : 'off',
  );

  return (
    <div style={{ width: 'min(88vw, 860px)', height: 'min(80vh, 680px)', position: 'relative' }}>
      {timedOut && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10"
          style={{ background: 'var(--app-surface)', color: 'var(--text-secondary)' }}
        >
          <AlertTriangle size={24} style={{ color: 'var(--accent-red, #ef4444)' }} />
          <span className="text-sm">Seite konnte nicht geladen werden</span>
          <span className="text-xs opacity-60">{action.url}</span>
        </div>
      )}
      <iframe
        src={action.url}
        sandbox={sandboxAttr}
        onLoad={() => setTimedOut(false)}
        onError={() => setTimedOut(true)}
        style={{ width: '100%', height: '100%', border: 'none', borderRadius: '0 0 var(--widget-radius) var(--widget-radius)' }}
        title="Popup"
      />
    </div>
  );
}
