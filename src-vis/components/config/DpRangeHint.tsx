/**
 * DpRangeHint — "the datapoint reports 10 … 30 °C", one click to take it over.
 *
 * A widget adopts `common.min` / `common.max` when it is created on a datapoint,
 * but one that already exists keeps the scale it was saved with — which for every
 * widget built before that was the placeholder 0…100 (#665). This row sits under
 * a scale's Min/Max fields and only shows up when the object behind the widget
 * declares a range the widget is not using, so the mismatch becomes visible
 * instead of quietly wrong.
 */
import { useEffect, useState } from 'react';
import { ensureDatapointCache, lookupDatapointEntry, type DatapointEntry } from '../../hooks/useDatapointList';
import { scaleOptionsFromDatapoint } from '../../utils/dpScale';
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

    const patch = scaleOptionsFromDatapoint(type, entry);
    const keys = Object.keys(patch);
    if (!keys.length) return null;
    // Nothing to offer once the widget already runs on that range.
    if (keys.every((k) => options?.[k] === patch[k])) return null;

    const unit = entry?.unit ? ` ${entry.unit}` : '';
    return (
        <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                {`Datenpunkt meldet ${entry?.min} … ${entry?.max}${unit}`}
            </span>
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
        </div>
    );
}
