// Live size readout while a widget is resized in the editor (#981): "4 × 3 · 180 × 80 px"
// on the item being resized, so several widgets can be pulled to the same size — also
// one inside a group and one next to it, where only the px compare.
//
// Imperative on purpose: RGL calls onResize on every pointer move, and a React state
// update there would re-render the whole dashboard each time (#982). The text sits in
// a data attribute on the grid item; index.css draws it via ::after.

const ATTR = 'data-aura-size';

function gridItemOf(node: HTMLElement | null | undefined): HTMLElement | null {
    return (node?.closest?.('.react-grid-item') as HTMLElement | null) ?? null;
}

/** RGL onResize: show the snapped size (grid cells + px of the placeholder). */
export function showResizeSize(
    node: HTMLElement | null | undefined,
    item: { w: number; h: number } | null | undefined,
): void {
    const el = gridItemOf(node);
    if (!el || !item) return;
    const cells = `${item.w} × ${item.h}`;
    el.setAttribute(ATTR, cells);
    // The placeholder is the snapped target; RGL moves it in the same render, so read it next frame.
    requestAnimationFrame(() => {
        if (!el.hasAttribute(ATTR)) return;
        const ph = el.parentElement?.querySelector(':scope > .react-grid-placeholder');
        const r = ph?.getBoundingClientRect();
        el.setAttribute(ATTR, r ? `${cells} · ${Math.round(r.width)} × ${Math.round(r.height)} px` : cells);
    });
}

/** RGL onResizeStop: remove the readout. */
export function clearResizeSize(node: HTMLElement | null | undefined): void {
    gridItemOf(node)?.removeAttribute(ATTR);
}
