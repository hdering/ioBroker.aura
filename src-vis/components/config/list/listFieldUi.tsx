import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { ColorPicker } from '../../common/ColorPicker';

/**
 * Small field primitives shared by the static and the dynamic list config.
 * Both panels carried byte-identical copies of these before.
 */

/** Compact input styling used throughout the per-entry editors. */
export const ENTRY_INPUT_CLS = 'w-full text-[10px] rounded px-2 py-0.5 focus:outline-none';
export const ENTRY_INPUT_STYLE: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};

/**
 * Collapsible group for the list config panels. Both used to be flat walls of ~20
 * equal-weight blocks; this is the repo's usual `<details>`/`<summary>` pattern
 * (see StatusOverviewConfig) so the panel opens as a short, scannable outline.
 */
export function ConfigSection({
    title,
    defaultOpen,
    children,
}: {
    title: string;
    defaultOpen?: boolean;
    children: ReactNode;
}) {
    return (
        <details className="group pt-2" open={defaultOpen} style={{ borderTop: '1px solid var(--app-border)' }}>
            <summary className="flex items-center justify-between cursor-pointer list-none select-none">
                <span
                    className="text-[11px] font-semibold uppercase tracking-wide"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    {title}
                </span>
                <ChevronDown
                    size={13}
                    className="transition-transform group-open:rotate-180"
                    style={{ color: 'var(--text-secondary)' }}
                />
            </summary>
            <div className="space-y-2.5 mt-2.5">{children}</div>
        </details>
    );
}

/**
 * One labelled block of the entry detail pane. The pane used to be a flat run of
 * fields where it was impossible to tell which settings belonged to the chosen
 * display type and where the next topic started - these cards draw that line.
 *
 * Not collapsible on purpose: the point is to make things visible, not to hide them.
 */
export function DetailSection({
    title,
    badge,
    children,
}: {
    title: string;
    /** Small accent pill on the right, e.g. the currently chosen display type. */
    badge?: string;
    children: ReactNode;
}) {
    return (
        <section
            className="rounded-lg overflow-hidden"
            style={{ border: '1px solid var(--app-border)', background: 'var(--app-surface)' }}
        >
            <div
                className="flex items-center justify-between gap-2 px-2.5 py-1.5"
                style={{ borderBottom: '1px solid var(--app-border)' }}
            >
                <span
                    className="text-[10px] font-semibold uppercase tracking-wide"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    {title}
                </span>
                {badge && (
                    <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
                        style={{
                            background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                            color: 'var(--accent)',
                        }}
                    >
                        {badge}
                    </span>
                )}
            </div>
            <div className="p-2.5 space-y-1.5">{children}</div>
        </section>
    );
}

/**
 * Colour swatch with a reset affordance. An unset value shows a dash and falls
 * back to `fallback` in the picker, so "not configured" stays visible as such.
 */
export function ColorField({
    label,
    value,
    fallback,
    onChange,
}: {
    label: string;
    value: string | undefined;
    fallback: string;
    onChange: (v: string | undefined) => void;
}) {
    return (
        <div>
            <label className="text-[9px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                {label}
            </label>
            <div className="flex items-center gap-1">
                <ColorPicker
                    value={value?.match(/#[0-9a-fA-F]{6}/)?.[0] ?? fallback}
                    unset={!value}
                    onChange={(v) => onChange(v)}
                    className="w-7 h-6 rounded cursor-pointer shrink-0"
                    style={{ border: '1px solid var(--app-border)', padding: '1px' }}
                />
                {value ? (
                    <button
                        onClick={() => onChange(undefined)}
                        title="Zurücksetzen"
                        className="text-[9px] px-1.5 py-0.5 rounded hover:opacity-70"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--app-border)',
                        }}
                    >
                        Reset
                    </button>
                ) : (
                    <span className="text-[9px] opacity-60" style={{ color: 'var(--text-secondary)' }}>
                        —
                    </span>
                )}
            </div>
        </div>
    );
}

/**
 * Before issue #616 the row icon and the icon switch shared one `iconSize`. The switch
 * still falls back to it while `switchIconSize` is unset, so an entry saved back then
 * would shrink its switch as soon as the (newly reachable) row-icon field is used.
 * Patch the switch to the size it renders at right now, once, alongside that change.
 */
export function pinSwitchIconSize(
    entry: { iconSize?: number; switchIconSize?: number },
    isSwitch: boolean,
): { switchIconSize?: number } {
    return isSwitch && entry.switchIconSize === undefined && entry.iconSize !== undefined
        ? { switchIconSize: entry.iconSize }
        : {};
}
