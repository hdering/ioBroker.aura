import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { usePortalTarget } from '../../contexts/PortalTargetContext';
import { OverlayZContext } from '../../contexts/OverlayZContext';
import { clampModalPos, usePersistedModalSize } from '../../utils/modalGeometry';

/**
 * Popup for sub-editors of a widget's options panel (battery assignment, name filters, …).
 * Portals into the app's portal target so it also works inside the fullscreen dashboard
 * container; CenteredModal from WidgetFrame is private, hence this shared variant.
 *
 * Draggable by its title bar. With `storageKey` it also gets a resize grip in the bottom
 * right corner and remembers its size across sessions — same convention as CenteredModal.
 */
export function ConfigModal({
    title,
    maxWidth,
    maxHeight,
    padded,
    storageKey,
    onClose,
    children,
}: {
    title?: string;
    maxWidth?: number;
    /** Default height cap in px. Omitted = nearly full height (for page-sized content). */
    maxHeight?: number;
    /** Adds inner padding — needed for plain content, not for pages that pad themselves. */
    padded?: boolean;
    /** Enables resizing and persists width/height in localStorage under this key. */
    storageKey?: string;
    onClose: () => void;
    children: React.ReactNode;
}) {
    const portalTarget = usePortalTarget();
    const panelRef = useRef<HTMLDivElement>(null);
    // null = stay centered via CSS; once dragged, holds an absolute pixel position.
    const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
    const dragOrigin = useRef<{ mx: number; my: number; rx: number; ry: number } | null>(null);

    const [size, setSize] = usePersistedModalSize(storageKey);
    const resizeOrigin = useRef<{ mx: number; my: number; w: number; h: number } | null>(null);

    // A dialog left open across a resolution change must stay grabbable.
    useEffect(() => {
        const onResize = () => setPos((p) => (p ? clampModalPos(p, panelRef.current) : p));
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // Capture phase + stopPropagation: CenteredModal (the widget edit dialog that
    // usually sits below us) listens for Escape on `document` in the bubble phase.
    // Without this, one Escape closes both layers at once.
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            onClose();
        };
        document.addEventListener('keydown', handler, true);
        return () => document.removeEventListener('keydown', handler, true);
    }, [onClose]);

    const onHeaderMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const rect = panelRef.current?.getBoundingClientRect();
        if (!rect) return;
        dragOrigin.current = { mx: e.clientX, my: e.clientY, rx: rect.left, ry: rect.top };

        const onMove = (ev: MouseEvent) => {
            const o = dragOrigin.current;
            if (!o) return;
            // Keep the title bar on screen — a modal dragged fully off would be unreachable.
            setPos(clampModalPos({ x: o.rx + ev.clientX - o.mx, y: o.ry + ev.clientY - o.my }, panelRef.current));
        };
        const onUp = () => {
            dragOrigin.current = null;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    const onResizeMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0 || !storageKey) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = panelRef.current?.getBoundingClientRect();
        if (!rect) return;
        resizeOrigin.current = { mx: e.clientX, my: e.clientY, w: rect.width, h: rect.height };

        const onMove = (ev: MouseEvent) => {
            const o = resizeOrigin.current;
            if (!o) return;
            const maxW = Math.max(320, window.innerWidth - 20);
            const maxH = Math.max(240, window.innerHeight - 20);
            setSize({
                w: Math.round(Math.min(maxW, Math.max(320, o.w + ev.clientX - o.mx))),
                h: Math.round(Math.min(maxH, Math.max(240, o.h + ev.clientY - o.my))),
            });
        };
        const onUp = () => {
            resizeOrigin.current = null;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    const posStyle: React.CSSProperties = pos
        ? { left: pos.x, top: pos.y, transform: 'none' }
        : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };

    return createPortal(
        <div className="fixed inset-0" style={{ zIndex: 10000 }}>
            <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)' }} onMouseDown={onClose} />
            <div
                ref={panelRef}
                className="aura-config-modal fixed rounded-xl shadow-2xl flex flex-col overflow-hidden"
                style={{
                    width: size ? size.w : `min(${maxWidth ?? 1100}px, calc(100vw - 24px))`,
                    height: size
                        ? size.h
                        : maxHeight
                          ? `min(${maxHeight}px, calc(100vh - 24px))`
                          : 'min(94vh, calc(100vh - 24px))',
                    background: 'var(--app-surface)',
                    border: '1px solid var(--app-border)',
                    ...posStyle,
                }}
            >
                {/* Fixed top bar: drag handle, and the close button stays visible while scrolling. */}
                <div
                    className="shrink-0 flex items-center justify-between gap-2 px-3 py-2 cursor-move select-none"
                    style={{ borderBottom: '1px solid var(--app-border)' }}
                    onMouseDown={onHeaderMouseDown}
                >
                    <span className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {title ?? ''}
                    </span>
                    <button
                        onClick={onClose}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:opacity-80 shrink-0"
                        style={{
                            background: 'var(--app-bg)',
                            border: '1px solid var(--app-border)',
                            color: 'var(--text-secondary)',
                        }}
                        title="Schließen"
                    >
                        <X size={16} />
                    </button>
                </div>
                {/* Leaf pickers (colour, icon) opened from this content must clear our
                    backdrop - see contexts/OverlayZContext for the tier map. */}
                <div className={`aura-scroll flex-1 min-h-0 overflow-auto${padded ? ' p-3' : ''}`}>
                    <OverlayZContext.Provider value={10040}>{children}</OverlayZContext.Provider>
                </div>
                {storageKey && (
                    <div
                        onMouseDown={onResizeMouseDown}
                        title="Größe ändern"
                        className="absolute bottom-0 right-0 cursor-nwse-resize select-none"
                        style={{
                            // 20px: the panel's rounded corner clips the outermost few pixels,
                            // so a 16px grip would have a dead zone exactly where users aim.
                            width: 20,
                            height: 20,
                            background:
                                'linear-gradient(135deg, transparent 0%, transparent 45%, var(--text-secondary) 45%, var(--text-secondary) 55%, transparent 55%, transparent 70%, var(--text-secondary) 70%, var(--text-secondary) 80%, transparent 80%)',
                            opacity: 0.5,
                            borderBottomRightRadius: 12,
                        }}
                    />
                )}
            </div>
        </div>,
        portalTarget ?? document.body,
    );
}
