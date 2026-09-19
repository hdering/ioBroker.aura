/**
 * DpRangeHint — what the datapoint says about the scale, in one line.
 *
 * A widget adopts `common.min` / `common.max` when it is created on a datapoint,
 * but one that already exists keeps the scale it was saved with — which for every
 * widget built before that was the placeholder 0…100 (#665). So this row sits under
 * a scale's Min/Max fields and reports what the object behind the widget declares:
 * a range, with one click to take it over while the widget is not on it yet — or
 * that it declares none at all, which is the other half of the answer. Without that
 * second case a missing line looks like a broken feature, when in truth there is
 * simply nothing on the object to read.
 *
 * It stays silent only while nothing can be said: no datapoint, an id the datapoint
 * list does not know, or a list that has not loaded yet.
 */
import { useEffect, useState } from 'react';
import { ensureDatapointCache, lookupDatapointEntry, type DatapointEntry } from '../../hooks/useDatapointList';
import { hasScaleFromDatapoint, scaleOptionsFromDatapoint } from '../../utils/dpScale';
import { controlValueTransform } from '../../utils/valueTransform';
import { baseDpId } from '../../utils/dpRef';

interface DpRangeHintProps {
    /** Widget type — decides which option keys the range is written to. */
    type: string;
    /** The widget's datapoint (a JSON-path suffix is stripped). */
    datapoint?: string;
    /** Current widget options, to compare the range against. */
    options?: Record<string, unknown>;
    /** Applies the range, e.g. `(patch) => set(patch)`. */
    onApply: (patch: Record<string, number>) => void;
}

export function DpRangeHint({ type, datapoint, options, onApply }: DpRangeHintProps) {
    const id = baseDpId(datapoint);
    const [entry, setEntry] = useState<DatapointEntry | null>(() => (id ? lookupDatapointEntry(id) : null));

    useEffect(() => {
        if (!id) {
            setEntry(null);
            return;
        }
        const cached = lookupDatapointEntry(id);
        setEntry(cached);
        if (cached) return;
        let alive = true;
        void ensureDatapointCache()
            .then((entries) => {
                if (alive) setEntry(entries.find((e) => e.id === id) ?? null);
            })
            .catch(() => {
                if (alive) setEntry(null);
            });
        return () => {
            alive = false;
        };
    }, [id]);

    // Nothing known about the datapoint yet (or at all) — say nothing rather than
    // claim it has no range.
    if (!entry || !hasScaleFromDatapoint(type)) return null;

    const patch = scaleOptionsFromDatapoint(type, entry, options);
    const keys = Object.keys(patch);
    // With a conversion attached (#682) the object's own numbers are in the datapoint's unit —
    // reporting them raw would name a range the scale above must not be set to. So the line
    // shows what the widget would actually take over, and says where it came from.
    const tr = controlValueTransform(options);
    const lo = tr.toDisplay(entry.min) as number;
    const hi = tr.toDisplay(entry.max) as number;
    const shown = tr.active ? { min: Math.min(lo, hi), max: Math.max(lo, hi) } : { min: entry.min, max: entry.max };
    const unit = tr.active ? '' : entry.unit ? ` ${entry.unit}` : '';
    // The range is already in the widget's options — then the line only says where
    // the numbers above come from, and there is nothing left to take over.
    const onIt = keys.length > 0 && keys.every((k) => options?.[k] === patch[k]);

    return (
        <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                {keys.length
                    ? `Datenpunkt meldet ${shown.min} … ${shown.max}${unit}${tr.active ? ' (umgerechnet)' : ''}`
                    : 'Datenpunkt meldet keinen Bereich (kein Min/Max am Objekt)'}
            </span>
            {keys.length > 0 && !onIt && (
                <button
                    type="button"
                    onClick={() => onApply(patch)}
                    className="text-[10px] px-2 py-1 rounded-lg hover:opacity-80 shrink-0"
                    style={{
                        background: 'var(--app-bg)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--app-border)',
                    }}
                >
                    Übernehmen
                </button>
            )}
        </div>
    );
}
