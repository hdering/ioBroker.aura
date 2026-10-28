import { AlertTriangle } from 'lucide-react';
import { useT } from '../../i18n';

/**
 * The history adapter's error, shown on a chart instead of an empty or flat curve. `block` fills an
 * empty plot area; `badge` sits in its corner while older data is still drawn.
 */
export function HistoryErrorNote({ message, variant }: { message: string; variant: 'block' | 'badge' }) {
    const t = useT();
    if (variant === 'badge') {
        return (
            <div
                className="aura-history-error absolute bottom-1 left-1 z-10 flex items-center gap-1 max-w-[90%] px-1.5 py-0.5 rounded text-[10px] pointer-events-auto"
                style={{
                    background: 'var(--app-bg)',
                    color: 'var(--accent-red)',
                    border: '1px solid var(--app-border)',
                }}
                title={message}
            >
                <AlertTriangle size={11} className="shrink-0" />
                <span className="truncate">{t('echart.historyError')}</span>
            </div>
        );
    }
    return (
        <div
            className="aura-history-error absolute inset-0 flex flex-col items-center justify-center gap-1 px-3 text-center"
            title={message}
        >
            <AlertTriangle size={24} strokeWidth={1.5} style={{ color: 'var(--accent-red)' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--accent-red)' }}>
                {t('echart.historyError')}
            </span>
            <span className="text-xs line-clamp-3 break-words" style={{ color: 'var(--text-secondary)' }}>
                {message}
            </span>
        </div>
    );
}
