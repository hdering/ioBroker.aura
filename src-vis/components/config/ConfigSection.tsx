import { useRef, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/** Heading style shared by every section of the widget edit dialog (folded or flat). */
export const SECTION_TITLE_CLS = 'text-[11px] font-semibold uppercase tracking-wide';

/**
 * Collapsible section of the widget edit dialog — the repo's usual `<details>`/`<summary>`
 * pattern (see docs-internal/widget-config-template.md). Starts folded unless `defaultOpen`,
 * so a long panel opens as a short, scannable outline.
 */
export function ConfigSection({
    title,
    defaultOpen,
    action,
    sectionKey,
    count,
    children,
}: {
    title: string;
    defaultOpen?: boolean;
    /** Control in the header (e.g. "+ Marker"). Using it opens the section instead of toggling it. */
    action?: ReactNode;
    /** Stable hook for tests: rendered as `data-aura-config-section`. */
    sectionKey?: string;
    /** Small summary next to the title, e.g. "5/7" visible fields. */
    count?: string;
    children: ReactNode;
}) {
    const ref = useRef<HTMLDetailsElement>(null);
    return (
        <details
            ref={ref}
            className="group pt-2"
            open={defaultOpen}
            data-aura-config-section={sectionKey}
            style={{ borderTop: '1px solid var(--app-border)' }}
        >
            <summary className="flex items-center justify-between gap-2 cursor-pointer list-none select-none">
                <span className="flex items-baseline gap-1.5 min-w-0">
                    <span className={SECTION_TITLE_CLS} style={{ color: 'var(--text-secondary)' }}>
                        {title}
                    </span>
                    {count && (
                        <span
                            className="text-[10px] tabular-nums"
                            style={{ color: 'var(--text-secondary)', opacity: 0.6 }}
                        >
                            {count}
                        </span>
                    )}
                </span>
                <span className="flex items-center gap-2">
                    {action && (
                        // A click inside <summary> would toggle the section — keep it open instead,
                        // so whatever the action adds is visible right away.
                        <span
                            onClick={(e) => {
                                e.preventDefault();
                                if (ref.current) ref.current.open = true;
                            }}
                        >
                            {action}
                        </span>
                    )}
                    <ChevronDown
                        size={13}
                        className="transition-transform group-open:rotate-180"
                        style={{ color: 'var(--text-secondary)' }}
                    />
                </span>
            </summary>
            <div className="space-y-2.5 mt-2.5">{children}</div>
        </details>
    );
}

/** The same section, not collapsible — for short widget blocks that stay flat. */
export function FlatSection({
    title,
    sectionKey,
    children,
}: {
    title: string;
    sectionKey?: string;
    children: ReactNode;
}) {
    return (
        <div
            className="pt-2"
            data-aura-config-section={sectionKey}
            style={{ borderTop: '1px solid var(--app-border)' }}
        >
            <p className={SECTION_TITLE_CLS} style={{ color: 'var(--text-secondary)' }}>
                {title}
            </p>
            <div className="space-y-2.5 mt-2.5">{children}</div>
        </div>
    );
}
