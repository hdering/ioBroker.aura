import { Suspense, useCallback, useMemo, useRef, useState } from 'react';
import ReactGridLayout from 'react-grid-layout/legacy';
import { AlertTriangle } from 'lucide-react';
import { usePopupConfigStore } from '../../../store/popupConfigStore';
import { useEffectiveSettings } from '../../../hooks/useEffectiveSettings';
import { getWidgetMap } from '../widgetMap';
import type { WidgetConfig } from '../../../types';

const DEFAULT_MARGIN = 10;

// ── {{key}} substitution ──────────────────────────────────────────────────────

function subAll(value: string, map: Record<string, string>): string {
    if (!value) return value;
    return value.replace(/\{\{(\w+)\}\}/g, (_, key) => map[key] ?? `{{${key}}}`);
}

function substituteWidget(w: WidgetConfig, map: Record<string, string>): WidgetConfig {
    if (Object.keys(map).length === 0) return w;
    return {
        ...w,
        datapoint: subAll(w.datapoint, map),
        title: subAll(w.title, map),
        options: w.options
            ? Object.fromEntries(
                  Object.entries(w.options).map(([k, v]) => [k, typeof v === 'string' ? subAll(v, map) : v]),
              )
            : w.options,
    };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
    viewId: string;
    triggerWidget?: WidgetConfig;
}

export function TabEmbedBody({ viewId, triggerWidget }: Props) {
    const view = usePopupConfigStore((s) => s.views.find((v) => v.id === viewId));
    const settings = useEffectiveSettings();
    const cellSize = settings.gridRowHeight ?? 60;
    const snapX = settings.gridSnapX ?? settings.gridRowHeight ?? 60;
    const MARGIN = settings.gridGap ?? DEFAULT_MARGIN;

    const roRef = useRef<ResizeObserver | null>(null);
    const [containerWidth, setContainerWidth] = useState(0);

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

    const naturalMinWidth = useMemo(() => {
        if (!view || view.widgets.length === 0) return 280;
        const maxCol = Math.max(...view.widgets.map((w) => (w.gridPos.x ?? 0) + (w.gridPos.w ?? 4)));
        return maxCol * (snapX + MARGIN) + MARGIN + 24;
    }, [view, snapX, MARGIN]);

    const cols = containerWidth > 0 ? Math.max(2, Math.floor((containerWidth - MARGIN) / (snapX + MARGIN))) : 12;

    if (!view || view.widgets.length === 0) {
        return (
            <div
                className="flex flex-col items-center justify-center h-48 gap-2 p-4"
                style={{ color: 'var(--text-secondary)' }}
            >
                <AlertTriangle size={24} style={{ color: 'var(--accent-red, #ef4444)' }} />
                <span className="text-sm">{view ? 'View ist leer' : 'View nicht gefunden'}</span>
                <span className="text-xs opacity-60 font-mono">{viewId}</span>
            </div>
        );
    }

    const subMap: Record<string, string> = triggerWidget
        ? {
              dp: triggerWidget.datapoint,
              ...Object.fromEntries(
                  Object.entries(triggerWidget.options ?? {}).filter(
                      (e): e is [string, string] => typeof e[1] === 'string',
                  ),
              ),
          }
        : {};

    const wm = getWidgetMap();
    const widgets = view.widgets.map((w) => substituteWidget(w, subMap));

    const layout = widgets.map((w) => ({
        i: w.id,
        x: w.gridPos.x ?? 0,
        y: w.gridPos.y ?? 9999,
        w: w.gridPos.w ?? 4,
        h: w.gridPos.h ?? 3,
        minH: 1,
    }));

    return (
        <div ref={containerRefCallback} className="p-3" style={{ minWidth: naturalMinWidth }}>
            {containerWidth > 0 && (
                <ReactGridLayout
                    className="layout"
                    layout={layout}
                    cols={cols}
                    rowHeight={cellSize}
                    width={containerWidth}
                    isDraggable={false}
                    isResizable={false}
                    margin={[MARGIN, MARGIN]}
                    containerPadding={[0, 0]}
                >
                    {widgets.map((w) => {
                        const Widget = wm[w.type as keyof typeof wm];
                        return (
                            <div key={w.id}>
                                {Widget ? (
                                    <Suspense fallback={<div className="h-full w-full" style={{ opacity: 0.3 }} />}>
                                        <Widget config={w} editMode={false} onConfigChange={() => {}} />
                                    </Suspense>
                                ) : (
                                    <div
                                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs h-full"
                                        style={{
                                            background: 'var(--app-bg)',
                                            color: 'var(--text-secondary)',
                                            border: '1px solid var(--app-border)',
                                        }}
                                    >
                                        <AlertTriangle size={13} />
                                        Unbekannter Typ: {w.type}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </ReactGridLayout>
            )}
        </div>
    );
}
