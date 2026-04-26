import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactGridLayout from 'react-grid-layout';
import { X } from 'lucide-react';
import { useDashboardStore, useActiveLayout } from '../../store/dashboardStore';
import { useGroupDefsStore } from '../../store/groupDefsStore';
import { useIframeStore, type IframeFullscreenData } from '../../store/iframeStore';
import { WidgetFrame } from './WidgetFrame';
import { useReflowHiddenIds } from '../../hooks/useConditionStyle';
import { useEffectiveSettings } from '../../hooks/useEffectiveSettings';
import { ActiveLayoutContext } from '../../contexts/ActiveLayoutContext';
import { DashboardMobileContext } from '../../contexts/DashboardMobileContext';
import type { WidgetConfig } from '../../types';
import type { Tab } from '../../store/dashboardStore';
import { useT } from '../../i18n';
import { getDragBridge, setDragBridge } from '../../utils/dragBridge';

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

export function Dashboard({ readonly = false, editMode = false, onLayoutChange, viewTabs, viewActiveTabId, layoutId }: DashboardProps) {
  const t = useT();
  const activeLayout = useActiveLayout();
  const { updateWidget, updateLayouts, removeWidget, addWidgetToLayoutTab } = useDashboardStore();

  // Use per-layout effective settings (falls back to global when no override)
  const effectiveLayoutId = layoutId ?? activeLayout.id;
  const settings = useEffectiveSettings(effectiveLayoutId);

  const cellSize = settings.gridRowHeight ?? 20;
  const snapX    = settings.gridSnapX ?? settings.gridRowHeight ?? 20;
  const MARGIN = settings.gridGap ?? DEFAULT_MARGIN;
  const groupDefs = useGroupDefsStore((s) => s.defs);
  const mobileBreakpoint = settings.mobileBreakpoint ?? 600;
  const guidelinesEnabled      = settings.guidelinesEnabled ?? false;
  const guidelinesWidth        = settings.guidelinesWidth ?? 1280;
  const guidelinesHeight       = settings.guidelinesHeight ?? 800;
  const guidelinesShowInFrontend = settings.guidelinesShowInFrontend ?? false;

  const showGuidelines = guidelinesEnabled && (editMode || guidelinesShowInFrontend);

  // In frontend view, use provided override; otherwise use active editor layout
  const tabs = viewTabs ?? activeLayout.tabs;
  const activeTabId = viewActiveTabId ?? activeLayout.activeTabId;

  const reflowHiddenIds = useReflowHiddenIds();

  // ── iFrame fullscreen overlay ──────────────────────────────────────────
  const iframeFullscreen  = useIframeStore((s) => s.fullscreen);
  const setIframeFullscreen = useIframeStore((s) => s.setFullscreen);

  useEffect(() => {
    if (!iframeFullscreen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setIframeFullscreen(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [iframeFullscreen, setIframeFullscreen]);

  // Synchronous render-time check: only show fullscreen overlay when the widget
  // that triggered it is on the currently active tab. This avoids async useEffect
  // timing issues (all tabs stay mounted, so widget-unmount cleanup never fires).
  const fullscreenTabId = iframeFullscreen
    ? tabs.find((t) => (t.widgets ?? []).some((w) => w.id === iframeFullscreen.widgetId))?.id ?? null
    : null;
  const showIframeOverlay = iframeFullscreen !== null && fullscreenTabId === activeTabId;

  // ── container width measurement ────────────────────────────────────────
  // Use a callback ref instead of useRef + useEffect so that the ResizeObserver
  // is correctly connected to whichever DOM element is currently mounted.
  // A plain useEffect with [] deps could keep watching a detached element,
  // causing some browsers (Chrome) to fire with width=0, setting containerWidth=0
  // and making the tab appear blank ({rglWidth > 0 && ...} renders nothing).
  const roRef = useRef<ResizeObserver | null>(null);
  const [containerWidth, setContainerWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 0,
  );

  const containerRefCallback = useCallback((el: HTMLDivElement | null) => {
    if (roRef.current) { roRef.current.disconnect(); roRef.current = null; }
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
  const cols = rglWidth > 0
    ? Math.max(2, Math.floor((rglWidth - MARGIN) / (snapX + MARGIN)))
    : 12;

  // ── prevent widget repositioning in both frontend and admin ──────────────
  // Keep cols ≥ the maximum column used across all tabs so RGL never clamps
  // widget positions. If the window is narrower than the design width (frontend)
  // or opened small (admin), the grid overflows and the container scrolls
  // horizontally instead of reflowing widgets.
  const minCols = useMemo(() =>
    tabs.reduce((max, tab) =>
      (tab.widgets ?? []).reduce((m, w) => Math.max(m, w.gridPos.x + w.gridPos.w), max),
      2,
    )
  , [tabs]);

  const effectiveCols = Math.max(cols, minCols);
  // When effectiveCols exceeds what fits in rglWidth, compute a wider virtual
  // width so RGL cell sizes stay consistent with the original design.
  const effectiveRglWidth = effectiveCols > cols
    ? effectiveCols * (snapX + MARGIN) + MARGIN
    : rglWidth;

  // Rescaling when snapX changes is handled in AdminSettings via rescaleAllWidgetsX.

  // ── fill-tab: one widget covers the whole tab area ────────────────────
  // fillTabWidget is rendered as an absolute overlay so the normal tab tree
  // stays mounted in all cases — keepAlive iframes are never unmounted when
  // switching between fill-tab and normal tabs.
  const activeTab    = tabs.find((t) => t.id === activeTabId);
  const fillTabWidget = activeTab?.widgets?.find((w) => (w.options as Record<string, unknown>)?.fillTab);

  // ── mobile: single-column stack ───────────────────────────────────────
  if (containerWidth > 0 && containerWidth < mobileBreakpoint) {
    return (
      <DashboardMobileContext.Provider value={true}>
      <ActiveLayoutContext.Provider value={effectiveLayoutId}>
      <div className="flex-1 min-h-0 relative">
        {fillTabWidget && (
          <div className="absolute inset-0" style={{ zIndex: 10 }}>
            <WidgetFrame config={fillTabWidget} editMode={editMode} onRemove={removeWidget} onConfigChange={(cfg) => updateWidget(cfg.id, cfg)} />
          </div>
        )}
        <div ref={containerRefCallback} className="aura-scroll absolute inset-0 overflow-auto p-2" style={{ scrollbarGutter: 'stable both-edges' }}>
          {/* Reflow-hidden widgets from all tabs rendered off-screen */}
          <div style={{ position: 'fixed', top: -9999, left: -9999, width: 1, height: 1, overflow: 'hidden', pointerEvents: 'none', opacity: 0 }}>
            {tabs.flatMap((tab) =>
              (tab.widgets ?? []).filter((w) => reflowHiddenIds.has(w.id)).map((w) => (
                <WidgetFrame key={w.id} config={w} editMode={false} onRemove={removeWidget} onConfigChange={(cfg) => updateWidget(cfg.id, cfg)} />
              ))
            )}
          </div>
          {/* All tabs rendered; inactive ones hidden so keepAlive iframes stay mounted */}
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const tabWidgets = (tab.widgets ?? []).filter((w) => !reflowHiddenIds.has(w.id) && !(fillTabWidget && w.id === fillTabWidget.id));
            const sorted = [...tabWidgets].sort((a, b) => {
              const oa = a.mobileOrder ?? (a.gridPos.y * 1000 + a.gridPos.x);
              const ob = b.mobileOrder ?? (b.gridPos.y * 1000 + b.gridPos.x);
              return oa - ob;
            });
            return (
              <div key={tab.id} data-tab={tab.slug} className={`aura-tab aura-tab-${tab.slug}`} style={{ display: isActive ? undefined : 'none' }}>
                {isActive && tabWidgets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center flex-1 h-64 space-y-2" style={{ color: 'var(--text-secondary)' }}>
                    <p>{readonly ? t('frontend.noWidgets') : t('frontend.addWidgets')}</p>
                  </div>
                ) : (
                  <div className="flex flex-col" style={{ gap: MARGIN }}>
                    {sorted.map((w) => (
                      <div key={w.id} style={w.type === 'group' ? undefined : { height: w.gridPos.h * cellSize + (w.gridPos.h - 1) * MARGIN }}>
                        <WidgetFrame config={w} editMode={false} onRemove={removeWidget} onConfigChange={(cfg) => updateWidget(cfg.id, cfg)} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {showIframeOverlay && <IframeOverlay data={iframeFullscreen!} onClose={() => setIframeFullscreen(null)} />}
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
        <WidgetFrame config={fillTabWidget} editMode={editMode} onRemove={removeWidget} onConfigChange={(cfg) => updateWidget(cfg.id, cfg)} />
      </div>
    )}
    <div ref={containerRefCallback} className="aura-scroll absolute inset-0 overflow-auto p-2 sm:p-4" style={{ scrollbarGutter: 'stable both-edges', ...(effectiveRglWidth > containerWidth ? { overflowX: 'auto' } : {}) }}>
      {showGuidelines && <GuidelinesOverlay width={guidelinesWidth} height={guidelinesHeight} />}
      {rglWidth > 0 && (
        <>
          {/* Reflow-hidden widgets from all tabs rendered off-screen so conditions keep evaluating */}
          <div style={{ position: 'fixed', top: -9999, left: -9999, width: 1, height: 1, overflow: 'hidden', pointerEvents: 'none', opacity: 0 }}>
            {tabs.flatMap((tab) =>
              (tab.widgets ?? []).filter((w) => reflowHiddenIds.has(w.id)).map((w) => (
                <WidgetFrame
                  key={w.id}
                  config={w}
                  editMode={false}
                  onRemove={removeWidget}
                  onConfigChange={(cfg) => updateWidget(cfg.id, cfg)}
                />
              ))
            )}
          </div>

          {/* All tabs rendered; inactive ones hidden so keepAlive iframes stay mounted */}
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const tabWidgets = tab.widgets ?? [];
            // Exclude the fillTab widget from the grid — it is rendered as an absolute overlay above
            const tabGridWidgets = tabWidgets.filter((w) => !reflowHiddenIds.has(w.id) && !(fillTabWidget && w.id === fillTabWidget.id));
            const tabLayout = tabGridWidgets.map((w) => {
              let minH = 1;
              if (editMode && w.type === 'group') {
                const defId = w.options?.defId as string | undefined;
                const children = defId ? (groupDefs[defId] ?? []) : [];
                if (children.length > 0) {
                  const maxBottom = Math.max(...children.map((c) => c.gridPos.y + c.gridPos.h));
                  const innerH = maxBottom * (cellSize + MARGIN) - MARGIN;
                  const titleBarH = w.title ? 28 : 0;
                  minH = Math.ceil((titleBarH + innerH + MARGIN) / (cellSize + MARGIN));
                }
              }
              return {
                i: w.id,
                x: Math.min(w.gridPos.x ?? 0, effectiveCols - 1),
                y: w.gridPos.y ?? 9999,
                w: Math.min(w.gridPos.w ?? 2, effectiveCols),
                h: w.gridPos.h ?? 2,
                minH,
              };
            });
            const buildTabUpdated = (newLayout: { i: string; x: number; y: number; w: number; h: number }[]) =>
              tabWidgets.map((w) => {
                if (reflowHiddenIds.has(w.id)) return w;
                const pos = newLayout.find((l) => l.i === w.id);
                if (!pos) return w;
                return { ...w, gridPos: { x: pos.x, y: pos.y, w: pos.w, h: pos.h } };
              });

            if (isActive && tabGridWidgets.length === 0) {
              return (
                <div key={tab.id} data-tab={tab.slug} className={`aura-tab aura-tab-${tab.slug} flex flex-col items-center justify-center flex-1 h-64 space-y-2`} style={{ color: 'var(--text-secondary)' }}>
                  <p>{readonly ? t('frontend.noWidgets') : t('frontend.addWidgets')}</p>
                </div>
              );
            }

            const dropHandlers = isActive && editMode ? {
              onDragOver: (e: React.DragEvent) => { if (getDragBridge()) e.preventDefault(); },
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
            } : {};

            return (
              <div key={tab.id} data-tab={tab.slug} className={`aura-tab aura-tab-${tab.slug}`} style={{ display: isActive ? undefined : 'none' }} {...dropHandlers}>
                <ReactGridLayout
                  className="layout"
                  layout={tabLayout}
                  cols={effectiveCols}
                  rowHeight={cellSize}
                  width={effectiveRglWidth}
                  isDraggable={isActive && editMode}
                  isResizable={isActive && editMode}
                  draggableCancel=".nodrag"
                  onLayoutChange={(nl) => { if (isActive) onLayoutChange?.(buildTabUpdated(nl)); }}
                  onDragStop={(nl) => { if (isActive && !readonly) updateLayouts(buildTabUpdated(nl)); }}
                  onResizeStop={(nl) => { if (isActive && !readonly) updateLayouts(buildTabUpdated(nl)); }}
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
    {showIframeOverlay && <IframeOverlay data={iframeFullscreen!} onClose={() => setIframeFullscreen(null)} />}
    </div>
    </ActiveLayoutContext.Provider>
  );
}

// ── Guidelines overlay ────────────────────────────────────────────────────
// Renders a vertical line at x=guidelinesWidth and a horizontal line at
// y=guidelinesHeight. Positioned absolutely inside the scroll container so
// the lines scroll with the grid content and stay aligned to grid coordinates.
function GuidelinesOverlay({ width, height }: { width: number; height: number }) {
  return (
    <>
      {/* Vertical line: right edge of the target width */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: width,
          width: 0,
          bottom: 0,
          borderLeft: '2px dashed rgba(239,68,68,0.85)',
          pointerEvents: 'none',
          zIndex: 40,
        }}
      >
        <span style={{
          position: 'sticky',
          top: 4,
          display: 'block',
          background: 'rgba(239,68,68,0.85)',
          color: '#fff',
          fontSize: 10,
          fontWeight: 600,
          padding: '1px 5px',
          borderRadius: 3,
          whiteSpace: 'nowrap',
          transform: 'translateX(4px)',
          lineHeight: 1.6,
        }}>{width} px</span>
      </div>
      {/* Horizontal line: bottom edge of the target height */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          top: height,
          right: 0,
          height: 0,
          borderTop: '2px dashed rgba(239,68,68,0.85)',
          pointerEvents: 'none',
          zIndex: 40,
        }}
      >
        <span style={{
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
        }}>{height} px</span>
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
