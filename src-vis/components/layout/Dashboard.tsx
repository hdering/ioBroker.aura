import { useEffect, useMemo, useRef, useState } from 'react';
import ReactGridLayout from 'react-grid-layout';
import { useDashboardStore, useActiveLayout } from '../../store/dashboardStore';
import { useConfigStore } from '../../store/configStore';
import { WidgetFrame } from './WidgetFrame';
import { useReflowHiddenIds } from '../../hooks/useConditionStyle';
import type { WidgetConfig } from '../../types';
import type { Tab } from '../../store/dashboardStore';
import { useT } from '../../i18n';

// Default gap — overridden by config at runtime
const DEFAULT_MARGIN = 10;


interface DashboardProps {
  readonly?: boolean;
  editMode?: boolean;
  onLayoutChange?: (widgets: WidgetConfig[]) => void;
  /** Override tabs for frontend readonly view (specific layout by slug) */
  viewTabs?: Tab[];
  viewActiveTabId?: string;
}

export function Dashboard({ readonly = false, editMode = false, onLayoutChange, viewTabs, viewActiveTabId }: DashboardProps) {
  const t = useT();
  const activeLayout = useActiveLayout();
  const { updateWidget, updateLayouts, removeWidget } = useDashboardStore();
  const cellSize = useConfigStore((s) => s.frontend.gridRowHeight ?? 80);
  const snapX    = useConfigStore((s) => s.frontend.gridSnapX ?? s.frontend.gridRowHeight ?? 80);
  const MARGIN = useConfigStore((s) => s.frontend.gridGap ?? DEFAULT_MARGIN);
  const mobileBreakpoint = useConfigStore((s) => s.frontend.mobileBreakpoint ?? 600);

  // In frontend view, use provided override; otherwise use active editor layout
  const tabs = viewTabs ?? activeLayout.tabs;
  const activeTabId = viewActiveTabId ?? activeLayout.activeTabId;

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const widgets = useMemo(() => activeTab?.widgets ?? [], [activeTab]);
  const reflowHiddenIds = useReflowHiddenIds();

  // ── container width measurement ────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 0,
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(Math.floor(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
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

  // ── in readonly (frontend) mode: prevent widget repositioning ──────────
  // Keep cols ≥ the maximum column used across all tabs so RGL never clamps
  // widget positions. If the browser is narrower than the design width, the
  // grid overflows and the container scrolls horizontally instead.
  const minCols = useMemo(() => {
    if (!readonly) return 2;
    return tabs.reduce((max, tab) =>
      (tab.widgets ?? []).reduce((m, w) => Math.max(m, w.gridPos.x + w.gridPos.w), max),
      2,
    );
  }, [readonly, tabs]);

  const effectiveCols = readonly ? Math.max(cols, minCols) : cols;
  // When the effective col count exceeds what fits in the viewport, use the
  // minimum required width so cell sizes stay consistent with the design.
  const effectiveRglWidth = (readonly && effectiveCols > cols)
    ? effectiveCols * (snapX + MARGIN) + MARGIN
    : rglWidth;

  // ── re-scale widget x/w when snapX changes ────────────────────────────
  // Rescale only when the snap setting itself changes, not on container resize.
  const prevColsRef = useRef<number | null>(null);
  const prevSnapXRef = useRef(snapX);
  const widgetsRef = useRef(widgets);
  widgetsRef.current = widgets;
  const updateLayoutsRef = useRef(updateLayouts);
  updateLayoutsRef.current = updateLayouts;

  useEffect(() => {
    // First mount: just initialise refs
    if (prevColsRef.current === null) {
      prevColsRef.current = cols;
      prevSnapXRef.current = snapX;
      return;
    }

    const prevCols = prevColsRef.current;
    const prevSnap = prevSnapXRef.current;

    // Only re-scale when snapX itself changed (not just a container resize)
    // Skip in readonly mode — we must not write back to the store from a view-only context.
    if (!readonly && prevSnap !== snapX && prevCols > 0) {
      const cur = widgetsRef.current;
      if (cur.length > 0) {
        const rescaled = cur.map((w) => ({
          ...w,
          gridPos: {
            ...w.gridPos,
            x: Math.min(Math.round(w.gridPos.x * cols / prevCols), cols - 1),
            w: Math.max(1, Math.round(w.gridPos.w * cols / prevCols)),
          },
        }));
        updateLayoutsRef.current(rescaled);
      }
    }

    prevColsRef.current = cols;
    prevSnapXRef.current = snapX;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, snapX]);

  // ── mobile: single-column stack ───────────────────────────────────────
  if (containerWidth > 0 && containerWidth < mobileBreakpoint) {
    return (
      <div ref={containerRef} className="aura-scroll flex-1 min-h-0 overflow-auto p-2">
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
          const tabWidgets = (tab.widgets ?? []).filter((w) => !reflowHiddenIds.has(w.id));
          const sorted = [...tabWidgets].sort((a, b) => {
            const oa = a.mobileOrder ?? (a.gridPos.y * 1000 + a.gridPos.x);
            const ob = b.mobileOrder ?? (b.gridPos.y * 1000 + b.gridPos.x);
            return oa - ob;
          });
          return (
            <div key={tab.id} className={`aura-tab aura-tab-${tab.slug}`} style={{ display: isActive ? undefined : 'none' }}>
              {isActive && tabWidgets.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 h-64 space-y-2" style={{ color: 'var(--text-secondary)' }}>
                  <p>{readonly ? t('frontend.noWidgets') : t('frontend.addWidgets')}</p>
                </div>
              ) : (
                <div className="flex flex-col" style={{ gap: MARGIN }}>
                  {sorted.map((w) => (
                    <div key={w.id} style={{ height: w.gridPos.h * cellSize + (w.gridPos.h - 1) * MARGIN }}>
                      <WidgetFrame config={w} editMode={false} onRemove={removeWidget} onConfigChange={(cfg) => updateWidget(cfg.id, cfg)} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="aura-scroll flex-1 min-h-0 overflow-auto p-2 sm:p-4" style={(editMode && rglWidth > containerWidth) || (readonly && effectiveRglWidth > containerWidth) ? { overflowX: 'auto' } : undefined}>
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
            const tabGridWidgets = tabWidgets.filter((w) => !reflowHiddenIds.has(w.id));
            const tabLayout = tabGridWidgets.map((w) => ({
              i: w.id,
              x: Math.min(w.gridPos.x, effectiveCols - 1),
              y: w.gridPos.y,
              w: Math.min(w.gridPos.w, effectiveCols),
              h: w.gridPos.h,
            }));
            const buildTabUpdated = (newLayout: { i: string; x: number; y: number; w: number; h: number }[]) =>
              tabWidgets.map((w) => {
                if (reflowHiddenIds.has(w.id)) return w;
                const pos = newLayout.find((l) => l.i === w.id);
                if (!pos) return w;
                return { ...w, gridPos: { x: pos.x, y: pos.y, w: pos.w, h: pos.h } };
              });

            if (isActive && tabGridWidgets.length === 0) {
              return (
                <div key={tab.id} className={`aura-tab aura-tab-${tab.slug} flex flex-col items-center justify-center flex-1 h-64 space-y-2`} style={{ color: 'var(--text-secondary)' }}>
                  <p>{readonly ? t('frontend.noWidgets') : t('frontend.addWidgets')}</p>
                </div>
              );
            }

            return (
              <div key={tab.id} className={`aura-tab aura-tab-${tab.slug}`} style={{ display: isActive ? undefined : 'none' }}>
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
  );
}
