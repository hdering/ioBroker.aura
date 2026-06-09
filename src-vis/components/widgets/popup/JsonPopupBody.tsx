import { useDatapoint } from '../../../hooks/useDatapoint';
import type { ClickAction } from '../../../types';

interface Props {
    action: Extract<ClickAction, { kind: 'popup-json' }>;
}

function prettyJson(raw: string): string {
    try {
        return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
        return raw;
    }
}

export function JsonPopupBody({ action }: Props) {
    const { value: dpValue } = useDatapoint(action.dp ?? '');

    const raw = (() => {
        if (action.dp && dpValue != null) return String(dpValue);
        return action.json ?? '';
    })();

    const pretty = prettyJson(raw);

    return (
        <div style={{ maxHeight: '65vh', overflow: 'auto' }}>
            <pre
                className="text-xs p-4 rounded-lg"
                style={{
                    background: 'var(--app-bg)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--app-border)',
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    margin: 0,
                }}
            >
                {pretty || '(kein Inhalt)'}
            </pre>
        </div>
    );
}
