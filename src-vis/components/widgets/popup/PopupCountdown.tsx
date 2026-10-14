import { useEffect, useState, type CSSProperties, type MutableRefObject } from 'react';
import { Timer } from 'lucide-react';
import type { PopupCountdownPosition } from '../../../types';
import { DEFAULT_POPUP_BORDER } from '../../../store/popupConfigStore';

/** Corner offsets. Top-right sits left of the close button (top-2.5 right-2.5, w-7). */
const CORNER_STYLE: Record<Exclude<PopupCountdownPosition, 'off'>, CSSProperties> = {
    'top-left': { top: 10, left: 10 },
    'top-right': { top: 10, right: 46 },
    'bottom-left': { bottom: 10, left: 10 },
    'bottom-right': { bottom: 10, right: 10 },
};

interface Props {
    position: Exclude<PopupCountdownPosition, 'off'>;
    /** Epoch ms of the pending auto-close; the popup re-arms it on activity. */
    deadlineRef: MutableRefObject<number>;
}

/**
 * Seconds left until the popup closes itself. Ticks on its own so the popup body
 * does not re-render every second; reads the deadline from a ref because activity
 * inside the popup pushes it back on every pointer move.
 */
export function PopupCountdown({ position, deadlineRef }: Props) {
    const secondsLeft = () => Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
    const [left, setLeft] = useState(secondsLeft);
    useEffect(() => {
        const id = window.setInterval(() => setLeft(secondsLeft()), 200);
        return () => window.clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div
            className={`aura-popup-countdown aura-popup-countdown--${position} absolute z-20 h-7 px-2 flex items-center gap-1 rounded-lg text-xs tabular-nums pointer-events-none`}
            data-aura-popup-countdown={position}
            style={{
                ...CORNER_STYLE[position],
                color: 'var(--popup-countdown-color, var(--text-secondary))',
                background: 'var(--popup-countdown-bg, var(--app-bg))',
                border: `1px solid var(--popup-countdown-border, ${DEFAULT_POPUP_BORDER})`,
            }}
        >
            <Timer size={12} className="aura-popup-countdown-icon" />
            <span className="aura-popup-countdown-value">{left} s</span>
        </div>
    );
}
