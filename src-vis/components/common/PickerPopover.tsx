/**
 * The shell shared by every picker this app draws itself — the hour/minute list
 * in {@link DateTimeInput} and the parts list in {@link PatternInput}.
 *
 * Portaled like HtmlSelect so a widget's overflow cannot clip the panel, clamped
 * into the viewport, and seeded with the anchor's theme variables: the portal
 * target usually lands outside the scope that defines them.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Clock } from 'lucide-react';
import { usePortalTarget } from '../../contexts/PortalTargetContext';

/** Room reserved at the right edge of a field for the picker button. */
export const PICKER_BTN_SPACE = 22;

const THEME_VAR_NAMES = [
    '--app-bg',
    '--app-surface',
    '--app-border',
    '--text-primary',
    '--text-secondary',
    '--accent',
] as const;

/** The button we draw into a field wherever the engine offers none of its own. */
export function PickerButton({
    icon,
    onOpen,
    btnRef,
}: {
    icon: 'date' | 'time';
    onOpen: () => void;
    btnRef?: React.RefObject<HTMLButtonElement>;
}) {
    const Icon = icon === 'time' ? Clock : CalendarDays;
    return (
        <button
            ref={btnRef}
            type="button"
            // The field itself is the keyboard path; a second tab stop that only
            // opens a mouse/touch picker would just be in the way.
            tabIndex={-1}
            aria-label="Auswahl öffnen"
            title="Auswahl öffnen"
            className="aura-widget-action nodrag"
            onClick={(e) => {
                e.stopPropagation();
                onOpen();
            }}
            style={{
                position: 'absolute',
                right: 5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'none',
                border: 0,
                padding: 0,
                lineHeight: 0,
                cursor: 'pointer',
                color: 'var(--text-primary)',
                opacity: 0.6,
            }}
        >
            <Icon size={13} />
        </button>
    );
}

export function PickerPopover({
    anchorRef,
    onClose,
    children,
}: {
    anchorRef: React.RefObject<HTMLElement>;
    onClose: () => void;
    children: React.ReactNode;
}) {
    const portalTarget = usePortalTarget();
    const panelRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const panel = panelRef.current;
        const anchor = anchorRef.current;
        if (!panel || !anchor) return;

        // Inherit the widget's theme even when the portal lands in another scope.
        const cs = getComputedStyle(anchor);
        for (const name of THEME_VAR_NAMES) {
            const v = cs.getPropertyValue(name).trim();
            if (v) panel.style.setProperty(name, v);
        }

        const p = panel.getBoundingClientRect();
        const a = anchor.getBoundingClientRect();
        const GAP = 4;
        let left = a.right - p.width;
        if (left + p.width > window.innerWidth - GAP) left = window.innerWidth - GAP - p.width;
        if (left < GAP) left = GAP;
        let top = a.bottom + GAP;
        if (top + p.height > window.innerHeight - GAP) top = a.top - p.height - GAP;
        if (top < GAP) top = GAP;
        panel.style.top = `${top}px`;
        panel.style.left = `${left}px`;
        panel.style.visibility = 'visible';
    }, [anchorRef]);

    useEffect(() => {
        const away = (e: MouseEvent) => {
            if (!panelRef.current?.contains(e.target as Node) && !anchorRef.current?.contains(e.target as Node)) {
                onClose();
            }
        };
        const key = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('mousedown', away);
        document.addEventListener('keydown', key);
        return () => {
            document.removeEventListener('mousedown', away);
            document.removeEventListener('keydown', key);
        };
    }, [anchorRef, onClose]);

    return createPortal(
        <div
            ref={panelRef}
            className="nodrag fixed z-[9999] rounded-lg shadow-2xl flex"
            style={{
                top: -9999,
                left: -9999,
                visibility: 'hidden',
                background: 'var(--app-surface)',
                border: '1px solid var(--app-border)',
                overflow: 'hidden',
            }}
            onMouseDown={(e) => e.stopPropagation()}
        >
            {children}
        </div>,
        portalTarget,
    );
}

export interface PickerItem {
    /** What a click reports back. */
    value: string;
    /** What the entry reads as — `yy` shows two digits for the same year. */
    label: string;
}

/** One scrollable column of a picker panel; the selected entry scrolls to the middle. */
export function PickerColumn({
    items,
    current,
    onSelect,
    label,
    divider = false,
}: {
    items: PickerItem[];
    current: string;
    onSelect: (value: string) => void;
    label: string;
    /** Hairline in front of the column — every column but the first. */
    divider?: boolean;
}) {
    const colRef = useRef<HTMLDivElement>(null);

    // Open on the current entry. Set outright rather than via scrollIntoView():
    // that walks up the ancestors and would scroll whatever sits behind the
    // panel too, and with several columns it does not settle where it should.
    useLayoutEffect(() => {
        const col = colRef.current;
        const sel = col?.querySelector<HTMLElement>('[data-sel="1"]');
        if (col && sel) col.scrollTop = sel.offsetTop - (col.clientHeight - sel.offsetHeight) / 2;
        // Only on open — a later pick must not yank a list the user just scrolled.
    }, []);

    return (
        <>
            {divider && <div style={{ width: 1, background: 'var(--app-border)' }} />}
            <div
                ref={colRef}
                className="overflow-y-auto"
                // Its own offset parent, so an entry's offsetTop is its place in the list.
                style={{ maxHeight: 176, scrollbarWidth: 'thin', position: 'relative' }}
                aria-label={label}
            >
                {items.map((it) => {
                    const sel = it.value === current;
                    return (
                        <button
                            key={it.value}
                            type="button"
                            data-sel={sel ? '1' : '0'}
                            onClick={() => onSelect(it.value)}
                            className="block w-full text-center px-3 py-1 text-xs hover:opacity-80"
                            style={{
                                background: sel ? 'var(--accent)' : 'transparent',
                                color: sel ? '#fff' : 'var(--text-primary)',
                            }}
                        >
                            {it.label}
                        </button>
                    );
                })}
            </div>
        </>
    );
}
