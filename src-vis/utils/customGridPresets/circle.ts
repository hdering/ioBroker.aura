import type { CustomGridDef } from '../../types';
import { GridBuilder } from './gridBuilder';
import { FS, addStatusBadges, comp, showTitleOf, titleAlignOf, titleCell, type Opts } from './common';

/**
 * The circle layout (#815) as a custom grid (#838): the widget's round button
 * ('circle-menu' component) fills the grid, the title sits below it like in the
 * layout. Shared by every widget that offers `layout: 'circle'`.
 */
export function buildCircleMenuGrid(o: Opts): CustomGridDef {
    const b = new GridBuilder(1);
    b.row('1fr', [comp('circle-menu')]);
    if (showTitleOf(o)) {
        const align = titleAlignOf(o);
        b.row('auto', [titleCell(o, { fontSize: FS.xs, align: align === 'left' ? 'center' : align })]);
    }
    addStatusBadges(b, o);
    return b.build();
}
