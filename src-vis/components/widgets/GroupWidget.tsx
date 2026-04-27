import { useRef, useState, useEffect } from 'react';
import ReactGridLayout from 'react-grid-layout';
import type { WidgetProps, WidgetConfig, WidgetType } from '../../types';
import { useConfigStore } from '../../store/configStore';
import { WIDGET_BY_TYPE } from '../../widgetRegistry';
// WidgetFrame is imported here — circular dep is safe because GroupWidget only
// uses WidgetFrame inside its render function, never at module-init time.
import { WidgetFrame } from '../layout/WidgetFrame';
import { useT } from '../../i18n';
import { CustomGridView } from './CustomGridView';
import { getDragBridge, setDragBridge } from '../../utils/dragBridge';
import { useDashboardMobile } from '../../contexts/DashboardMobileContext';
import { useGroupDefsStore, newGroupDefId } from '../../store/groupDefsStore';

function mobileSort(children: WidgetConfig[]): WidgetConfig[] {
  return [...children].sort((a, b) => {
    const oa = a.mobileOrder ?? (a.gridPos.y * 1000 + a.gridPos.x);
    const ob = b.mobileOrder ?? (b.gridPos.y * 1000 + b.gridPos.x);
    return oa - ob;
  });
}

export function GroupWidget({ config, editMode, onConfigChange }: WidgetProps) {
  const t = useT();
  const configLayout = config.layout ?? 'default';

  // ── defId initialisation ───────────────────────────────────────────────────
  // Stable temp defId used between mount and the first onConfigChange round-trip
  const tempDefIdRef = useRef<string | null>(null);
  const defId = (config.options?.defId as string | undefined) ?? (() => {
    if (!tempDefIdRef.current) tempDefIdRef.current = newGroupDefId();
    return tempDefIdRef.current;
  })();

  // Persist the defId to aura-dashboard on first render if it wasn't saved yet
  useEffect(() => {
    if (!config.options?.defId) {
      onConfigChange({ ...config, options: { ...config.options, defId } });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const children = useGroupDefsStore((s) => s.defs[defId] ?? []);
  const transparent = !!(config.options?.transparent);
  const cellSize = useConfigStore((s) => s.frontend.gridRowHeight ?? 80);
  const gridGap  = useConfigStore((s) => s.frontend.gridGap ?? 10);
  const dashboardIsMobile = useDashboardMobile();
  const [isDragOver, setIsDragOver] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (configLayout === 'custom') return <CustomGridView config={config} value="" />;

  const isMobile = !editMode && dashboardIsMobile;

  const cols = !isMobile && width > 0
    ? Math.max(2, Math.floor((width - gridGap) / (cellSize + gridGap)))
    : 4;

  const setChildren = (next: WidgetConfig[]) =>
    useGroupDefsStore.getState().setDef(defId, next);

  const updateChild = (updated: WidgetConfig) =>
    setChildren(children.map((c) => (c.id === updated.id ? updated : c)));

  const fitHeightToChildren = (next: WidgetConfig[]) => {
    if (next.length === 0) return;
    const maxBottom = Math.max(...next.map((c) => c.gridPos.y + c.gridPos.h));
    const innerH = maxBottom * (cellSize + gridGap) - gridGap;
    const titleBarH = config.title ? 28 : 0;
    const newH = Math.ceil((titleBarH + innerH + 8 + gridGap) / (cellSize + gridGap));
    if (newH > config.gridPos.h) {
      onConfigChange({ ...config, gridPos: { ...config.gridPos, h: newH } });
    }
  };

  const duplicateChild = (child: WidgetConfig) => {
    const maxY = children.reduce((m, c) => Math.max(m, c.gridPos.y + c.gridPos.h), 0);
    setChildren([...children, {
      ...child,
      id: `child-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      gridPos: { ...child.gridPos, x: 0, y: maxY },
    }]);
  };

  const handleGroupDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const bridge = getDragBridge();
    if (!bridge) return;
    const meta = WIDGET_BY_TYPE[bridge.widget.type as WidgetType];
    const maxY = children.reduce((m, c) => Math.max(m, c.gridPos.y + c.gridPos.h), 0);
    const next = [...children, {
      ...bridge.widget,
      id: `child-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      gridPos: { x: 0, y: maxY, w: meta?.defaultW ?? bridge.widget.gridPos.w, h: meta?.defaultH ?? bridge.widget.gridPos.h },
    }];
    setChildren(next);
    fitHeightToChildren(next);
    bridge.remove(bridge.widget.id);
    setDragBridge(null);
  };

  // ── Mobile order helpers ───────────────────────────────────────────────────
  const sorted = mobileSort(children);

  // ── Shared remove + configChange handlers ──────────────────────────────────
  const onRemove = (id: string) => setChildren(children.filter((c) => c.id !== id));

  // ── Title bar (always shown in editMode as outer-grid drag handle) ─────────
  const titleBar = (config.title || editMode) ? (
    <div
      className="shrink-0 px-3 py-1.5 text-xs font-semibold truncate"
      style={{
        color: 'var(--text-secondary)',
        borderBottom: transparent ? 'none' : '1px solid var(--widget-border)',
        minHeight: editMode && !config.title ? '18px' : undefined,
      }}
    >
      {config.title}
    </div>
  ) : null;

  const dragHandlers = editMode ? {
    onDragOver:  (e: React.DragEvent) => { if (getDragBridge()) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setIsDragOver(true); } },
    onDragEnter: (e: React.DragEvent) => { if (getDragBridge()) { e.preventDefault(); setIsDragOver(true); } },
    onDragLeave: (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false); },
    onDrop: handleGroupDrop,
  } : {};

  // ── Mobile layout ──────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="relative flex flex-col" {...dragHandlers}>
        {isDragOver && (
          <div className="nodrag pointer-events-none absolute inset-0 z-20 rounded-[inherit] border-2 border-dashed flex items-center justify-center"
            style={{ borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}>
            <p className="text-sm font-medium" style={{ color: 'var(--accent)' }}>{t('group.dropHere')}</p>
          </div>
        )}
        {titleBar}

        <div className="aura-scroll flex-1 overflow-auto min-h-0 p-1" style={{ scrollbarGutter: 'stable both-edges' }}>
          <div className="flex flex-col gap-1.5">
            {sorted.map((child) => (
              <div
                key={child.id}
                style={{ height: child.gridPos.h * cellSize + (child.gridPos.h - 1) * gridGap }}
              >
                <WidgetFrame
                  config={child}
                  editMode={false}
                  onRemove={onRemove}
                  onConfigChange={updateChild}
                  onDuplicate={() => duplicateChild(child)}
                />
              </div>
            ))}
          </div>
          {children.length === 0 && (
            <p className="text-xs text-center py-6" style={{ color: 'var(--text-secondary)' }}>
              {t('group.noWidgets')}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Desktop grid layout ────────────────────────────────────────────────────
  const layout = children.map((c) => {
    const x = Math.min(c.gridPos.x, cols - 1);
    const w = Math.min(c.gridPos.w, cols - x);
    return { i: c.id, x, y: c.gridPos.y, w, h: c.gridPos.h };
  });

  return (
    <div className="relative flex flex-col h-full" {...dragHandlers}>
      {isDragOver && (
        <div className="nodrag pointer-events-none absolute inset-0 z-20 rounded-[inherit] border-2 border-dashed flex items-center justify-center"
          style={{ borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--accent)' }}>{t('group.dropHere')}</p>
        </div>
      )}
      {titleBar}

      {/* Inner scrollable grid area – stop propagation so outer RGL doesn't
          intercept drags meant for the inner grid */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto min-h-0 p-1"
        onMouseDown={editMode ? (e) => e.stopPropagation() : undefined}
        onPointerDown={editMode ? (e) => e.stopPropagation() : undefined}
      >
        {width > 0 && (
          <ReactGridLayout
            layout={layout}
            cols={cols}
            rowHeight={cellSize}
            width={width}
            isDraggable={editMode}
            isResizable={editMode}
            compactType={editMode ? 'vertical' : null}
            draggableCancel=".nodrag"
            onDragStop={(newLayout) => {
              if (!editMode) return;
              let changed = false;
              const updated = children.map((c) => {
                const pos = newLayout.find((l) => l.i === c.id);
                if (!pos) return c;
                if (pos.x === c.gridPos.x && pos.y === c.gridPos.y && pos.w === c.gridPos.w && pos.h === c.gridPos.h) return c;
                changed = true;
                return { ...c, gridPos: { x: pos.x, y: pos.y, w: pos.w, h: pos.h } };
              });
              if (changed) setChildren(updated);
            }}
            onResizeStop={(newLayout) => {
              if (!editMode) return;
              let changed = false;
              const updated = children.map((c) => {
                const pos = newLayout.find((l) => l.i === c.id);
                if (!pos) return c;
                if (pos.x === c.gridPos.x && pos.y === c.gridPos.y && pos.w === c.gridPos.w && pos.h === c.gridPos.h) return c;
                changed = true;
                return { ...c, gridPos: { x: pos.x, y: pos.y, w: pos.w, h: pos.h } };
              });
              if (changed) setChildren(updated);
            }}
            margin={[gridGap, gridGap]}
            containerPadding={[0, 0]}
          >
            {children.map((child) => (
              <div key={child.id}>
                <WidgetFrame
                  config={child}
                  editMode={editMode}
                  onRemove={onRemove}
                  onConfigChange={updateChild}
                  onDuplicate={() => duplicateChild(child)}
                />
              </div>
            ))}
          </ReactGridLayout>
        )}

        {children.length === 0 && !editMode && (
          <p className="text-xs text-center py-6" style={{ color: 'var(--text-secondary)' }}>
            {t('group.noWidgets')}
          </p>
        )}
      </div>

    </div>
  );
}
