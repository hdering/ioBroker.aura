import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactGridLayout from 'react-grid-layout/legacy';
import { X, Check } from 'lucide-react';
import { useT } from '../../i18n';
import type { WidgetConfig, WidgetPreset } from '../../types';
import { useWidgetPresetsStore } from '../../store/widgetPresetsStore';
import { useGroupDefsStore } from '../../store/groupDefsStore';
import { collectGroupDefs } from '../../utils/widgetExportImport';
import { useEffectiveSettings } from '../../hooks/useEffectiveSettings';
import { ActiveLayoutContext } from '../../contexts/ActiveLayoutContext';
import { WidgetFrame } from '../layout/WidgetFrame';

const DEFAULT_MARGIN = 10;
const clone = (w: WidgetConfig) => JSON.parse(JSON.stringify(w)) as WidgetConfig;

/**
 * Edit a Widget-Designer preset's actual widget content (layout, options, cells)
 * using the real WidgetFrame edit UI — the same one used in the dashboard and popup
 * editors. The widget is hosted in a single-cell ReactGridLayout (mirrors
 * PopupViewEditor). Group/panels children live in groupDefsStore, so the preset's
 * group defs are registered on open and re-collected on save.
 */
export function PresetEditDialog({ preset, onClose }: { preset: WidgetPreset; onClose: () => void }) {
    const t = useT();
    const updatePreset = useWidgetPresetsStore((s) => s.updatePreset);
    const settings = useEffectiveSettings();
    const cellSize = settings.gridRowHeight ?? 60;
    const snapX = settings.gridSnapX ?? settings.gridRowHeight ?? 60;
    const MARGIN = settings.gridGap ?? DEFAULT_MARGIN;

    const [draft, setDraft] = useState<WidgetConfig>(() => clone(preset.widget));

    // Register the preset's group defs so group/panels children render while editing.
    useEffect(() => {
        if (preset.groupDefs) {
            const { setDef } = useGroupDefsStore.getState();
            for (const [id, children] of Object.entries(preset.groupDefs)) setDef(id, children);
        }
        // No cleanup: unreferenced defs are GC'd on the next dashboard save; we
        // re-collect the current state into the preset on save below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [preset.id]);

    const roRef = useRef<ResizeObserver | null>(null);
    const [containerWidth, setContainerWidth] = useState(0);
    const containerRefCallback = useCallback((el: HTMLDivElement | null) => {
        if (roRef.current) {
            roRef.current.disconnect();
            roRef.current = null;
        }
        if (!el) return;
        setContainerWidth(el.clientWidth);
        const ro = new ResizeObserver(([entry]) => setContainerWidth(Math.floor(entry.contentRect.width)));
        ro.observe(el);
        roRef.current = ro;
    }, []);

    const cols = containerWidth > 0 ? Math.max(2, Math.floor((containerWidth - MARGIN) / (snapX + MARGIN))) : 12;

    const layout = [
        {
            i: draft.id,
            x: draft.gridPos.x ?? 0,
            y: draft.gridPos.y ?? 0,
            w: draft.gridPos.w ?? 4,
            h: draft.gridPos.h ?? 3,
            minH: 1,
        },
    ];

    const syncLayout = (nl: readonly { i: string; x: number; y: number; w: number; h: number }[]) => {
        const it = nl.find((l) => l.i === draft.id);
        if (!it) return;
        setDraft((d) => ({ ...d, gridPos: { x: it.x, y: it.y, w: it.w, h: it.h } }));
    };

    const handleSave = () => {
        let groupDefs: Record<string, WidgetConfig[]> | undefined;
        if ((draft.type === 'group' || draft.type === 'panels') && draft.options?.defId) {
            const out: Record<string, WidgetConfig[]> = {};
            collectGroupDefs([draft], useGroupDefsStore.getState().defs, out);
            if (Object.keys(out).length > 0) groupDefs = JSON.parse(JSON.stringify(out));
        }
        updatePreset(preset.id, { widget: clone(draft), groupDefs });
        onClose();
    };

    return createPortal(
        <ActiveLayoutContext.Provider value="">
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000] p-4" onClick={onClose}>
                <div
                    className="rounded-xl w-full max-w-4xl shadow-2xl flex flex-col"
                    style={{
                        height: '85vh',
                        background: 'linear-gradient(var(--app-surface), var(--app-surface)), var(--app-bg)',
                        border: '1px solid var(--app-border)',
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div
                        className="flex items-center justify-between px-6 pt-5 pb-4"
                        style={{ borderBottom: '1px solid var(--app-border)' }}
                    >
                        <h2 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                            {preset.icon ? `${preset.icon} ` : ''}
                            {preset.name}
                        </h2>
                        <button
                            onClick={onClose}
                            className="hover:opacity-60"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            <X size={18} />
                        </button>
                    </div>

                    <div ref={containerRefCallback} className="aura-scroll flex-1 overflow-auto p-4">
                        {containerWidth > 0 && (
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
                                <div key={draft.id}>
                                    <WidgetFrame
                                        config={draft}
                                        editMode
                                        onRemove={() => {}}
                                        onConfigChange={(cfg) => setDraft(cfg)}
                                        onCopy={() => {}}
                                    />
                                </div>
                            </ReactGridLayout>
                        )}
                    </div>

                    <div
                        className="flex justify-end gap-2 px-6 py-4"
                        style={{ borderTop: '1px solid var(--app-border)' }}
                    >
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm rounded-lg hover:opacity-80"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--app-border)',
                            }}
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            onClick={handleSave}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-80"
                            style={{ background: 'var(--accent)' }}
                        >
                            <Check size={13} /> {t('preset.edit.save')}
                        </button>
                    </div>
                </div>
            </div>
        </ActiveLayoutContext.Provider>,
        document.body,
    );
}
