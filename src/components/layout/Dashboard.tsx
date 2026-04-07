import { useCallback } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import { useDashboardStore } from '../../store/dashboardStore';
import { WidgetFrame } from './WidgetFrame';
import type { WidgetConfig } from '../../types';

const ResponsiveGridLayout = WidthProvider(Responsive);
const BREAKPOINTS = { lg: 1200, md: 768, sm: 480, xs: 0 };
const COLS = { lg: 12, md: 8, sm: 4, xs: 2 };
const ROW_HEIGHT = 80;

interface DashboardProps {
  readonly?: boolean;
  editMode?: boolean;
  onLayoutChange?: (widgets: WidgetConfig[]) => void;
}

export function Dashboard({ readonly = false, editMode = false, onLayoutChange }: DashboardProps) {
  const { tabs, activeTabId, updateWidget, updateLayouts } = useDashboardStore();

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const widgets = activeTab?.widgets ?? [];

  const layouts = {
    lg: widgets.map((w) => ({ i: w.id, x: w.gridPos.x, y: w.gridPos.y, w: w.gridPos.w, h: w.gridPos.h })),
  };

  const handleLayoutChange = useCallback(
    (_: unknown, allLayouts: Record<string, { i: string; x: number; y: number; w: number; h: number }[]>) => {
      const lg = allLayouts['lg'];
      if (!lg) return;
      const updated = widgets.map((w) => {
        const pos = lg.find((l) => l.i === w.id);
        if (!pos) return w;
        return { ...w, gridPos: { x: pos.x, y: pos.y, w: pos.w, h: pos.h } };
      });
      updateLayouts(updated);
      onLayoutChange?.(updated);
    },
    [widgets, updateLayouts, onLayoutChange],
  );

  if (widgets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 h-64 space-y-2"
        style={{ color: 'var(--text-secondary)' }}>
        <p>{readonly ? 'Keine Widgets konfiguriert.' : 'Noch keine Widgets – über "+ Geräte" hinzufügen.'}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-2 sm:p-4">
      <ResponsiveGridLayout
        className="layout"
        layouts={layouts}
        breakpoints={BREAKPOINTS}
        cols={COLS}
        rowHeight={ROW_HEIGHT}
        isDraggable={editMode}
        isResizable={editMode}
        draggableCancel=".nodrag"
        onLayoutChange={handleLayoutChange}
        margin={[10, 10]}
        containerPadding={[0, 0]}
      >
        {widgets.map((w) => (
          <div key={w.id}>
            <WidgetFrame
              config={w}
              editMode={editMode}
              onRemove={() => {}}
              onConfigChange={(cfg) => updateWidget(cfg.id, cfg)}
            />
          </div>
        ))}
      </ResponsiveGridLayout>
    </div>
  );
}
