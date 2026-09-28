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
import {
    Children,
    cloneElement,
    createContext,
    isValidElement,
    useContext,
    useLayoutEffect,
    type CSSProperties,
    type HTMLAttributes,
    type ReactElement,
    type ReactNode,
} from 'react';
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
 *
 * `part` is set by a centred TitleRow only: it draws the centre items in flow beside
 * the title — 'before' / 'after' by their titleSide — and the right items in the
 * right column ('right').
 */
export function HeaderSlotsInline({ part = 'all' }: { part?: 'all' | 'before' | 'after' | 'right' }): ReactNode {
    const ctx = useContext(HeaderSlotsContext);
    useRegister(ctx, 'r1');
    if (!ctx?.items.length) return null;
    const slots = groupBySlot(ctx.items);
    const center =
        part === 'right'
            ? []
            : part === 'all'
              ? slots['r1-center']
              : slots['r1-center'].filter((i) => (i.titleSide === 'before') === (part === 'before'));
    const right = part === 'all' || part === 'right' ? slots['r1-right'] : [];
    if (!center.length && !right.length) return null;
    return (
        <>
            {center.length > 0 && (
                <span
                    className="flex items-center gap-2 min-w-0 pointer-events-auto"
                    style={
                        part !== 'all'
                            ? { flex: '0 1 auto' }
                            : { position: 'absolute', left: '50%', transform: 'translateX(-50%)', maxWidth: '40%' }
                    }
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
                    style={{ marginLeft: 'auto', maxWidth: part === 'right' ? '100%' : '60%' }}
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

const hasClass = (el: ReactElement, cls: string) => {
    const c = (el.props as { className?: unknown }).className;
    return typeof c === 'string' && c.split(/\s+/).includes(cls);
};

const isTitle = (el: ReactElement) =>
    (el.props as { 'data-title-slot'?: unknown })['data-title-slot'] !== undefined || hasClass(el, 'aura-widget-title');

const holds = (node: ReactNode, pred: (el: ReactElement) => boolean): boolean =>
    isValidElement(node) &&
    (pred(node) || Children.toArray((node.props as { children?: ReactNode }).children).some((c) => holds(c, pred)));

/**
 * Lifts the children of a wrapper that holds both the icon and the title up into
 * the row (`<div>[icon][title]</div>`), so the icon can go left and the title into
 * the middle. A wrapper round the title alone (title + stats) stays one unit.
 */
function liftWrappers(kids: ReturnType<typeof Children.toArray>, depth = 0): ReturnType<typeof Children.toArray> {
    return kids.flatMap((k) => {
        if (
            depth < 3 &&
            isValidElement(k) &&
            k.type === 'div' &&
            !isTitle(k) &&
            holds(k, isTitle) &&
            holds(k, (el) => hasClass(el, 'aura-widget-icon'))
        ) {
            const inner = Children.toArray((k.props as { children?: ReactNode }).children);
            return liftWrappers(inner, depth + 1).map((c) =>
                isValidElement(c) ? cloneElement(c, { key: `${String(k.key)}/${String(c.key)}` }) : c,
            );
        }
        return [k];
    });
}

/**
 * A widget's title row (issue #676). Takes the row's children as they are —
 * icon, title, `<HeaderSlotsInline />`, the widget's own controls — and only
 * changes how they are laid out when the title is centred:
 *
 *   [ everything before the title | r1-center items + title + r1-center items | everything after ]
 *
 * The outer two columns grow equally from zero, so the title sits in the middle of
 * the card no matter how wide the icon on the left or the values and buttons on the
 * right are; it truncates first once the row gets tight. Centre items join the
 * title instead of lying on top of it.
 *
 * The title is the child that is or holds the element with class
 * `aura-widget-title` (or `data-title-slot`); a wrapper round icon and title is
 * lifted first (liftWrappers). Left/right alignment, or no title at all: a plain
 * flex row, exactly as before.
 */
export function TitleRow({ align, children, ...rest }: { align?: string } & HTMLAttributes<HTMLDivElement>): ReactNode {
    if (align !== 'center') return <div {...rest}>{children}</div>;
    const kids = liftWrappers(Children.toArray(children));
    const titleAt = kids.findIndex((k) => holds(k, isTitle));
    if (titleAt < 0) return <div {...rest}>{children}</div>;
    const hasSlots = kids.some((k) => isValidElement(k) && k.type === HeaderSlotsInline);
    const side: CSSProperties = { flex: '1 1 0', display: 'flex', alignItems: 'center', gap: 'inherit', minWidth: 0 };
    return (
        <div {...rest} data-title-align="center">
            <div style={side} data-title-side="lead">
                {kids.slice(0, titleAt)}
            </div>
            <div className="flex items-center gap-2 min-w-0" style={{ flex: '0 1 auto' }} data-title-side="center">
                {hasSlots && <HeaderSlotsInline part="before" />}
                {/* Own box: the title (often flex: 1, basis 0) would otherwise give up all its
                    width to the centre items before they shrink at all. */}
                <div className="flex min-w-0" style={{ flex: '0 1 auto' }}>
                    {kids[titleAt]}
                </div>
                {hasSlots && <HeaderSlotsInline part="after" />}
            </div>
            <div style={{ ...side, justifyContent: 'flex-end' }} data-title-side="trail">
                {kids
                    .slice(titleAt + 1)
                    .map((k) =>
                        isValidElement(k) && k.type === HeaderSlotsInline ? (
                            <HeaderSlotsInline key={k.key ?? 'slots'} part="right" />
                        ) : (
                            k
                        ),
                    )}
            </div>
        </div>
    );
}

/**
 * Whether the widget has header items to show. A widget whose title row is optional
 * (title and icon off) keeps the row — and its divider — while items sit on it,
 * instead of leaving them to the frame's overlay strip.
 */
export function useHasHeaderItems(): boolean {
    return !!useContext(HeaderSlotsContext)?.items.length;
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
