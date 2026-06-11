import { useCallback, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactGridLayout from 'react-grid-layout/legacy';
import { ArrowLeft, Plus } from 'lucide-react';
import { usePopupConfigStore, BUILTIN_VIEW_IDS } from '../../store/popupConfigStore';
import { useEffectiveSettings } from '../../hooks/useEffectiveSettings';
import { WidgetFrame } from '../../components/layout/WidgetFrame';
import { ActiveLayoutContext } from '../../contexts/ActiveLayoutContext';
import { WIDGET_REGISTRY, ALL_POPUP_PLACEHOLDER_KEYS } from '../../widgetRegistry';
import { useSuperAdmin } from '../../hooks/useSuperAdmin';
import type { WidgetConfig, WidgetType } from '../../types';

const DEFAULT_MARGIN = 10;

export function PopupViewEditor() {
    const { viewId } = useParams<{ viewId: string }>();
    const navigate = useNavigate();
    const { views, addWidgetToView, removeWidgetFromView, updateWidgetInView, copyView, setViewAutoCloseSec } =
        usePopupConfigStore();

    const isSuperAdmin = useSuperAdmin();
    const view = views.find((v) => v.id === viewId);
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

    const cols = containerWidth > 0 ? Math.max(2, Math.floor((containerWidth - MARGIN) / (snapX + MARGIN))) : 12;

    const [addType, setAddType] = useState<WidgetType>(WIDGET_REGISTRY[0]?.type as WidgetType);

    if (!viewId || !view) {
        return (
            <div className="flex items-center justify-center h-64 text-sm" style={{ color: 'var(--text-secondary)' }}>
                View nicht gefunden: {viewId}
            </div>
        );
    }

    if (BUILTIN_VIEW_IDS.has(viewId) && !isSuperAdmin) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Standard-Views können nicht direkt bearbeitet werden.
                </p>
                <button
                    onClick={() => {
                        const id = copyView(viewId);
                        navigate(`/admin/popups/${id}`);
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium hover:opacity-80 transition-opacity"
                    style={{ background: 'var(--accent)', color: '#fff' }}
                >
                    <Plus size={14} /> Als Kopie bearbeiten
                </button>
                <button
                    onClick={() => navigate('/admin/popups')}
                    className="text-xs hover:opacity-70 transition-opacity"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    Zurück
                </button>
            </div>
        );
    }

    const widgets = view.widgets;

    const layout = widgets.map((w) => ({
        i: w.id,
        x: w.gridPos.x ?? 0,
        y: w.gridPos.y ?? 9999,
        w: w.gridPos.w ?? 4,
        h: w.gridPos.h ?? 3,
        minH: 1,
    }));

    const syncLayout = (nl: readonly { i: string; x: number; y: number; w: number; h: number }[]) => {
        nl.forEach(({ i, x, y, w: nw, h: nh }) => {
            const widget = widgets.find((wg) => wg.id === i);
            if (!widget) return;
            if (
                widget.gridPos.x !== x ||
                widget.gridPos.y !== y ||
                widget.gridPos.w !== nw ||
                widget.gridPos.h !== nh
            ) {
                updateWidgetInView(viewId, i, { gridPos: { x, y, w: nw, h: nh } });
            }
        });
    };

    const handleAddWidget = () => {
        const meta = WIDGET_REGISTRY.find((m) => m.type === addType);
        const widget: WidgetConfig = {
            id: `pw-${Date.now()}`,
            type: addType,
            title: '',
            datapoint: '{{dp}}',
            gridPos: { x: 0, y: 9999, w: 6, h: 4 },
            options: { ...(meta?.popupDefaults ?? {}) },
        };
        addWidgetToView(viewId, widget);
    };

    return (
        <ActiveLayoutContext.Provider value="">
            <div className="flex flex-col h-full">
                {/* Toolbar */}
                <div
                    className="flex items-center gap-3 px-4 py-3 shrink-0"
                    style={{ borderBottom: '1px solid var(--app-border)', background: 'var(--app-surface)' }}
                >
                    <button
                        onClick={() => navigate('/admin/popups')}
                        className="flex items-center gap-1.5 text-xs hover:opacity-70 transition-opacity"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        <ArrowLeft size={14} />
                        Zurück
                    </button>
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {view.name}
                    </span>
                    <div
                        className="flex items-center gap-1 flex-wrap"
                        title="Verfügbare Platzhalter aus dem auslösenden Widget"
                    >
                        {ALL_POPUP_PLACEHOLDER_KEYS.map((key) => (
                            <span
                                key={key}
                                className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--text-secondary)',
                                    border: '1px solid var(--app-border)',
                                }}
                            >
                                {`{{${key}}}`}
                            </span>
                        ))}
                    </div>
                    <div className="flex-1" />
                    <label
                        className="flex items-center gap-1.5 text-[11px]"
                        style={{ color: 'var(--text-secondary)' }}
                        title="Auto-Schließen für diese View (Sek., leer = global)"
                    >
                        Auto-Schließen
                        <input
                            type="number"
                            min={0}
                            max={3600}
                            step={1}
                            value={view.autoCloseSec ?? ''}
                            onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === '') return setViewAutoCloseSec(viewId, undefined);
                                const n = Number(raw);
                                setViewAutoCloseSec(viewId, Number.isFinite(n) && n >= 0 ? n : undefined);
                            }}
                            placeholder="global"
                            className="text-xs rounded-lg px-2 py-1.5 focus:outline-none w-20"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--app-border)',
                            }}
                        />
                    </label>
                    <select
                        value={addType}
                        onChange={(e) => setAddType(e.target.value as WidgetType)}
                        className="text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--app-border)',
                        }}
                    >
                        {WIDGET_REGISTRY.map((m) => (
                            <option key={m.type} value={m.type}>
                                {m.label}
                            </option>
                        ))}
                    </select>
                    <button
                        onClick={handleAddWidget}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
                        style={{ background: 'var(--accent)', color: '#fff' }}
                    >
                        <Plus size={12} /> Widget
                    </button>
                </div>

                {/* Grid canvas */}
                <div ref={containerRefCallback} className="aura-scroll flex-1 overflow-auto p-4">
                    {widgets.length === 0 ? (
                        <div
                            className="flex items-center justify-center h-48 text-sm"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            Noch keine Widgets — füge oben welche hinzu.
                        </div>
                    ) : (
                        containerWidth > 0 && (
                            <ReactGridLayout
                                className="layout"
                                layout={layout}
                                cols={cols}
                                rowHeight={cellSize}
                                width={containerWidth}
                                isDraggable
                                isResizable
                                draggableCancel=".nodrag"
                                onDragStop={syncLayout}
                                onResizeStop={syncLayout}
                                margin={[MARGIN, MARGIN]}
                                containerPadding={[0, 0]}
                            >
                                {widgets.map((w) => (
                                    <div key={w.id}>
                                        <WidgetFrame
                                            config={w}
                                            editMode
                                            onRemove={(id) => removeWidgetFromView(viewId, id)}
                                            onConfigChange={(cfg) => updateWidgetInView(viewId, cfg.id, cfg)}
                                        />
                                    </div>
                                ))}
                            </ReactGridLayout>
                        )
                    )}
                </div>
            </div>
        </ActiveLayoutContext.Provider>
    );
}
