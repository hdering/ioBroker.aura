/**
 * Shared helpers for the extra elements of the three navigation chromes — header,
 * tab bar and section menu. They all host the same `MenuItemContent` shapes
 * (clock / datapoint / text / widget); only the position axis differs.
 */

import type { DashboardLayout, HeaderItem, MenuItemContent, MenuItemType } from '../store/dashboardStore';
import type { FrontendSettings } from '../store/configStore';
import type { WidgetConfig, WidgetLayout, WidgetType } from '../types';
import { WIDGET_BY_TYPE } from '../widgetRegistry';
import { getAvailableLayouts } from './widgetLayouts';

/** Fresh element of the given type, with the defaults its editor expects. */
export function makeMenuItem<T extends MenuItemContent>(type: MenuItemType, rest: Omit<T, keyof MenuItemContent>): T {
    return {
        id: `mi-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        type,
        ...(type === 'clock' ? { clockDisplay: 'time' as const } : {}),
        ...rest,
    } as T;
}

/**
 * Widget types that actually read well inside a navigation bar: small, one line
 * of content, no intrinsic scroll area. The picker offers these first and hides
 * the rest behind "show all" — the limit is a display hint, not a restriction,
 * because the section menu's block layout has room for far more than a 40px bar.
 */
export const MENU_FRIENDLY_TYPES: WidgetType[] = [
    'value',
    'switch',
    'button',
    'chips',
    'fill',
    'gauge',
    'clock',
    'stateimage',
    'image',
    'binarysensor',
    'windowcontact',
    'html',
    'universal',
    'statusoverview',
    'messages',
    'menu',
    'mirror',
];

/**
 * Fallback slot size in px for items that carry no size of their own — configs
 * written before a fresh slot started at the widget's own size, see
 * `menuWidgetDefaultSize`.
 *
 * The bar height is a fixed number rather than "stretch to the bar" on purpose:
 * a widget's natural height is a dashboard height (a value widget wants ~90px),
 * so as an ordinary flex item it would push the header or the tab bar open to
 * that. Stretching instead needs a sibling in the same flex zone to supply the
 * height, and a bar zone that holds nothing but extras has none — the slot then
 * collapses to nothing. A definite height is predictable in both cases.
 */
export const MENU_WIDGET_DEFAULT_W = { bar: 120, block: 240 } as const;
export const MENU_WIDGET_DEFAULT_H = { bar: 32, block: 120 } as const;

/** Limits of a menu slot — the drag handle and any stored value stay inside. */
export const MENU_WIDGET_MIN_PX = 24;
export const MENU_WIDGET_MAX_W = 1200;
export const MENU_WIDGET_MAX_H = 800;

/** Grid metrics a widget is sized in on a dashboard (see Dashboard.tsx). */
export interface MenuGridMetrics {
    gridRowHeight?: number;
    gridSnapX?: number;
    gridGap?: number;
}

/**
 * The px box a widget type occupies on a dashboard — the size a freshly picked
 * menu slot starts at (#634).
 *
 * Before this, a new slot fell back to the bar default (120×32) and the widget
 * showed up as a sliver nobody recognised as the thing they had just added. A
 * dashboard sizes in grid cells and a menu has no grid, so the type's default
 * cell box is converted with the same metrics the editor grid uses: n cells plus
 * the n-1 gaps between them. `block` leaves the width open because a section
 * menu entry is full width by design.
 */
export function menuWidgetDefaultSize(
    type: WidgetType | undefined,
    variant: 'bar' | 'block',
    grid?: MenuGridMetrics,
): { widgetWidth: number | undefined; widgetHeight: number } {
    const meta = type ? WIDGET_BY_TYPE[type] : undefined;
    const cell = grid?.gridRowHeight ?? 20;
    const snapX = grid?.gridSnapX ?? cell;
    const gap = grid?.gridGap ?? 10;
    const span = (cells: number, size: number) => Math.max(MENU_WIDGET_MIN_PX, cells * size + (cells - 1) * gap);
    return {
        widgetWidth: variant === 'bar' ? Math.min(MENU_WIDGET_MAX_W, span(meta?.defaultW ?? 8, snapX)) : undefined,
        widgetHeight: Math.min(MENU_WIDGET_MAX_H, span(meta?.defaultH ?? 4, cell)),
    };
}

/**
 * The widget an item shows: its own instance if it has one, otherwise the
 * referenced dashboard widget. Returns undefined when a reference is dangling —
 * the renderer then says so instead of silently showing nothing.
 */
export function resolveMenuWidget(
    item: MenuItemContent,
    layouts: readonly DashboardLayout[],
): { widget: WidgetConfig; owned: boolean } | undefined {
    if (item.widget) return { widget: item.widget, owned: true };
    if (!item.widgetId) return undefined;
    for (const l of layouts) {
        for (const sec of l.sections) {
            for (const tab of sec.tabs) {
                const found = tab.widgets.find((w) => w.id === item.widgetId);
                if (found) return { widget: found, owned: false };
            }
        }
    }
    return undefined;
}

/**
 * The layout a menu slot should start on for this widget type.
 *
 * A menu is not a dashboard. The switch that reads well as a card is far too
 * tall for a 32px bar, so a fresh slot prefers the densest layout the type
 * offers — `minimal` before `compact` — and falls back to the type's own default
 * when it has neither. The element editor overrides it either way.
 */
export function preferredMenuLayout(type: WidgetType | undefined): WidgetLayout | undefined {
    if (!type) return undefined;
    const available = getAvailableLayouts(type);
    return (['minimal', 'compact'] as const).find((l) => available.includes(l));
}

/** Minimal config for a brand-new item-owned widget instance. */
export function makeMenuWidget(type: WidgetType): WidgetConfig {
    const meta = WIDGET_BY_TYPE[type];
    return {
        id: `mw-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        type,
        layout: preferredMenuLayout(type) ?? (type === 'universal' ? 'custom' : 'default'),
        title: '',
        datapoint: '',
        gridPos: { x: 0, y: 0, w: meta?.defaultW ?? 4, h: meta?.defaultH ?? 3 },
        options: { icon: meta?.iconName, showTitle: false },
    };
}

/**
 * The header's extra elements. Before #634 the header had one hard-wired clock
 * and one hard-wired datapoint; those configs carry no `headerItems`, so they are
 * projected onto the list here. An explicit empty array means "no extras" and is
 * therefore NOT overridden — only `undefined` falls back.
 */
export function deriveHeaderItems(
    f: Pick<
        FrontendSettings,
        | 'headerItems'
        | 'headerClockEnabled'
        | 'headerClockDisplay'
        | 'headerClockShowSeconds'
        | 'headerClockDateLength'
        | 'headerClockCustomFormat'
        | 'headerDatapoint'
        | 'headerDatapointTemplate'
    >,
): HeaderItem[] {
    if (f.headerItems) return f.headerItems;
    const items: HeaderItem[] = [];
    // Order mirrors the old markup: datapoint first, then the clock.
    if (f.headerDatapoint) {
        items.push({
            id: 'legacy-datapoint',
            type: 'datapoint',
            position: 'right',
            datapointId: f.headerDatapoint,
            datapointTemplate: f.headerDatapointTemplate || undefined,
        });
    }
    if (f.headerClockEnabled) {
        items.push({
            id: 'legacy-clock',
            type: 'clock',
            position: 'right',
            clockDisplay: f.headerClockDisplay ?? 'time',
            clockShowSeconds: f.headerClockShowSeconds ?? false,
            clockDateLength: f.headerClockDateLength ?? 'short',
            clockCustomFormat: f.headerClockCustomFormat || undefined,
        });
    }
    return items;
}
