/**
 * Reordering helpers for the extra elements of the tab bar and the area menu
 * (clock / datapoint / text rows in the layout admin).
 *
 * Both bars render their elements grouped by "position" — L/M/R for the tab bar,
 * top/bottom for the area menu — and inside a group in plain array order. A naive
 * neighbour swap in the flat editor list would therefore often be a click without
 * any visible effect, so moving swaps an element with the nearest sibling that
 * shares its position: every enabled arrow reorders something on screen.
 */

type Positioned = { id: string; position?: string };

/** Index of the next element in the same position group, or -1 if there is none. */
export function menuItemSibling<T extends Positioned>(items: readonly T[], id: string, dir: -1 | 1): number {
    const from = items.findIndex((it) => it.id === id);
    if (from < 0) return -1;
    const pos = items[from].position;
    for (let i = from + dir; i >= 0 && i < items.length; i += dir) {
        if (items[i].position === pos) return i;
    }
    return -1;
}

/** True when the element has a sibling to swap with in that direction. */
export function canMoveMenuItem<T extends Positioned>(items: readonly T[], id: string, dir: -1 | 1): boolean {
    return menuItemSibling(items, id, dir) >= 0;
}

/** Swap the element with its nearest same-position sibling; unchanged copy if it cannot move. */
export function moveMenuItem<T extends Positioned>(items: readonly T[], id: string, dir: -1 | 1): T[] {
    const from = items.findIndex((it) => it.id === id);
    const to = menuItemSibling(items, id, dir);
    if (from < 0 || to < 0) return [...items];
    const next = [...items];
    [next[from], next[to]] = [next[to], next[from]];
    return next;
}
