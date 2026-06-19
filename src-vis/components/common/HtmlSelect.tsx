/**
 * HtmlSelect — a select-style dropdown whose options can render arbitrary
 * React content (text, <img> logos, sanitised HTML, icons), which a native
 * <select>/<option> cannot do.
 *
 * The open list is rendered into a portal (usePortalTarget) so it is not
 * clipped by the widget's overflow, positioned + viewport-clamped like the
 * PortalDropdown in WidgetFrame.tsx. Each option supplies a precomputed
 * `content` node so this component stays agnostic of how labels are rendered.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { usePortalTarget } from '../../contexts/PortalTargetContext';

export interface HtmlSelectEntry {
    value: string;
    content: React.ReactNode;
}

/**
 * Theme vars the portaled menu references (directly or via inheritance). They
 * are copied from the anchor's resolved style onto the portal panel so the menu
 * matches the widget's theme even when it portals into a differently-themed
 * scope (e.g. a per-layout theme is scoped to [data-aura-app="frontend"] while
 * the menu lands on document.body, which only carries the global :root theme).
 */
const THEME_VAR_NAMES = [
    '--app-bg',
    '--app-surface',
    '--app-border',
    '--widget-bg',
    '--widget-border',
    '--widget-radius',
    '--widget-shadow',
    '--text-primary',
    '--text-secondary',
    '--accent',
    '--accent-green',
    '--accent-yellow',
    '--accent-red',
] as const;

interface Props {
    entries: HtmlSelectEntry[];
    /** Currently selected entry value (''=none). */
    value: string;
    onPick: (value: string) => void;
}

export function HtmlSelect({ entries, value, onPick }: Props) {
    const [open, setOpen] = useState(false);
    const anchorRef = useRef<HTMLButtonElement>(null);

    const current = entries.find((e) => e.value === value);

    return (
        <div className="aura-widget-action relative inline-flex items-center" style={{ minWidth: 0 }}>
            <button
                ref={anchorRef}
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="nodrag text-xs rounded-lg pl-2.5 pr-7 py-1.5 focus:outline-none inline-flex items-center truncate"
                style={{
                    background: 'var(--app-bg)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--app-border)',
                    maxWidth: '100%',
                }}
            >
                {current ? current.content : <span style={{ color: 'var(--text-secondary)' }}>–</span>}
            </button>
            <ChevronDown
                size={12}
                className="absolute right-2 pointer-events-none"
                style={{ color: 'var(--text-secondary)' }}
            />
            {open && (
                <HtmlSelectMenu
                    anchorRef={anchorRef}
                    entries={entries}
                    value={value}
                    onClose={() => setOpen(false)}
                    onPick={(v) => {
                        onPick(v);
                        setOpen(false);
                    }}
                />
            )}
        </div>
    );
}

function HtmlSelectMenu({
    anchorRef,
    entries,
    value,
    onClose,
    onPick,
}: {
    anchorRef: React.RefObject<HTMLButtonElement>;
    entries: HtmlSelectEntry[];
    value: string;
    onClose: () => void;
    onPick: (value: string) => void;
}) {
    const portalTarget = usePortalTarget();
    const panelRef = useRef<HTMLDivElement>(null);

    // Position below the trigger, clamped into the viewport (flip up if needed).
    useLayoutEffect(() => {
        const panel = panelRef.current;
        const anchor = anchorRef.current;
        if (!panel || !anchor) return;

        // Inherit the widget's theme: copy the anchor's resolved CSS vars onto the
        // panel so var(--app-surface) etc. resolve to the same values the trigger
        // uses, regardless of which DOM scope the portal target lives in.
        const cs = getComputedStyle(anchor);
        for (const name of THEME_VAR_NAMES) {
            const v = cs.getPropertyValue(name).trim();
            if (v) panel.style.setProperty(name, v);
        }

        const panelRect = panel.getBoundingClientRect();
        const anchorRect = anchor.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const GAP = 4;

        let left = anchorRect.left;
        if (left + panelRect.width > vw - GAP) left = vw - GAP - panelRect.width;
        if (left < GAP) left = GAP;

        let top = anchorRect.bottom + GAP;
        if (top + panelRect.height > vh - GAP) top = anchorRect.top - panelRect.height - GAP;
        if (top < GAP) top = GAP;

        panel.style.top = `${top}px`;
        panel.style.left = `${left}px`;
        panel.style.minWidth = `${anchorRect.width}px`;
        panel.style.visibility = 'visible';
    });

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (
                anchorRef.current &&
                !anchorRef.current.contains(e.target as Node) &&
                panelRef.current &&
                !panelRef.current.contains(e.target as Node)
            ) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [anchorRef, onClose]);

    return createPortal(
        <div
            ref={panelRef}
            className="nodrag fixed z-[9999] rounded-lg shadow-2xl py-1 overflow-auto"
            style={{
                top: -9999,
                left: -9999,
                maxHeight: '60vh',
                background: 'var(--app-surface)',
                color: 'var(--text-primary)',
                border: '1px solid var(--app-border)',
                visibility: 'hidden',
            }}
            onMouseDown={(e) => e.stopPropagation()}
        >
            {entries.length === 0 && (
                <div className="px-3 py-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    –
                </div>
            )}
            {entries.map((e) => (
                <button
                    key={e.value}
                    type="button"
                    onClick={() => onPick(e.value)}
                    className="w-full text-left px-3 py-1.5 text-xs flex items-center hover:opacity-80"
                    style={{ background: e.value === value ? 'var(--app-bg)' : 'transparent' }}
                >
                    {e.content}
                </button>
            ))}
        </div>,
        portalTarget,
    );
}
