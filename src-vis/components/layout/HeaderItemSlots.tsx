/**
 * The header items of a widget (issue #676), laid out on their slots.
 *
 *   HeaderRowOne   – wraps the title block: [title …] [r1-center] [r1-right]
 *   HeaderRowTwo   – three columns [r2-left] [r2-center] [r2-right], rendered only
 *                    when something sits there
 *
 * With a centre item the title block and the right slot share the rest equally, so
 * the centre really is the middle of the row; without one the title takes what the
 * right slot leaves. Every item truncates on its own, the title first.
 */
import type { CSSProperties, ReactNode } from 'react';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { groupBySlot, hasSecondRow } from '../../utils/headerItems';
import type { ResolvedHeaderItem } from '../../hooks/useHeaderItems';

function Item({ item }: { item: ResolvedHeaderItem }) {
    const ItemIcon = item.icon ? getWidgetIcon(item.icon, null) : null;
    return (
        <span
            className="aura-header-item inline-flex items-center gap-1 min-w-0 text-xs font-medium tabular-nums"
            style={{ color: item.color || 'var(--text-primary)' }}
            data-header-item={item.id}
        >
            {ItemIcon && <ItemIcon size={13} className="shrink-0" />}
            {item.text && <span className="truncate">{item.text}</span>}
        </span>
    );
}

function Slot({
    items,
    slot,
    className,
    style,
}: {
    items: ResolvedHeaderItem[];
    slot: string;
    className?: string;
    style?: CSSProperties;
}) {
    return (
        <div className={`flex items-center gap-2 min-w-0 ${className ?? ''}`} style={style} data-header-slot={slot}>
            {items.map((item) => (
                <Item key={item.id} item={item} />
            ))}
        </div>
    );
}

export function HeaderRowOne({
    items,
    title,
    trailing,
}: {
    items: ResolvedHeaderItem[];
    /** Chevron, icon and title — the left part of the row. */
    title: ReactNode;
    /** Anything after the right slot (the click-action icon). */
    trailing?: ReactNode;
}) {
    const slots = groupBySlot(items);
    const center = slots['r1-center'];
    const right = slots['r1-right'];
    const centered = center.length > 0;
    return (
        <div className="flex items-center gap-2 min-w-0 w-full">
            <div className="flex items-center gap-2 min-w-0" style={{ flex: '1 1 0' }}>
                {title}
            </div>
            {centered && (
                <Slot items={center} slot="r1-center" className="justify-center" style={{ flex: '0 1 auto' }} />
            )}
            {(centered || right.length > 0) && (
                <Slot
                    items={right}
                    slot="r1-right"
                    className="justify-end"
                    style={centered ? { flex: '1 1 0' } : { flex: '0 1 auto', maxWidth: '60%' }}
                />
            )}
            {trailing}
        </div>
    );
}

export function HeaderRowTwo({ items }: { items: ResolvedHeaderItem[] }) {
    if (!hasSecondRow(items)) return null;
    const slots = groupBySlot(items);
    // With a centre item the outer columns are equal, so the centre is the middle;
    // without one, left and right take what they need and a lone item is not capped
    // at a third of the row.
    const centered = slots['r2-center'].length > 0;
    return (
        <div
            className="gap-2 min-w-0 w-full"
            style={
                centered
                    ? { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)' }
                    : { display: 'flex', justifyContent: 'space-between' }
            }
            data-header-row="2"
        >
            <Slot items={slots['r2-left']} slot="r2-left" className="justify-start" style={{ flex: '0 1 auto' }} />
            {centered && <Slot items={slots['r2-center']} slot="r2-center" className="justify-center" />}
            <Slot items={slots['r2-right']} slot="r2-right" className="justify-end" style={{ flex: '0 1 auto' }} />
        </div>
    );
}
