import type { WidgetConfig, WidgetLayout } from '../types';
import type { DetectedWidget } from './widgetDetection';
import type { StaticListEntry } from '../components/widgets/ListWidget';
import type { AutoListEntry } from '../components/widgets/AutoListWidget';
import { WIDGET_BY_TYPE } from '../widgetRegistry';

export interface LayoutVariant {
    id: string;
    label: string;
    description: string;
    widgets: WidgetConfig[];
}

// [cols_fraction, rows] per widget type per variant
// cols_fraction: fraction of total columns (1 = full width)
type SizeMap = Record<string, [number, number]>;

/**
 * Widget height (rows) per type per variant.
 * Width is now computed dynamically from gridCols and TARGET_PER_ROW.
 */
const ROW_H: Record<string, Record<string, number>> = {
    compact: {
        switch: 4,
        value: 4,
        dimmer: 5,
        thermostat: 5,
        chart: 5,
        list: 5,
        clock: 3,
        calendar: 5,
        shutter: 5,
        gauge: 5,
        echart: 5,
        autolist: 5,
        weather: 5,
        evcc: 6,
        camera: 5,
        image: 5,
        trash: 5,
        fill: 5,
        iframe: 6,
        group: 6,
        jsontable: 5,
        html: 5,
        windowcontact: 4,
        binarysensor: 4,
    },
    standard: {
        switch: 5,
        value: 5,
        dimmer: 6,
        thermostat: 6,
        chart: 6,
        list: 6,
        clock: 4,
        calendar: 6,
        shutter: 6,
        gauge: 6,
        echart: 6,
        autolist: 6,
        weather: 5,
        evcc: 6,
        camera: 6,
        image: 6,
        trash: 5,
        fill: 6,
        iframe: 6,
        group: 6,
        jsontable: 5,
        html: 5,
        windowcontact: 5,
        binarysensor: 5,
    },
    wide: {
        switch: 6,
        value: 6,
        dimmer: 7,
        thermostat: 7,
        chart: 7,
        list: 7,
        clock: 5,
        calendar: 7,
        shutter: 7,
        gauge: 7,
        echart: 7,
        autolist: 7,
        weather: 6,
        evcc: 7,
        camera: 7,
        image: 7,
        trash: 6,
        fill: 7,
        iframe: 7,
        group: 7,
        jsontable: 6,
        html: 6,
        windowcontact: 6,
        binarysensor: 6,
    },
};

// Keep SIZES for backward compatibility (e.g. MiniGridPreview in TabWizard)
const SIZES: Record<string, SizeMap> = {
    compact: {
        switch: [6, 4],
        value: [6, 4],
        dimmer: [8, 5],
        thermostat: [8, 5],
        chart: [12, 5],
        list: [8, 5],
        clock: [6, 3],
        calendar: [12, 5],
    },
    standard: {
        switch: [8, 5],
        value: [8, 5],
        dimmer: [10, 6],
        thermostat: [10, 6],
        chart: [12, 6],
        list: [10, 6],
        clock: [8, 4],
        calendar: [12, 6],
    },
    wide: {
        switch: [12, 6],
        value: [12, 6],
        dimmer: [12, 7],
        thermostat: [12, 7],
        chart: [12, 7],
        list: [12, 7],
        clock: [12, 5],
        calendar: [12, 7],
    },
};
export { SIZES };

const LAYOUT_MODES: Record<string, WidgetLayout> = {
    compact: 'compact',
    standard: 'default',
    wide: 'card',
};

/**
 * Return the preferred column width for a widget type in the given variant.
 * Uses registry defaultW directly — no scaling — so the widget occupies the
 * same absolute number of grid columns regardless of canvas width.
 * A scale factor < 1 compresses for compact; > 1 expands for wide.
 */
const WIDTH_SCALE: Record<string, number> = {
    compact: 0.6,
    standard: 1.0,
    wide: 2.0,
};

function preferredW(type: string, sizeKey: string, gridCols: number): number {
    const meta = WIDGET_BY_TYPE[type as keyof typeof WIDGET_BY_TYPE];
    const base = meta?.defaultW ?? 8;
    const scale = WIDTH_SCALE[sizeKey] ?? 1;
    // Clamp to [1, gridCols]
    return Math.min(gridCols, Math.max(1, Math.round(base * scale)));
}

const STAMP = Date.now();

export interface GenerateOptions {
    /** Actual number of grid columns (from canvas width + snapX) */
    gridCols?: number;
    /** How grouped sections are rendered */
    groupStyle?: 'header' | 'autolist' | 'list';
    /** Pre-built group→widgets map (when groupStyle is list/autolist) */
    detectedGroups?: Map<string, DetectedWidget[]>;
}

// ── list/autolist group packing ───────────────────────────────────────────────

/**
 * Builds one list or autolist widget per group, spanning full width.
 * Height scales with number of entries (min 4, ~1.5 rows per entry).
 */
function packGroupedLists(
    groups: Map<string, DetectedWidget[]>,
    widgetType: 'list' | 'autolist',
    layoutMode: WidgetLayout,
    gridCols: number,
): WidgetConfig[] {
    const result: WidgetConfig[] = [];
    let y = 0;
    let idx = 0;

    for (const [label, dws] of groups) {
        const h = Math.max(4, Math.ceil(dws.length * 1.5) + 2);

        const entries = dws.map(
            (dw) =>
                ({
                    id: dw.datapoint.id,
                    label: dw.title,
                    unit: dw.unit,
                }) satisfies StaticListEntry & AutoListEntry,
        );

        result.push({
            id: `wiz-grp-${idx}-${STAMP}`,
            type: widgetType,
            title: label,
            datapoint: '',
            layout: layoutMode,
            gridPos: { x: 0, y, w: gridCols, h },
            options: { entries },
        });

        y += h + 1; // 1-row gap
        idx++;
    }

    return result;
}

// ── flat packing ──────────────────────────────────────────────────────────────

/**
 * Greedy row packing using each widget's preferred width from the registry.
 * Widgets are placed left→right; when the next widget doesn't fit, a new row
 * starts. The last widget in each row is stretched to fill remaining columns.
 */
function packFlat(
    widgets: DetectedWidget[],
    sizeKey: string,
    layoutMode: WidgetLayout,
    gridCols: number,
    startY = 0,
    idxOffset = 0,
): WidgetConfig[] {
    if (widgets.length === 0) return [];

    const heights = ROW_H[sizeKey] ?? ROW_H.standard;

    // Build rows greedily
    const rows: DetectedWidget[][] = [];
    let currentRow: DetectedWidget[] = [];
    let usedW = 0;

    for (const dw of widgets) {
        const w = preferredW(dw.type, sizeKey, gridCols);
        if (currentRow.length > 0 && usedW + w > gridCols) {
            rows.push(currentRow);
            currentRow = [];
            usedW = 0;
        }
        currentRow.push(dw);
        usedW += w;
    }
    if (currentRow.length > 0) rows.push(currentRow);

    const result: WidgetConfig[] = [];
    let rowY = startY;
    let globalIdx = idxOffset;

    for (const row of rows) {
        const rowH = row.reduce((m, dw) => Math.max(m, heights[dw.type] ?? 5), 0);
        let x = 0;

        row.forEach((dw) => {
            const w = preferredW(dw.type, sizeKey, gridCols);
            result.push({
                id: `wiz-${sizeKey}-${globalIdx}-${STAMP}`,
                type: dw.type,
                title: dw.title,
                datapoint: dw.datapoint.id === '__clock__' ? '' : dw.datapoint.id,
                layout: layoutMode,
                gridPos: { x, y: rowY, w, h: rowH },
                options: dw.unit ? { unit: dw.unit } : {},
            });
            x += w;
            globalIdx++;
        });

        rowY += rowH;
    }

    return result;
}

// ── header-grouped packing ────────────────────────────────────────────────────

function packWithHeaders(
    widgets: DetectedWidget[],
    groupMapper: (id: string) => string,
    sizeKey: string,
    layoutMode: WidgetLayout,
    gridCols: number,
): WidgetConfig[] {
    const groups = new Map<string, DetectedWidget[]>();
    const groupOrder: string[] = [];
    for (const dw of widgets) {
        const label = groupMapper(dw.datapoint.id);
        if (!groups.has(label)) {
            groups.set(label, []);
            groupOrder.push(label);
        }
        groups.get(label)!.push(dw);
    }

    const result: WidgetConfig[] = [];
    let startY = 0;
    let globalIdx = 0;

    for (const label of groupOrder) {
        result.push({
            id: `wiz-header-${globalIdx}-${STAMP}`,
            type: 'header',
            title: label,
            datapoint: '',
            layout: 'default',
            gridPos: { x: 0, y: startY, w: gridCols, h: 1 },
            options: {},
        });
        startY += 1;
        globalIdx += 1;

        const chunk = groups.get(label)!;
        const packed = packFlat(chunk, sizeKey, layoutMode, gridCols, startY, globalIdx);
        result.push(...packed);
        globalIdx += packed.length;
        const maxY = packed.reduce((m, w) => Math.max(m, w.gridPos.y + w.gridPos.h), startY);
        startY = maxY + 1;
    }

    return result;
}

// ── public API ────────────────────────────────────────────────────────────────

export function generateLayouts(
    widgets: DetectedWidget[],
    groupMapper?: (datapointId: string) => string,
    opts?: GenerateOptions,
): LayoutVariant[] {
    if (widgets.length === 0) return [];

    const gridCols = opts?.gridCols ?? 12;
    const groupStyle = opts?.groupStyle ?? 'header';
    const groups = opts?.detectedGroups;
    const useGroups =
        !!groupMapper && (groupStyle === 'autolist' || groupStyle === 'list') && groups && groups.size >= 2;

    const buildVariant = (sizeKey: string): WidgetConfig[] => {
        const layoutMode = LAYOUT_MODES[sizeKey];

        if (useGroups) {
            return packGroupedLists(groups!, groupStyle as 'list' | 'autolist', layoutMode, gridCols);
        }
        if (groupMapper) {
            return packWithHeaders(widgets, groupMapper, sizeKey, layoutMode, gridCols);
        }
        return packFlat(widgets, sizeKey, layoutMode, gridCols);
    };

    return [
        {
            id: 'compact',
            label: 'Kompakt',
            description: 'Mehr Widgets auf einen Blick – kleinere Kacheln',
            widgets: buildVariant('compact'),
        },
        {
            id: 'standard',
            label: 'Standard',
            description: 'Ausgewogene Darstellung mit gut lesbaren Widgets',
            widgets: buildVariant('standard'),
        },
        {
            id: 'wide',
            label: 'Großzügig',
            description: 'Große Kacheln – ideal für Wandtablets',
            widgets: buildVariant('wide'),
        },
    ];
}
