/**
 * Panels Widget — horizontal swipeable slides, one widget per slide.
 *
 * Reuses the groupDefsStore to keep children (one WidgetConfig per slide). Each
 * slide fills the full viewport. Navigation: swipe / touch / mouse-drag,
 * pagination dots, prev/next arrows. Optional infinite loop + autoplay.
 *
 * This is the revived "slide-of-widgets" carousel, re-introduced as its own
 * widget type alongside the newer chip-strip 'carousel'.
 */
import { useEffect, useRef, useState } from 'react';
import { GalleryThumbnails, ChevronLeft, ChevronRight, Plus, Trash2, Loader } from 'lucide-react';
import type { WidgetProps, WidgetConfig, WidgetType } from '../../types';
import { WIDGET_BY_TYPE, WIDGET_REGISTRY } from '../../widgetRegistry';
import { WidgetFrame } from '../layout/WidgetFrame';
import { useT } from '../../i18n';
import { useGroupDefsStore, newGroupDefId } from '../../store/groupDefsStore';
import { getDragBridge, setDragBridge } from '../../utils/dragBridge';
import { getWidgetIcon } from '../../utils/widgetIconMap';

const SWIPE_THRESHOLD = 60; // px — minimum drag distance to trigger slide change

export function PanelsWidget({ config, editMode, onConfigChange }: WidgetProps) {
    const t = useT();

    // ── defId initialisation ────────────────────────────────────────────────
    // Mirrors GroupWidget: a stable temp defId (useRef) bridges the gap between
    // mount and the first onConfigChange round-trip. Persisted ONCE on mount via
    // useEffect — never re-seeded, so children can never end up under a defId the
    // saved dashboard doesn't reference.
    const tempDefIdRef = useRef<string | null>(null);
    const defId =
        (config.options?.defId as string | undefined) ??
        (() => {
            if (!tempDefIdRef.current) tempDefIdRef.current = newGroupDefId();
            return tempDefIdRef.current;
        })();

    // Persist the defId to aura-dashboard on first render if it wasn't saved yet.
    useEffect(() => {
        if (!config.options?.defId) {
            onConfigChange({ ...config, options: { ...config.options, defId } });
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const children = useGroupDefsStore((s) => s.defs[defId] ?? []);
    // Children hydrate from ioBroker after boot (can take a few seconds). Until
    // then an empty `children` means "still loading", not "genuinely empty" —
    // show a spinner instead of the empty hint in that window (mirrors GroupWidget).
    const defsHydrated = useGroupDefsStore((s) => s.hydrated);
    const isLoading = children.length === 0 && !defsHydrated;
    const setChildren = (next: WidgetConfig[]) => {
        useGroupDefsStore.getState().setDef(defId, next);
        // Defensive: also bump dashboard config so save flushes both keys together.
        // Without this, after a fresh widget add → save → reload cycle, the widget
        // can end up with options.defId set but the corresponding store entry empty
        // because aura-group-defs was saved before children were committed.
        if (config.options?.defId !== defId) {
            onConfigChange({ ...config, options: { ...config.options, defId } });
        }
    };

    // ── Options ──────────────────────────────────────────────────────────────
    const o = config.options ?? {};
    const transparent = !!o.transparent;
    const showTitle = o.showTitle !== false;
    const showIcon = o.showIcon !== false;
    const titleAlign = (o.titleAlign as string | undefined) ?? 'left';
    const iconSize = (o.iconSize as number | undefined) || 20;
    const WidgetIcon = getWidgetIcon(o.icon as string | undefined, GalleryThumbnails);
    const loop = !!o.loop;
    const showDots = o.showDots !== false;
    const showArrows = o.showArrows !== false;
    const autoplay = !!o.autoplay;
    const autoplayInterval = Math.max(1, (o.autoplayInterval as number | undefined) ?? 5);

    // ── State ────────────────────────────────────────────────────────────────
    const [active, setActive] = useState(0);
    const [dragOver, setDragOver] = useState(false);
    const [drag, setDrag] = useState<{ startX: number; dx: number } | null>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const [viewportW, setViewportW] = useState(0);
    // Auto-advance pauses while the user is interacting with the panel — hovering
    // with the mouse or keyboard-focused inside it. Without this, an autoplay tick
    // can fire mid-interaction and flip to the next slide right as the user clicks.
    const [paused, setPaused] = useState(false);

    // Clamp active index when children count drops
    useEffect(() => {
        if (active >= children.length && children.length > 0) setActive(children.length - 1);
        if (children.length === 0 && active !== 0) setActive(0);
    }, [children.length, active]);

    // Track viewport width for transform math
    useEffect(() => {
        const el = viewportRef.current;
        if (!el) return;
        const ro = new ResizeObserver(([e]) => setViewportW(Math.floor(e.contentRect.width)));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Autoplay — suspended while `paused` (pointer over / focus inside the panel).
    // Re-entering the effect on un-pause restarts the interval from zero, so the
    // next slide is always a full interval away from the user's last interaction.
    useEffect(() => {
        if (!autoplay || editMode || paused || children.length < 2) return;
        const iv = setInterval(() => {
            setActive((i) => {
                if (i + 1 < children.length) return i + 1;
                return loop ? 0 : i;
            });
        }, autoplayInterval * 1000);
        return () => clearInterval(iv);
    }, [autoplay, autoplayInterval, editMode, paused, children.length, loop]);

    // ── Navigation ───────────────────────────────────────────────────────────
    const goTo = (i: number) => {
        if (children.length === 0) return;
        if (loop) {
            const n = children.length;
            setActive(((i % n) + n) % n);
        } else {
            setActive(Math.max(0, Math.min(children.length - 1, i)));
        }
    };
    const prev = () => goTo(active - 1);
    const next = () => goTo(active + 1);

    // ── Pointer drag / swipe ─────────────────────────────────────────────────
    const onPointerDown = (e: React.PointerEvent) => {
        if (editMode || children.length < 2) return;
        // Only react to primary button / single-touch
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setDrag({ startX: e.clientX, dx: 0 });
    };
    const onPointerMove = (e: React.PointerEvent) => {
        if (!drag) return;
        setDrag({ ...drag, dx: e.clientX - drag.startX });
    };
    const onPointerUp = (e: React.PointerEvent) => {
        if (!drag) return;
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
        if (Math.abs(drag.dx) > SWIPE_THRESHOLD) {
            if (drag.dx < 0) next();
            else prev();
        }
        setDrag(null);
    };

    // ── Slide CRUD (editMode) ────────────────────────────────────────────────
    const addSlide = (type: WidgetType) => {
        const meta = WIDGET_BY_TYPE[type];
        const newChild: WidgetConfig = {
            id: `slide-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            type,
            title: meta?.label ?? 'Widget',
            datapoint: '',
            gridPos: { x: 0, y: children.length, w: meta?.defaultW ?? 4, h: meta?.defaultH ?? 4 },
            options: { icon: meta?.iconName },
        };
        setChildren([...children, newChild]);
        setActive(children.length);
    };

    const removeSlide = (id: string) => {
        const idx = children.findIndex((c) => c.id === id);
        const nextChildren = children.filter((c) => c.id !== id);
        setChildren(nextChildren);
        if (idx <= active && active > 0) setActive(active - 1);
    };

    const updateChild = (updated: WidgetConfig) =>
        setChildren(children.map((c) => (c.id === updated.id ? updated : c)));

    const duplicateChild = (child: WidgetConfig) => {
        const copy: WidgetConfig = {
            ...child,
            id: `slide-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        };
        setChildren([...children, copy]);
        setActive(children.length);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const bridge = getDragBridge();
        if (!bridge) return;
        const meta = WIDGET_BY_TYPE[bridge.widget.type as WidgetType];
        const newChild: WidgetConfig = {
            ...bridge.widget,
            id: `slide-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            gridPos: {
                x: 0,
                y: children.length,
                w: meta?.defaultW ?? bridge.widget.gridPos.w,
                h: meta?.defaultH ?? bridge.widget.gridPos.h,
            },
        };
        setChildren([...children, newChild]);
        setActive(children.length);
        bridge.remove(bridge.widget.id);
        setDragBridge(null);
    };

    const dragHandlers = editMode
        ? {
              onDragOver: (e: React.DragEvent) => {
                  if (getDragBridge()) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setDragOver(true);
                  }
              },
              onDragEnter: (e: React.DragEvent) => {
                  if (getDragBridge()) {
                      e.preventDefault();
                      setDragOver(true);
                  }
              },
              onDragLeave: (e: React.DragEvent) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
              },
              onDrop: handleDrop,
          }
        : {};

    // ── Title bar (always shown in editMode as outer-grid drag handle) ───────
    const titleBar =
        (showTitle && config.title) || editMode ? (
            <div
                className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 min-w-0"
                style={{
                    color: 'var(--text-secondary)',
                    borderBottom: transparent ? 'none' : '1px solid var(--widget-border)',
                    minHeight: editMode && !(showTitle && config.title) ? '36px' : undefined,
                }}
            >
                {showIcon && <WidgetIcon size={iconSize} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />}
                {showTitle && config.title && (
                    <span
                        className="text-xs font-semibold truncate flex-1 min-w-0"
                        style={{ textAlign: titleAlign as React.CSSProperties['textAlign'] }}
                    >
                        {config.title}
                    </span>
                )}
                {editMode && (
                    <span className="text-[10px] shrink-0 ml-auto" style={{ color: 'var(--text-secondary)' }}>
                        {children.length === 0 ? t('panels.noSlides') : `${active + 1} / ${children.length}`}
                    </span>
                )}
            </div>
        ) : null;

    const atFirst = active === 0;
    const atLast = active === children.length - 1;
    const canPrev = children.length > 1 && (loop || !atFirst);
    const canNext = children.length > 1 && (loop || !atLast);

    // ── Render ───────────────────────────────────────────────────────────────
    // Translate: active index * viewport width, plus live drag offset
    const liveOffset = drag?.dx ?? 0;
    const translateX = viewportW > 0 ? -(active * viewportW) + liveOffset : 0;

    return (
        <div
            className="aura-widget-row relative flex flex-col h-full"
            // Pause auto-advance while the user interacts: mouse over the panel, or
            // focus landing on any control inside it (onFocus/onBlur bubble from
            // children). editMode never autoplays, so the handlers are harmless there.
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={(e) => {
                // Only un-pause when focus leaves the panel entirely, not when it
                // moves between two controls inside it.
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setPaused(false);
            }}
            {...dragHandlers}
        >
            {dragOver && (
                <div
                    className="nodrag pointer-events-none absolute inset-0 z-20 rounded-[inherit] border-2 border-dashed flex items-center justify-center"
                    style={{
                        borderColor: 'var(--accent)',
                        background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                    }}
                >
                    <p className="text-sm font-medium" style={{ color: 'var(--accent)' }}>
                        {t('panels.dropHere')}
                    </p>
                </div>
            )}
            {titleBar}

            <div
                ref={viewportRef}
                className="relative flex-1 min-h-0 overflow-hidden"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                style={{
                    touchAction: 'pan-y',
                    cursor: !editMode && children.length > 1 ? (drag ? 'grabbing' : 'grab') : undefined,
                }}
            >
                {children.length === 0 ? (
                    <div
                        className="absolute inset-0 flex items-center justify-center gap-1.5"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        {isLoading ? (
                            <>
                                <Loader size={14} className="animate-spin" />
                                <span className="text-xs">{t('common.loading')}</span>
                            </>
                        ) : (
                            <p className="text-xs text-center">
                                {editMode ? t('panels.empty.editHint') : t('panels.empty.viewHint')}
                            </p>
                        )}
                    </div>
                ) : (
                    <div
                        className="absolute inset-0 flex"
                        style={{
                            transform: `translate3d(${translateX}px, 0, 0)`,
                            transition: drag ? 'none' : 'transform 280ms ease-out',
                            width: `${children.length * 100}%`,
                            // Keep the slide track promoted to its own compositor layer so
                            // each transition just moves an existing texture instead of
                            // re-rasterising every slide on each autoplay tick — the main
                            // source of jank on weaker tablets. backfaceVisibility nudges
                            // stubborn GPUs into actually creating the layer.
                            willChange: 'transform',
                            backfaceVisibility: 'hidden',
                        }}
                    >
                        {children.map((child) => (
                            <div
                                key={child.id}
                                className="relative shrink-0 p-1"
                                style={{
                                    width: viewportW || `${100 / Math.max(1, children.length)}%`,
                                    // Layout containment: a child widget resizing/ticking
                                    // can't reflow the sibling slides, so the track layer
                                    // stays valid through the whole transition.
                                    contain: 'layout',
                                }}
                            >
                                <WidgetFrame
                                    config={child}
                                    editMode={editMode}
                                    onRemove={removeSlide}
                                    onConfigChange={updateChild}
                                    onDuplicate={() => duplicateChild(child)}
                                />
                                {editMode && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeSlide(child.id);
                                        }}
                                        onPointerDown={(e) => e.stopPropagation()}
                                        className="nodrag absolute top-1.5 left-1.5 z-10 w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-80"
                                        title={t('panels.removeSlide')}
                                        style={{
                                            background: 'var(--app-bg)',
                                            color: 'var(--text-secondary)',
                                            border: '1px solid var(--app-border)',
                                        }}
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Arrows — also shown in editMode so user can navigate slides while editing */}
                {(editMode || showArrows) && canPrev && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            prev();
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="nodrag absolute left-1.5 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full z-10"
                        style={{
                            background: 'color-mix(in srgb, var(--app-bg) 80%, transparent)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--app-border)',
                        }}
                        aria-label={t('panels.prev')}
                    >
                        <ChevronLeft size={16} />
                    </button>
                )}
                {(editMode || showArrows) && canNext && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            next();
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="nodrag absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full z-10"
                        style={{
                            background: 'color-mix(in srgb, var(--app-bg) 80%, transparent)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--app-border)',
                        }}
                        aria-label={t('panels.next')}
                    >
                        <ChevronRight size={16} />
                    </button>
                )}
            </div>

            {/* Dots — clickable in both modes; nodrag so RGL doesn't swallow the click in editMode */}
            {(showDots || editMode) && children.length > 1 && (
                <div className="nodrag shrink-0 flex items-center justify-center gap-1.5 py-1.5">
                    {children.map((c, i) => (
                        <button
                            key={c.id}
                            onClick={(e) => {
                                e.stopPropagation();
                                setActive(i);
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="nodrag rounded-full transition-all"
                            style={{
                                width: i === active ? 16 : 6,
                                height: 6,
                                background: i === active ? 'var(--accent)' : 'var(--app-border)',
                                cursor: 'pointer',
                            }}
                            aria-label={`${t('panels.slide')} ${i + 1}`}
                        />
                    ))}
                </div>
            )}

            {/* Edit-mode: Add-slide picker */}
            {editMode && <PanelsAddPanel onAdd={addSlide} />}
        </div>
    );
}

// Every widget type that can live on a slide: all manually-addable types
// (excludes 'wizard-only' types like calendar) except the panels widget itself,
// sorted alphabetically by their displayed label. Derived from the registry so
// new widgets show up automatically — and stay sorted — without touching this file.
const PANEL_WIDGET_TYPES: WidgetType[] = WIDGET_REGISTRY.filter(
    (m) => m.addMode !== 'wizard-only' && m.type !== 'panels',
)
    .slice()
    .sort((a, b) => a.shortLabel.localeCompare(b.shortLabel, 'de'))
    .map((m) => m.type);

// ── Add-slide panel ─────────────────────────────────────────────────────────
function PanelsAddPanel({ onAdd }: { onAdd: (type: WidgetType) => void }) {
    const t = useT();
    const [open, setOpen] = useState(false);

    const types: WidgetType[] = PANEL_WIDGET_TYPES;

    if (!open) {
        return (
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setOpen(true);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="nodrag shrink-0 mx-2 mb-2 mt-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-xs"
                style={{
                    background: 'var(--app-bg)',
                    color: 'var(--text-secondary)',
                    border: '1px dashed var(--app-border)',
                }}
            >
                <Plus size={12} />
                {t('panels.addSlide')}
            </button>
        );
    }

    return (
        <div
            className="nodrag shrink-0 mx-2 mb-2 mt-1 p-2 rounded-md"
            style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
            onPointerDown={(e) => e.stopPropagation()}
        >
            <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    {t('panels.pickWidget')}
                </span>
                <button
                    onClick={() => setOpen(false)}
                    className="text-[11px]"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    ×
                </button>
            </div>
            <div className="flex flex-wrap gap-1">
                {types.map((type) => {
                    const meta = WIDGET_BY_TYPE[type];
                    if (!meta) return null;
                    const Icon = meta.Icon;
                    return (
                        <button
                            key={type}
                            onClick={(e) => {
                                e.stopPropagation();
                                onAdd(type);
                                setOpen(false);
                            }}
                            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] hover:opacity-80"
                            style={{
                                background: 'var(--widget-bg)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--app-border)',
                            }}
                            title={meta.hint}
                        >
                            <Icon size={12} style={{ color: meta.color }} />
                            {meta.shortLabel}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
