import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactGridLayout from 'react-grid-layout/legacy';
import { X } from 'lucide-react';
import { useDashboardStore, useActiveLayout } from '../../store/dashboardStore';
import { useGroupDefsStore } from '../../store/groupDefsStore';
import { useIframeStore, type IframeFullscreenData } from '../../store/iframeStore';
import { WidgetFrame } from './WidgetFrame';
import { useReflowHiddenIds, useConditionReflowIds } from '../../hooks/useConditionStyle';
import { useEffectiveSettings } from '../../hooks/useEffectiveSettings';
import { ActiveLayoutContext } from '../../contexts/ActiveLayoutContext';
import { DashboardMobileContext } from '../../contexts/DashboardMobileContext';
import type { WidgetConfig } from '../../types';
import type { Tab } from '../../store/dashboardStore';
import { useT } from '../../i18n';
import { getDragBridge, setDragBridge } from '../../utils/dragBridge';
import { verticalCompact } from '../../utils/gridCompact';

// Default gap — overridden by config at runtime
const DEFAULT_MARGIN = 10;

interface DashboardProps {
    readonly?: boolean;
    editMode?: boolean;
    onLayoutChange?: (widgets: WidgetConfig[]) => void;
    /** Override tabs for frontend readonly view (specific layout by slug) */
    viewTabs?: Tab[];
    viewActiveTabId?: string;
    /** Layout ID for per-layout settings resolution. If omitted, uses activeLayout.id (admin editor). */
    layoutId?: string;
}

export function Dashboard({
    readonly = false,
    editMode = false,
    onLayoutChange,
    viewTabs,
    viewActiveTabId,
    layoutId,
}: DashboardProps) {
    const t = useT();
    const activeLayout = useActiveLayout();
    const { updateWidget, updateLayouts, removeWidget, addWidgetToLayoutTab } = useDashboardStore();

    // Use per-layout effective settings (falls back to global when no override)
    const effectiveLayoutId = layoutId ?? activeLayout.id;
    const settings = useEffectiveSettings(effectiveLayoutId);

    const cellSize = settings.gridRowHeight ?? 20;
    const snapX = settings.gridSnapX ?? settings.gridRowHeight ?? 20;
    const MARGIN = settings.gridGap ?? DEFAULT_MARGIN;
    const groupDefs = useGroupDefsStore((s) => s.defs);
    const mobileBreakpoint = settings.mobileBreakpoint ?? 600;
    const guidelinesEnabled = settings.guidelinesEnabled ?? false;
    const guidelinesWidth = settings.guidelinesWidth ?? 1280;
    const guidelinesHeight = settings.guidelinesHeight ?? 800;
    const guidelinesShowInFrontend = settings.guidelinesShowInFrontend ?? false;

    const showGuidelines = guidelinesEnabled && (editMode || guidelinesShowInFrontend);

    // In frontend view, use provided override; otherwise use active editor layout
    const tabs = viewTabs ?? activeLayout.tabs;
    const activeTabId = viewActiveTabId ?? activeLayout.activeTabId;

    // Track which tabs have ever been activated. Only those get their widgets
    // mounted — pre-mounting all tabs would defeat lazy widget chunks (echarts,
    // recharts) and load chart libs even on tabs that have no charts. Tabs the
    // user *did* visit stay mounted so iframe widgets keep their state.
    const [mountedTabIds, setMountedTabIds] = useState<Set<string>>(() =>
        activeTabId ? new Set([activeTabId]) : new Set(),
    );
    useEffect(() => {
        if (!activeTabId) return;
        setMountedTabIds((prev) => (prev.has(activeTabId) ? prev : new Set(prev).add(activeTabId)));
    }, [activeTabId]);

    const reflowHiddenIds = useReflowHiddenIds();
    // Raw condition verdict (works in edit mode too) — drives group auto-shrink.
    const conditionReflowIds = useConditionReflowIds();

    // ── iFrame fullscreen overlay ──────────────────────────────────────────
    const iframeFullscreen = useIframeStore((s) => s.fullscreen);
    const setIframeFullscreen = useIframeStore((s) => s.setFullscreen);

    useEffect(() => {
        if (!iframeFullscreen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIframeFullscreen(null);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [iframeFullscreen, setIframeFullscreen]);

    // Synchronous render-time check: only show fullscreen overlay when the widget
    // that triggered it is on the currently active tab. This avoids async useEffect
    // timing issues (all tabs stay mounted, so widget-unmount cleanup never fires).
    const fullscreenTabId = iframeFullscreen
        ? (tabs.find((t) => (t.widgets ?? []).some((w) => w.id === iframeFullscreen.widgetId))?.id ?? null)
        : null;
    const showIframeOverlay = iframeFullscreen !== null && fullscreenTabId === activeTabId;

    // ── container width measurement ────────────────────────────────────────
    // Use a callback ref instead of useRef + useEffect so that the ResizeObserver
    // is correctly connected to whichever DOM element is currently mounted.
    // A plain useEffect with [] deps could keep watching a detached element,
    // causing some browsers (Chrome) to fire with width=0, setting containerWidth=0
    // and making the tab appear blank ({rglWidth > 0 && ...} renders nothing).
    const roRef = useRef<ResizeObserver | null>(null);
    const [containerWidth, setContainerWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 0));

    const containerRefCallback = useCallback((el: HTMLDivElement | null) => {
        if (roRef.current) {
            roRef.current.disconnect();
            roRef.current = null;
        }
        if (!el) return;
        setContainerWidth(el.clientWidth);
        const ro = new ResizeObserver(([entry]) => {
            setContainerWidth(Math.floor(entry.contentRect.width));
        });
        ro.observe(el);
        roRef.current = ro;
    }, []);

    // ── in editMode: lock grid width so the window can shrink without reflowing widgets ──
    // The grid width only grows (never shrinks) while editing. The container gets
    // overflow-x: auto so the user can scroll if the window is narrower than the grid.
    const [editWidth, setEditWidth] = useState(0);
    useEffect(() => {
        if (editMode && containerWidth > 0) {
            setEditWidth((prev) => Math.max(prev, containerWidth));
        }
        if (!editMode) {
            setEditWidth(0);
        }
    }, [editMode, containerWidth]);

    // RGL gets the locked width in editMode, actual containerWidth otherwise
    const rglWidth = editMode && editWidth > 0 ? editWidth : containerWidth;

    // ── compute cols based on horizontal snap width ────────────────────────
    // col_width = (rglWidth - (cols+1)*MARGIN) / cols ≈ snapX
    // → cols ≈ (rglWidth - MARGIN) / (snapX + MARGIN)
    const cols = rglWidth > 0 ? Math.max(2, Math.floor((rglWidth - MARGIN) / (snapX + MARGIN))) : 12;

    // ── prevent widget repositioning in both frontend and admin ──────────────
    // Keep cols ≥ the maximum column used across all tabs so RGL never clamps
    // widget positions. If the window is narrower than the design width (frontend)
    // or opened small (admin), the grid overflows and the container scrolls
    // horizontally instead of reflowing widgets.
    const minCols = useMemo(
        () =>
            tabs.reduce(
                (max, tab) => (tab.widgets ?? []).reduce((m, w) => Math.max(m, w.gridPos.x + w.gridPos.w), max),
                2,
            ),
        [tabs],
    );

    const effectiveCols = Math.max(cols, minCols);
    // When effectiveCols exceeds what fits in rglWidth, compute a wider virtual
    // width so RGL cell sizes stay consistent with the original design.
    const effectiveRglWidth = effectiveCols > cols ? effectiveCols * (snapX + MARGIN) + MARGIN : rglWidth;

    // Rescaling when snapX changes is handled in AdminSettings via rescaleAllWidgetsX.

    // ── fill-tab: one widget covers the whole tab area ────────────────────
    // fillTabWidget is rendered as an absolute overlay so the normal tab tree
    // stays mounted in all cases — keepAlive iframes are never unmounted when
    // switching between fill-tab and normal tabs.
    const activeTab = tabs.find((t) => t.id === activeTabId);
    const fillTabWidget = activeTab?.widgets?.find((w) => (w.options as Record<string, unknown>)?.fillTab);

    // ── mobile: single-column stack ───────────────────────────────────────
    if (containerWidth > 0 && containerWidth < mobileBreakpoint) {
        return (
            <DashboardMobileContext.Provider value={true}>
                <ActiveLayoutContext.Provider value={effectiveLayoutId}>
                    <div className="flex-1 min-h-0 relative">
                        {fillTabWidget && (
                            <div className="absolute inset-0" style={{ zIndex: 10 }}>
                                <WidgetFrame
                                    config={fillTabWidget}
                                    editMode={editMode}
                                    onRemove={removeWidget}
                                    onConfigChange={(cfg) => updateWidget(cfg.id, cfg)}
                                />
                            </div>
                        )}
                        <div
                            ref={containerRefCallback}
                            className="aura-scroll absolute inset-0 overflow-auto p-2"
                            style={{ scrollbarGutter: 'stable both-edges' }}
                        >
                            {/* Reflow-hidden widgets from all tabs rendered off-screen */}
                            <div
                                style={{
                                    position: 'fixed',
                                    top: -9999,
                                    left: -9999,
                                    width: 1,
                                    height: 1,
                                    overflow: 'hidden',
                                    pointerEvents: 'none',
                                    opacity: 0,
                                }}
                            >
                                {tabs.flatMap((tab) =>
                                    (tab.widgets ?? [])
                                        .filter((w) => reflowHiddenIds.has(w.id))
                                        .map((w) => (
                                            <WidgetFrame
                                                key={w.id}
                                                config={w}
                                                editMode={false}
                                                onRemove={removeWidget}
                                                onConfigChange={(cfg) => updateWidget(cfg.id, cfg)}
                                            />
                                        )),
                                )}
                            </div>
                            {/* Mount-on-visit: tabs are rendered the first time the user activates
              them, and stay mounted afterwards (so iframe widgets keep state).
              Unvisited tabs are skipped entirely so their widgets don't pull in
              lazy chunks (echarts, recharts) on initial load. */}
                            {tabs
                                .filter((tab) => mountedTabIds.has(tab.id))
                                .map((tab) => {
                                    const isActive = tab.id === activeTabId;
                                    const tabWidgets = (tab.widgets ?? []).filter(
                                        (w) =>
                                            !reflowHiddenIds.has(w.id) && !(fillTabWidget && w.id === fillTabWidget.id),
                                    );
                                    const sorted = [...tabWidgets].sort((a, b) => {
                                        const oa = a.mobileOrder ?? a.gridPos.y * 1000 + a.gridPos.x;
                                        const ob = b.mobileOrder ?? b.gridPos.y * 1000 + b.gridPos.x;
                                        return oa - ob;
                                    });
                                    return (
                                        <div
                                            key={tab.id}
                                            data-tab={tab.slug}
                                            className={`aura-tab aura-tab-${tab.slug}`}
                                            style={{ display: isActive ? undefined : 'none' }}
                                        >
                                            {isActive && tabWidgets.length === 0 ? (
                                                <div
                                                    className="flex flex-col items-center justify-center flex-1 h-64 space-y-2"
                                                    style={{ color: 'var(--text-secondary)' }}
                                                >
                                                    <p>
                                                        {readonly ? t('frontend.noWidgets') : t('frontend.addWidgets')}
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col" style={{ gap: MARGIN }}>
                                                    {sorted.map((w) => (
                                                        <div
                                                            key={w.id}
                                                            style={
                                                                w.type === 'group' ||
                                                                w.type === 'panels' ||
                                                                w.type === 'mediaplayer'
                                                                    ? undefined
                                                                    : {
                                                                          height:
                                                                              w.gridPos.h * cellSize +
                                                                              (w.gridPos.h - 1) * MARGIN,
                                                                      }
                                                            }
                                                        >
                                                            <WidgetFrame
                                                                config={w}
                                                                editMode={editMode}
                                                                onRemove={removeWidget}
                                                                onConfigChange={(cfg) => updateWidget(cfg.id, cfg)}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                        </div>
                        {showIframeOverlay && (
                            <IframeOverlay data={iframeFullscreen!} onClose={() => setIframeFullscreen(null)} />
                        )}
                    </div>
                </ActiveLayoutContext.Provider>
            </DashboardMobileContext.Provider>
        );
    }

    return (
        <ActiveLayoutContext.Provider value={effectiveLayoutId}>
            <div className="flex-1 min-h-0 relative">
                {fillTabWidget && (
                    <div className="absolute inset-0" style={{ zIndex: 10 }}>
                        <WidgetFrame
                            config={fillTabWidget}
                            editMode={editMode}
                            onRemove={removeWidget}
                            onConfigChange={(cfg) => updateWidget(cfg.id, cfg)}
                        />
                    </div>
                )}
                <div
                    ref={containerRefCallback}
                    className="aura-scroll absolute inset-0 overflow-auto p-2 sm:p-4"
                    style={{
                        scrollbarGutter: 'stable both-edges',
                        ...(effectiveRglWidth > containerWidth ? { overflowX: 'auto' } : {}),
                    }}
                >
                    {showGuidelines && <GuidelinesOverlay width={guidelinesWidth} height={guidelinesHeight} />}
                    {rglWidth > 0 && (
                        <>
                            {/* Reflow-hidden widgets from all tabs rendered off-screen so conditions keep evaluating */}
                            <div
                                style={{
                                    position: 'fixed',
                                    top: -9999,
                                    left: -9999,
                                    width: 1,
                                    height: 1,
                                    overflow: 'hidden',
                                    pointerEvents: 'none',
                                    opacity: 0,
                                }}
                            >
                                {tabs.flatMap((tab) =>
                                    (tab.widgets ?? [])
                                        .filter((w) => reflowHiddenIds.has(w.id))
                                        .map((w) => (
                                            <WidgetFrame
                                                key={w.id}
                                                config={w}
                                                editMode={false}
                                                onRemove={removeWidget}
                                                onConfigChange={(cfg) => updateWidget(cfg.id, cfg)}
                                            />
                                        )),
                                )}
                            </div>

                            {/* Mount-on-visit: see comment above for mobile branch. */}
                            {tabs
                                .filter((tab) => mountedTabIds.has(tab.id))
                                .map((tab) => {
                                    const isActive = tab.id === activeTabId;
                                    const tabWidgets = tab.widgets ?? [];
                                    // Exclude the fillTab widget from the grid — it is rendered as an absolute overlay above
                                    const tabGridWidgets = tabWidgets.filter(
                                        (w) =>
                                            !reflowHiddenIds.has(w.id) && !(fillTabWidget && w.id === fillTabWidget.id),
                                    );
                                    const tabLayout = tabGridWidgets.map((w) => {
                                        const isGroup = w.type === 'group';
                                        const autoShrink = isGroup && !!w.options?.autoShrink;
                                        const defId = isGroup ? (w.options?.defId as string | undefined) : undefined;
                                        const groupChildren = defId ? (groupDefs[defId] ?? []) : [];

                                        let minH = 1;
                                        // Editor: force a group tall enough to show ALL children so they
                                        // stay editable — except when autoShrink is on, where we let the
                                        // box shrink and rely on the group's inner scrollbar instead.
                                        if (editMode && isGroup && !autoShrink && groupChildren.length > 0) {
                                            const maxBottom = Math.max(
                                                ...groupChildren.map((c) => c.gridPos.y + c.gridPos.h),
                                            );
                                            const innerH = maxBottom * (cellSize + MARGIN) - MARGIN;
                                            const titleBarH = w.title ? 37 : 36;
                                            minH = Math.ceil((titleBarH + innerH + 10 + MARGIN) / (cellSize + MARGIN));
                                        }
                                        let h = Math.max(w.gridPos.h ?? 2, minH);

                                        // Auto-shrink: collapse the group's outer height to its remaining
                                        // condition-visible children. The two views fit a different layout:
                                        //  • Frontend — hidden children are removed and the rest compacted
                                        //    upward, so the box fits the *compacted* visible layout exactly.
                                        //  • Editor — every child stays mounted at its stored position (so
                                        //    hidden ones remain editable). Fitting the visible children at
                                        //    their *original* positions never cuts a visible widget; only
                                        //    hidden children trailing below the last visible one fall past
                                        //    the fold, reachable via the group's inner scrollbar.
                                        if (autoShrink && groupChildren.length > 0) {
                                            const visible = groupChildren.filter((c) => !conditionReflowIds.has(c.id));
                                            if (visible.length > 0 && visible.length < groupChildren.length) {
                                                const fitLayout = editMode ? visible : verticalCompact(visible);
                                                const maxBottom = Math.max(
                                                    ...fitLayout.map((c) => c.gridPos.y + c.gridPos.h),
                                                );
                                                const innerH =
                                                    maxBottom > 0 ? maxBottom * (cellSize + MARGIN) - MARGIN : 0;
                                                const showTitle = w.options?.showTitle !== false;
                                                const titleBarH = editMode
                                                    ? w.title
                                                        ? 37
                                                        : 36
                                                    : (showTitle && w.title) || w.options?.groupSwitch
                                                      ? 37
                                                      : 0;
                                                const shrunk = Math.max(
                                                    1,
                                                    Math.ceil((titleBarH + innerH + 10 + MARGIN) / (cellSize + MARGIN)),
                                                );
                                                h = Math.min(h, shrunk);
                                                minH = Math.min(minH, h); // never let RGL clamp back up
                                            }
                                        }
                                        return {
                                            i: w.id,
                                            x: Math.min(w.gridPos.x ?? 0, effectiveCols - 1),
                                            y: w.gridPos.y ?? 9999,
                                            w: Math.min(w.gridPos.w ?? 2, effectiveCols),
                                            h,
                                            minH,
                                        };
                                    });
                                    const buildTabUpdated = (
                                        newLayout: readonly { i: string; x: number; y: number; w: number; h: number }[],
                                    ) =>
                                        tabWidgets.map((w) => {
                                            if (reflowHiddenIds.has(w.id)) return w;
                                            const pos = newLayout.find((l) => l.i === w.id);
                                            if (!pos) return w;
                                            // Auto-shrink groups render at a condition-derived height that is
                                            // NOT stored — keep the canonical gridPos.h so a transient shrunk
                                            // value can't get persisted on an unrelated drag/resize.
                                            const h = w.type === 'group' && w.options?.autoShrink ? w.gridPos.h : pos.h;
                                            return { ...w, gridPos: { x: pos.x, y: pos.y, w: pos.w, h } };
                                        });

                                    if (isActive && tabGridWidgets.length === 0) {
                                        return (
                                            <div
                                                key={tab.id}
                                                data-tab={tab.slug}
                                                className={`aura-tab aura-tab-${tab.slug} flex flex-col items-center justify-center flex-1 h-64 space-y-2`}
                                                style={{ color: 'var(--text-secondary)' }}
                                            >
                                                <p>{readonly ? t('frontend.noWidgets') : t('frontend.addWidgets')}</p>
                                            </div>
                                        );
                                    }

                                    const dropHandlers =
                                        isActive && editMode
                                            ? {
                                                  onDragOver: (e: React.DragEvent) => {
                                                      if (getDragBridge()) e.preventDefault();
                                                  },
                                                  onDrop: (e: React.DragEvent) => {
                                                      const bridge = getDragBridge();
                                                      if (!bridge) return;
                                                      e.preventDefault();
                                                      addWidgetToLayoutTab(activeLayout.id, tab.id, {
                                                          ...bridge.widget,
                                                          id: `w-${Date.now()}`,
                                                          gridPos: { ...bridge.widget.gridPos, y: 9999 },
                                                      });
                                                      bridge.remove(bridge.widget.id);
                                                      setDragBridge(null);
                                                  },
                                              }
                                            : {};

                                    return (
                                        <div
                                            key={tab.id}
                                            data-tab={tab.slug}
                                            className={`aura-tab aura-tab-${tab.slug}`}
                                            style={{ display: isActive ? undefined : 'none' }}
                                            {...dropHandlers}
                                        >
                                            <ReactGridLayout
                                                className="layout"
                                                layout={tabLayout}
                                                cols={effectiveCols}
                                                rowHeight={cellSize}
                                                width={effectiveRglWidth}
                                                isDraggable={isActive && editMode}
                                                isResizable={isActive && editMode}
                                                draggableCancel=".nodrag"
                                                onLayoutChange={(nl) => {
                                                    if (isActive) onLayoutChange?.(buildTabUpdated(nl));
                                                }}
                                                onDragStop={(nl) => {
                                                    if (!isActive || readonly) return;
                                                    // Skip if nothing moved (click without drag fires onDragStop too)
                                                    const moved = nl.some(({ i, x, y, w: nw, h: nh }) => {
                                                        const widget = tabGridWidgets.find((tw) => tw.id === i);
                                                        return (
                                                            !widget ||
                                                            widget.gridPos.x !== x ||
                                                            widget.gridPos.y !== y ||
                                                            widget.gridPos.w !== nw ||
                                                            widget.gridPos.h !== nh
                                                        );
                                                    });
                                                    if (moved) updateLayouts(buildTabUpdated(nl));
                                                }}
                                                onResizeStop={(nl) => {
                                                    if (isActive && !readonly) updateLayouts(buildTabUpdated(nl));
                                                }}
                                                margin={[MARGIN, MARGIN]}
                                                containerPadding={[0, 0]}
                                            >
                                                {tabGridWidgets.map((w) => (
                                                    <div key={w.id}>
                                                        <WidgetFrame
                                                            config={w}
                                                            editMode={isActive && editMode}
                                                            onRemove={removeWidget}
                                                            onConfigChange={(cfg) => updateWidget(cfg.id, cfg)}
                                                        />
                                                    </div>
                                                ))}
                                            </ReactGridLayout>
                                        </div>
                                    );
                                })}
                        </>
                    )}
                </div>
                {showIframeOverlay && (
                    <IframeOverlay data={iframeFullscreen!} onClose={() => setIframeFullscreen(null)} />
                )}
            </div>
        </ActiveLayoutContext.Provider>
    );
}

// ── Guidelines overlay ────────────────────────────────────────────────────
// Renders a vertical line at x=guidelinesWidth and a horizontal line at
// y=guidelinesHeight. Lines are positioned absolutely inside the scroll
// container; positions are offset by the scroll container's viewport
// top/left so the lines indicate the *device's* screen edges (the target
// width/height covers the entire app including header + tab bar), not
// the dashboard area alone.
function GuidelinesOverlay({ width, height }: { width: number; height: number }) {
    const markerRef = useRef<HTMLDivElement | null>(null);
    const [offset, setOffset] = useState({ top: 0, left: 0 });

    useEffect(() => {
        const marker = markerRef.current;
        const parent = marker?.parentElement;
        if (!parent) return;
        const measure = () => {
            const r = parent.getBoundingClientRect();
            setOffset({ top: Math.round(r.top), left: Math.round(r.left) });
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(parent);
        ro.observe(document.documentElement);
        window.addEventListener('resize', measure);
        return () => {
            ro.disconnect();
            window.removeEventListener('resize', measure);
        };
    }, []);

    const lineLeft = width - offset.left;
    const lineTop = height - offset.top;

    return (
        <>
            <div
                ref={markerRef}
                aria-hidden
                style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0, pointerEvents: 'none' }}
            />
            {/* Vertical line: right edge of the target width */}
            <div
                aria-hidden
                style={{
                    position: 'absolute',
                    top: 0,
                    left: lineLeft,
                    width: 0,
                    bottom: 0,
                    borderLeft: '2px dashed rgba(239,68,68,0.85)',
                    pointerEvents: 'none',
                    zIndex: 40,
                }}
            >
                <span
                    style={{
                        position: 'sticky',
                        top: 4,
                        display: 'inline-block',
                        background: 'rgba(239,68,68,0.85)',
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: 600,
                        padding: '1px 5px',
                        borderRadius: 3,
                        whiteSpace: 'nowrap',
                        transform: 'translateX(4px)',
                        lineHeight: 1.6,
                    }}
                >
                    {width} px
                </span>
            </div>
            {/* Horizontal line: bottom edge of the target height */}
            <div
                aria-hidden
                style={{
                    position: 'absolute',
                    left: 0,
                    top: lineTop,
                    right: 0,
                    height: 0,
                    borderTop: '2px dashed rgba(239,68,68,0.85)',
                    pointerEvents: 'none',
                    zIndex: 40,
                }}
            >
                <span
                    style={{
                        position: 'absolute',
                        left: 4,
                        top: 3,
                        background: 'rgba(239,68,68,0.85)',
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: 600,
                        padding: '1px 5px',
                        borderRadius: 3,
                        whiteSpace: 'nowrap',
                        lineHeight: 1.6,
                    }}
                >
                    {height} px
                </span>
            </div>
        </>
    );
}

// ── iFrame fullscreen overlay ─────────────────────────────────────────────
function IframeOverlay({ data, onClose }: { data: IframeFullscreenData; onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-[900] flex flex-col" style={{ background: '#000' }}>
            <iframe
                key={data.iframeKey}
                src={data.url}
                sandbox={data.sandboxAttr}
                allow="autoplay; fullscreen; picture-in-picture; web-share"
                title={data.title}
                style={{ width: '100%', flex: 1, border: 'none', display: 'block', height: '100%' }}
            />
            <button
                onClick={onClose}
                className="absolute top-3 right-3 w-9 h-9 flex items-center justify-center rounded-full"
                style={{ background: 'rgba(0,0,0,0.6)', color: '#fff', backdropFilter: 'blur(4px)', zIndex: 1 }}
                title="Vollbild beenden (Esc)"
            >
                <X size={18} />
            </button>
        </div>
    );
}
