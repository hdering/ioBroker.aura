import { useRef, useState } from 'react';
import { MonitorDot, AlertTriangle } from 'lucide-react';
import type { ClickAction } from '../../../types';
import { resolveSandboxAttr } from '../../../utils/iframeSandbox';
import { useIframeColorScheme } from '../../../hooks/useIframeColorScheme';
import { useActionUrl } from '../../../hooks/useActionUrl';
import { hasUrlPlaceholders } from '../../../utils/actionUrl';

interface Props {
    action: Extract<ClickAction, { kind: 'popup-iframe' }>;
    /** Configured popup size in px; empty keeps the default box. */
    width?: number;
    height?: number;
    /** Fill the parent (fullscreen popup) instead of sizing the box itself. */
    fill?: boolean;
    /** Datapoint `{dp}` stands for in the URL — the clicked row's or the widget's (#1006). */
    dpId?: string;
}

export function IframePopupBody({ action, width, height, fill, dpId }: Props) {
    const [timedOut, setTimedOut] = useState(false);
    const boxRef = useRef<HTMLDivElement | null>(null);
    // The popup sits on Aura's surface, so the page inside follows Aura's
    // brightness like an iframe widget does (#663) — a known transparent page
    // stays neutral (#642).
    const url = useActionUrl(action.url, dpId);
    const colorSchemeStyle = useIframeColorScheme(boxRef, undefined, url ?? undefined);

    if (!url) {
        return (
            <div
                className="flex flex-col items-center justify-center h-64 gap-2"
                style={{ color: 'var(--text-secondary)' }}
            >
                <MonitorDot size={32} strokeWidth={1} />
                <span className="text-xs">
                    {action.url && hasUrlPlaceholders(action.url)
                        ? 'Datenpunkt der URL hat keinen Wert'
                        : 'Keine URL konfiguriert'}
                </span>
            </div>
        );
    }

    const sandboxAttr = resolveSandboxAttr(
        action.sandboxPreset,
        action.sandboxCustom,
        action.sandbox ? 'extended' : 'off',
    );

    return (
        <div
            ref={boxRef}
            style={{
                width: fill ? '100%' : width ? `min(calc(100vw - 48px), ${width}px)` : 'min(88vw, 860px)',
                height: fill ? '100%' : height ? `min(calc(100dvh - 120px), ${height}px)` : 'min(80vh, 680px)',
                position: 'relative',
            }}
        >
            {timedOut && (
                <div
                    className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10"
                    style={{ background: 'var(--app-surface)', color: 'var(--text-secondary)' }}
                >
                    <AlertTriangle size={24} style={{ color: 'var(--accent-red, #ef4444)' }} />
                    <span className="text-sm">Seite konnte nicht geladen werden</span>
                    <span className="text-xs opacity-60">{url}</span>
                </div>
            )}
            <iframe
                src={url}
                sandbox={sandboxAttr}
                onLoad={() => setTimedOut(false)}
                onError={() => setTimedOut(true)}
                style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                    borderRadius: '0 0 var(--widget-radius) var(--widget-radius)',
                    ...colorSchemeStyle,
                }}
                title="Popup"
            />
        </div>
    );
}
