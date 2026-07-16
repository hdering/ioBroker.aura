import type { WidgetConfig, CustomCell } from '../types';
import { WIDGET_BY_TYPE } from '../widgetRegistry';

// ─────────────────────────────────────────────────────────────────────────────
// Datapoint slot collection for Widget-Designer presets.
//
// A preset stores a full widget blueprint with concrete datapoint IDs. When the
// preset is inserted somewhere else, the user must re-point those DPs. This
// module walks the (already cloned, in-memory) widget + its group definitions and
// returns a flat list of DpSlots. Each slot carries a setter closure that writes
// straight into the target objects — no path DSL needed.
//
// DP fields are recognised via the codebase-wide naming convention: option keys
// ending in `Dp` / `Datapoint`, the top-level `datapoint`, custom-grid cell
// `dpId`, and echart series `datapointId`.
// ─────────────────────────────────────────────────────────────────────────────

/** Secondary DPs that are auto-detected from the primary DP's siblings and are
 *  NOT shown as individual pickers in the insert dialog. */
export const AUTO_DP_KEYS = new Set(['batteryDp', 'unreachDp']);

/** Human-readable German labels for well-known DP option keys. Falls back to the
 *  raw key when a label is missing. */
export const DP_KEY_LABELS: Record<string, string> = {
    datapoint: 'Hauptdatenpunkt',
    actualDatapoint: 'Ist-Temperatur',
    localTempDatapoint: 'Lokale Temperatur',
    humidityDatapoint: 'Luftfeuchtigkeit',
    switchDp: 'Schalter',
    brightnessDp: 'Helligkeit',
    hueDp: 'Farbton',
    saturationDp: 'Sättigung',
    rDp: 'Rot',
    gDp: 'Grün',
    bDp: 'Blau',
    colorDp: 'Farbe',
    temperatureDp: 'Farbtemperatur',
    effectDp: 'Effekt',
    activityDp: 'Aktivität',
    directionDp: 'Richtung',
    stopDp: 'Stopp',
    openDp: 'Öffnen',
    closeDp: 'Schließen',
    lockDp: 'Verriegelung',
    batteryDp: 'Batterie',
    unreachDp: 'Erreichbarkeit',
    lastChangeDatapoint: 'Letzte Änderung',
};

export interface DpSlot {
    /** Unique id within one collection pass. */
    id: string;
    /** Picker label shown to the user. */
    label: string;
    /** Grouping heading (widget / child title) for sectioning the dialog. */
    group: string;
    /** The DP currently stored in the preset (used to pre-fill the picker). */
    originalDpId: string;
    /** Battery/unreach etc. — filled automatically from the primary DP, hidden in UI. */
    isAuto: boolean;
    /** True for the widget's main `datapoint` field (the anchor for auto-detection). */
    isMain: boolean;
    /** The option key (e.g. 'batteryDp') or 'datapoint' / 'dpId' / 'datapointId'. */
    optionKey: string;
    /** Groups slots that share one options object (widget or group child), so
     *  auto slots can be filled from their owner's primary DP. */
    ownerKey: string;
    /** Write a new DP into the underlying (cloned) object. */
    apply: (newDpId: string) => void;
}

function isDpOptionKey(key: string): boolean {
    return key === 'datapoint' || key.endsWith('Dp') || key.endsWith('Datapoint');
}

function widgetLabel(cfg: WidgetConfig): string {
    return cfg.title?.trim() || WIDGET_BY_TYPE[cfg.type]?.label || cfg.type;
}

function extractCells(options: Record<string, unknown> | undefined): CustomCell[] {
    const grid = options?.customGrid;
    if (Array.isArray(grid)) return grid as CustomCell[];
    if (grid && typeof grid === 'object' && Array.isArray((grid as { cells?: unknown }).cells)) {
        return (grid as { cells: CustomCell[] }).cells;
    }
    return [];
}

/**
 * Walk a widget config (+ its group definitions) and collect every datapoint
 * reference as a DpSlot with a setter closure. Mutating closures write into the
 * exact objects passed in, so call this on the already-cloned graph you intend to
 * commit.
 */
export function collectDpSlots(widget: WidgetConfig, groupDefs?: Record<string, WidgetConfig[]>): DpSlot[] {
    const slots: DpSlot[] = [];
    let seq = 0;
    const visitedDefs = new Set<string>();

    function addConfig(cfg: WidgetConfig, ownerPath: string): void {
        const ownerKey = ownerPath;
        const groupName = widgetLabel(cfg);

        // Main datapoint (anchor for auto-detection).
        if (typeof cfg.datapoint === 'string' && cfg.datapoint.trim()) {
            slots.push({
                id: `slot-${seq++}`,
                label: DP_KEY_LABELS.datapoint,
                group: groupName,
                originalDpId: cfg.datapoint,
                isAuto: false,
                isMain: true,
                optionKey: 'datapoint',
                ownerKey,
                apply: (v) => {
                    cfg.datapoint = v;
                },
            });
        }

        // Secondary DPs in options (*Dp / *Datapoint).
        const opts = cfg.options;
        if (opts) {
            for (const key of Object.keys(opts)) {
                if (!isDpOptionKey(key) || key === 'datapoint') continue;
                const val = opts[key];
                if (typeof val !== 'string' || !val.trim()) continue;
                slots.push({
                    id: `slot-${seq++}`,
                    label: DP_KEY_LABELS[key] ?? key,
                    group: groupName,
                    originalDpId: val,
                    isAuto: AUTO_DP_KEYS.has(key),
                    isMain: false,
                    optionKey: key,
                    ownerKey,
                    apply: (v) => {
                        opts[key] = v;
                    },
                });
            }

            // Custom-grid cells (Universal widget & custom-layout widgets).
            const cells = extractCells(opts);
            cells.forEach((cell, i) => {
                if (typeof cell.dpId !== 'string' || !cell.dpId.trim()) return;
                slots.push({
                    id: `slot-${seq++}`,
                    label: cell.text?.trim() || `Zelle ${i + 1}`,
                    group: `${groupName} – Zellen`,
                    originalDpId: cell.dpId,
                    isAuto: false,
                    isMain: false,
                    optionKey: 'dpId',
                    ownerKey: `${ownerKey}:cell:${i}`,
                    apply: (v) => {
                        cell.dpId = v;
                    },
                });
            });

            // ECharts series datapoints.
            const series = opts.echartSeries;
            if (Array.isArray(series)) {
                (series as Array<Record<string, unknown>>).forEach((s, i) => {
                    if (typeof s.datapointId !== 'string' || !s.datapointId.trim()) return;
                    slots.push({
                        id: `slot-${seq++}`,
                        label: (typeof s.name === 'string' && s.name.trim()) || `Serie ${i + 1}`,
                        group: `${groupName} – Serien`,
                        originalDpId: s.datapointId,
                        isAuto: false,
                        isMain: false,
                        optionKey: 'datapointId',
                        ownerKey: `${ownerKey}:series:${i}`,
                        apply: (v) => {
                            s.datapointId = v;
                        },
                    });
                });
            }

            // Recurse into group / panels children.
            if ((cfg.type === 'group' || cfg.type === 'panels') && typeof opts.defId === 'string') {
                const defId = opts.defId;
                if (groupDefs && groupDefs[defId] && !visitedDefs.has(defId)) {
                    visitedDefs.add(defId);
                    groupDefs[defId].forEach((child, i) => addConfig(child, `${ownerKey}:child:${defId}:${i}`));
                }
            }
        }
    }

    addConfig(widget, 'root');
    return slots;
}
