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
    title,
    trailing,
    onAction,
}: {
    items: ResolvedHeaderItem[];
    /** Chevron, icon and title — the left part of the row. Omitted: a row of items only. */
    title?: ReactNode;
    /** Anything after the right slot (the click-action icon). */
    trailing?: ReactNode;
    onAction?: () => void;
}) {
    const slots = groupBySlot(items);
    const center = slots['r1-center'];
    const right = slots['r1-right'];
    const centered = center.length > 0;
    return (
        <div className="flex items-center gap-2 min-w-0 w-full" data-header-row="1">
            <div className="flex items-center gap-2 min-w-0" style={{ flex: '1 1 0' }}>
                {title}
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
            {trailing}
        </div>
    );
}

export function HeaderRowTwo({ items, onAction }: { items: ResolvedHeaderItem[]; onAction?: () => void }) {
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
            <Slot
                items={slots['r2-left']}
                slot="r2-left"
                className="justify-start"
                style={{ flex: '0 1 auto' }}
                onAction={onAction}
            />
            {centered && (
                <Slot items={slots['r2-center']} slot="r2-center" className="justify-center" onAction={onAction} />
            )}
            <Slot
                items={slots['r2-right']}
                slot="r2-right"
                className="justify-end"
                style={{ flex: '0 1 auto' }}
                onAction={onAction}
            />
        </div>
    );
}
