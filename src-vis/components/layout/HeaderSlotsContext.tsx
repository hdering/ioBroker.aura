/**
 * Header items of an EXPANDED widget (issue #676).
 *
 * Folded, the frame owns the whole header row and draws the items itself
 * (HeaderItemSlots). Expanded, the title row belongs to the widget — its layout,
 * its icon colour, sometimes a control in the same row — so the frame must not
 * take it over. Instead the frame hands the resolved items down through this
 * context and the widget places two small components into its own title row:
 *
 *   <HeaderGroup>           wraps the title row and row 2, so a parent that spreads
 *                           its children (justify-between) keeps them together
 *   <HeaderSlotsInline />   row 1: centre + right items, inside the title row
 *   <HeaderSlotsRow2 />     row 2, directly below the title row
 *
 * Each registers itself while mounted. A row nobody drew — a layout without a
 * title row, a widget that was never wired, title and icon both off — is drawn
 * by the frame as a strip above the body instead, so an item is never lost.
 */
import { createContext, useContext, useLayoutEffect, type ReactNode } from 'react';
import type { ResolvedHeaderItem } from '../../hooks/useHeaderItems';
import { groupBySlot, hasSecondRow } from '../../utils/headerItems';
import { HeaderItemView, HeaderRowTwo } from './HeaderItemSlots';

export type HeaderRow = 'r1' | 'r2';

export interface HeaderSlotsValue {
    items: ResolvedHeaderItem[];
    /** Called by a mounted row component; returns the unregister function. */
    register: (row: HeaderRow) => () => void;
    /** Runs the widget's click action (items with source 'action'). */
    onAction?: () => void;
}

export const HeaderSlotsContext = createContext<HeaderSlotsValue | null>(null);

function useRegister(ctx: HeaderSlotsValue | null, row: HeaderRow) {
    const register = ctx?.register;
    // Layout effect: the frame hears about the row before the first paint, so its
    // fallback strip never flashes up for a widget that draws the row itself.
    useLayoutEffect(() => (register ? register(row) : undefined), [register, row]);
}

/**
 * Row-1 items for a widget's title row. Right items push to the end of the row;
 * centre items are centred on the card — absolutely positioned but vertically in
 * place (no `top`), so they sit in the title row without taking its space.
 */
export function HeaderSlotsInline(): ReactNode {
    const ctx = useContext(HeaderSlotsContext);
    useRegister(ctx, 'r1');
    if (!ctx?.items.length) return null;
    const slots = groupBySlot(ctx.items);
    const center = slots['r1-center'];
    const right = slots['r1-right'];
    if (!center.length && !right.length) return null;
    return (
        <>
            {center.length > 0 && (
                <span
                    className="flex items-center gap-2 min-w-0 pointer-events-auto"
                    style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', maxWidth: '40%' }}
                    data-header-slot="r1-center"
                >
                    {center.map((item) => (
                        <HeaderItemView key={item.id} item={item} onAction={ctx.onAction} />
                    ))}
                </span>
            )}
            {right.length > 0 && (
                <span
                    className="flex items-center justify-end gap-2 min-w-0 shrink"
                    style={{ marginLeft: 'auto', maxWidth: '60%' }}
                    data-header-slot="r1-right"
                >
                    {right.map((item) => (
                        <HeaderItemView key={item.id} item={item} onAction={ctx.onAction} />
                    ))}
                </span>
            )}
        </>
    );
}

/** Row-2 items, placed right below the widget's title row. */
export function HeaderSlotsRow2(): ReactNode {
    const ctx = useContext(HeaderSlotsContext);
    useRegister(ctx, 'r2');
    if (!ctx?.items.length || !hasSecondRow(ctx.items)) return null;
    return <HeaderRowTwo items={ctx.items} onAction={ctx.onAction} />;
}

/**
 * Keeps the title row and row 2 together. Without a second row it is
 * `display: contents` — no box at all, the widget's layout is exactly what it was;
 * with one it is a column, so a parent that distributes its children
 * (justify-between, a centred content position) moves both rows as one.
 */
export function HeaderGroup({ children }: { children: ReactNode }): ReactNode {
    const ctx = useContext(HeaderSlotsContext);
    const grouped = !!ctx?.items.length && hasSecondRow(ctx.items);
    return (
        <div
            style={
                grouped
                    ? { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, alignSelf: 'stretch' }
                    : { display: 'contents' }
            }
            data-header-group=""
        >
            {children}
        </div>
    );
}
