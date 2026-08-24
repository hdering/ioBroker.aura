import type { ReactNode } from 'react';
import { SUB_SORT_PREFIX, sortSubKey, type ListSortKey } from '../../../utils/listFilter';

/**
 * The "Sortierung" block both lists share — first key, direction, tie-breaker,
 * direction.
 *
 * Beside name and value a key may point at a datapoint of the second line
 * (issue #572), stored as `sub:<key>`. The key is the datapoint's label or the last
 * segment of its id, the same convention a filter rule's `subKey` uses — so
 * `{{parent}}.BATTERY` is addressed as `BATTERY` in every row of a dynamic list.
 */

export interface SortOpts {
    sortBy?: ListSortKey;
    sortOrder?: 'asc' | 'desc';
    sortBy2?: ListSortKey;
    sortOrder2?: 'asc' | 'desc';
}

/**
 * Sort keys the configured second-line datapoints offer. The key is the datapoint's
 * label, or the last segment of its id — exactly what subMatchesKey() looks for, so
 * a `{{parent}}.BATTERY` template row is addressed as `BATTERY`.
 */
export function subSortKeys(
    lists: Array<{ id?: string; label?: string }[] | undefined>,
): { key: string; label: string }[] {
    const out = new Map<string, string>();
    for (const list of lists) {
        for (const s of list ?? []) {
            if (!s?.id) continue;
            const last = s.id.split('.').pop() || s.id;
            const named = (s.label ?? '').trim();
            const key = named || last;
            if (!out.has(key)) out.set(key, named ? `${named} (${last})` : last);
        }
    }
    return [...out].map(([key, label]) => ({ key, label }));
}

type Kind = 'none' | 'label' | 'value' | 'sub';

const KIND_LABELS: Record<Kind, string> = { none: 'Keine', label: 'Name', value: 'Wert', sub: '2. Zeile' };

function kindOf(sortBy: string | undefined): Kind {
    if (!sortBy || sortBy === 'none') return 'none';
    if (sortBy.startsWith(SUB_SORT_PREFIX)) return 'sub';
    return sortBy === 'label' ? 'label' : 'value';
}

/** How a stored sort key reads in a sentence. */
export function sortByLabel(sortBy: string | undefined): string {
    const sk = sortSubKey(sortBy);
    return sk !== null ? `2. Zeile: ${sk}` : KIND_LABELS[kindOf(sortBy)];
}

const btnCls = 'flex-1 text-[11px] py-1.5 rounded-lg transition-colors';
const selCls = 'w-full text-[11px] rounded-lg px-2 py-1.5 mt-1 focus:outline-none';
const selSty: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};

function pill(active: boolean): React.CSSProperties {
    return {
        background: active ? 'var(--accent)' : 'var(--app-bg)',
        color: active ? '#fff' : 'var(--text-secondary)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
    };
}

function OrderRow({ value, onChange }: { value: 'asc' | 'desc'; onChange: (v: 'asc' | 'desc') => void }) {
    return (
        <div className="flex gap-1 mt-1">
            {(['asc', 'desc'] as const).map((v) => (
                <button key={v} onClick={() => onChange(v)} className={btnCls} style={pill(value === v)}>
                    {v === 'asc' ? '↑ Aufsteigend' : '↓ Absteigend'}
                </button>
            ))}
        </div>
    );
}

function KeyRow({
    value,
    subKeys,
    disabledKind,
    onChange,
}: {
    value: ListSortKey | undefined;
    subKeys: { key: string; label: string }[];
    /** Already taken by the primary key — offering it twice sorts by nothing. */
    disabledKind?: Kind;
    onChange: (next: ListSortKey | undefined) => void;
}) {
    const kind = kindOf(value);
    const kinds: Kind[] = subKeys.length ? ['none', 'label', 'value', 'sub'] : ['none', 'label', 'value'];
    return (
        <>
            <div className="flex gap-1">
                {kinds.map((v) => {
                    const disabled = v !== 'none' && v === disabledKind;
                    return (
                        <button
                            key={v}
                            disabled={disabled}
                            title={disabled ? 'Schon als 1. Sortierung gewählt' : undefined}
                            onClick={() =>
                                onChange(
                                    v === 'none'
                                        ? undefined
                                        : v === 'sub'
                                          ? ((SUB_SORT_PREFIX + (subKeys[0]?.key ?? '')) as ListSortKey)
                                          : v,
                                )
                            }
                            className={`${btnCls} disabled:opacity-30 disabled:cursor-not-allowed`}
                            style={pill(kind === v)}
                        >
                            {KIND_LABELS[v]}
                        </button>
                    );
                })}
            </div>
            {kind === 'sub' && (
                <select
                    value={sortSubKey(value) ?? ''}
                    onChange={(e) => onChange((SUB_SORT_PREFIX + e.target.value) as ListSortKey)}
                    className={selCls}
                    style={selSty}
                >
                    {subKeys.map((k) => (
                        <option key={k.key} value={k.key}>
                            {k.label}
                        </option>
                    ))}
                </select>
            )}
        </>
    );
}

export function SortFields({
    opts,
    subKeys,
    onChange,
    hint,
}: {
    opts: SortOpts;
    /** Second-line datapoints available as a sort key. Empty hides the option. */
    subKeys: { key: string; label: string }[];
    onChange: (patch: Partial<SortOpts>) => void;
    /** Shown under the heading — the static list explains section-wise sorting here. */
    hint?: ReactNode;
}) {
    const primary = kindOf(opts.sortBy);
    return (
        <div>
            <label className="text-[11px] mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
                Sortierung
            </label>
            {hint}
            <KeyRow
                value={opts.sortBy}
                subKeys={subKeys}
                onChange={(next) =>
                    onChange({
                        sortBy: next,
                        ...(next === undefined ? { sortBy2: undefined, sortOrder2: undefined } : {}),
                    })
                }
            />
            {primary !== 'none' && (
                <>
                    <OrderRow value={opts.sortOrder ?? 'asc'} onChange={(v) => onChange({ sortOrder: v })} />
                    <label className="text-[10px] mt-2 mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                        Danach sortieren <span className="opacity-60">(bei Gleichheit)</span>
                    </label>
                    <KeyRow
                        value={opts.sortBy2}
                        subKeys={subKeys}
                        disabledKind={primary}
                        onChange={(next) => onChange({ sortBy2: next })}
                    />
                    {kindOf(opts.sortBy2) !== 'none' && (
                        <OrderRow value={opts.sortOrder2 ?? 'asc'} onChange={(v) => onChange({ sortOrder2: v })} />
                    )}
                </>
            )}
        </div>
    );
}
