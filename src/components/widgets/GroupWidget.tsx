import { useRef, useState, useEffect } from 'react';
import ReactGridLayout from 'react-grid-layout';
import { Plus, X } from 'lucide-react';
import type { WidgetProps, WidgetConfig, WidgetType } from '../../types';
import { useConfigStore } from '../../store/configStore';
import { WIDGET_BY_TYPE } from '../../widgetRegistry';
// WidgetFrame is imported here — circular dep is safe because GroupWidget only
// uses WidgetFrame inside its render function, never at module-init time.
import { WidgetFrame } from '../layout/WidgetFrame';
import { useT } from '../../i18n';

const CHILD_MARGIN = 6;

const CHILD_TYPE_LIST: WidgetType[] = [
  'switch', 'value', 'dimmer', 'thermostat', 'chart', 'list', 'clock', 'calendar', 'header', 'group',
];

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

export function GroupWidget({ config, editMode, onConfigChange }: WidgetProps) {
  const t = useT();
  const children = (config.options?.children as WidgetConfig[] | undefined) ?? [];
  const transparent = !!(config.options?.transparent);
  const cellSize = useConfigStore((s) => s.frontend.gridRowHeight ?? 80);
  const [showTypePicker, setShowTypePicker] = useState(false);

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

  const cols = width > 0
    ? Math.max(2, Math.floor((width - CHILD_MARGIN) / (cellSize + CHILD_MARGIN)))
    : 4;

  const setChildren = (next: WidgetConfig[]) =>
    onConfigChange({ ...config, options: { ...config.options, children: next } });

  const layout = children.map((c) => ({
    i: c.id,
    x: Math.min(c.gridPos.x, cols - 1),
    y: c.gridPos.y,
    w: Math.min(c.gridPos.w, cols),
    h: c.gridPos.h,
  }));

  return (
    <div className="flex flex-col h-full">
      {/* Group title bar */}
      {config.title && (
        <div
          className="shrink-0 px-3 py-1.5 text-xs font-semibold truncate"
          style={{ color: 'var(--text-secondary)', borderBottom: transparent ? 'none' : '1px solid var(--widget-border)' }}
        >
          {config.title}
        </div>
      )}

      {/* Inner scrollable grid area */}
      <div ref={containerRef} className="flex-1 overflow-auto min-h-0 p-1">
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
                  onRemove={(id) => setChildren(children.filter((c) => c.id !== id))}
                  onConfigChange={(newChild) =>
                    setChildren(children.map((c) => (c.id === newChild.id ? newChild : c)))
                  }
                />
              </div>
            ))}
          </ReactGridLayout>
        )}

        {children.length === 0 && !editMode && (
          <p className="text-xs text-center py-6" style={{ color: 'var(--text-secondary)' }}>
            Keine Widgets in dieser Gruppe.
          </p>
        )}
      </div>

      {/* Add-widget bar (edit mode only) */}
      {editMode && (
        <div className="nodrag shrink-0 px-2 pb-2 pt-1" style={{ borderTop: transparent ? 'none' : '1px solid var(--widget-border)' }}>
          {showTypePicker ? (
            <div className="flex flex-wrap items-center gap-1">
              {CHILD_TYPE_LIST.map((type) => (
                <button
                  key={type}
                  onClick={() => { setChildren([...children, makeChild(type, children)]); setShowTypePicker(false); }}
                  className="text-[10px] px-2 py-1 rounded-lg hover:opacity-80"
                  style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
                >
                  {t(`widget.${type}` as never)}
                </button>
              ))}
              <button
                onClick={() => setShowTypePicker(false)}
                className="hover:opacity-60 p-1"
                style={{ color: 'var(--text-secondary)' }}
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowTypePicker(true)}
              className="flex items-center gap-1 text-[10px] hover:opacity-80 px-2 py-1 rounded-lg"
              style={{ color: 'var(--accent)', background: 'var(--app-surface)', border: '1px dashed var(--accent)55' }}
            >
              <Plus size={11} /> {t('group.addWidget')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
