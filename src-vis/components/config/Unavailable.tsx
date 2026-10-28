import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';

/**
 * Shows settings that do not apply right now (e.g. not in the chart's current mode) greyed out with
 * the reason above, instead of hiding them: a setting that only appears after switching the mode
 * is one nobody finds (#869). Without a reason the children render untouched.
 *
 * A `<fieldset disabled>` rather than `pointer-events: none` so keyboard focus is blocked as well.
 */
export function Unavailable({
    reason,
    className,
    children,
}: {
    reason?: ReactNode;
    /** Layout of the greyed-out children (e.g. the parent's `space-y-*`, which the wrapper interrupts). */
    className?: string;
    children: ReactNode;
}) {
    if (!reason) return <>{children}</>;
    return (
        <div className="aura-cfg-unavailable">
            {/* Above, not below: a greyed block can be long, and the reason must be read first. */}
            <UnavailableReason reason={reason} />
            <fieldset disabled className={`m-0 p-0 border-0 min-w-0 ${className ?? ''}`} style={{ opacity: 0.45 }}>
                {children}
            </fieldset>
        </div>
    );
}

/** The reason line alone — for rows that grey out their own control (ToggleRow). */
export function UnavailableReason({ reason }: { reason: ReactNode }) {
    return (
        <p
            className="aura-cfg-unavailable-reason text-[10px] my-1 leading-tight flex gap-1"
            style={{ color: 'var(--text-secondary)' }}
        >
            <Lock size={10} className="shrink-0 mt-px" />
            <span>{reason}</span>
        </p>
    );
}
