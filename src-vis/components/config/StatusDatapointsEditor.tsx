import { useEffect, useMemo, useRef, useState } from 'react';
import { deviceIdFallback, type StatusCandidate } from '../../utils/statusOverview';
import { CAT_LABEL } from './StatusDeviceNamesEditor';

/**
 * The Statusübersicht's detected datapoints with a checkbox each (#1002). Unticking one
 * writes its id into excludeIds — the existing filter, nothing new in the frontend.
 * An alias and the datapoint it reads from are both found as their own device; they are
 * marked, and one click hides all originals (or all aliases) of such pairs.
 */

interface DpRow {
    id: string;
    label: string; // state part of the name (after " › ")
    cat?: StatusCandidate['cat'];
    aliasOf?: string; // this alias reads from that found datapoint
    aliasedBy?: string; // a found alias reads from this datapoint
}

interface DeviceGroup {
    key: string;
    name: string;
    room?: string;
    rows: DpRow[];
}

type Mode = 'all' | 'hidden' | 'dupes';

/** Groups rendered at once; the rest behind "Weitere anzeigen" (search covers all). */
const PAGE = 100;

const inputCls = 'text-xs rounded-lg px-2.5 py-1.5 focus:outline-none';
const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const btnCls = 'text-xs rounded-lg px-2.5 py-1.5 hover:opacity-80 transition-opacity disabled:opacity-40';
const btnStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};

/** Alias ↔ original pairs among the found datapoints: alias id → original id. */
export function aliasPairsOf(found: StatusCandidate[]): Map<string, string> {
    const ids = new Set(found.map((c) => c.dp.id));
    const pairs = new Map<string, string>();
    for (const { dp } of found) if (dp.aliasOf && ids.has(dp.aliasOf)) pairs.set(dp.id, dp.aliasOf);
    return pairs;
}

/** The found datapoints folded into one group per device, sorted by room and name. */
function groupsOf(found: StatusCandidate[], pairs: Map<string, string>, excluded: Set<string>): DeviceGroup[] {
    const aliasedBy = new Map<string, string>();
    for (const [alias, orig] of pairs) aliasedBy.set(orig, alias);
    const map = new Map<string, DeviceGroup>();
    const seen = new Set<string>();
    for (const { dp, cat } of found) {
        if (seen.has(dp.id)) continue;
        seen.add(dp.id);
        const key = deviceIdFallback(dp.id);
        const sep = dp.name.indexOf(' › ');
        let g = map.get(key);
        if (!g) {
            g = { key, name: sep > 0 ? dp.name.slice(0, sep) : dp.name, room: dp.rooms[0], rows: [] };
            map.set(key, g);
        }
        g.rows.push({
            id: dp.id,
            label: sep > 0 ? dp.name.slice(sep + 3) : dp.id.split('.').pop() || dp.id,
            cat,
            aliasOf: pairs.get(dp.id),
            aliasedBy: aliasedBy.get(dp.id),
        });
    }
    const groups = [...map.values()].sort(
        (a, b) => (a.room ?? '￿').localeCompare(b.room ?? '￿', 'de') || a.name.localeCompare(b.name, 'de'),
    );
    // Excluded ids the widget no longer finds: listed last so they can be taken out again.
    const orphans = [...excluded].filter((id) => !seen.has(id));
    if (orphans.length) {
        groups.push({
            key: '',
            name: 'Nicht mehr gefunden',
            rows: orphans.map((id) => ({ id, label: id })),
        });
    }
    return groups;
}

function TriCheckbox({
    checked,
    indeterminate,
    onChange,
    label,
}: {
    checked: boolean;
    indeterminate: boolean;
    onChange: (v: boolean) => void;
    label: string;
}) {
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (ref.current) ref.current.indeterminate = indeterminate;
    }, [indeterminate]);
    return (
        <input
            ref={ref}
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            aria-label={label}
            className="shrink-0"
            style={{ accentColor: 'var(--accent)' }}
        />
    );
}

export function StatusDatapointsEditor({
    found,
    excludeIds,
    onChange,
}: {
    /** Discovery result without the widget's own excludeIds. */
    found: StatusCandidate[];
    excludeIds: string[] | undefined;
    onChange: (v: string[] | undefined) => void;
}) {
    const [query, setQuery] = useState('');
    const [mode, setMode] = useState<Mode>('all');
    const [limit, setLimit] = useState(PAGE);
    // A new search or filter starts at the top again.
    useEffect(() => setLimit(PAGE), [query, mode]);
    const excluded = useMemo(() => new Set(excludeIds ?? []), [excludeIds]);
    const pairs = useMemo(() => aliasPairsOf(found), [found]);
    const groups = useMemo(() => groupsOf(found, pairs, excluded), [found, pairs, excluded]);

    const commit = (next: Set<string>) => onChange(next.size ? [...next] : undefined);
    const setShown = (ids: string[], shown: boolean) => {
        const next = new Set(excluded);
        for (const id of ids) {
            if (shown) next.delete(id);
            else next.add(id);
        }
        commit(next);
    };

    const originals = [...new Set(pairs.values())];
    const aliases = [...pairs.keys()];
    const allHidden = (ids: string[]) => ids.length > 0 && ids.every((id) => excluded.has(id));

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        const keep = (g: DeviceGroup, r: DpRow) => {
            if (mode === 'hidden' && !excluded.has(r.id)) return false;
            if (mode === 'dupes' && !r.aliasOf && !r.aliasedBy) return false;
            if (!q) return true;
            return [g.name, g.room ?? '', r.label, r.id].some((s) => s.toLowerCase().includes(q));
        };
        return groups.map((g) => ({ ...g, rows: g.rows.filter((r) => keep(g, r)) })).filter((g) => g.rows.length > 0);
    }, [groups, query, mode, excluded]);

    const foundCount = groups.reduce((n, g) => n + (g.key ? g.rows.length : 0), 0);
    const hiddenCount = excluded.size;

    return (
        <div className="space-y-2" data-aura-status-datapoints>
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                Haken weg = Datenpunkt wird in diesem Widget nicht angezeigt. Ausschluss-Muster wirken zusätzlich; was
                sie ausblenden, steht hier nicht.
            </p>
            <div className="flex flex-wrap gap-2 items-center">
                <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Suchen (Name, Raum, ID) …"
                    className={`${inputCls} flex-1 min-w-[160px]`}
                    style={inputStyle}
                />
                <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as Mode)}
                    className={inputCls}
                    style={inputStyle}
                    aria-label="Anzeigen"
                >
                    <option value="all">Alle</option>
                    <option value="hidden">Nur ausgeblendete</option>
                    <option value="dupes">Nur Alias-Doppelte</option>
                </select>
            </div>
            <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }} data-status-dp-summary>
                {foundCount} erkannt · {hiddenCount} ausgeblendet
                {pairs.size ? ` · ${pairs.size} Alias-Doppelte` : ''}
            </div>
            {pairs.size > 0 && (
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        className={btnCls}
                        style={btnStyle}
                        disabled={allHidden(originals)}
                        onClick={() => {
                            const next = new Set(excluded);
                            originals.forEach((id) => next.add(id));
                            aliases.forEach((id) => next.delete(id));
                            commit(next);
                        }}
                        data-status-dp-hide="originals"
                    >
                        Originale ausblenden, Aliase behalten ({originals.length})
                    </button>
                    <button
                        type="button"
                        className={btnCls}
                        style={btnStyle}
                        disabled={allHidden(aliases)}
                        onClick={() => {
                            const next = new Set(excluded);
                            aliases.forEach((id) => next.add(id));
                            originals.forEach((id) => next.delete(id));
                            commit(next);
                        }}
                        data-status-dp-hide="aliases"
                    >
                        Aliase ausblenden, Originale behalten ({aliases.length})
                    </button>
                </div>
            )}
            <div className="flex gap-2">
                <button
                    type="button"
                    className={btnCls}
                    style={btnStyle}
                    disabled={!hiddenCount}
                    onClick={() => onChange(undefined)}
                >
                    Alle wieder einblenden
                </button>
            </div>
            {!foundCount && !hiddenCount && (
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Noch keine Datenpunkte gefunden (werden geladen oder keine Kategorie aktiv).
                </p>
            )}
            {visible.length > 0 && (
                <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
                    {visible.slice(0, limit).map((g, i) => {
                        const ids = g.rows.map((r) => r.id);
                        const hidden = ids.filter((id) => excluded.has(id)).length;
                        const single = g.rows.length === 1 && g.key !== '';
                        return (
                            <div
                                key={g.key || '__orphans'}
                                className="px-2.5 py-1"
                                style={i ? { borderTop: '1px solid var(--app-border)' } : undefined}
                                data-status-dp-device={g.key}
                            >
                                {single ? (
                                    <DpLine
                                        row={g.rows[0]}
                                        title={g.name}
                                        room={g.room}
                                        shown={hidden === 0}
                                        onChange={(v) => setShown(ids, v)}
                                    />
                                ) : (
                                    <>
                                        <label className="flex items-center gap-2 cursor-pointer min-w-0 py-0.5">
                                            <TriCheckbox
                                                checked={hidden === 0}
                                                indeterminate={hidden > 0 && hidden < ids.length}
                                                onChange={(v) => setShown(ids, v)}
                                                label={`${g.name} anzeigen`}
                                            />
                                            <span
                                                className="text-xs font-medium truncate"
                                                style={{ color: 'var(--text-primary)' }}
                                            >
                                                {g.name}
                                            </span>
                                            {g.room && (
                                                <span
                                                    className="text-[10px] shrink-0"
                                                    style={{ color: 'var(--text-secondary)' }}
                                                >
                                                    {g.room}
                                                </span>
                                            )}
                                            <span
                                                className="ml-auto text-[10px] tabular-nums shrink-0"
                                                style={{ color: 'var(--text-secondary)' }}
                                            >
                                                {ids.length - hidden}/{ids.length}
                                            </span>
                                        </label>
                                        <div className="pl-5">
                                            {g.rows.map((r) => (
                                                <DpLine
                                                    key={r.id}
                                                    row={r}
                                                    title={r.label}
                                                    shown={!excluded.has(r.id)}
                                                    onChange={(v) => setShown([r.id], v)}
                                                />
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
            {visible.length > limit && (
                <button
                    type="button"
                    className={btnCls}
                    style={btnStyle}
                    onClick={() => setLimit((n) => n + PAGE)}
                    data-status-dp-more
                >
                    Weitere {Math.min(PAGE, visible.length - limit)} von {visible.length - limit} Geräten anzeigen
                </button>
            )}
        </div>
    );
}

/** One datapoint: checkbox, name (+ room/category), id and alias marker below. */
function DpLine({
    row,
    title,
    room,
    shown,
    onChange,
}: {
    row: DpRow;
    title: string;
    room?: string;
    shown: boolean;
    onChange: (v: boolean) => void;
}) {
    const cat = row.cat && CAT_LABEL[row.cat] !== title ? CAT_LABEL[row.cat] : '';
    const dupe = row.aliasOf ? `Alias von ${row.aliasOf}` : row.aliasedBy ? `auch als Alias ${row.aliasedBy}` : '';
    return (
        <label className="flex items-start gap-2 cursor-pointer min-w-0 py-0.5" data-status-dp={row.id}>
            <input
                type="checkbox"
                checked={shown}
                onChange={(e) => onChange(e.target.checked)}
                className="shrink-0 mt-0.5"
                style={{ accentColor: 'var(--accent)' }}
            />
            <span className="min-w-0 flex-1" style={{ opacity: shown ? 1 : 0.55 }}>
                <span className="flex items-baseline gap-1.5 min-w-0">
                    <span className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>
                        {title}
                    </span>
                    {room && (
                        <span className="text-[10px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
                            {room}
                        </span>
                    )}
                    {cat && (
                        <span className="text-[10px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
                            · {cat}
                        </span>
                    )}
                    {dupe && (
                        <span
                            className="ml-auto text-[10px] shrink-0 rounded px-1"
                            style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}
                            title={dupe}
                            data-status-dp-dupe={row.aliasOf ? 'alias' : 'original'}
                        >
                            {row.aliasOf ? 'Alias' : 'Original'}
                        </span>
                    )}
                </span>
                <span
                    className="block text-[10px] truncate"
                    style={{ color: 'var(--text-secondary)' }}
                    title={dupe ? `${row.id} – ${dupe}` : row.id}
                >
                    {row.id}
                </span>
            </span>
        </label>
    );
}
