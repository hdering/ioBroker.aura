import { Fragment, useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Info, Search, X } from 'lucide-react';
import { iconLoaded, loadIcons } from '@iconify/react';
import { ICON_CATEGORIES } from '../../utils/iconCategories';
import { isIconsOfflineActive, lucidePascalToIconify } from '../../utils/iconifyLoader';
import { adapterIconId, adapterIconLabel, parseAdapterIconId } from '../../utils/adapterIconId';
import { AuraIcon } from '../common/AuraIcon';
import { usePortalTarget } from '../../contexts/PortalTargetContext';
import { useOverlayZ } from '../../contexts/OverlayZContext';
import { useEscapeLayer } from '../../utils/escapeStack';
import { useT } from '../../i18n';

// ── Props ──────────────────────────────────────────────────────────────────────
interface IconPickerModalProps {
    current: string;
    onSelect: (name: string) => void;
    onClose: () => void;
}

/** Normalize stored icon name to Iconify ID for display/comparison */
function toIconifyId(name: string): string {
    if (!name) return '';
    return name.includes(':') ? name : lucidePascalToIconify(name);
}

/** Selection highlight ignores the colour flag — the file is what was picked. */
function sameIcon(a: string, b: string): boolean {
    return a.replace(/#original$/, '') === b.replace(/#original$/, '');
}

// ── Sources (#716) ────────────────────────────────────────────────────────────
//
// `all`             curated categories; a query also searches every Iconify set + adapter files
// `iconify:<pfx>`   one Iconify set, browsable without a query
// `adapter:<name>`  one installed ioBroker icon adapter, straight from its storage

interface AdapterSet {
    id: string;
    title: string;
    license: string;
    count: number;
    folders: string[];
    multicolor: boolean;
    raster: boolean;
    /** Display names of folders — a vis-2 icon pack's own name ("Einfarbig"). */
    folderLabels?: Record<string, string>;
}

interface IconifySet {
    prefix: string;
    name: string;
    total: number;
    license: string;
}

interface CollectionData {
    names: string[];
    categories: Record<string, string[]>;
    /** The list could not be fetched (offline, rate limit) — the set is not empty. */
    failed?: boolean;
}

/** Tiles rendered per step — a whole set (mdi: 7 000) at once would stall the dialog. */
const PAGE = 400;

let iconifySetsPromise: Promise<IconifySet[]> | null = null;
function fetchIconifySets(): Promise<IconifySet[]> {
    if (!iconifySetsPromise) {
        // No catalogue, no Iconify group: listing sets that cannot be opened
        // only produced empty grids (#716).
        iconifySetsPromise = fetch('/icons/collections')
            .then((r) => (r.ok ? r.json() : {}))
            .then(
                (
                    data: Record<
                        string,
                        { name?: string; total?: number; hidden?: boolean; license?: { title?: string } }
                    >,
                ) => {
                    const sets = Object.entries(data || {})
                        .filter(([, v]) => v && !v.hidden)
                        .map(([prefix, v]) => ({
                            prefix,
                            name: v.name || prefix,
                            total: v.total ?? 0,
                            license: v.license?.title ?? '',
                        }))
                        .sort((a, b) => a.name.localeCompare(b.name));
                    if (!sets.length) iconifySetsPromise = null; // offline — ask again next time
                    return sets;
                },
            )
            .catch(() => {
                iconifySetsPromise = null;
                return [];
            });
    }
    return iconifySetsPromise;
}

const collectionPromises = new Map<string, Promise<CollectionData>>();
function fetchCollection(prefix: string): Promise<CollectionData> {
    let p = collectionPromises.get(prefix);
    if (!p) {
        const failed = (): CollectionData => {
            collectionPromises.delete(prefix); // try again on the next visit
            return { names: [], categories: {}, failed: true };
        };
        p = fetch(`/icons/collection?prefix=${encodeURIComponent(prefix)}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data: { uncategorized?: string[]; categories?: Record<string, string[]> } | null) => {
                if (!data) return failed();
                const categories = data.categories ?? {};
                const names = new Set<string>(data.uncategorized ?? []);
                for (const list of Object.values(categories)) for (const n of list) names.add(n);
                if (!names.size) return failed();
                return { names: [...names].sort(), categories };
            })
            .catch(failed);
        collectionPromises.set(prefix, p);
    }
    return p;
}

/** Every Iconify id the adapter's disk cache answers — what a device without
 *  internet can show. Asked fresh per picker, the cache grows while browsing. */
function fetchCachedIds(): Promise<Set<string>> {
    return fetch('/icons/status?all=1')
        .then((r) => (r.ok ? r.json() : { ids: [] }))
        .then((d: { ids?: string[] }) => new Set(Array.isArray(d?.ids) ? d.ids : []))
        .catch(() => new Set<string>());
}

function fetchAdapterSets(): Promise<AdapterSet[]> {
    return fetch('/adapter-icons/sets')
        .then((r) => (r.ok ? r.json() : { sets: [] }))
        .then((d: { sets?: AdapterSet[] }) => (Array.isArray(d?.sets) ? d.sets : []))
        .catch(() => []);
}

const adapterLists = new Map<string, Promise<string[]>>();
/** set → path → name (+ keywords) of icons that carry one — vis-2 pack entries. */
const adapterTitles = new Map<string, Record<string, string>>();
function fetchAdapterList(set: string): Promise<string[]> {
    let p = adapterLists.get(set);
    if (!p) {
        p = fetch(`/adapter-icons/list?set=${encodeURIComponent(set)}`)
            .then((r) => (r.ok ? r.json() : { icons: [] }))
            .then((d: { icons?: string[]; titles?: Record<string, string> }) => {
                adapterTitles.set(set, d?.titles && typeof d.titles === 'object' ? d.titles : {});
                return Array.isArray(d?.icons) ? d.icons : [];
            })
            .catch(() => {
                adapterLists.delete(set);
                return [];
            });
        adapterLists.set(set, p);
    }
    return p;
}

/** Search hits a file name or, for a pack entry, its name and keywords. */
function adapterFileMatches(set: string, file: string, q: string): boolean {
    return file.toLowerCase().includes(q) || !!adapterTitles.get(set)?.[file]?.toLowerCase().includes(q);
}

/** Root-level files of an adapter set get this pseudo folder in the sidebar. */
const ROOT_FOLDER = '\u0000root';

// ── Icon grid item ─────────────────────────────────────────────────────────────
function IconItem({
    id,
    title,
    selected,
    onSelect,
}: {
    id: string;
    title: string;
    selected: boolean;
    onSelect: () => void;
}) {
    return (
        <button
            title={title}
            onClick={onSelect}
            data-icon-id={id}
            className="w-9 h-9 rounded-lg flex flex-col items-center justify-center transition-colors"
            style={{
                background: selected ? 'var(--accent)' : 'var(--app-bg)',
                color: selected ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${selected ? 'var(--accent)' : 'var(--app-border)'}`,
            }}
        >
            <AuraIcon icon={id} width={id.startsWith('iob:') ? 20 : 15} height={id.startsWith('iob:') ? 20 : 15} />
        </button>
    );
}

// ── Sidebar group heading ──────────────────────────────────────────────────────
function SidebarHeading({ label }: { label: string }) {
    return (
        <div
            className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide truncate shrink-0"
            title={label}
            style={{ color: 'var(--text-secondary)', opacity: 0.8 }}
        >
            {label}
        </div>
    );
}

// ── Category sidebar button ────────────────────────────────────────────────────
function CategoryBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            title={label}
            className="w-full text-left px-3 py-1.5 text-xs transition-colors truncate shrink-0"
            style={{
                background: active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text-secondary)',
                fontWeight: active ? 600 : 400,
                borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
            }}
        >
            {label}
        </button>
    );
}

// ── Modal ──────────────────────────────────────────────────────────────────────
export function IconPickerModal({ current, onSelect, onClose }: IconPickerModalProps) {
    const t = useT();
    const portalTarget = usePortalTarget();
    const overlayZ = useOverlayZ();
    const currentRef = parseAdapterIconId(current || '');
    const [query, setQuery] = useState('');
    const [source, setSource] = useState<string>(() => (currentRef ? `adapter:${currentRef.adapter}` : 'all'));
    const [categoryId, setCategoryId] = useState('all');
    const [missingIds, setMissingIds] = useState<Set<string>>(new Set());
    const [onlineIds, setOnlineIds] = useState<string[]>([]);
    const [onlineLoading, setOnlineLoading] = useState(false);
    const [iconifySets, setIconifySets] = useState<IconifySet[]>([]);
    const [adapterSets, setAdapterSets] = useState<AdapterSet[]>([]);
    const [adapterSetsLoaded, setAdapterSetsLoaded] = useState(false);
    const [adapterFiles, setAdapterFiles] = useState<Record<string, string[]>>({});
    const [collection, setCollection] = useState<CollectionData | null>(null);
    const [collectionLoading, setCollectionLoading] = useState(false);
    const [keepColours, setKeepColours] = useState<boolean | null>(() => (currentRef ? currentRef.original : null));
    const [shown, setShown] = useState(PAGE);
    // "Offline only" (#716): starts on where the layout declared its devices
    // offline (iconsOffline) — there, an icon the adapter has not cached stays blank.
    const [offlineOnly, setOfflineOnly] = useState(() => isIconsOfflineActive());
    const [cachedIds, setCachedIds] = useState<Set<string> | null>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    /** Offset from the centred position, moved by dragging the title bar. */
    const [offset, setOffset] = useState({ x: 0, y: 0 });

    const onDragStart = (e: React.PointerEvent) => {
        if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, select')) return;
        const panel = panelRef.current;
        if (!panel) return;
        e.preventDefault();
        const start = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y };
        const rect = panel.getBoundingClientRect();
        // Keep at least the title bar on screen, whichever way it is dragged.
        const minX = start.ox - rect.left - rect.width + 80;
        const maxX = start.ox + (window.innerWidth - rect.left) - 80;
        const minY = start.oy - rect.top;
        const maxY = start.oy + (window.innerHeight - rect.top) - 40;
        const onMove = (ev: PointerEvent) => {
            setOffset({
                x: Math.min(maxX, Math.max(minX, start.ox + ev.clientX - start.mx)),
                y: Math.min(maxY, Math.max(minY, start.oy + ev.clientY - start.my)),
            });
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    };

    // Topmost layer: Escape closes the picker, not the dialog it was opened from.
    useEscapeLayer(onClose);

    const currentId = currentRef ? current : toIconifyId(current);

    const sourceKind = source.startsWith('iconify:') ? 'iconify' : source.startsWith('adapter:') ? 'adapter' : source;
    const sourceId = source.includes(':') ? source.slice(source.indexOf(':') + 1) : '';
    const adapterSet = sourceKind === 'adapter' ? adapterSets.find((s) => s.id === sourceId) : undefined;
    // null = follow the set's own default (a colour set keeps its colours)
    const original = keepColours ?? adapterSet?.multicolor ?? false;

    useEffect(() => {
        setTimeout(() => searchRef.current?.focus(), 50);
    }, []);

    useEffect(() => {
        let cancelled = false;
        void fetchIconifySets().then((sets) => !cancelled && setIconifySets(sets));
        void fetchAdapterSets().then((sets) => {
            if (cancelled) return;
            setAdapterSets(sets);
            setAdapterSetsLoaded(true);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!offlineOnly || cachedIds) return;
        let cancelled = false;
        void fetchCachedIds().then((ids) => !cancelled && setCachedIds(ids));
        return () => {
            cancelled = true;
        };
    }, [offlineOnly, cachedIds]);

    /** Adapter files are local by nature; an Iconify id only when the adapter cached it. */
    const available = (id: string): boolean =>
        !offlineOnly || id.startsWith('iob:') || (cachedIds ? cachedIds.has(id) : true);

    // A source change starts over: first page, all categories, colour default of the set.
    useEffect(() => {
        setCategoryId('all');
        setShown(PAGE);
    }, [source]);
    useEffect(() => setShown(PAGE), [query, categoryId, offlineOnly]);

    // File lists: the chosen adapter set — or every set while searching across all sources.
    const wantedLists = useMemo(() => {
        if (sourceKind === 'adapter') return sourceId ? [sourceId] : [];
        if (sourceKind === 'all') return adapterSets.map((s) => s.id);
        return [];
    }, [sourceKind, sourceId, adapterSets]);
    useEffect(() => {
        let cancelled = false;
        for (const id of wantedLists) {
            if (adapterFiles[id]) continue;
            void fetchAdapterList(id).then((files) => {
                if (!cancelled) setAdapterFiles((prev) => ({ ...prev, [id]: files }));
            });
        }
        return () => {
            cancelled = true;
        };
    }, [wantedLists, adapterFiles]);

    // One Iconify set: its full name list, so it can be browsed and filtered offline-fast.
    useEffect(() => {
        if (sourceKind !== 'iconify' || !sourceId) {
            setCollection(null);
            return;
        }
        let cancelled = false;
        setCollection(null);
        setCollectionLoading(true);
        void fetchCollection(sourceId).then((c) => {
            if (cancelled) return;
            setCollection(c);
            setCollectionLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [sourceKind, sourceId]);

    // Build flat list of all Iconify IDs across all categories.
    const allIds = useMemo(() => {
        const seen = new Set<string>();
        const result: string[] = [];
        for (const cat of ICON_CATEGORIES) {
            for (const name of cat.icons) {
                const id = toIconifyId(name);
                if (!seen.has(id)) {
                    seen.add(id);
                    result.push(id);
                }
            }
        }
        return result;
    }, []);

    // Validate icons against the Iconify API once on mount, then drop the
    // missing ones from view so users can't pick blank tiles. The curated
    // list contains legacy Lucide aliases (e.g. "GiftIcon", "BlindsIcon")
    // that resolve to non-existent Iconify IDs.
    useEffect(() => {
        const todo = allIds.filter((id) => !iconLoaded(id));
        if (todo.length === 0) return;
        let cancelled = false;
        loadIcons(todo, (_loaded, missing /*, _pending */) => {
            if (cancelled || !missing || missing.length === 0) return;
            setMissingIds((prev) => {
                const next = new Set(prev);
                for (const m of missing) {
                    next.add(typeof m === 'string' ? m : `${m.prefix}:${m.name}`);
                }
                return next;
            });
        });
        return () => {
            cancelled = true;
        };
    }, [allIds]);

    const validIds = useMemo(() => allIds.filter((id) => !missingIds.has(id)), [allIds, missingIds]);

    // Live Iconify search — fetches any icon from any set (mdi, material-symbols,
    // tabler, …) so users aren't limited to the curated category list. Debounced
    // 300 ms; aborts on query change or unmount. Relayed by the adapter (#636),
    // because api.iconify.design is blocked by the tracker blockers in Samsung
    // Internet and Opera and unreachable from a tablet without internet.
    // A single set with its name list loaded is filtered locally instead.
    // Offline only: the adapter's cache is the catalogue, nothing is asked online.
    const needsOnline =
        !offlineOnly &&
        (sourceKind === 'all' || (sourceKind === 'iconify' && !collectionLoading && !collection?.names.length));
    useEffect(() => {
        const q = query.trim();
        if (q.length < 2 || !needsOnline) {
            setOnlineIds([]);
            setOnlineLoading(false);
            return;
        }
        const ctrl = new AbortController();
        setOnlineLoading(true);
        const scope = sourceKind === 'iconify' ? `&prefixes=${encodeURIComponent(sourceId)}` : '';
        const timer = setTimeout(() => {
            fetch(`/icons/search?query=${encodeURIComponent(q)}&limit=200${scope}`, { signal: ctrl.signal })
                .then((r) => r.json())
                .then((data) => {
                    const ids = Array.isArray(data?.icons) ? (data.icons as string[]) : [];
                    setOnlineIds(ids);
                })
                .catch(() => {
                    /* abort or network error → ignore */
                })
                .finally(() => setOnlineLoading(false));
        }, 300);
        return () => {
            clearTimeout(timer);
            ctrl.abort();
        };
    }, [query, needsOnline, sourceKind, sourceId]);

    // Sidebar: curated categories, the set's own categories, or the adapter's folders.
    const sidebar = useMemo<{ id: string; label: string; count: number; heading?: string }[]>(() => {
        if (sourceKind === 'iconify') {
            if (!collection) return [];
            return Object.entries(collection.categories)
                .map(([name, list]) => ({
                    id: name,
                    label: name,
                    count: list.filter((n) => available(`${sourceId}:${n}`)).length,
                }))
                .filter((c) => c.count > 0)
                .sort((a, b) => a.label.localeCompare(b.label));
        }
        if (sourceKind === 'adapter') {
            const files = adapterFiles[sourceId] ?? [];
            const counts = new Map<string, number>();
            for (const f of files) {
                const folder = f.includes('/') ? f.slice(0, f.indexOf('/')) : ROOT_FOLDER;
                counts.set(folder, (counts.get(folder) ?? 0) + 1);
            }
            if (counts.size < 2) return [];
            return [...counts.entries()]
                .map(([id, count]) => ({
                    id,
                    label: id === ROOT_FOLDER ? t('iconPicker.rootFolder') : (adapterSet?.folderLabels?.[id] ?? id),
                    count,
                }))
                .sort((a, b) =>
                    a.id === ROOT_FOLDER
                        ? -1
                        : b.id === ROOT_FOLDER
                          ? 1
                          : adapterSet?.folderLabels?.[a.id] || adapterSet?.folderLabels?.[b.id]
                            ? 0
                            : a.label.localeCompare(b.label),
                );
        }
        const curated: { id: string; label: string; count: number; heading?: string }[] = ICON_CATEGORIES.map(
            (cat) => ({
                id: cat.id,
                label: cat.label,
                count: cat.icons.filter((n) => !missingIds.has(toIconifyId(n)) && available(toIconifyId(n))).length,
            }),
        ).filter((c) => c.count > 0);
        if (curated.length) curated[0].heading = t('iconPicker.groupAura');
        // "All sources" browses the installed adapters too — each under its own
        // heading with its folders / packs, like the adapter source shows them.
        for (const set of adapterSets) {
            const counts = new Map<string, number>();
            for (const f of adapterFiles[set.id] ?? []) {
                const folder = f.includes('/') ? f.slice(0, f.indexOf('/')) : ROOT_FOLDER;
                counts.set(folder, (counts.get(folder) ?? 0) + 1);
            }
            let first = true;
            for (const [folder, count] of counts) {
                curated.push({
                    id: `@${set.id}/${folder === ROOT_FOLDER ? '' : folder}`,
                    label:
                        folder === ROOT_FOLDER
                            ? counts.size > 1
                                ? t('iconPicker.rootFolder')
                                : t('common.all')
                            : (set.folderLabels?.[folder] ?? folder),
                    count,
                    heading: first ? set.title : undefined,
                });
                first = false;
            }
        }
        return curated;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        sourceKind,
        sourceId,
        collection,
        adapterFiles,
        adapterSets,
        missingIds,
        t,
        offlineOnly,
        cachedIds,
        adapterSet,
    ]);

    const adapterIdsOf = (setId: string, files: string[]) => {
        const set = adapterSets.find((s) => s.id === setId);
        const keep = setId === sourceId ? original : (set?.multicolor ?? false);
        return files.map((f) => adapterIconId(setId, f, keep && f.toLowerCase().endsWith('.svg')));
    };

    // Visible icons for current selection
    const rawEntries = useMemo<string[]>(() => {
        const q = query.toLowerCase().trim();

        if (sourceKind === 'adapter') {
            let files = adapterFiles[sourceId] ?? [];
            if (categoryId !== 'all') {
                files = files.filter((f) =>
                    categoryId === ROOT_FOLDER ? !f.includes('/') : f.startsWith(`${categoryId}/`),
                );
            }
            if (q) files = files.filter((f) => adapterFileMatches(sourceId, f, q));
            return adapterIdsOf(sourceId, files);
        }

        if (sourceKind === 'iconify') {
            if (collection?.names.length) {
                let names = categoryId === 'all' ? collection.names : (collection.categories[categoryId] ?? []);
                if (q) names = names.filter((n) => n.includes(q));
                return names.map((n) => `${sourceId}:${n}`);
            }
            if (offlineOnly && cachedIds) {
                return [...cachedIds].filter((id) => id.startsWith(`${sourceId}:`) && id.includes(q)).sort();
            }
            return q ? onlineIds.filter((id) => id.startsWith(`${sourceId}:`)) : [];
        }

        if (q) {
            const local = validIds.filter((id) => id.toLowerCase().includes(q)).sort();
            const seen = new Set(local);
            const out = [...local];
            const more = offlineOnly && cachedIds ? [...cachedIds].filter((id) => id.includes(q)).sort() : onlineIds;
            for (const id of more) {
                if (!seen.has(id)) {
                    seen.add(id);
                    out.push(id);
                }
            }
            for (const set of adapterSets) {
                const files = (adapterFiles[set.id] ?? []).filter((f) => adapterFileMatches(set.id, f, q));
                out.push(...adapterIdsOf(set.id, files));
            }
            return out;
        }

        if (categoryId === 'all') {
            const out = [...validIds];
            for (const set of adapterSets) out.push(...adapterIdsOf(set.id, adapterFiles[set.id] ?? []));
            return out;
        }

        if (categoryId.startsWith('@')) {
            const slash = categoryId.indexOf('/');
            const setId = categoryId.slice(1, slash);
            const folder = categoryId.slice(slash + 1);
            const files = (adapterFiles[setId] ?? []).filter((f) =>
                folder ? f.startsWith(`${folder}/`) : !f.includes('/'),
            );
            return adapterIdsOf(setId, files);
        }

        const cat = ICON_CATEGORIES.find((c) => c.id === categoryId);
        if (!cat) return [];
        return cat.icons.map(toIconifyId).filter((id) => !missingIds.has(id));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        validIds,
        missingIds,
        query,
        categoryId,
        onlineIds,
        sourceKind,
        sourceId,
        adapterFiles,
        adapterSets,
        collection,
        original,
        offlineOnly,
        cachedIds,
    ]);
    const entries = useMemo(() => rawEntries.filter(available), [rawEntries, offlineOnly, cachedIds]); // eslint-disable-line react-hooks/exhaustive-deps

    const visible = entries.slice(0, shown);
    const shownIconifySets = useMemo(() => {
        if (!offlineOnly || !cachedIds) return iconifySets;
        const prefixes = new Set([...cachedIds].map((id) => id.slice(0, id.indexOf(':'))));
        return iconifySets.filter((s) => prefixes.has(s.prefix) || source === `iconify:${s.prefix}`);
    }, [iconifySets, offlineOnly, cachedIds, source]);
    const totalCount =
        sourceKind === 'adapter'
            ? (adapterFiles[sourceId]?.length ?? 0)
            : sourceKind === 'iconify'
              ? (collection?.names.filter((n) => available(`${sourceId}:${n}`)).length ?? 0)
              : validIds.filter(available).length +
                adapterSets.reduce((n, set) => n + (adapterFiles[set.id]?.length ?? 0), 0);
    const loading =
        onlineLoading ||
        collectionLoading ||
        (sourceKind === 'adapter' && !adapterFiles[sourceId]) ||
        (sourceKind === 'all' && query.trim().length >= 2 && adapterSets.some((s) => !adapterFiles[s.id]));

    const titleOf = (id: string): string => {
        const ref = parseAdapterIconId(id);
        if (!ref) return id;
        const set = adapterSets.find((s) => s.id === ref.adapter);
        const name = adapterTitles.get(ref.adapter)?.[ref.path] || adapterIconLabel(ref);
        const slash = ref.path.indexOf('/');
        const folder = slash > 0 ? set?.folderLabels?.[ref.path.slice(0, slash)] : undefined;
        return `${name}\n${set?.title ?? ref.adapter}${folder ? ` · ${folder}` : ''} · ${ref.path}`;
    };

    const currentLabel = (() => {
        if (!currentId) return '';
        const ref = parseAdapterIconId(currentId);
        return ref ? `${ref.adapter} · ${adapterIconLabel(ref)}` : currentId;
    })();

    const selectStyle = {
        background: 'var(--app-bg)',
        color: 'var(--text-primary)',
        border: '1px solid var(--app-border)',
    };

    const modal = (
        <div
            className="fixed inset-0 flex items-center justify-center"
            // Tier comes from the surrounding overlay - inside a ConfigModal the picker
            // has to clear that dialog's backdrop (see contexts/OverlayZContext).
            style={{ zIndex: overlayZ }}
            onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
            {/* Backdrop */}
            <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.5)' }} />

            {/* Panel */}
            <div
                ref={panelRef}
                className="relative rounded-xl flex flex-col"
                data-aura-icon-picker
                style={{
                    transform: offset.x || offset.y ? `translate(${offset.x}px, ${offset.y}px)` : undefined,
                    background: 'linear-gradient(var(--app-surface), var(--app-surface)), var(--app-bg)',
                    border: '1px solid var(--app-border)',
                    width: 620,
                    maxWidth: '95vw',
                    height: 860,
                    maxHeight: '96vh',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
                }}
            >
                {/* Title bar: drag handle + close */}
                <div
                    className="flex items-center gap-2 px-3 pt-2.5 pb-1 shrink-0 cursor-move select-none"
                    data-aura-icon-picker-drag
                    onPointerDown={onDragStart}
                    style={{ touchAction: 'none' }}
                >
                    <span className="text-xs font-semibold flex-1" style={{ color: 'var(--text-primary)' }}>
                        {t('iconPicker.title')}
                    </span>
                    <button
                        onClick={onClose}
                        className="p-1 rounded hover:opacity-70 transition-opacity"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Search */}
                <div className="flex items-center gap-2 px-3 pt-1 pb-2 shrink-0">
                    <Search size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                    <input
                        ref={searchRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t('iconPicker.search')}
                        className="flex-1 min-w-0 text-sm bg-transparent focus:outline-none"
                        style={{ color: 'var(--text-primary)' }}
                    />
                    {query && (
                        <button onClick={() => setQuery('')} style={{ color: 'var(--text-secondary)' }}>
                            <X size={13} />
                        </button>
                    )}
                </div>

                {/* Source filter */}
                <div className="flex items-center gap-2 px-3 pb-2 shrink-0 flex-wrap">
                    <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        {t('iconPicker.source')}
                    </span>
                    <select
                        value={source}
                        onChange={(e) => {
                            setSource(e.target.value);
                            setKeepColours(null);
                        }}
                        data-aura-icon-source
                        className="text-xs rounded px-1.5 py-1 min-w-0 flex-1"
                        style={{ ...selectStyle, maxWidth: 360 }}
                    >
                        <option value="all">{t('iconPicker.sourceAll')}</option>
                        <optgroup label={t('iconPicker.groupAdapters')}>
                            {adapterSets.map((s) => (
                                <option key={s.id} value={`adapter:${s.id}`}>
                                    {s.title} ({s.count})
                                </option>
                            ))}
                            {adapterSetsLoaded && !adapterSets.length && (
                                <option disabled value="">
                                    {t('iconPicker.noAdapters')}
                                </option>
                            )}
                        </optgroup>
                        {shownIconifySets.length > 0 && (
                            <optgroup label={t('iconPicker.groupIconify')}>
                                {shownIconifySets.map((s) => (
                                    <option key={s.prefix} value={`iconify:${s.prefix}`}>
                                        {s.name}
                                        {s.total ? ` (${s.total})` : ''}
                                    </option>
                                ))}
                            </optgroup>
                        )}
                    </select>
                    <label
                        className="flex items-center gap-1 text-[11px] cursor-pointer"
                        title={t('iconPicker.offlineOnlyHint')}
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        <input
                            type="checkbox"
                            checked={offlineOnly}
                            onChange={(e) => setOfflineOnly(e.target.checked)}
                            data-aura-icon-offline
                        />
                        {t('iconPicker.offlineOnly')}
                    </label>
                    {adapterSet && !adapterSet.raster && (
                        <label
                            className="flex items-center gap-1 text-[11px] cursor-pointer"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            <input
                                type="checkbox"
                                checked={original}
                                onChange={(e) => setKeepColours(e.target.checked)}
                                data-aura-icon-original
                            />
                            {t('iconPicker.keepColours')}
                        </label>
                    )}
                </div>

                {/* Adapter icons behave differently from Iconify icons — say how, once, right here. */}
                {adapterSet && (
                    <div
                        className="mx-3 mb-2 px-2.5 py-2 rounded-lg text-[11px] leading-snug flex gap-2 shrink-0"
                        data-aura-icon-hint
                        style={{
                            background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
                            color: 'var(--text-secondary)',
                            border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                        }}
                    >
                        <Info size={13} style={{ flexShrink: 0, marginTop: 1, color: 'var(--accent)' }} />
                        <div>
                            {adapterSet.raster
                                ? t('iconPicker.hintRaster')
                                : original
                                  ? t('iconPicker.hintOriginal')
                                  : t('iconPicker.hintTinted')}{' '}
                            {t('iconPicker.hintLicense', { adapter: adapterSet.id })}
                            {adapterSet.license ? ` (${adapterSet.license})` : ''}.
                        </div>
                    </div>
                )}

                <div className="h-px shrink-0" style={{ background: 'var(--app-border)' }} />

                {/* Body: sidebar + grid */}
                <div className="flex flex-1 min-h-0">
                    {/* Left sidebar: categories / folders */}
                    {sidebar.length > 0 && (
                        <div
                            className="flex flex-col overflow-y-scroll shrink-0 py-1"
                            style={{
                                width: 160,
                                borderRight: '1px solid var(--app-border)',
                                scrollbarWidth: 'thin',
                                scrollbarColor: 'var(--app-border) transparent',
                            }}
                        >
                            <CategoryBtn
                                label={`${t('common.all')} (${totalCount})`}
                                active={!query && categoryId === 'all'}
                                onClick={() => {
                                    setQuery('');
                                    setCategoryId('all');
                                }}
                            />
                            {sidebar.map((cat) => (
                                <Fragment key={cat.id}>
                                    {cat.heading && <SidebarHeading label={cat.heading} />}
                                    <CategoryBtn
                                        label={`${cat.label} (${cat.count})`}
                                        active={!query && categoryId === cat.id}
                                        onClick={() => {
                                            setQuery('');
                                            setCategoryId(cat.id);
                                        }}
                                    />
                                </Fragment>
                            ))}
                            {sourceKind === 'all' && iconifySets.length > 0 && (
                                <p
                                    className="px-3 pt-3 pb-2 text-[10px] leading-snug shrink-0"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    {t('iconPicker.iconifyNote')}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Right: icon grid */}
                    <div className="flex-1 overflow-y-auto min-h-0 p-2">
                        {entries.length === 0 ? (
                            <div className="h-full flex items-center justify-center">
                                <p className="text-xs text-center px-4" style={{ color: 'var(--text-secondary)' }}>
                                    {loading
                                        ? t('iconPicker.searching')
                                        : sourceKind === 'iconify' && collection?.failed
                                          ? t('iconPicker.setOffline')
                                          : t('iconPicker.none')}
                                </p>
                            </div>
                        ) : (
                            <>
                                <div className="flex flex-wrap gap-1">
                                    {visible.map((id) => (
                                        <IconItem
                                            key={id}
                                            id={id}
                                            title={titleOf(id)}
                                            selected={!!currentId && sameIcon(currentId, id)}
                                            onSelect={() => {
                                                onSelect(id);
                                                onClose();
                                            }}
                                        />
                                    ))}
                                </div>
                                {entries.length > visible.length && (
                                    <button
                                        onClick={() => setShown((n) => n + PAGE)}
                                        className="mt-2 w-full text-xs py-1.5 rounded-lg hover:opacity-80"
                                        style={{ ...selectStyle, color: 'var(--text-secondary)' }}
                                    >
                                        {t('iconPicker.more', { n: entries.length - visible.length })}
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Footer: count + selected name + remove */}
                <div className="h-px shrink-0" style={{ background: 'var(--app-border)' }} />
                <div className="flex items-center gap-2 px-3 py-2 shrink-0">
                    <span className="text-[11px] flex-1 min-w-0 truncate" style={{ color: 'var(--text-secondary)' }}>
                        {t('iconPicker.count', { n: entries.length })}
                        {onlineLoading ? ` · ${t('iconPicker.searchingOnline')}` : ''}
                        {currentLabel && (
                            <span className="ml-2 font-medium" style={{ color: 'var(--text-primary)' }}>
                                • {currentLabel}
                            </span>
                        )}
                    </span>
                    {currentId && (
                        <button
                            onClick={() => {
                                onSelect('');
                                onClose();
                            }}
                            className="text-[11px] px-2 py-1 rounded hover:opacity-70"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            {t('iconPicker.remove')}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );

    return createPortal(modal, portalTarget ?? document.body);
}
