import { useMemo } from 'react';
import {
    formatItemName,
    finishItemName,
    hasLiveToken,
    type NameFilterRule,
    type NameSource,
} from '../../utils/nameFilter';
import { useDpTokenResolver } from '../widgets/DynamicTitle';
import { useDpNameVarsList } from '../../hooks/useDpNameVars';

/**
 * Live "erkannt → angezeigt" preview of a widget's names: the same formatItemName the
 * widget renders with, plus the live `[[dp]]` tokens and the 'Ergebnis' rules after them
 * (mirrors NameFilterEditor's own preview, which the status overview hides in favour of
 * this one at the top of its "Namen" tab).
 */
export function NamePreview({
    samples,
    sampleTotal,
    pattern,
    rules,
    detected,
}: {
    /** Real datapoints of the owning widget, with any own device name already applied. */
    samples: NameSource[];
    sampleTotal: number;
    pattern?: string;
    rules?: NameFilterRule[];
    /** The detected name per id, when it differs from `samples[].name` (own device names). */
    detected?: Record<string, string>;
}) {
    const rulesKey = JSON.stringify(rules ?? []);
    const nameVars = useDpNameVarsList(
        samples.map((s) => s.id),
        pattern,
    );
    const raw = useMemo(
        () =>
            samples.map((s) => ({
                id: s.id,
                name: s.name,
                after: formatItemName(nameVars[s.id] ? { ...s, nameVars: nameVars[s.id] } : s, pattern, rules),
            })),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [samples, pattern, rulesKey, nameVars],
    );
    const resolveDpTokens = useDpTokenResolver(raw.map((p) => p.after));
    const rows = raw.map((p) => ({
        ...p,
        after: hasLiveToken(p.after) ? finishItemName(resolveDpTokens(p.after, p.name), rules ?? [], p.name) : p.after,
        before: detected?.[p.id] ?? p.name,
        own: detected?.[p.id] !== undefined && detected[p.id] !== p.name,
    }));

    if (rows.length === 0)
        return (
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                Keine passenden Datenpunkte gefunden — Kategorien und Filter prüfen.
            </p>
        );
    return (
        <div className="space-y-1" data-name-preview>
            {rows.map((p) => (
                <div key={p.id} className="text-[11px] leading-tight grid grid-cols-2 gap-3">
                    <div className="truncate" style={{ color: 'var(--text-secondary)', opacity: 0.7 }} title={p.id}>
                        {p.before}
                    </div>
                    <div className="truncate font-medium" style={{ color: 'var(--text-primary)' }}>
                        → {p.after}
                        {p.own && (
                            <span className="font-normal ml-1" style={{ color: 'var(--text-secondary)' }}>
                                (eigener Name)
                            </span>
                        )}
                    </div>
                </div>
            ))}
            {sampleTotal > rows.length && (
                <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                    {rows.length} von {sampleTotal} Datenpunkten
                </p>
            )}
        </div>
    );
}
