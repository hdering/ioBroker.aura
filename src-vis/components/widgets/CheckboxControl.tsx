/**
 * CheckboxControl — the checkbox alternative to the slide toggle (issue #683).
 *
 * Every place that draws an on/off toggle for a datapoint (Schalter widget, Dimmer,
 * list rows, custom-layout cells, the group master switch) offers this shape as an
 * option. The box is exactly as tall as the toggle it replaces, so a layout keeps
 * its height when the style changes and no widget metric has to be re-measured.
 *
 * Colours follow the same theme tokens as the toggle: the checked fill is the "on"
 * track (`--switch-bg`), the border the switch border, the glyph the thumb colour.
 * A caller may pass its own active colour (list rows paint with `activeColor`).
 */
import { forwardRef, type CSSProperties, type MouseEvent } from 'react';
import { Check, Minus } from 'lucide-react';

export interface CheckboxControlProps {
    checked: boolean;
    /** Tri-state for the group master: some targets on, some off. Drawn as a dash. */
    mixed?: boolean;
    onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
    /** Edge length in px. Default 20. */
    size?: number;
    /** Fill in the checked state. Default: the theme's "on" track colour. */
    color?: string;
    /** Fill in the mixed state. Default: the theme's warning colour. */
    mixedColor?: string;
    /** False draws the box without pointer handling (read-only rows). Default true. */
    writable?: boolean;
    className?: string;
    style?: CSSProperties;
    title?: string;
    'aria-label'?: string;
}

export const CheckboxControl = forwardRef<HTMLButtonElement, CheckboxControlProps>(function CheckboxControl(
    {
        checked,
        mixed = false,
        onClick,
        size = 20,
        color,
        mixedColor,
        writable = true,
        className = '',
        style,
        title,
        'aria-label': ariaLabel,
    },
    ref,
) {
    const filled = checked || mixed;
    const fill = mixed ? (mixedColor ?? 'var(--accent-yellow)') : (color ?? 'var(--switch-bg, var(--accent-green))');
    const stateCls = mixed ? 'aura-checkbox-mixed' : checked ? 'aura-checkbox-on' : '';
    const Glyph = mixed ? Minus : Check;
    return (
        <button
            ref={ref}
            type="button"
            role="checkbox"
            aria-checked={mixed ? 'mixed' : checked}
            aria-label={ariaLabel}
            title={title}
            onClick={writable ? onClick : undefined}
            className={`aura-checkbox ${stateCls} shrink-0 flex items-center justify-center transition-colors ${writable ? '' : 'pointer-events-none'} ${className}`}
            style={{
                width: size,
                height: size,
                borderRadius: Math.max(3, Math.round(size / 5)),
                background: filled ? fill : 'transparent',
                border: `2px solid ${filled ? fill : 'var(--switch-border, var(--app-border))'}`,
                color: 'var(--switch-thumb-color, #fff)',
                cursor: writable ? 'pointer' : 'default',
                padding: 0,
                ...style,
            }}
        >
            {filled && <Glyph size={Math.round(size * 0.7)} strokeWidth={3} />}
        </button>
    );
});
