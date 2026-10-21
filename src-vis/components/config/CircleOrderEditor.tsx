import { applyCircleOrder } from '../widgets/CircleMenu';
import { RuleDragHandle, RuleMoveButtons, useRuleReorder } from './ruleReorder';

/**
 * Order of the circle menu's entries (`circleOrder`, #815) — shared by every
 * widget that offers `layout: 'circle'`. The widget hands in its entries in
 * default order; an unchanged order is stored as nothing at all.
 */
export function CircleOrderEditor({
    entries,
    order,
    onChange,
}: {
    entries: { key: string; label: string }[];
    order: unknown;
    onChange: (order: string[] | undefined) => void;
}) {
    const list = applyCircleOrder(entries, order);
    const isDefault = list.every((e, i) => e.key === entries[i]?.key);
    const set = (next: { key: string }[]) => {
        const keys = next.map((e) => e.key);
        onChange(keys.every((k, i) => k === entries[i]?.key) ? undefined : keys);
    };
    const { itemProps, reorderProps } = useRuleReorder(list, set);
    const hint: React.CSSProperties = { color: 'var(--text-secondary)' };

    return (
        <div data-aura-circle-order="">
            <div className="flex items-center justify-between mb-1">
                <label className="text-[11px]" style={hint}>
                    Reihenfolge
                </label>
                {!isDefault && (
                    <button
                        type="button"
                        onClick={() => onChange(undefined)}
                        className="text-[10px] hover:opacity-70"
                        style={{ color: 'var(--accent)' }}
                    >
                        Standard
                    </button>
                )}
            </div>
            <div className="space-y-1">
                {list.map((e, i) => {
                    const drag = itemProps(i);
                    return (
                        <div
                            key={e.key}
                            {...drag}
                            data-aura-circle-entry={e.key}
                            className="flex items-center gap-2 rounded-md px-2 py-1 text-xs"
                            style={{
                                background: 'var(--app-bg)',
                                border: '1px solid var(--app-border)',
                                color: 'var(--text-primary)',
                                ...drag.style,
                            }}
                        >
                            <RuleDragHandle {...reorderProps(i)} />
                            <span className="text-[10px] tabular-nums w-4 shrink-0" style={hint}>
                                {i + 1}
                            </span>
                            <span className="flex-1 min-w-0 truncate">{e.label}</span>
                            <RuleMoveButtons {...reorderProps(i)} />
                        </div>
                    );
                })}
            </div>
            <p className="text-[10px] mt-1" style={hint}>
                Vollkreis: der erste Eintrag oben, dann im Uhrzeigersinn. Halbkreis: von links nach rechts bzw. von oben
                nach unten.
            </p>
        </div>
    );
}
