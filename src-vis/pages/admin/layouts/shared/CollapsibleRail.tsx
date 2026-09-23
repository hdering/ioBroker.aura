import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface CollapsibleRailProps {
    testId: string;
    /** Rail name, shown in the phone bar (the rail's own heading sits inside `children`). */
    title: string;
    /** What is selected in the rail — the bar names it while the rail is folded. */
    current: React.ReactNode;
    children: React.ReactNode;
}

/**
 * Left rail of the Layouts and Design pages. Beside the detail (md and up) it is
 * always open; on a phone it stands above the detail, so it folds into a bar that
 * names the selection and folds again once a row in it is picked.
 */
export function CollapsibleRail({ testId, title, current, children }: CollapsibleRailProps) {
    const [open, setOpen] = useState(false);
    return (
        <aside
            data-testid={testId}
            className="md:sticky md:top-0 self-start rounded-xl p-2 space-y-1"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
            <button
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                data-testid={`${testId}-toggle`}
                className="md:hidden w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm"
                style={{ color: 'var(--text-primary)' }}
            >
                <span
                    className="shrink-0 text-[10px] uppercase tracking-widest font-semibold"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    {title}
                </span>
                {!open && <span className="flex items-center gap-1.5 min-w-0 font-medium truncate">{current}</span>}
                <ChevronDown
                    size={14}
                    className="ml-auto shrink-0 transition-transform"
                    style={{ color: 'var(--text-secondary)', transform: open ? 'rotate(180deg)' : undefined }}
                />
            </button>
            <div
                className={`space-y-1 ${open ? '' : 'hidden'} md:block`}
                // Picking a row is the end of the detour on a phone; on md+ the bar is hidden anyway.
                onClick={(e) => {
                    if ((e.target as HTMLElement).closest('button')) setOpen(false);
                }}
            >
                {children}
            </div>
        </aside>
    );
}
