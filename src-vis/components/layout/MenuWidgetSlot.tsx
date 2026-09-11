/**
 * A dashboard widget hosted inside one of the navigation chromes (header, tab
 * bar, section menu).
 *
 * It renders through the real `WidgetFrame`, not bare through the widget map, so
 * a widget in a menu behaves exactly like the same widget on a dashboard:
 * conditions, badges, click actions, popups and the last-change overlay all keep
 * working. The only difference is the box — a menu slot is sized in px rather
 * than in grid cells, and by default it drops the card so it sits flush in the
 * bar.
 */

import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useDashboardStore } from '../../store/dashboardStore';
import type { MenuItemContent } from '../../store/dashboardStore';
import { resolveMenuWidget, MENU_WIDGET_DEFAULT_H, MENU_WIDGET_DEFAULT_W } from '../../utils/menuItems';
import { WidgetFrame } from './WidgetFrame';

interface Props {
    item: MenuItemContent;
    /**
     * `bar` = horizontal chrome (header, tab bar, docked section bar): fixed
     * width, stretches to the bar's own height unless the item says otherwise.
     * `block` = stacked list (section menu drawer): full width, fixed height.
     */
    variant: 'bar' | 'block';
    /**
     * Admin preview: render the widget's edit chrome, so its own options panel is
     * reachable straight from the element row. The element editor uses this very
     * component instead of a preview of its own, so what the admin shows and what
     * the bar draws can never drift apart.
     */
    editMode?: boolean;
    /** Item-owned widget edits are persisted by the host (admin preview only). */
    onWidgetChange?: (next: MenuItemContent['widget']) => void;
}

export function MenuWidgetSlot({ item, variant, editMode = false, onWidgetChange }: Props) {
    const layouts = useDashboardStore((s) => s.layouts);
    const updateWidget = useDashboardStore((s) => s.updateWidget);
    const resolved = resolveMenuWidget(item, layouts);

    // A menu slot is a px box, never a grid cell — hand the widget a gridPos that
    // matches so anything deriving columns from it (groups, panels) agrees with
    // what it actually gets. Card suppression rides on the widget's own
    // transparency option, which is exactly what WidgetFrame already honours.
    const config = useMemo(() => {
        if (!resolved) return undefined;
        const w = resolved.widget;
        const withLayout = item.widgetLayout ? { ...w, layout: item.widgetLayout } : w;
        if (item.widgetCard) return withLayout;
        return { ...withLayout, options: { ...withLayout.options, transparent: true, transparency: 100 } };
    }, [resolved, item.widgetCard, item.widgetLayout]);

    if (!resolved || !config) {
        return (
            <div
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] shrink-0"
                style={{
                    color: 'var(--text-secondary)',
                    border: '1px dashed var(--app-border)',
                    maxWidth: 220,
                }}
                title={item.widgetId}
            >
                <AlertTriangle size={12} className="shrink-0" style={{ color: 'var(--accent-red, #ef4444)' }} />
                <span className="truncate font-mono">{item.widgetId || '—'}</span>
            </div>
        );
    }

    // Both dimensions are definite — see MENU_WIDGET_DEFAULT_H on why a bar slot
    // does not simply stretch. The widget fills the box; it never sizes it.
    const boxStyle: CSSProperties =
        variant === 'bar'
            ? {
                  width: item.widgetWidth || MENU_WIDGET_DEFAULT_W.bar,
                  height: item.widgetHeight || MENU_WIDGET_DEFAULT_H.bar,
                  alignSelf: 'center',
                  flexShrink: 0,
              }
            : {
                  width: item.widgetWidth || '100%',
                  height: item.widgetHeight || MENU_WIDGET_DEFAULT_H.block,
              };

    return (
        <div className="aura-menu-widget" style={boxStyle}>
            <div style={{ height: '100%' }}>
                <WidgetFrame
                    config={config}
                    editMode={editMode}
                    onRemove={() => {}}
                    onConfigChange={(next) => {
                        // Widgets persist their own interactive state (timer events,
                        // enabled flags …) through this callback. Route it back to
                        // wherever the widget actually lives — and restore the two
                        // keys the bare-slot override borrowed, so a card-less slot
                        // never bakes `transparent` into the source widget.
                        const src = (resolved.widget.options ?? {}) as Record<string, unknown>;
                        const options = { ...next.options } as Record<string, unknown>;
                        if (!item.widgetCard) {
                            for (const k of ['transparent', 'transparency'] as const) {
                                if (k in src) options[k] = src[k];
                                else delete options[k];
                            }
                        }
                        // In the admin the whole widget is editable, not just its
                        // options — the element owns it. Keep the slot's layout
                        // override out of what gets stored.
                        if (resolved.owned) {
                            const layout = item.widgetLayout ? resolved.widget.layout : next.layout;
                            onWidgetChange?.({ ...next, layout, options });
                        } else updateWidget(resolved.widget.id, { options });
                    }}
                />
            </div>
        </div>
    );
}
