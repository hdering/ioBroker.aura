import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { WidgetConfig, ClickAction } from '../../../types';
import { usePortalTarget } from '../../../contexts/PortalTargetContext';
import { usePopupConfigStore } from '../../../store/popupConfigStore';
import { DimmerPopupBody } from './DimmerPopupBody';
import { ThermostatPopupBody } from './ThermostatPopupBody';
import { SwitchPopupBody } from './SwitchPopupBody';
import { ShutterPopupBody } from './ShutterPopupBody';
import { MediaplayerPopupBody } from './MediaplayerPopupBody';
import { ImagePopupBody } from './ImagePopupBody';
import { IframePopupBody } from './IframePopupBody';
import { JsonPopupBody } from './JsonPopupBody';
import { HtmlPopupBody } from './HtmlPopupBody';
import { WidgetEmbedBody } from './WidgetEmbedBody';
import { TabEmbedBody } from './TabEmbedBody';

function normalizeAction(action: ClickAction): ClickAction {
  switch (action.kind) {
    case 'popup-dimmer':      return { kind: 'popup-view', viewId: 'pv-builtin-dimmer' };
    case 'popup-thermostat':  return { kind: 'popup-view', viewId: 'pv-builtin-thermostat' };
    case 'popup-switch':      return { kind: 'popup-view', viewId: 'pv-builtin-switch' };
    case 'popup-shutter':     return { kind: 'popup-view', viewId: 'pv-builtin-shutter' };
    case 'popup-mediaplayer': return { kind: 'popup-view', viewId: 'pv-builtin-mediaplayer' };
    default:                  return action;
  }
}

interface Props {
  widget: WidgetConfig;
  action: ClickAction;
  onClose: () => void;
  allWidgets?: WidgetConfig[];
}

function getTitle(widget: WidgetConfig, action: ClickAction): string {
  const custom = widget.options?.popupTitle as string | undefined;
  if (custom) return custom;
  if (widget.title) return widget.title;
  switch (action.kind) {
    case 'popup-dimmer':      return 'Dimmer';
    case 'popup-thermostat':  return 'Thermostat';
    case 'popup-switch':      return 'Schalter';
    case 'popup-shutter':     return 'Rolladen';
    case 'popup-mediaplayer': return 'Mediaplayer';
    case 'popup-image':       return 'Bild';
    case 'popup-iframe':      return 'Webseite';
    case 'popup-json':        return 'JSON';
    case 'popup-html':        return 'HTML';
    case 'popup-widget':      return 'Widget';
    case 'popup-view':        return widget.title || '';
    default:                  return '';
  }
}

export function WidgetClickPopup({ widget, action: rawAction, onClose, allWidgets = [] }: Props) {
  const action = normalizeAction(rawAction);
  // Prefer the frontend container so the popup inherits per-layout scoped CSS vars.
  // Falls back to the portal target (admin context) or document.body.
  const adminTarget = usePortalTarget();
  const portalTarget = document.querySelector('[data-aura-app="frontend"]') ?? adminTarget;

  // Auto-close resolution: action override > popup-view setting > global default.
  // Tri-state: undefined = inherit next level, 0 = explicit off, >0 = seconds.
  const actionAutoClose = widget.options?.popupAutoCloseSec as number | undefined;
  const viewAutoClose = usePopupConfigStore((s) =>
    action.kind === 'popup-view' ? s.views.find((v) => v.id === action.viewId)?.autoCloseSec : undefined,
  );
  const globalAutoClose = usePopupConfigStore((s) => s.globalAutoCloseSec);
  const effectiveAutoCloseSec = actionAutoClose ?? viewAutoClose ?? globalAutoClose ?? 0;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Auto-close timer, reset on pointer activity inside the popup body.
  const timerRef = useRef<number | null>(null);
  const armTimer = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (effectiveAutoCloseSec > 0) {
      timerRef.current = window.setTimeout(onClose, effectiveAutoCloseSec * 1000);
    }
  };
  useEffect(() => {
    armTimer();
    return () => { if (timerRef.current !== null) window.clearTimeout(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveAutoCloseSec, onClose]);

  const isIframe    = action.kind === 'popup-iframe';
  const hideTitle   = !!(widget.options?.popupHideTitle);
  const title       = getTitle(widget, action);
  const customWidth  = widget.options?.popupWidth  as number | undefined;
  const customHeight = widget.options?.popupHeight as number | undefined;

  const body = (() => {
    switch (action.kind) {
      case 'popup-dimmer':
        return <DimmerPopupBody widget={widget} />;
      case 'popup-thermostat':
        return <ThermostatPopupBody widget={widget} action={action} />;
      case 'popup-switch':
        return <SwitchPopupBody widget={widget} />;
      case 'popup-shutter':
        return <ShutterPopupBody widget={widget} />;
      case 'popup-mediaplayer':
        return <MediaplayerPopupBody widget={widget} />;
      case 'popup-image':
        return <ImagePopupBody action={action} />;
      case 'popup-iframe':
        return <IframePopupBody action={action} />;
      case 'popup-json':
        return <JsonPopupBody action={action} />;
      case 'popup-html':
        return <HtmlPopupBody action={action} />;
      case 'popup-widget':
        return <WidgetEmbedBody widget={widget} action={action} allWidgets={allWidgets} />;
      case 'popup-view':
        return <TabEmbedBody viewId={action.viewId} triggerWidget={widget} />;
      default:
        return null;
    }
  })();

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center z-[300] p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="relative flex flex-col rounded-2xl shadow-2xl overflow-hidden"
        style={{
          background: 'var(--app-surface)',
          border: '1px solid var(--app-border)',
          width: isIframe ? undefined : (customWidth ? `min(90vw, ${customWidth}px)` : undefined),
          maxWidth: isIframe ? undefined : (customWidth ? undefined : 'min(90vw, 600px)'),
          maxHeight: isIframe ? undefined : (customHeight ? `min(85vh, ${customHeight}px)` : '85vh'),
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={armTimer}
        onPointerMove={effectiveAutoCloseSec > 0 ? armTimer : undefined}
        onKeyDown={armTimer}
      >
        {/* Close button — always absolute top-right of popup */}
        <button
          onClick={onClose}
          className="absolute top-2.5 right-2.5 z-20 w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-70 transition-opacity"
          style={{ color: 'var(--text-secondary)', background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
        >
          <X size={13} />
        </button>

        {/* Optional title header */}
        {!hideTitle && title && (
          <div
            className="shrink-0 px-5 pr-12 py-3"
            style={{ borderBottom: '1px solid var(--app-border)' }}
          >
            <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              {title}
            </span>
          </div>
        )}

        {/* Body */}
        <div className="overflow-auto flex items-center justify-center" style={{ flex: isIframe ? 'none' : '1 1 auto' }}>
          {body}
        </div>
      </div>
    </div>,
    portalTarget,
  );
}
