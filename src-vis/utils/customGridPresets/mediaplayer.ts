import type { CustomGridDef, WidgetLayout } from '../../types';
import { GridBuilder } from './gridBuilder';
import { addStatusBadges, comp, hasStatusBadges, type Opts } from './common';

// Media player (MediaplayerWidget): default, compact. The player rows are whole
// components — 'player' (cover filling the row height, track info, progress,
// controls, volume) and 'player-compact' (one row) — so rows can be added around
// them; 'progress' and 'chips-row' are rows of their own. The single buttons, the
// volume slider and the track fields stay available for a finer grid.

export function buildMediaplayerGrid(layout: WidgetLayout, o: Opts): CustomGridDef | null {
    const showProgress = !!(o.mediaProgressDp || o.mediaLengthDp);
    const showChips = o.showChips !== false && Array.isArray(o.chips) && o.chips.length > 0;

    switch (layout) {
        case 'default': {
            // Two columns, so the badges find their bottom-right slot next to the chips
            // instead of a column of their own that would narrow the player.
            const b = new GridBuilder(['1fr', 'auto']);
            b.row('1fr', [comp('player', { align: 'left', valign: 'top', colSpan: 2 })]);
            if (showChips) {
                b.row('2px', []); // gap-2
                b.row('auto', [comp('chips-row', { align: 'left' })]);
            } else if (hasStatusBadges(o)) b.row('auto', []);
            addStatusBadges(b, o);
            return b.build();
        }
        case 'compact': {
            const b = new GridBuilder(1);
            b.row('1fr', []);
            b.row('auto', [comp('player-compact', { align: 'left', allowOverflow: true })]);
            if (showProgress) b.row('auto', [comp('progress', { align: 'left' })]);
            b.row('1fr', []);
            addStatusBadges(b, o);
            return b.build();
        }
        default:
            return null;
    }
}
