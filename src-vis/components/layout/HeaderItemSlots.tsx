/**
 * The header items of a widget (issue #676), laid out on their slots.
 *
 *   HeaderRowOne   – wraps the title block: [title …] [r1-center] [r1-right]
 *   HeaderRowTwo   – [r2-left] [r2-center] [r2-right], rendered only when
 *                    something sits there
 *
 * With a centre item the title block and the right slot share the rest equally, so
 * the centre really is the middle of the row; without one the title takes what the
 * right slot leaves. Every item truncates on its own, the title first.
 *
 * Used by the folded header and by the frame's fallback strip; an expanded widget
 * places the slots into its own title row through HeaderSlotsContext.
 */
import type { CSSProperties, ReactNode } from 'react';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { groupBySlot, hasSecondRow } from '../../utils/headerItems';
import type { ResolvedHeaderItem } from '../../hooks/useHeaderItems';
import { useT } from '../../i18n';

/**
 * One item. An 'action' item is the click-action icon (issue #702) moved onto a
 * slot: a button that runs the action — and nothing at all without one, e.g. in
 * the editor.
 */
export function HeaderItemView({ item, onAction }: { item: ResolvedHeaderItem; onAction?: () => void }) {
    const t = useT();
    if (item.action) {
        if (!onAction || !item.ActionIcon) return null;
        const ActionIcon = item.ActionIcon;
        return (
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onAction();
                }}
                className="nodrag aura-click-action-btn aura-header-item pointer-events-auto shrink-0 w-5 h-5 -my-1 flex items-center justify-center rounded-md opacity-75 hover:opacity-100 transition-opacity"
                style={{ color: item.color || 'var(--text-secondary)' }}
                title={t('wf.embedAction')}
                aria-label={t('wf.embedAction')}
                data-header-item={item.id}
                data-click-action-icon=""
            >
                <ActionIcon size={14} />
            </button>
        );
    }
    const ItemIcon = item.icon ? getWidgetIcon(item.icon, null) : null;
    return (
        <span
            className="aura-header-item inline-flex items-center gap-1 min-w-0 text-xs font-medium tabular-nums"
            style={{
                color: item.color || 'var(--text-primary)',
                // Own size carries its own line-height — text-xs ships an absolute one
                // that would clip the descenders of a larger font.
                ...(item.textSize
                    ? { fontSize: `calc(${item.textSize}px * var(--font-scale, 1))`, lineHeight: 1.25 }
                    : {}),
            }}
            data-header-item={item.id}
        >
            {ItemIcon &&
                (item.iconSize ? (
                    // Explicit size: scaled by the global font scale like every other px size.
                    <ItemIcon
                        size={item.iconSize}
                        className="shrink-0"
                        style={{
                            width: `calc(${item.iconSize}px * var(--font-scale, 1))`,
                            height: `calc(${item.iconSize}px * var(--font-scale, 1))`,
                        }}
                    />
                ) : (
                    <ItemIcon size={13} className="shrink-0" />
                ))}
            {item.text && <span className="truncate">{item.text}</span>}
        </span>
    );
}

function Slot({
    items,
    slot,
    className,
    style,
    onAction,
}: {
    items: ResolvedHeaderItem[];
    slot: string;
    className?: string;
    style?: CSSProperties;
    onAction?: () => void;
}) {
    return (
        <div className={`flex items-center gap-2 min-w-0 ${className ?? ''}`} style={style} data-header-slot={slot}>
            {items.map((item) => (
                <HeaderItemView key={item.id} item={item} onAction={onAction} />
            ))}
        </div>
    );
}

export function HeaderRowOne({
    items,
    lead,
    icon,
    iconPlace = 'lead',
    title,
    align,
    trailing,
    onAction,
}: {
    items: ResolvedHeaderItem[];
    /** The chevron, left of everything. */
    lead?: ReactNode;
    /** The widget's symbol, placed by iconPlace (as TitleRow does expanded). */
    icon?: ReactNode;
    iconPlace?: string;
    /** The title — the left part of the row. Omitted: a row of items only. */
    title?: ReactNode;
    /** The title's alignment. 'center' puts it in the middle of the row, the centre items beside it. */
    align?: string;
    /** Anything after the right slot (the click-action icon). */
    trailing?: ReactNode;
    onAction?: () => void;
}) {
    const slots = groupBySlot(items);
    const left = slots['r1-left'];
    const center = slots['r1-center'];
    const right = slots['r1-right'];
    const leadSlot =
        left.length > 0 ? <Slot items={left} slot="r1-left" style={{ flex: '0 1 auto' }} onAction={onAction} /> : null;
    const place = title ? iconPlace : iconPlace === 'trail' ? 'trail' : 'lead';
    const leadIcon = place === 'lead' ? icon : null;
    const beforeIcon = place === 'beforeTitle' ? icon : null;
    const afterIcon = place === 'afterTitle' ? icon : null;
    const trailIcon = place === 'trail' ? icon : null;
    if (title && align === 'center') {
        // [lead | centre items + title + centre items | right items] — the outer two
        // grow equally, so the title is the middle of the card (see TitleRow).
        const before = center.filter((i) => i.titleSide === 'before');
        const after = center.filter((i) => i.titleSide !== 'before');
        return (
            <div className="flex items-center gap-2 min-w-0 w-full" data-header-row="1" data-title-align="center">
                <div className="flex items-center gap-2 min-w-0" style={{ flex: '1 1 0' }}>
                    {lead}
                    {leadSlot}
                    {leadIcon}
                </div>
                <div className="flex items-center gap-2 min-w-0" style={{ flex: '0 1 auto' }}>
                    {before.length > 0 && (
                        <Slot items={before} slot="r1-center" style={{ flex: '0 1 auto' }} onAction={onAction} />
                    )}
                    {beforeIcon}
                    <div className="flex min-w-0" style={{ flex: '0 1 auto' }}>
                        {title}
                    </div>
                    {afterIcon}
                    {after.length > 0 && (
                        <Slot items={after} slot="r1-center" style={{ flex: '0 1 auto' }} onAction={onAction} />
                    )}
                </div>
                <div className="flex items-center justify-end gap-2 min-w-0" style={{ flex: '1 1 0' }}>
                    {right.length > 0 && (
                        <Slot items={right} slot="r1-right" className="justify-end" onAction={onAction} />
                    )}
                    {trailIcon}
                    {trailing}
                </div>
            </div>
        );
    }
    const centered = center.length > 0;
    return (
        <div className="flex items-center gap-2 min-w-0 w-full" data-header-row="1">
            <div className="flex items-center gap-2 min-w-0" style={{ flex: '1 1 0' }}>
                {lead}
                {leadSlot}
                {leadIcon}
                {beforeIcon || afterIcon ? (
                    // The symbol right beside the title: the title box shrinks to its
                    // text so the symbol can follow it.
                    <div
                        className="flex items-center gap-2 min-w-0"
                        style={{ flex: '1 1 0', justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}
                    >
                        {beforeIcon}
                        <div
                            className="flex min-w-0"
                            style={{ flex: afterIcon || align === 'right' ? '0 1 auto' : '1 1 auto' }}
                        >
                            {title}
                        </div>
                        {afterIcon}
                    </div>
                ) : (
                    title
                )}
            </div>
            {centered && (
                <Slot
                    items={center}
                    slot="r1-center"
                    className="justify-center"
                    style={{ flex: '0 1 auto' }}
                    onAction={onAction}
                />
            )}
            {(centered || right.length > 0) && (
                <Slot
                    items={right}
                    slot="r1-right"
                    className="justify-end"
                    style={centered ? { flex: '1 1 0' } : { flex: '0 1 auto', maxWidth: title ? '60%' : '100%' }}
                    onAction={onAction}
                />
            )}
            {trailIcon}
            {trailing}
        </div>
    );
}

export function HeaderRowTwo({
    items,
    title,
    titleAlign,
    onAction,
}: {
    items: ResolvedHeaderItem[];
    /** The title (with its symbol) moved to the second row — options.titleRow 2. */
    title?: ReactNode;
    /** Where the title stands in the row: left, center or right. */
    titleAlign?: string;
    onAction?: () => void;
}) {
    if (!title && !hasSecondRow(items)) return null;
    const slots = groupBySlot(items);
    const titleCol = !title ? null : titleAlign === 'center' ? 'center' : titleAlign === 'right' ? 'right' : 'left';
    const titleBox = title ? (
        <div className="flex items-center gap-2 min-w-0" style={{ flex: '0 1 auto' }} data-title-in-row2="">
            {title}
        </div>
    ) : null;
    // With a centre item (or the title in the middle) the outer columns are equal, so
    // the centre is the middle; without one, left and right take what they need and
    // a lone item is not capped at a third of the row.
    const centered = slots['r2-center'].length > 0 || titleCol === 'center';
    const column = (slot: 'r2-left' | 'r2-center' | 'r2-right', justify: string, style?: CSSProperties) => {
        const list = slots[slot];
        const here = titleCol === slot.slice(3);
        const itemsEl = list.length ? (
            <Slot items={list} slot={slot} className={justify} style={{ flex: '0 1 auto' }} onAction={onAction} />
        ) : null;
        if (!here) return <Slot items={list} slot={slot} className={justify} style={style} onAction={onAction} />;
        return (
            <div className={`flex items-center gap-2 min-w-0 ${justify}`} style={style}>
                {slot === 'r2-right' ? itemsEl : titleBox}
                {slot === 'r2-right' ? titleBox : itemsEl}
            </div>
        );
    };
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
            {column('r2-left', 'justify-start', { flex: '0 1 auto' })}
            {centered && column('r2-center', 'justify-center')}
            {column('r2-right', 'justify-end', { flex: '0 1 auto' })}
        </div>
    );
}
