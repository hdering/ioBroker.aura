/**
 * Shared helpers for the extra elements of the three navigation chromes — header,
 * tab bar and section menu. They all host the same `MenuItemContent` shapes
 * (clock / datapoint / text / widget); only the position axis differs.
 */

import type { DashboardLayout, HeaderItem, MenuItemContent, MenuItemType } from '../store/dashboardStore';
import type { FrontendSettings } from '../store/configStore';
import type { WidgetConfig, WidgetType } from '../types';
import { WIDGET_BY_TYPE } from '../widgetRegistry';

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
 * Default slot size in px, by host layout.
 *
 * The bar height is a fixed number rather than "stretch to the bar" on purpose:
 * a widget's natural height is a dashboard height (a value widget wants ~90px),
 * so as an ordinary flex item it would push the header or the tab bar open to
 * that. Stretching instead needs a sibling in the same flex zone to supply the
 * height, and a bar zone that holds nothing but extras has none — the slot then
 * collapses to nothing. A definite height is predictable in both cases, and the
 * element editor exposes it.
 */
export const MENU_WIDGET_DEFAULT_W = { bar: 120, block: 240 } as const;
export const MENU_WIDGET_DEFAULT_H = { bar: 32, block: 120 } as const;

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

/** Minimal config for a brand-new item-owned widget instance. */
export function makeMenuWidget(type: WidgetType): WidgetConfig {
    const meta = WIDGET_BY_TYPE[type];
    return {
        id: `mw-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        type,
        layout: type === 'universal' ? 'custom' : 'default',
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
