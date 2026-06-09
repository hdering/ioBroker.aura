import { ImageIcon } from 'lucide-react';
import { useDatapoint } from '../../../hooks/useDatapoint';
import type { ClickAction } from '../../../types';

interface Props {
    action: Extract<ClickAction, { kind: 'popup-image' }>;
}

export function ImagePopupBody({ action }: Props) {
    const { value: dpValue } = useDatapoint(action.dp ?? '');

    const src = (() => {
        if (action.dp && dpValue != null) {
            const str = String(dpValue);
            if (!str) return '';
            if (
                str.startsWith('data:') ||
                str.startsWith('http://') ||
                str.startsWith('https://') ||
                str.startsWith('/')
            )
                return str;
            return `data:image/jpeg;base64,${str}`;
        }
        return action.url ?? '';
    })();

    if (!src) {
        return (
            <div
                className="flex flex-col items-center justify-center h-48 gap-2"
                style={{ color: 'var(--text-secondary)' }}
            >
                <ImageIcon size={32} strokeWidth={1} />
                <span className="text-xs">Keine Bild-URL konfiguriert</span>
            </div>
        );
    }

    return (
        <div className="flex items-center justify-center p-2">
            <img
                src={src}
                alt=""
                style={{
                    maxWidth: '100%',
                    maxHeight: '70vh',
                    objectFit: action.fit ?? 'contain',
                    borderRadius: 'var(--widget-radius)',
                }}
            />
        </div>
    );
}
