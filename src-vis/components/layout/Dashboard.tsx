import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactGridLayout from 'react-grid-layout';
import { useDashboardStore, useActiveLayout } from '../../store/dashboardStore';
import { useConfigStore } from '../../store/configStore';
import { WidgetFrame } from './WidgetFrame';
import { useReflowHiddenIds } from '../../hooks/useConditionStyle';
import type { WidgetConfig } from '../../types';
import type { Tab } from '../../store/dashboardStore';
import { useT } from '../../i18n';

// Gap between grid cells (px)
const MARGIN = 10;


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

  // ── compute cols so that column width ≈ cellSize ───────────────────────
  // col_width = (rglWidth - (cols+1)*MARGIN) / cols ≈ cellSize
  // → cols ≈ (rglWidth - MARGIN) / (cellSize + MARGIN)
  const cols = rglWidth > 0
    ? Math.max(2, Math.floor((rglWidth - MARGIN) / (cellSize + MARGIN)))
    : 12;

  // ── re-scale widget x/w when cellSize changes ──────────────────────────
  const prevColsRef = useRef<number | null>(null);
  const prevCellSizeRef = useRef(cellSize);
  const widgetsRef = useRef(widgets);
  widgetsRef.current = widgets;
  const updateLayoutsRef = useRef(updateLayouts);
  updateLayoutsRef.current = updateLayouts;

  useEffect(() => {
    // First mount: just initialise refs
    if (prevColsRef.current === null) {
      prevColsRef.current = cols;
      prevCellSizeRef.current = cellSize;
      return;
    }

    const prevCols = prevColsRef.current;
    const prevCellSize = prevCellSizeRef.current;

    // Only re-scale when cellSize itself changed (not just a container resize)
    // Skip in readonly mode — we must not write back to the store from a view-only context.
    if (!readonly && prevCellSize !== cellSize && prevCols > 0) {
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
    prevCellSizeRef.current = cellSize;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, cellSize]);

  // ── layout array for ReactGridLayout ──────────────────────────────────
  // Reflow-hidden widgets are excluded from the grid (rendered outside for condition eval)
  const gridWidgets = widgets.filter((w) => !reflowHiddenIds.has(w.id));

  const layout = gridWidgets.map((w) => ({
    i: w.id,
    x: Math.min(w.gridPos.x, cols - 1),
    y: w.gridPos.y,
    w: Math.min(w.gridPos.w, cols),
    h: w.gridPos.h,
  }));

  // Build updated widget list from a RGL layout snapshot
  const buildUpdated = useCallback(
    (newLayout: { i: string; x: number; y: number; w: number; h: number }[]) =>
      widgets.map((w) => {
        if (reflowHiddenIds.has(w.id)) return w;
        const pos = newLayout.find((l) => l.i === w.id);
        if (!pos) return w;
        return { ...w, gridPos: { x: pos.x, y: pos.y, w: pos.w, h: pos.h } };
      }),
    [widgets, reflowHiddenIds],
  );

  // onLayoutChange fires on EVERY render (cols change, mount, etc.) — never write
  // back to the store here, otherwise window-resize clamps widget positions permanently.
  const handleLayoutChange = useCallback(
    (newLayout: { i: string; x: number; y: number; w: number; h: number }[]) => {
      onLayoutChange?.(buildUpdated(newLayout));
    },
    [buildUpdated, onLayoutChange],
  );

  // Only persist positions after an explicit drag or resize by the user.
  // RGL callback signature: (layout, oldItem, newItem, placeholder, event, element)
  // → layout is the first argument.
  const handleInteractionStop = useCallback(
    (newLayout: { i: string; x: number; y: number; w: number; h: number }[]) => {
      if (readonly) return;
      updateLayouts(buildUpdated(newLayout));
    },
    [readonly, buildUpdated, updateLayouts],
  );

  // ── mobile: single-column stack ───────────────────────────────────────
  if (containerWidth > 0 && containerWidth < mobileBreakpoint) {
    const sorted = [...widgets]
      .filter((w) => !reflowHiddenIds.has(w.id))
      .sort((a, b) => {
        const oa = a.mobileOrder ?? (a.gridPos.y * 1000 + a.gridPos.x);
        const ob = b.mobileOrder ?? (b.gridPos.y * 1000 + b.gridPos.x);
        return oa - ob;
      });

    return (
      <div ref={containerRef} className="flex-1 min-h-0 overflow-auto p-2">
        {/* Reflow-hidden widgets rendered off-screen */}
        <div style={{ position: 'fixed', top: -9999, left: -9999, width: 1, height: 1, overflow: 'hidden', pointerEvents: 'none', opacity: 0 }}>
          {widgets.filter((w) => reflowHiddenIds.has(w.id)).map((w) => (
            <WidgetFrame key={w.id} config={w} editMode={false} onRemove={removeWidget} onConfigChange={(cfg) => updateWidget(cfg.id, cfg)} />
          ))}
        </div>
        <div className="flex flex-col gap-2.5">
          {sorted.map((w) => (
            <div key={w.id} style={{ height: w.gridPos.h * cellSize + (w.gridPos.h - 1) * MARGIN }}>
              <WidgetFrame config={w} editMode={false} onRemove={removeWidget} onConfigChange={(cfg) => updateWidget(cfg.id, cfg)} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (widgets.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center flex-1 h-64 space-y-2"
        style={{ color: 'var(--text-secondary)' }}
      >
        <p>{readonly ? t('frontend.noWidgets') : t('frontend.addWidgets')}</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 min-h-0 overflow-auto p-2 sm:p-4" style={editMode && rglWidth > containerWidth ? { overflowX: 'auto' } : undefined}>
      {rglWidth > 0 && (
        <>
          {/* Reflow-hidden widgets: rendered off-screen so conditions keep evaluating */}
          <div style={{ position: 'fixed', top: -9999, left: -9999, width: 1, height: 1, overflow: 'hidden', pointerEvents: 'none', opacity: 0 }}>
            {widgets.filter((w) => reflowHiddenIds.has(w.id)).map((w) => (
              <WidgetFrame
                key={w.id}
                config={w}
                editMode={false}
                onRemove={removeWidget}
                onConfigChange={(cfg) => updateWidget(cfg.id, cfg)}
              />
            ))}
          </div>

          <ReactGridLayout
          className="layout"
          layout={layout}
          cols={cols}
          rowHeight={cellSize}
          width={rglWidth}
          isDraggable={editMode}
          isResizable={editMode}
          draggableCancel=".nodrag"
          onLayoutChange={handleLayoutChange}
          onDragStop={handleInteractionStop}
          onResizeStop={handleInteractionStop}
          margin={[MARGIN, MARGIN]}
          containerPadding={[0, 0]}
        >
          {gridWidgets.map((w) => (
            <div key={w.id}>
              <WidgetFrame
                config={w}
                editMode={editMode}
                onRemove={removeWidget}
                onConfigChange={(cfg) => updateWidget(cfg.id, cfg)}
              />
            </div>
          ))}
          </ReactGridLayout>
        </>
      )}
    </div>
  );
}
