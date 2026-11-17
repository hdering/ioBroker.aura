import { useMemo, useState } from 'react';
import type { DatapointEntry } from '../../utils/datapointEntry';
import { deviceIdFallback, type CategoryKey } from '../../utils/statusOverview';

/** One device the Statusübersicht found — what the name popup lists. */
export interface DeviceNameRow {
    key: string; // device id (adapter.instance.device), the deviceNames key
    name: string; // detected name (device part, before " › ")
    room?: string;
    cats: CategoryKey[];
}

const CAT_LABEL: Record<CategoryKey, string> = {
    window: 'Fenster',
    battery: 'Batterie',
    light: 'Licht',
    alarm: 'Alarm',
    unreach: 'Offline',
};

/** The discovered candidates folded into one row per device, sorted by room and name. */
export function deviceRowsOf(found: { dp: DatapointEntry; cat: CategoryKey }[]): DeviceNameRow[] {
    const map = new Map<string, DeviceNameRow>();
    for (const { dp, cat } of found) {
        const key = deviceIdFallback(dp.id);
        const row = map.get(key);
        if (row) {
            if (!row.cats.includes(cat)) row.cats.push(cat);
            continue;
        }
        map.set(key, { key, name: dp.name.split(' › ')[0] || dp.name, room: dp.rooms[0], cats: [cat] });
    }
    return [...map.values()].sort(
        (a, b) => (a.room ?? '￿').localeCompare(b.room ?? '￿', 'de') || a.name.localeCompare(b.name, 'de'),
    );
}

const inputCls = 'w-full text-xs rounded-lg px-2.5 py-1.5 focus:outline-none';
const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};

/**
 * Own display names per device (option deviceNames). Empty field = detected name. Entries
 * for devices the widget no longer finds stay listed at the end so they can be removed.
 */
export function DeviceNamesEditor({
    devices,
    names,
    onChange,
}: {
    devices: DeviceNameRow[];
    names: Record<string, string> | undefined;
    onChange: (v: Record<string, string> | undefined) => void;
}) {
    const [query, setQuery] = useState('');
    const own = useMemo(() => names ?? {}, [names]);

    const setName = (key: string, value: string) => {
        const next = { ...own };
        if (value) next[key] = value;
        else delete next[key];
        onChange(Object.keys(next).length ? next : undefined);
    };

    const rows = useMemo(() => {
        const known = new Set(devices.map((d) => d.key));
        const orphans: DeviceNameRow[] = Object.keys(own)
            .filter((k) => !known.has(k))
            .map((k) => ({ key: k, name: k, cats: [] }));
        const q = query.trim().toLowerCase();
        const all = [...devices, ...orphans];
        if (!q) return all;
        return all.filter((d) =>
            [d.name, d.room ?? '', d.key, own[d.key] ?? ''].some((s) => s.toLowerCase().includes(q)),
        );
    }, [devices, own, query]);

    return (
        <div className="space-y-2" data-aura-device-names>
            <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Suchen (Name, Raum, ID) …"
                className={inputCls}
                style={inputStyle}
            />
            {!devices.length && (
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Noch keine Geräte gefunden (Datenpunkte werden geladen oder keine Kategorie aktiv).
                </p>
            )}
            <div className="space-y-1.5">
                {rows.map((d) => (
                    <div
                        key={d.key}
                        className="grid gap-2 items-center"
                        style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}
                    >
                        <div className="min-w-0">
                            <div className="text-xs truncate" style={{ color: 'var(--text-primary)' }} title={d.name}>
                                {d.name}
                            </div>
                            <div
                                className="text-[10px] truncate"
                                style={{ color: 'var(--text-secondary)' }}
                                title={d.key}
                            >
                                {d.cats.length
                                    ? [d.room, d.cats.map((c) => CAT_LABEL[c]).join(', ')].filter(Boolean).join(' · ')
                                    : 'nicht mehr gefunden'}
                                {' · '}
                                {d.key}
                            </div>
                        </div>
                        <input
                            value={own[d.key] ?? ''}
                            onChange={(e) => setName(d.key, e.target.value)}
                            placeholder={d.cats.length ? d.name : 'leer = entfernen'}
                            className={inputCls}
                            style={inputStyle}
                            aria-label={`Name für ${d.name}`}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
