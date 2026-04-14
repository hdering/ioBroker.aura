import { useRef, useState, useEffect } from 'react';
import ReactGridLayout from 'react-grid-layout';
import { Plus, X, GripVertical, Smartphone } from 'lucide-react';
import type { WidgetProps, WidgetConfig, WidgetType } from '../../types';
import { useConfigStore } from '../../store/configStore';
import { WIDGET_BY_TYPE, WIDGET_REGISTRY, WIDGET_GROUPS } from '../../widgetRegistry';
// WidgetFrame is imported here — circular dep is safe because GroupWidget only
// uses WidgetFrame inside its render function, never at module-init time.
import { WidgetFrame } from '../layout/WidgetFrame';
import { useT } from '../../i18n';

const CHILD_MARGIN = 6;

const DEFAULT_SIZE: Partial<Record<WidgetType, { w: number; h: number }>> = {
  thermostat: { w: 3, h: 3 },
  chart:      { w: 4, h: 3 },
  calendar:   { w: 4, h: 4 },
  list:       { w: 2, h: 3 },
  clock:      { w: 2, h: 2 },
  group:      { w: 4, h: 4 },
};

function makeChild(type: WidgetType, existing: WidgetConfig[]): WidgetConfig {
  const maxY = existing.reduce((m, c) => Math.max(m, c.gridPos.y + c.gridPos.h), 0);
  const { w = 2, h = 2 } = DEFAULT_SIZE[type] ?? {};
  return {
    id: `child-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    title: 'Widget',
    datapoint: '',
    gridPos: { x: 0, y: maxY, w, h },
    options: { icon: WIDGET_BY_TYPE[type]?.iconName },
  };
}

function mobileSort(children: WidgetConfig[]): WidgetConfig[] {
  return [...children].sort((a, b) => {
    const oa = a.mobileOrder ?? (a.gridPos.y * 1000 + a.gridPos.x);
    const ob = b.mobileOrder ?? (b.gridPos.y * 1000 + b.gridPos.x);
    return oa - ob;
  });
}

export function GroupWidget({ config, editMode, onConfigChange }: WidgetProps) {
  const t = useT();
  const children = (config.options?.children as WidgetConfig[] | undefined) ?? [];
  const transparent = !!(config.options?.transparent);
  const cellSize = useConfigStore((s) => s.frontend.gridRowHeight ?? 80);
  const mobileBreakpoint = useConfigStore((s) => s.frontend.mobileBreakpoint ?? 600);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showMobileOrder, setShowMobileOrder] = useState(false);

  // Drag state for mobile-order reordering
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const isMobile = width > 0 && mobileBreakpoint > 0 && width < mobileBreakpoint;

  const cols = !isMobile && width > 0
    ? Math.max(2, Math.floor((width - CHILD_MARGIN) / (cellSize + CHILD_MARGIN)))
    : 4;

  const setChildren = (next: WidgetConfig[]) =>
    onConfigChange({ ...config, options: { ...config.options, children: next } });

  const updateChild = (updated: WidgetConfig) =>
    setChildren(children.map((c) => (c.id === updated.id ? updated : c)));

  // ── Mobile order helpers ───────────────────────────────────────────────────
  const sorted = mobileSort(children);

  const applyMobileOrder = (reordered: WidgetConfig[]) => {
    const next = children.map((c) => {
      const idx = reordered.findIndex((r) => r.id === c.id);
      return idx === -1 ? c : { ...c, mobileOrder: idx };
    });
    setChildren(next);
  };

  const moveItem = (from: number, to: number) => {
    if (to < 0 || to >= sorted.length) return;
    const reordered = [...sorted];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    applyMobileOrder(reordered);
  };

  const handleDrop = (targetIdx: number) => {
    if (dragIdx === null || dragIdx === targetIdx) { setDragIdx(null); setOverIdx(null); return; }
    const reordered = [...sorted];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(targetIdx, 0, moved);
    applyMobileOrder(reordered);
    setDragIdx(null); setOverIdx(null);
  };

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

  // ── Add-widget bar ─────────────────────────────────────────────────────────
  const addBar = editMode ? (
    <div className="nodrag shrink-0 px-2 pb-2 pt-1" style={{ borderTop: transparent ? 'none' : '1px solid var(--widget-border)' }}>
      {showTypePicker ? (
        <div className="space-y-1">
          {WIDGET_GROUPS.map((g) => {
            const types = WIDGET_REGISTRY.filter((m) => m.widgetGroup === g.id && m.type !== 'calendar');
            if (types.length === 0) return null;
            return (
              <div key={g.id}>
                <div className="text-[9px] uppercase tracking-wider px-0.5 pb-0.5" style={{ color: 'var(--text-secondary)' }}>{g.label}</div>
                <div className="flex flex-wrap gap-1">
                  {types.map((m) => (
                    <button
                      key={m.type}
                      onClick={() => { setChildren([...children, makeChild(m.type, children)]); setShowTypePicker(false); }}
                      className="text-[10px] px-2 py-1 rounded-lg hover:opacity-80"
                      style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
                    >
                      {t(`widget.${m.type}` as never)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <button onClick={() => setShowTypePicker(false)} className="hover:opacity-60 p-1 mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            <X size={12} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { setShowTypePicker(true); setShowMobileOrder(false); }}
            className="flex items-center gap-1 text-[10px] hover:opacity-80 px-2 py-1 rounded-lg"
            style={{ color: 'var(--accent)', background: 'var(--app-surface)', border: '1px dashed var(--accent)55' }}
          >
            <Plus size={11} /> {t('group.addWidget')}
          </button>
          <button
            onClick={() => { setShowMobileOrder((v) => !v); setShowTypePicker(false); }}
            className="flex items-center gap-1 text-[10px] hover:opacity-80 px-2 py-1 rounded-lg ml-auto"
            style={{
              color: showMobileOrder ? 'var(--accent)' : 'var(--text-secondary)',
              background: showMobileOrder ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--app-surface)',
              border: `1px solid ${showMobileOrder ? 'var(--accent)' : 'var(--app-border)'}`,
            }}
          >
            <Smartphone size={11} /> {t('group.mobileOrder')}
          </button>
        </div>
      )}

      {/* Mobile order panel */}
      {showMobileOrder && !showTypePicker && (
        <div className="mt-1.5 rounded-lg overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider" style={{ background: 'var(--app-surface)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--app-border)' }}>
            {t('group.mobileOrder')}
          </div>
          {sorted.map((child, i) => (
            <div
              key={child.id}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => { e.preventDefault(); setOverIdx(i); }}
              onDragLeave={() => setOverIdx(null)}
              onDrop={() => handleDrop(i)}
              onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
              className="flex items-center gap-1.5 px-2 py-1 select-none"
              style={{
                background: dragIdx === i ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : overIdx === i ? 'color-mix(in srgb, var(--accent) 6%, var(--app-bg))' : 'var(--app-bg)',
                borderBottom: '1px solid var(--app-border)',
                borderLeft: overIdx === i ? '2px solid var(--accent)' : '2px solid transparent',
                opacity: dragIdx === i ? 0.5 : 1,
                cursor: 'grab',
              }}
            >
              <GripVertical size={11} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
              <span className="text-[10px] font-mono w-3 shrink-0 text-center" style={{ color: 'var(--text-secondary)' }}>{i + 1}</span>
              <span className="flex-1 text-[10px] truncate" style={{ color: 'var(--text-primary)' }}>
                {child.title || t(`widget.${child.type}` as never)}
              </span>
              <div className="flex flex-col gap-0.5 shrink-0">
                <button onClick={() => moveItem(i, i - 1)} disabled={i === 0}
                  className="w-4 h-3 flex items-center justify-center rounded text-[8px] hover:opacity-80 disabled:opacity-20"
                  style={{ background: 'var(--app-surface)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>▲</button>
                <button onClick={() => moveItem(i, i + 1)} disabled={i === sorted.length - 1}
                  className="w-4 h-3 flex items-center justify-center rounded text-[8px] hover:opacity-80 disabled:opacity-20"
                  style={{ background: 'var(--app-surface)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>▼</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  ) : null;

  // ── Mobile layout ──────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="flex flex-col h-full">
        {titleBar}
        <div className="flex-1 overflow-auto min-h-0 p-1">
          <div className="flex flex-col gap-1.5">
            {sorted.map((child) => (
              <div
                key={child.id}
                style={{ height: child.gridPos.h * cellSize + (child.gridPos.h - 1) * CHILD_MARGIN }}
              >
                <WidgetFrame
                  config={child}
                  editMode={false}
                  onRemove={onRemove}
                  onConfigChange={updateChild}
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
        {addBar}
      </div>
    );
  }

  // ── Desktop grid layout ────────────────────────────────────────────────────
  const layout = children.map((c) => ({
    i: c.id,
    x: Math.min(c.gridPos.x, cols - 1),
    y: c.gridPos.y,
    w: Math.min(c.gridPos.w, cols),
    h: c.gridPos.h,
  }));

  return (
    <div className="flex flex-col h-full">
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
            draggableCancel=".nodrag"
            onLayoutChange={(newLayout) => {
              const updated = children.map((c) => {
                const pos = newLayout.find((l) => l.i === c.id);
                if (!pos) return c;
                return { ...c, gridPos: { x: pos.x, y: pos.y, w: pos.w, h: pos.h } };
              });
              setChildren(updated);
            }}
            margin={[CHILD_MARGIN, CHILD_MARGIN]}
            containerPadding={[0, 0]}
          >
            {children.map((child) => (
              <div key={child.id}>
                <WidgetFrame
                  config={child}
                  editMode={editMode}
                  onRemove={onRemove}
                  onConfigChange={updateChild}
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

      {addBar}
    </div>
  );
}
