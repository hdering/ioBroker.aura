/**
 * Edit the widget instance that a menu element owns (header / tab bar / section
 * menu). Uses the real `WidgetFrame` edit UI, the same one the dashboard, the
 * popup editor and the Widget-Designer use — see PresetEditDialog for the
 * original of this recipe.
 *
 * Unlike those, a menu slot is a px box rather than a grid cell, so the widget is
 * hosted in exactly the box it will occupy in the bar. What you see here is the
 * size it gets, which is the whole point: a widget that overflows a 40px tab bar
 * should look wrong in the editor too.
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check } from 'lucide-react';
import { useT } from '../../i18n';
import type { WidgetConfig } from '../../types';
import type { MenuItemContent } from '../../store/dashboardStore';
import { ActiveLayoutContext } from '../../contexts/ActiveLayoutContext';
import { usePortalThemeVars } from '../../contexts/PortalTargetContext';
import { WidgetFrame } from '../layout/WidgetFrame';
import { MENU_WIDGET_DEFAULT_H, MENU_WIDGET_DEFAULT_W } from '../../utils/menuItems';

const clone = (w: WidgetConfig) => JSON.parse(JSON.stringify(w)) as WidgetConfig;

interface Props {
    item: MenuItemContent;
    /** Preview box shape — mirrors the host the item sits in. */
    variant: 'bar' | 'block';
    onSave: (patch: Partial<MenuItemContent>) => void;
    onClose: () => void;
}

export function MenuWidgetEditDialog({ item, variant, onSave, onClose }: Props) {
    const t = useT();
    const themeVars = usePortalThemeVars();
    const [draft, setDraft] = useState<WidgetConfig>(() => clone(item.widget!));
    const [width, setWidth] = useState<number>(item.widgetWidth || MENU_WIDGET_DEFAULT_W[variant]);
    const [height, setHeight] = useState<number>(item.widgetHeight || MENU_WIDGET_DEFAULT_H[variant]);
    const [card, setCard] = useState<boolean>(item.widgetCard ?? false);

    const iSty = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };

    const handleSave = () => {
        onSave({
            widget: clone(draft),
            widgetWidth: width || undefined,
            widgetHeight: height || undefined,
            widgetCard: card,
        });
        onClose();
    };

    return createPortal(
        <ActiveLayoutContext.Provider value="">
            <div
                className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000] p-4"
                style={themeVars}
                onClick={onClose}
            >
                <div
                    className="rounded-xl w-full max-w-3xl shadow-2xl flex flex-col"
                    style={{
                        maxHeight: '85vh',
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
                            {t('menuItem.widget.editTitle')}
                        </h2>
                        <button
                            onClick={onClose}
                            className="hover:opacity-60"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            <X size={18} />
                        </button>
                    </div>

                    <div className="aura-scroll flex-1 overflow-auto p-6 space-y-4">
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                                    {t('menuItem.widget.width')}
                                </p>
                                <input
                                    type="number"
                                    min={20}
                                    max={1200}
                                    value={width}
                                    onChange={(e) =>
                                        setWidth(Math.min(1200, Math.max(0, parseInt(e.target.value) || 0)))
                                    }
                                    className="w-full text-sm rounded-lg px-2 py-1.5 focus:outline-none"
                                    style={iSty}
                                />
                            </div>
                            <div>
                                <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                                    {t('menuItem.widget.height')}
                                </p>
                                <input
                                    type="number"
                                    min={20}
                                    max={800}
                                    value={height}
                                    onChange={(e) =>
                                        setHeight(Math.min(800, Math.max(0, parseInt(e.target.value) || 0)))
                                    }
                                    className="w-full text-sm rounded-lg px-2 py-1.5 focus:outline-none"
                                    style={iSty}
                                />
                            </div>
                            <div className="flex items-end pb-1">
                                <label
                                    className="flex items-center gap-2 text-xs cursor-pointer"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    <input type="checkbox" checked={card} onChange={(e) => setCard(e.target.checked)} />
                                    {t('menuItem.widget.card')}
                                </label>
                            </div>
                        </div>

                        <div
                            className="rounded-lg p-6 flex items-center justify-center"
                            style={{ background: 'var(--app-bg)', border: '1px dashed var(--app-border)' }}
                        >
                            <div
                                style={{
                                    width: width || MENU_WIDGET_DEFAULT_W[variant],
                                    height: height || MENU_WIDGET_DEFAULT_H[variant],
                                }}
                            >
                                <WidgetFrame
                                    config={draft}
                                    editMode
                                    onRemove={() => {}}
                                    onConfigChange={(cfg) => setDraft(cfg)}
                                    onCopy={() => {}}
                                />
                            </div>
                        </div>
                        <p className="text-[11px]" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                            {t('menuItem.widget.editHint')}
                        </p>
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
                            <Check size={13} /> {t('common.save')}
                        </button>
                    </div>
                </div>
            </div>
        </ActiveLayoutContext.Provider>,
        document.body,
    );
}
