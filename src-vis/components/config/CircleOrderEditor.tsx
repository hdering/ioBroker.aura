import { Eye, EyeOff } from 'lucide-react';
import { applyCircleOrder } from '../widgets/CircleMenu';
import { RuleDragHandle, RuleMoveButtons, useRuleReorder } from './ruleReorder';

/**
 * Order of the circle menu's entries (`circleOrder`, #815) — shared by every
 * widget that offers `layout: 'circle'`. The widget hands in its entries in
 * default order; an unchanged order is stored as nothing at all. The eye per
 * row leaves an entry out of the circle (`circleHidden`, #993); the last visible
 * entry cannot be hidden.
 */
export function CircleOrderEditor({
    entries,
    order,
    onChange,
    hidden,
    onHiddenChange,
}: {
    entries: { key: string; label: string }[];
    order: unknown;
    onChange: (order: string[] | undefined) => void;
    hidden?: unknown;
    onHiddenChange?: (hidden: string[] | undefined) => void;
}) {
    const list = applyCircleOrder(entries, order);
    const keys = new Set(entries.map((e) => e.key));
    // Only keys that still exist count — a removed preset must not keep a slot hidden.
    const hiddenKeys = Array.isArray(hidden)
        ? hidden.filter((k): k is string => typeof k === 'string' && keys.has(k))
        : [];
    const visibleCount = entries.length - hiddenKeys.length;
    const toggleHidden = (key: string) => {
        const next = hiddenKeys.includes(key) ? hiddenKeys.filter((k) => k !== key) : [...hiddenKeys, key];
        onHiddenChange?.(next.length ? next : undefined);
    };
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
                    const isHidden = hiddenKeys.includes(e.key);
                    const lockShown = !isHidden && visibleCount <= 1;
                    return (
                        <div
                            key={e.key}
                            {...drag}
                            data-aura-circle-entry={e.key}
                            data-aura-circle-hidden={isHidden ? '' : undefined}
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
                            <span
                                className="flex-1 min-w-0 truncate"
                                style={isHidden ? { opacity: 0.45, textDecoration: 'line-through' } : undefined}
                            >
                                {e.label}
                            </span>
                            {onHiddenChange && (
                                <button
                                    type="button"
                                    data-aura-circle-eye=""
                                    disabled={lockShown}
                                    onClick={() => toggleHidden(e.key)}
                                    title={
                                        lockShown
                                            ? 'Mindestens ein Eintrag bleibt sichtbar'
                                            : isHidden
                                              ? 'Im Kreis anzeigen'
                                              : 'Im Kreis ausblenden'
                                    }
                                    className="shrink-0 p-0.5 hover:opacity-70 disabled:opacity-30"
                                    style={{ color: isHidden ? 'var(--text-secondary)' : 'var(--text-primary)' }}
                                >
                                    {isHidden ? <EyeOff size={13} /> : <Eye size={13} />}
                                </button>
                            )}
                            <RuleMoveButtons {...reorderProps(i)} />
                        </div>
                    );
                })}
            </div>
            <p className="text-[10px] mt-1" style={hint}>
                Vollkreis: der erste Eintrag oben, dann im Uhrzeigersinn. Halbkreis: von links nach rechts bzw. von oben
                nach unten. Das Auge blendet einen Eintrag im Kreis aus.
            </p>
        </div>
    );
}
