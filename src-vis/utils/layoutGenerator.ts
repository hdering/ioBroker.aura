import type { WidgetConfig, WidgetLayout } from '../types';
import type { DetectedWidget } from './widgetDetection';

export interface LayoutVariant {
  id: string;
  label: string;
  description: string;
  widgets: WidgetConfig[];
}

// [cols, rows] per widget type per variant
type SizeMap = Record<string, [number, number]>;

const SIZES: Record<string, SizeMap> = {
  // Kompakt: 2 Widgets/Reihe
  compact: {
    switch:     [6, 4],
    value:      [6, 4],
    dimmer:     [8, 5],
    thermostat: [8, 5],
    chart:      [12, 5],
    list:       [8, 5],
    clock:      [6, 3],
    calendar:   [12, 5],
  },
  // Standard: 1–2 Widgets/Reihe
  standard: {
    switch:     [8, 5],
    value:      [8, 5],
    dimmer:     [10, 6],
    thermostat: [10, 6],
    chart:      [12, 6],
    list:       [10, 6],
    clock:      [8, 4],
    calendar:   [12, 6],
  },
  // Großzügig: 1 Widget/Reihe – Wandtablet
  wide: {
    switch:     [12, 6],
    value:      [12, 6],
    dimmer:     [12, 7],
    thermostat: [12, 7],
    chart:      [12, 7],
    list:       [12, 7],
    clock:      [12, 5],
    calendar:   [12, 7],
  },
};

const LAYOUT_MODES: Record<string, WidgetLayout> = {
  compact:  'compact',
  standard: 'default',
  wide:     'card',
};

const GRID_COLS = 12;
const STAMP = Date.now();

function packWidgets(
  widgets: DetectedWidget[],
  sizeKey: string,
  layoutMode: WidgetLayout,
  groupMapper?: (datapointId: string) => string,
): WidgetConfig[] {
  const sizes = SIZES[sizeKey];

  if (!groupMapper) {
    return packFlat(widgets, sizes, sizeKey, layoutMode, 0, 0);
  }

  // Group-aware packing
  const groups = new Map<string, DetectedWidget[]>();
  const groupOrder: string[] = [];
  for (const dw of widgets) {
    const label = groupMapper(dw.datapoint.id);
    if (!groups.has(label)) { groups.set(label, []); groupOrder.push(label); }
    groups.get(label)!.push(dw);
  }

  const result: WidgetConfig[] = [];
  let startY = 0;
  let globalIdx = 0;

  for (const label of groupOrder) {
    // Header widget before each group
    result.push({
      id: `wiz-header-${globalIdx}-${STAMP}`,
      type: 'header',
      title: label,
      datapoint: '',
      layout: 'default',
      gridPos: { x: 0, y: startY, w: GRID_COLS, h: 1 },
      options: {},
    });
    startY += 1;
    globalIdx += 1;

    const chunk = groups.get(label)!;
    const packed = packFlat(chunk, sizes, sizeKey, layoutMode, 0, startY, globalIdx);
    result.push(...packed);
    globalIdx += packed.length;
    const maxY = packed.reduce((m, w) => Math.max(m, w.gridPos.y + w.gridPos.h), startY);
    startY = maxY + 1; // 1-row gap between groups
  }

  return result;
}

function packFlat(
  widgets: DetectedWidget[],
  sizes: SizeMap,
  sizeKey: string,
  layoutMode: WidgetLayout,
  startX: number,
  startY: number,
  idxOffset = 0,
): WidgetConfig[] {
  const result: WidgetConfig[] = [];
  let x = startX, y = startY, rowMaxH = 0;

  widgets.forEach((dw, i) => {
    const [w, h] = sizes[dw.type] ?? [3, 4];

    if (x + w > GRID_COLS) {
      x = 0;
      y += rowMaxH;
      rowMaxH = 0;
    }

    result.push({
      id: `wiz-${sizeKey}-${idxOffset + i}-${STAMP}`,
      type: dw.type,
      title: dw.title,
      datapoint: dw.datapoint.id === '__clock__' ? '' : dw.datapoint.id,
      layout: layoutMode,
      gridPos: { x, y, w, h },
      options: dw.unit ? { unit: dw.unit } : {},
    });

    rowMaxH = Math.max(rowMaxH, h);
    x += w;
  });

  return result;
}

export function generateLayouts(
  widgets: DetectedWidget[],
  groupMapper?: (datapointId: string) => string,
): LayoutVariant[] {
  if (widgets.length === 0) return [];

  return [
    {
      id: 'compact',
      label: 'Kompakt',
      description: 'Mehr Widgets auf einen Blick – kleinere Kacheln',
      widgets: packWidgets(widgets, 'compact', LAYOUT_MODES.compact, groupMapper),
    },
    {
      id: 'standard',
      label: 'Standard',
      description: 'Ausgewogene Darstellung mit gut lesbaren Widgets',
      widgets: packWidgets(widgets, 'standard', LAYOUT_MODES.standard, groupMapper),
    },
    {
      id: 'wide',
      label: 'Großzügig',
      description: 'Große Kacheln – ideal für Wandtablets',
      widgets: packWidgets(widgets, 'wide', LAYOUT_MODES.wide, groupMapper),
    },
  ];
}
