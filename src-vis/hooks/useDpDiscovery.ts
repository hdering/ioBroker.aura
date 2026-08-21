import { useEffect, useState } from 'react';
import { discoverDatapoints, loadFilterOptions } from '../components/widgets/AutoListWidget';
import type { AutoListEntry, AutoListOptions, DiscoveredDp } from '../components/widgets/AutoListWidget';
import type { EnumFilterOption } from '../utils/enumFilter';

function toArr(csv?: string): string[] {
    return csv
        ? csv
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
        : [];
}
function toCsv(arr: string[]): string | undefined {
    return arr.length ? arr.join(', ') : undefined;
}

export type DpDiscovery = ReturnType<typeof useDpDiscovery>;

/**
 * Datapoint search of the dynamic list: the available filter values, the user's
 * (not yet persisted) filter draft, and the search results.
 *
 * Deliberately owned by the config panel, not by the dialog that renders it:
 *
 *  - `loadFilterOptions()` is NOT cached - every call does a full getObjectView over
 *    all states plus the enum view. Dialog-local state would rescan on every open.
 *  - The filter fields are an unconfirmed draft; only "Übernehmen" writes them back.
 *    Closing the dialog by accident must not throw away hand-typed regex patterns.
 *
 * `ensureOptionsLoaded()` defers the expensive scan until the search is actually
 * shown, and is ref-free on purpose: the internal flag makes repeat calls free.
 */
export function useDpDiscovery(opts: AutoListOptions, setOpts: (patch: Partial<AutoListOptions>) => void) {
    // Available filter values from ioBroker
    const [availRoles, setAvailRoles] = useState<string[]>([]);
    const [availRooms, setAvailRooms] = useState<string[]>([]);
    const [availFuncs, setAvailFuncs] = useState<string[]>([]);
    const [availEnums, setAvailEnums] = useState<EnumFilterOption[]>([]);
    const [availTypes, setAvailTypes] = useState<string[]>([]);
    const [availAdapters, setAvailAdapters] = useState<string[]>([]);
    const [optLoading, setOptLoading] = useState(true);
    const [optionsRequested, setOptionsRequested] = useState(false);

    useEffect(() => {
        if (!optionsRequested) return;
        let cancelled = false;
        loadFilterOptions().then(({ roles, rooms, funcs, enums, types, adapters }) => {
            if (cancelled) return;
            setAvailRoles(roles);
            setAvailRooms(rooms);
            setAvailFuncs(funcs);
            setAvailEnums(enums);
            setAvailTypes(types);
            setAvailAdapters(adapters);
            setOptLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [optionsRequested]);

    /** Call when the search UI becomes visible. Repeat calls are free. */
    const ensureOptionsLoaded = () => setOptionsRequested(true);

    // Filter draft - seeded from the stored options, written back only by apply()
    const [selRoles, setSelRoles] = useState<string[]>(toArr(opts.filterRoles));
    const [selRooms, setSelRooms] = useState<string[]>(toArr(opts.filterRooms));
    const [selFuncs, setSelFuncs] = useState<string[]>(toArr(opts.filterFuncs));
    const [selEnums, setSelEnums] = useState<string[]>(toArr(opts.filterEnums));
    const [selTypes, setSelTypes] = useState<string[]>(toArr(opts.filterTypes));
    const [selAdapters, setSelAdapters] = useState<string[]>(toArr(opts.filterAdapters));
    const [idPat, setIdPat] = useState(opts.filterIdPattern ?? '');

    // Exclude state
    const [excludePats, setExcludePats] = useState(opts.excludeIdPatterns ?? '');
    const [excludeIds, setExcludeIds] = useState<string[]>(opts.excludeIds ?? []);
    const [showExcludePicker, setShowExcludePicker] = useState(false);

    // Search results
    const [results, setResults] = useState<DiscoveredDp[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [showOthers, setShowOthers] = useState(false);

    /** Results are stale as soon as any filter value changes. */
    const resetSearch = () => {
        setResults([]);
        setSelected(new Set());
        setSearched(false);
        setShowOthers(false);
    };

    const search = async () => {
        setLoading(true);
        try {
            const found = await discoverDatapoints({
                filterAdapters: toCsv(selAdapters),
                filterRoles: toCsv(selRoles),
                filterIdPattern: idPat || undefined,
                filterRooms: toCsv(selRooms),
                filterFuncs: toCsv(selFuncs),
                filterEnums: toCsv(selEnums),
                filterTypes: toCsv(selTypes),
                excludeIdPatterns: excludePats || undefined,
                excludeIds: excludeIds.length ? excludeIds : undefined,
            });
            setResults(found);
            setSearched(true);
            const relevantFound = found.filter((d) => d.isRelevant);
            if (relevantFound.length > 0) {
                setSelected(new Set(relevantFound.map((d) => d.id)));
                setShowOthers(false);
            } else {
                // No relevant DPs → select all and show them so the user sees what was found
                setSelected(new Set(found.map((d) => d.id)));
                setShowOthers(true);
            }
        } finally {
            setLoading(false);
        }
    };

    /** Merges new entries with existing ones so custom labels/units survive. */
    const apply = (): string | undefined => {
        const discovered = new Map(results.map((d) => [d.id, d]));
        const existingMap = new Map((opts.entries ?? []).map((e) => [e.id, e]));
        let firstNewId: string | undefined;
        const entries: AutoListEntry[] = [...selected]
            .filter((id) => !!id)
            .map((id) => {
                const existing = existingMap.get(id);
                if (existing) return existing; // preserve user-edited label/unit/trueLabel/falseLabel
                if (!firstNewId) firstNewId = id;
                const dp = discovered.get(id);
                return { id, label: undefined, rooms: dp?.rooms, unit: dp?.unit, role: dp?.role, writable: dp?.write };
            });
        setOpts({
            entries,
            filterAdapters: toCsv(selAdapters),
            filterRoles: toCsv(selRoles),
            filterIdPattern: idPat || undefined,
            filterRooms: toCsv(selRooms),
            filterFuncs: toCsv(selFuncs),
            filterEnums: toCsv(selEnums),
            filterTypes: toCsv(selTypes),
            excludeIdPatterns: excludePats || undefined,
            excludeIds: excludeIds.length ? excludeIds : undefined,
        });
        return firstNewId ?? entries[0]?.id;
    };

    const toggle = (id: string) =>
        setSelected((prev) => {
            const s = new Set(prev);
            s.has(id) ? s.delete(id) : s.add(id);
            return s;
        });

    const canSearch =
        selRoles.length > 0 ||
        selRooms.length > 0 ||
        selFuncs.length > 0 ||
        selEnums.length > 0 ||
        selTypes.length > 0 ||
        selAdapters.length > 0 ||
        !!idPat;

    return {
        availRoles,
        availRooms,
        availFuncs,
        availEnums,
        availTypes,
        availAdapters,
        optLoading,
        ensureOptionsLoaded,
        selRoles,
        setSelRoles,
        selRooms,
        setSelRooms,
        selFuncs,
        setSelFuncs,
        selEnums,
        setSelEnums,
        selTypes,
        setSelTypes,
        selAdapters,
        setSelAdapters,
        idPat,
        setIdPat,
        excludePats,
        setExcludePats,
        excludeIds,
        setExcludeIds,
        showExcludePicker,
        setShowExcludePicker,
        results,
        selected,
        setSelected,
        loading,
        searched,
        showOthers,
        setShowOthers,
        resetSearch,
        search,
        apply,
        toggle,
        canSearch,
    };
}
