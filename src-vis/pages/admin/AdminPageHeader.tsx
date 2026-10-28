import type { ReactNode } from 'react';

/**
 * Outer padding and block gap of every admin page (not the dashboard editor). One
 * value so the heading sits at the same spot and the content starts at the same
 * distance below it, whichever menu entry is open.
 */
export const ADMIN_PAGE_CLASS = 'p-4 sm:p-6 space-y-6';

/** Page heading of an admin page — same size on every page. */
export function AdminPageTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
    return (
        <h1 className={`text-xl font-bold ${className}`.trim()} style={{ color: 'var(--text-primary)' }}>
            {children}
        </h1>
    );
}

/** One-line description under {@link AdminPageTitle}. */
export function AdminPageSubtitle({ children }: { children: ReactNode }) {
    return (
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {children}
        </p>
    );
}
