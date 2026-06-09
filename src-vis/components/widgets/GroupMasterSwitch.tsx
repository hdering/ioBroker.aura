/**
 * GroupMasterSwitch — tri-state toggle that reflects and controls the combined
 * state of several datapoints. Knob sits left (all off), centred + amber
 * (mixed) or right + green (all on). Renders nothing when there is nothing to
 * control (aggregate === 'none').
 */
import type { GroupAggregate } from '../../hooks/useGroupControl';

interface Props {
    aggregate: GroupAggregate;
    onToggle: () => void;
    /** Tooltip / aria-label, e.g. "3/7". */
    title?: string;
    className?: string;
}

export function GroupMasterSwitch({ aggregate, onToggle, title, className = '' }: Props) {
    if (aggregate === 'none') return null;
    const on = aggregate === 'on';
    const mixed = aggregate === 'mixed';
    const bg = on ? 'var(--accent-green)' : mixed ? 'var(--accent-yellow)' : 'var(--app-border)';
    const knobLeft = on ? 'calc(100% - 16px)' : mixed ? 'calc(50% - 7px)' : '2px';

    return (
        <button
            onClick={(e) => {
                e.stopPropagation();
                onToggle();
            }}
            className={`aura-widget-action nodrag shrink-0 relative w-9 h-[18px] rounded-full transition-colors ${className}`}
            style={{ background: bg }}
            title={title}
            aria-label={title}
        >
            <span
                className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-all"
                style={{ left: knobLeft }}
            />
        </button>
    );
}
