import type { CustomCell } from '../types';
import type { CellCondResult } from '../hooks/useCellConditionStyle';

/**
 * The colour a value bar is drawn in — progress cells and bar-style sliders.
 *
 * Split out because it was not answerable from the outside. `CellConditionRule.color`
 * describes itself as "text / icon color", and the bar was in fact drawn with the
 * static `cell.color` alone: a rule that turned a cell red coloured the number and
 * left the bar at the accent colour. The only way round it was a per-widget
 * styleOverride on `--accent`, which cannot react to a value at all.
 *
 * A matched condition therefore wins over the configured colour, which wins over the
 * theme accent. Both bar cells go through here so the twin cannot drift apart again.
 */
export function cellBarColor(cell: CustomCell, cond?: CellCondResult): string {
    return cond?.color || cell.color || 'var(--accent)';
}
