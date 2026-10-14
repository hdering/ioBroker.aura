import type { CSSProperties } from 'react';
import { POPUP_COUNTDOWN_POSITIONS, type PopupCountdownPosition } from '../../store/popupConfigStore';

const LABELS: Record<PopupCountdownPosition, string> = {
    off: 'aus',
    'top-left': 'oben links',
    'top-right': 'oben rechts',
    'bottom-left': 'unten links',
    'bottom-right': 'unten rechts',
};

interface Props {
    value: PopupCountdownPosition | undefined;
    onChange: (pos: PopupCountdownPosition | undefined) => void;
    /** Label of the empty entry (inherit the next level). Without it 'aus' is the empty state. */
    inheritLabel?: string;
    className?: string;
    style?: CSSProperties;
}

/** Corner of the popup where the auto-close countdown is shown. Empty = inherit. */
export function PopupCountdownSelect({ value, onChange, inheritLabel, className, style }: Props) {
    const options = inheritLabel ? POPUP_COUNTDOWN_POSITIONS : POPUP_COUNTDOWN_POSITIONS.filter((p) => p !== 'off');
    return (
        <select
            value={value ?? ''}
            onChange={(e) => onChange((e.target.value || undefined) as PopupCountdownPosition | undefined)}
            className={className}
            style={style}
        >
            <option value="">{inheritLabel ?? LABELS.off}</option>
            {options.map((p) => (
                <option key={p} value={p}>
                    {LABELS[p]}
                </option>
            ))}
        </select>
    );
}
