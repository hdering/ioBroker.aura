/**
 * GroupMasterSwitch — tri-state toggle that reflects and controls the combined
 * state of several datapoints. Knob sits left (all off), centred + amber
 * (mixed) or right + green (all on).
 *
 * When there is nothing to control (aggregate === 'none') it renders nothing in
 * the live frontend, but in the editor (editing=true) it shows a greyed-out
 * dashed placeholder so the configurer sees where the switch will appear once
 * controllable datapoints are added.
 */
import type { GroupAggregate } from '../../hooks/useGroupControl';

interface Props {
    aggregate: GroupAggregate;
    onToggle: () => void;
    /** Tooltip / aria-label for the active switch, e.g. "3/7". */
    title?: string;
    className?: string;
    /** True in the dashboard editor — enables the empty-state placeholder. */
    editing?: boolean;
    /** Tooltip shown on the editor placeholder when there is nothing to control yet. */
    placeholderHint?: string;
}

export function GroupMasterSwitch({
    aggregate,
    onToggle,
    title,
    className = '',
    editing = false,
    placeholderHint,
}: Props) {
    if (aggregate === 'none') {
        if (!editing) return null;
        // Editor-only placeholder: dashed, muted, non-interactive — signals that
        // the master switch is enabled and will appear once controllable DPs exist.
        return (
            <span
                className={`nodrag shrink-0 relative w-9 h-[18px] rounded-full ${className}`}
                style={{ background: 'transparent', border: '1px dashed var(--app-border)', opacity: 0.6 }}
                title={placeholderHint}
                aria-hidden
            >
                <span
                    className="absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full"
                    style={{ background: 'var(--app-border)' }}
                />
            </span>
        );
    }
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
