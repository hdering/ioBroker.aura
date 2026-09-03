import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useSuperAdmin } from '../../hooks/useSuperAdmin';
import { Plus, Trash2, Check, Pencil, Layers, RotateCcw, Download, Upload, Search, X } from 'lucide-react';
import {
    usePopupConfigStore,
    viewCreatedAt,
    ALWAYS_SEEDED_VIEW_IDS,
    BUILTIN_VIEW_IDS,
    BUILTIN_VIEWS,
    DEFAULT_POPUP_TRANSPARENCY,
    MAX_POPUP_TRANSPARENCY,
    DEFAULT_BACKDROP_DIM,
    type PopupView,
    type PopupTrigger,
} from '../../store/popupConfigStore';
import { useDashboardStore } from '../../store/dashboardStore';
import { getObjectViewDirect, getStateDirect } from '../../hooks/useIoBroker';
import { NS } from '../../utils/namespace';
import { PopupBackgroundField } from '../../components/common/PopupBackgroundField';
import { ExportAnonymizeDialog } from '../../components/config/ExportAnonymizeDialog';
import { ClickActionEditor } from '../../components/config/ClickActionEditor';
import { ClauseRow, newClause } from '../../components/config/ConditionEditor';
import { ConfigModal } from '../../components/config/ConfigModal';
import { WIDGET_REGISTRY } from '../../widgetRegistry';
import { usePortalThemeVars } from '../../contexts/PortalTargetContext';
import { getAvailableLayouts } from '../../utils/widgetLayouts';
import { exportPopupView, importPopupView } from '../../utils/widgetExportImport';
import { builtinUsage, type UsageReason } from '../../utils/builtinPopupUsage';
import type { ClickAction, WidgetLayout } from '../../types';

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const labelStyle: React.CSSProperties = { color: 'var(--text-secondary)' };

// ── List sorting / filtering ──────────────────────────────────────────────────

type SortMode = 'alpha' | 'newest' | 'oldest';

const byLabel = (a: string, b: string) => a.localeCompare(b, 'de', { sensitivity: 'base' });

function ListToolbar({
    filter,
    onFilterChange,
    sort,
    onSortChange,
    placeholder,
}: {
    filter: string;
    onFilterChange: (v: string) => void;
    sort: SortMode;
    onSortChange: (v: SortMode) => void;
    placeholder: string;
}) {
    return (
        <div className="flex items-center gap-2 mb-2">
            <div className="relative flex-1 min-w-0">
                <Search
                    size={12}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'var(--text-secondary)' }}
                />
                <input
                    type="text"
                    value={filter}
                    onChange={(e) => onFilterChange(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') onFilterChange('');
                    }}
                    placeholder={placeholder}
                    className="w-full text-xs rounded-lg pl-7 pr-7 py-2 focus:outline-none"
                    style={inputStyle}
                />
                {filter && (
                    <button
                        onClick={() => onFilterChange('')}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 rounded hover:opacity-70 transition-opacity"
                        style={{ color: 'var(--text-secondary)' }}
                        title="Filter zurücksetzen"
                    >
                        <X size={11} />
                    </button>
                )}
            </div>
            <select
                value={sort}
                onChange={(e) => onSortChange(e.target.value as SortMode)}
                className="text-xs rounded-lg px-2 py-2 shrink-0 focus:outline-none"
                style={inputStyle}
                title="Sortierung"
            >
                <option value="alpha">Alphabetisch</option>
                <option value="newest">Neuste zuerst</option>
                <option value="oldest">Älteste zuerst</option>
            </select>
        </div>
    );
}

function NoMatches() {
    return (
        <div className="px-4 py-6 text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
            Keine Treffer für den Filter.
        </div>
    );
}

// ── Layout labels ─────────────────────────────────────────────────────────────

const LAYOUT_LABELS: Record<string, string> = {
    default: 'Standard',
    card: 'Karte',
    compact: 'Kompakt',
    minimal: 'Minimal',
    agenda: 'Agenda',
    flow: 'Flow',
    battery: 'Batterie',
    production: 'Produktion',
    consumption: 'Verbrauch',
    loadpoints: 'Ladepunkte',
    custom: 'Benutzerdef.',
    count: 'Anzahl',
};
const ALL_LAYOUTS = Object.keys(LAYOUT_LABELS) as WidgetLayout[];

// ── Layout multi-picker ───────────────────────────────────────────────────────

function LayoutPicker({
    value,
    onChange,
    available = ALL_LAYOUTS,
}: {
    value: WidgetLayout[];
    onChange: (v: WidgetLayout[]) => void;
    available?: WidgetLayout[];
}) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState({ top: 0, left: 0 });
    const btnRef = useRef<HTMLButtonElement>(null);
    const dropRef = useRef<HTMLDivElement>(null);
    const themeVars = usePortalThemeVars();

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (
                btnRef.current &&
                !btnRef.current.contains(e.target as Node) &&
                dropRef.current &&
                !dropRef.current.contains(e.target as Node)
            )
                setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const handleOpen = () => {
        if (btnRef.current) {
            const r = btnRef.current.getBoundingClientRect();
            setPos({ top: r.bottom + 4, left: r.left });
        }
        setOpen((o) => !o);
    };

    const toggle = (layout: WidgetLayout) => {
        onChange(value.includes(layout) ? value.filter((l) => l !== layout) : [...value, layout]);
    };

    const label = value.length === 0 ? 'Alle Layouts' : value.map((l) => LAYOUT_LABELS[l] ?? l).join(', ');

    return (
        <>
            <button
                ref={btnRef}
                onClick={handleOpen}
                className="w-full text-left text-xs rounded-lg px-2.5 py-2 focus:outline-none truncate"
                style={{
                    background: 'var(--app-bg)',
                    color: value.length ? 'var(--text-primary)' : 'var(--text-secondary)',
                    border: '1px solid var(--app-border)',
                    minWidth: 0,
                }}
                title={label}
            >
                {label}
            </button>
            {open &&
                createPortal(
                    <div
                        ref={dropRef}
                        className="fixed z-[9999] rounded-xl p-2 grid grid-cols-2 gap-1"
                        style={{
                            ...themeVars,
                            top: pos.top,
                            left: pos.left,
                            background: 'var(--app-surface)',
                            border: '1px solid var(--app-border)',
                            minWidth: 220,
                            boxShadow: '0 4px 16px rgba(0,0,0,.18)',
                        }}
                    >
                        <button
                            className="col-span-2 text-left text-[11px] px-2 py-1 rounded-lg hover:opacity-80 font-medium"
                            style={{
                                color: value.length === 0 ? 'var(--accent)' : 'var(--text-secondary)',
                                background:
                                    value.length === 0
                                        ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                                        : 'transparent',
                            }}
                            onClick={() => onChange([])}
                        >
                            Alle Layouts (kein Filter)
                        </button>
                        {available.map((l) => (
                            <button
                                key={l}
                                onClick={() => toggle(l)}
                                className="flex items-center gap-1.5 text-left text-[11px] px-2 py-1 rounded-lg hover:opacity-80"
                                style={{
                                    background: value.includes(l)
                                        ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                                        : 'transparent',
                                    color: value.includes(l) ? 'var(--accent)' : 'var(--text-primary)',
                                }}
                            >
                                <span
                                    className="w-3 h-3 rounded flex items-center justify-center shrink-0"
                                    style={{
                                        border: `1.5px solid ${value.includes(l) ? 'var(--accent)' : 'var(--app-border)'}`,
                                        background: value.includes(l) ? 'var(--accent)' : 'transparent',
                                    }}
                                >
                                    {value.includes(l) && <Check size={8} strokeWidth={3} style={{ color: '#fff' }} />}
                                </span>
                                {LAYOUT_LABELS[l]}
                            </button>
                        ))}
                    </div>,
                    document.body,
                )}
        </>
    );
}

// ── PopupView picker ──────────────────────────────────────────────────────────

function ViewSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const views = usePopupConfigStore((s) => s.views);
    const sorted = useMemo(() => [...views].sort((a, b) => byLabel(a.name, b.name)), [views]);
    return (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} style={inputStyle}>
            <option value="">— keine View —</option>
            {sorted.map((v) => (
                <option key={v.id} value={v.id}>
                    {v.name}
                </option>
            ))}
        </select>
    );
}

// ── Retired built-in cleanup ──────────────────────────────────────────────────

const USAGE_LABEL: Record<UsageReason, string> = {
    always: 'wird von Listenzeilen im Automatik-Modus geöffnet',
    edited: 'wurde angepasst',
    linked: 'ist als Klick-Aktion verlinkt',
    'type-default': 'ist Typ-Standard für vorhandene Widgets',
    'row-auto': 'kann über Listenzeilen im Automatik-Modus geöffnet werden',
};

/**
 * Offers to delete the shipped popup views this installation no longer needs.
 *
 * The views are not seeded into new installations any more, but nobody's working
 * setup gets torn out from under them — so the decision happens here, per
 * installation, with the usage scan spelling out why each keeper stays.
 */
function PruneBuiltinsDialog({ onClose }: { onClose: () => void }) {
    const pruneBuiltins = usePopupConfigStore((s) => s.pruneBuiltins);
    // Snapshot on mount: the list must not shift under the user while they read it.
    const [usage] = useState(() => builtinUsage());
    const removable = usage.filter((u) => !u.reason);
    const kept = usage.filter((u) => u.reason);

    const rowStyle: React.CSSProperties = {
        background: 'var(--app-bg)',
        border: '1px solid var(--app-border)',
    };

    return (
        <ConfigModal title="Nicht genutzte Standard-Views entfernen" maxWidth={620} padded onClose={onClose}>
            <div className="space-y-4">
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Die mitgelieferten Standard-Views werden nicht weiterentwickelt und in neue Installationen nicht
                    mehr eingerichtet. Entfernt wird nur, was hier nachweislich nirgends verwendet wird.
                </p>

                <div>
                    <p className="text-[11px] mb-1.5 font-medium" style={{ color: 'var(--text-primary)' }}>
                        Wird entfernt ({removable.length})
                    </p>
                    {removable.length === 0 ? (
                        <div
                            className="px-3 py-3 text-xs rounded-lg"
                            style={{ ...rowStyle, color: 'var(--text-secondary)' }}
                        >
                            Alle vorhandenen Standard-Views sind in Verwendung.
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {removable.map((u) => (
                                <div
                                    key={u.view.id}
                                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                                    style={rowStyle}
                                >
                                    <span className="flex-1 truncate" style={{ color: 'var(--text-primary)' }}>
                                        {u.view.name}
                                    </span>
                                    {u.types.length > 0 && (
                                        <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                            Typ-Standard: {u.types.join(', ')}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {kept.length > 0 && (
                    <div>
                        <p className="text-[11px] mb-1.5 font-medium" style={{ color: 'var(--text-primary)' }}>
                            Bleibt erhalten ({kept.length})
                        </p>
                        <div className="space-y-1">
                            {kept.map((u) => (
                                <div
                                    key={u.view.id}
                                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                                    style={rowStyle}
                                >
                                    <span className="flex-1 truncate" style={{ color: 'var(--text-primary)' }}>
                                        {u.view.name}
                                    </span>
                                    <span className="text-[10px] text-right" style={{ color: 'var(--text-secondary)' }}>
                                        {USAGE_LABEL[u.reason!]}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--app-border)',
                        }}
                    >
                        Abbrechen
                    </button>
                    <button
                        disabled={removable.length === 0}
                        onClick={() => {
                            pruneBuiltins(removable.map((u) => u.view.id));
                            onClose();
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 disabled:opacity-40 transition-opacity"
                        style={{ background: 'var(--accent-red, #ef4444)', color: '#fff' }}
                    >
                        {removable.length} entfernen
                    </button>
                </div>
            </div>
        </ConfigModal>
    );
}

// ── Popup-Views section ───────────────────────────────────────────────────────

function PopupViewsSection() {
    const navigate = useNavigate();
    const isSuperAdmin = useSuperAdmin();
    const {
        views,
        addView,
        addImportedView,
        removeView,
        updateViewName,
        copyView,
        restoreBuiltin,
        resetBuiltin,
        deletedBuiltinIds,
    } = usePopupConfigStore();

    const [newViewName, setNewViewName] = useState('');
    const [addingView, setAddingView] = useState(false);
    const [editingNameId, setEditingNameId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [exportTarget, setExportTarget] = useState<PopupView | null>(null);
    const [pruning, setPruning] = useState(false);
    const [filter, setFilter] = useState('');
    const [sort, setSort] = useState<SortMode>('alpha');
    const importInputRef = useRef<HTMLInputElement>(null);

    // Retired built-ins: only the ones that are still shipped everywhere stay
    // silent. Anything else means this installation was set up back when the
    // type-specific views were seeded — so it gets the cleanup offer.
    const retiredBuiltins = useMemo(
        () => views.filter((v) => BUILTIN_VIEW_IDS.has(v.id) && !ALWAYS_SEEDED_VIEW_IDS.has(v.id)),
        [views],
    );

    const query = filter.trim().toLowerCase();

    const visibleViews = useMemo(() => {
        const list = query ? views.filter((v) => v.name.toLowerCase().includes(query)) : [...views];
        if (sort === 'alpha') return list.sort((a, b) => byLabel(a.name, b.name));
        const dir = sort === 'newest' ? -1 : 1;
        return list.sort((a, b) => (viewCreatedAt(a) - viewCreatedAt(b)) * dir || byLabel(a.name, b.name));
    }, [views, query, sort]);

    const visibleDeletedBuiltins = useMemo(() => {
        const list = deletedBuiltinIds
            .map((id) => BUILTIN_VIEWS.find((v) => v.id === id))
            .filter((v): v is PopupView => !!v);
        return (query ? list.filter((v) => v.name.toLowerCase().includes(query)) : list).sort((a, b) =>
            byLabel(a.name, b.name),
        );
    }, [deletedBuiltinIds, query]);

    const handleAddView = () => {
        if (!newViewName.trim()) return;
        const id = addView(newViewName.trim());
        setNewViewName('');
        setAddingView(false);
        navigate(`/admin/popups/${id}`);
    };

    const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const obj = JSON.parse(ev.target?.result as string);
                const view = importPopupView(obj);
                if (!view) {
                    alert('Keine gültige Popup-View-JSON.');
                    return;
                }
                const id = addImportedView(view);
                navigate(`/admin/popups/${id}`);
            } catch (err) {
                alert(`Import fehlgeschlagen: ${(err as Error).message}`);
            }
        };
        reader.readAsText(file);
    };

    const commitName = (viewId: string) => {
        if (editingName.trim()) updateViewName(viewId, editingName.trim());
        setEditingNameId(null);
    };

    return (
        <section>
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Popup-Views
                </h2>
                {!addingView && (
                    <div className="flex items-center gap-2">
                        <input
                            ref={importInputRef}
                            type="file"
                            accept=".json,application/json"
                            onChange={handleImportFile}
                            className="hidden"
                        />
                        <button
                            onClick={() => importInputRef.current?.click()}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--app-border)',
                            }}
                            title="Popup-View aus JSON importieren"
                        >
                            <Upload size={13} /> Import
                        </button>
                        <button
                            onClick={() => {
                                setAddingView(true);
                                setNewViewName('');
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
                            style={{ background: 'var(--accent)', color: '#fff' }}
                        >
                            <Plus size={13} /> View hinzufügen
                        </button>
                    </div>
                )}
            </div>

            {retiredBuiltins.length > 0 && (
                <div
                    className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl"
                    style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
                >
                    <p className="text-[11px] flex-1" style={{ color: 'var(--text-secondary)' }}>
                        Die mitgelieferten Standard-Views werden nicht weiterentwickelt. Zum Anpassen kopieren.
                    </p>
                    <button
                        onClick={() => setPruning(true)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity shrink-0"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--app-border)',
                        }}
                    >
                        <Trash2 size={11} /> Ungenutzte entfernen
                    </button>
                </div>
            )}

            {pruning && <PruneBuiltinsDialog onClose={() => setPruning(false)} />}

            {views.length > 0 && (
                <ListToolbar
                    filter={filter}
                    onFilterChange={setFilter}
                    sort={sort}
                    onSortChange={setSort}
                    placeholder="Views filtern…"
                />
            )}

            <div className="space-y-2">
                {/* Add-view form */}
                {addingView && (
                    <div
                        className="flex items-center gap-2 px-4 py-3 rounded-xl"
                        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
                    >
                        <input
                            autoFocus
                            type="text"
                            value={newViewName}
                            onChange={(e) => setNewViewName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleAddView();
                                if (e.key === 'Escape') setAddingView(false);
                            }}
                            placeholder="View-Name"
                            className={inputCls}
                            style={inputStyle}
                        />
                        <button
                            onClick={handleAddView}
                            disabled={!newViewName.trim()}
                            className="flex items-center justify-center w-7 h-7 shrink-0 rounded-lg hover:opacity-80 disabled:opacity-40 transition-opacity"
                            style={{ background: 'var(--accent)', color: '#fff' }}
                        >
                            <Check size={13} />
                        </button>
                        <button
                            onClick={() => setAddingView(false)}
                            className="flex items-center justify-center w-7 h-7 shrink-0 rounded-lg hover:opacity-80 transition-opacity"
                            style={{
                                color: 'var(--text-secondary)',
                                background: 'var(--app-bg)',
                                border: '1px solid var(--app-border)',
                            }}
                        >
                            ✕
                        </button>
                    </div>
                )}

                {views.length === 0 && !addingView && (
                    <div
                        className="px-4 py-6 text-xs text-center rounded-xl"
                        style={{
                            color: 'var(--text-secondary)',
                            background: 'var(--app-surface)',
                            border: '1px solid var(--app-border)',
                        }}
                    >
                        Noch keine Popup-Views angelegt.
                    </div>
                )}

                {views.length > 0 && visibleViews.length === 0 && visibleDeletedBuiltins.length === 0 && (
                    <div
                        className="rounded-xl"
                        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
                    >
                        <NoMatches />
                    </div>
                )}

                {visibleViews.map((view) => {
                    const isBuiltin = BUILTIN_VIEW_IDS.has(view.id);
                    return (
                        <div
                            key={view.id}
                            className="flex items-center gap-2 px-4 py-3 rounded-xl"
                            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
                        >
                            {editingNameId === view.id ? (
                                <input
                                    autoFocus
                                    type="text"
                                    value={editingName}
                                    onChange={(e) => setEditingName(e.target.value)}
                                    onBlur={() => commitName(view.id)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') commitName(view.id);
                                        if (e.key === 'Escape') setEditingNameId(null);
                                    }}
                                    className="text-xs rounded-lg px-2 py-1 flex-1 focus:outline-none"
                                    style={{
                                        background: 'var(--app-bg)',
                                        color: 'var(--text-primary)',
                                        border: '1px solid var(--accent)',
                                    }}
                                />
                            ) : (
                                <span
                                    className="text-xs font-semibold flex-1 truncate"
                                    style={{ color: 'var(--text-primary)' }}
                                >
                                    {view.name}
                                </span>
                            )}

                            {isBuiltin && (
                                <span
                                    className="text-[9px] px-1.5 py-0.5 rounded shrink-0 font-medium"
                                    style={{
                                        background: 'var(--accent)22',
                                        color: 'var(--accent)',
                                        border: '1px solid var(--accent)44',
                                    }}
                                >
                                    Standard
                                </span>
                            )}

                            <span className="text-[10px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
                                {view.widgets.length} Widget{view.widgets.length !== 1 ? 's' : ''}
                            </span>

                            {isBuiltin ? (
                                <>
                                    {isSuperAdmin && (
                                        <>
                                            <button
                                                onClick={() => navigate(`/admin/popups/${view.id}`)}
                                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity shrink-0"
                                                style={{
                                                    background: 'var(--app-bg)',
                                                    border: '1px solid var(--app-border)',
                                                    color: 'var(--text-primary)',
                                                }}
                                                title="Standard-View bearbeiten"
                                            >
                                                <Layers size={11} /> Bearbeiten
                                            </button>
                                            <button
                                                onClick={() => {
                                                    if (
                                                        confirm(
                                                            `"${view.name}" auf Werkszustand zurücksetzen? Lokale Anpassungen gehen verloren.`,
                                                        )
                                                    )
                                                        resetBuiltin(view.id);
                                                }}
                                                className="flex items-center justify-center w-7 h-7 shrink-0 rounded-lg hover:opacity-80 transition-opacity"
                                                style={{
                                                    background: 'var(--app-bg)',
                                                    border: '1px solid var(--app-border)',
                                                    color: 'var(--text-secondary)',
                                                }}
                                                title="Werkszustand wiederherstellen"
                                            >
                                                <RotateCcw size={11} />
                                            </button>
                                        </>
                                    )}
                                    <button
                                        onClick={() => {
                                            const id = copyView(view.id);
                                            navigate(`/admin/popups/${id}`);
                                        }}
                                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity shrink-0"
                                        style={{
                                            background: 'var(--app-bg)',
                                            border: '1px solid var(--app-border)',
                                            color: 'var(--text-primary)',
                                        }}
                                        title="Als Kopie bearbeiten"
                                    >
                                        <Plus size={11} /> Kopieren
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        onClick={() => navigate(`/admin/popups/${view.id}`)}
                                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity shrink-0"
                                        style={{
                                            background: 'var(--app-bg)',
                                            border: '1px solid var(--app-border)',
                                            color: 'var(--text-primary)',
                                        }}
                                        title="View bearbeiten"
                                    >
                                        <Layers size={11} /> Bearbeiten
                                    </button>
                                    <button
                                        onClick={() => {
                                            setEditingNameId(view.id);
                                            setEditingName(view.name);
                                        }}
                                        className="flex items-center justify-center w-6 h-6 shrink-0 rounded hover:opacity-70 transition-opacity"
                                        style={{ color: 'var(--text-secondary)' }}
                                        title="Umbenennen"
                                    >
                                        <Pencil size={11} />
                                    </button>
                                </>
                            )}
                            <button
                                onClick={() => setExportTarget(view)}
                                className="flex items-center justify-center w-6 h-6 shrink-0 rounded hover:opacity-70 transition-opacity"
                                style={{ color: 'var(--text-secondary)' }}
                                title="Als JSON exportieren"
                            >
                                <Download size={11} />
                            </button>
                            {(!isBuiltin || isSuperAdmin) && (
                                <button
                                    onClick={() => removeView(view.id)}
                                    className="flex items-center justify-center w-6 h-6 shrink-0 rounded hover:opacity-70 transition-opacity"
                                    style={{ color: 'var(--accent-red, #ef4444)' }}
                                    title="View löschen"
                                >
                                    <Trash2 size={11} />
                                </button>
                            )}
                        </div>
                    );
                })}

                {exportTarget && (
                    <ExportAnonymizeDialog
                        onExport={(anon) => exportPopupView(exportTarget, anon)}
                        onClose={() => setExportTarget(null)}
                    />
                )}

                {/* Deleted builtins — only visible in super-admin mode */}
                {isSuperAdmin && visibleDeletedBuiltins.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                        <p className="text-[11px] px-1" style={{ color: 'var(--text-secondary)' }}>
                            Gelöschte Standard-Views
                        </p>
                        {visibleDeletedBuiltins.map((builtin) => {
                            const id = builtin.id;
                            return (
                                <div
                                    key={id}
                                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl opacity-60"
                                    style={{ background: 'var(--app-surface)', border: '1px dashed var(--app-border)' }}
                                >
                                    <span
                                        className="text-xs flex-1 truncate line-through"
                                        style={{ color: 'var(--text-secondary)' }}
                                    >
                                        {builtin.name}
                                    </span>
                                    <button
                                        onClick={() => restoreBuiltin(id)}
                                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity shrink-0 opacity-100"
                                        style={{
                                            background: 'var(--app-bg)',
                                            border: '1px solid var(--app-border)',
                                            color: 'var(--text-primary)',
                                        }}
                                        title="Wiederherstellen"
                                    >
                                        <RotateCcw size={11} /> Wiederherstellen
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </section>
    );
}

// ── Type defaults section ─────────────────────────────────────────────────────

function TypeDefaultsSection() {
    const { typeDefaults, typeDefaultLayouts, setTypeDefault, setTypeDefaultLayouts, removeTypeDefault } =
        usePopupConfigStore();
    const [adding, setAdding] = useState(false);
    const [newType, setNewType] = useState('');
    const [newViewId, setNewViewId] = useState('');
    const [filter, setFilter] = useState('');
    const [sort, setSort] = useState<SortMode>('alpha');

    const configuredTypes = Object.keys(typeDefaults);
    const availableTypes = useMemo(
        () => WIDGET_REGISTRY.filter((m) => !(m.type in typeDefaults)).sort((a, b) => byLabel(a.label, b.label)),
        [typeDefaults],
    );

    // Object key order is insertion order, so the index doubles as "age" for
    // the newest/oldest sort — no extra timestamp needed.
    const visibleTypes = useMemo(() => {
        const q = filter.trim().toLowerCase();
        const rows = configuredTypes.map((type, idx) => ({
            type,
            idx,
            label: WIDGET_REGISTRY.find((m) => m.type === type)?.label ?? type,
        }));
        const list = q
            ? rows.filter((r) => r.label.toLowerCase().includes(q) || r.type.toLowerCase().includes(q))
            : rows;
        if (sort === 'alpha') return list.sort((a, b) => byLabel(a.label, b.label));
        const dir = sort === 'newest' ? -1 : 1;
        return list.sort((a, b) => (a.idx - b.idx) * dir);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [typeDefaults, filter, sort]);

    const handleAdd = () => {
        if (!newType) return;
        setTypeDefault(newType, newViewId);
        setNewType('');
        setNewViewId('');
        setAdding(false);
    };

    return (
        <section>
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Widget-Typ-Standards
                </h2>
                {!adding && (
                    <button
                        onClick={() => {
                            setAdding(true);
                            setNewType(availableTypes[0]?.type ?? '');
                            setNewViewId('');
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
                        style={{ background: 'var(--accent)', color: '#fff' }}
                    >
                        <Plus size={13} /> Typ-Standard hinzufügen
                    </button>
                )}
            </div>

            {configuredTypes.length > 0 && (
                <ListToolbar
                    filter={filter}
                    onFilterChange={setFilter}
                    sort={sort}
                    onSortChange={setSort}
                    placeholder="Widget-Typen filtern…"
                />
            )}

            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
                <div
                    className="grid gap-3 px-4 py-2 text-[11px] font-medium"
                    style={{
                        gridTemplateColumns: '130px 1fr 1fr 28px',
                        background: 'var(--app-surface)',
                        borderBottom: '1px solid var(--app-border)',
                        color: 'var(--text-secondary)',
                    }}
                >
                    <span>Widget-Typ</span>
                    <span>Popup-View</span>
                    <span>Nur für Layouts</span>
                    <span />
                </div>

                {configuredTypes.length === 0 && !adding && (
                    <div className="px-4 py-6 text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
                        Noch keine Typ-Standards konfiguriert.
                    </div>
                )}

                {configuredTypes.length > 0 && visibleTypes.length === 0 && <NoMatches />}

                {visibleTypes.map(({ type: wType, label }) => {
                    return (
                        <div
                            key={wType}
                            className="grid items-center gap-3 px-4 py-2"
                            style={{
                                gridTemplateColumns: '130px 1fr 1fr 28px',
                                borderBottom: '1px solid var(--app-border)',
                                background: 'var(--app-bg)',
                            }}
                        >
                            <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                                {label}
                            </span>
                            <ViewSelect value={typeDefaults[wType]} onChange={(v) => setTypeDefault(wType, v)} />
                            <LayoutPicker
                                value={typeDefaultLayouts[wType] ?? []}
                                onChange={(v) => setTypeDefaultLayouts(wType, v)}
                                available={getAvailableLayouts(wType)}
                            />
                            <button
                                onClick={() => removeTypeDefault(wType)}
                                className="flex items-center justify-center w-7 h-7 rounded-lg hover:opacity-80 transition-opacity"
                                style={{
                                    color: 'var(--accent-red, #ef4444)',
                                    background: 'var(--app-bg)',
                                    border: '1px solid var(--app-border)',
                                }}
                            >
                                <Trash2 size={13} />
                            </button>
                        </div>
                    );
                })}

                {adding && (
                    <div
                        className="grid items-center gap-3 px-4 py-2"
                        style={{ gridTemplateColumns: '130px 1fr 1fr 28px', background: 'var(--app-bg)' }}
                    >
                        <select
                            value={newType}
                            onChange={(e) => setNewType(e.target.value)}
                            className={inputCls}
                            style={inputStyle}
                        >
                            <option value="">— Typ wählen —</option>
                            {availableTypes.map((m) => (
                                <option key={m.type} value={m.type}>
                                    {m.label}
                                </option>
                            ))}
                        </select>
                        <ViewSelect value={newViewId} onChange={setNewViewId} />
                        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            nach Speichern konfigurierbar
                        </span>
                        <button
                            onClick={handleAdd}
                            disabled={!newType}
                            className="flex items-center justify-center w-7 h-7 rounded-lg hover:opacity-80 disabled:opacity-40 transition-opacity"
                            style={{ background: 'var(--accent)', color: '#fff' }}
                        >
                            <Check size={13} />
                        </button>
                    </div>
                )}
            </div>
            <p className="text-[11px] mt-2" style={labelStyle}>
                Gilt für alle Widgets des jeweiligen Typs ohne individuelle Klick-Aktion.
            </p>
        </section>
    );
}

// ── Global settings section ───────────────────────────────────────────────────

/** Slider + live percent readout for one of the global appearance defaults. */
function PercentSlider({
    label,
    hint,
    value,
    max,
    onChange,
}: {
    label: string;
    hint: string;
    value: number;
    max: number;
    onChange: (v: number) => void;
}) {
    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <label className="text-[11px]" style={labelStyle}>
                    {label}
                </label>
                <span className="text-[11px] font-mono" style={{ color: 'var(--text-primary)' }}>
                    {value} %
                </span>
            </div>
            <input
                type="range"
                min={0}
                max={max}
                step={5}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-full"
                style={{ accentColor: 'var(--accent)' }}
            />
            <p className="text-[11px] mt-1" style={labelStyle}>
                {hint}
            </p>
        </div>
    );
}

function GlobalSettingsSection() {
    const globalAutoCloseSec = usePopupConfigStore((s) => s.globalAutoCloseSec);
    const setGlobalAutoCloseSec = usePopupConfigStore((s) => s.setGlobalAutoCloseSec);
    const globalPopupTransparency = usePopupConfigStore((s) => s.globalPopupTransparency);
    const setGlobalPopupTransparency = usePopupConfigStore((s) => s.setGlobalPopupTransparency);
    const globalBackdropDim = usePopupConfigStore((s) => s.globalBackdropDim);
    const setGlobalBackdropDim = usePopupConfigStore((s) => s.setGlobalBackdropDim);
    const globalPopupBackground = usePopupConfigStore((s) => s.globalPopupBackground);
    const setGlobalPopupBackground = usePopupConfigStore((s) => s.setGlobalPopupBackground);
    return (
        <section>
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                Globale Popup-Einstellungen
            </h2>
            <div
                className="rounded-xl px-4 py-3 grid grid-cols-1 sm:grid-cols-3 gap-4 items-start"
                style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
            >
                <div>
                    <label className="text-[11px] block mb-1" style={labelStyle}>
                        Auto-Schließen nach (Sek., 0/leer = aus)
                    </label>
                    <input
                        type="number"
                        min={0}
                        max={3600}
                        step={1}
                        value={globalAutoCloseSec ?? ''}
                        onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') return setGlobalAutoCloseSec(undefined);
                            const n = Number(raw);
                            setGlobalAutoCloseSec(Number.isFinite(n) && n >= 0 ? n : undefined);
                        }}
                        placeholder="aus"
                        className={inputCls}
                        style={{ ...inputStyle, maxWidth: 200 }}
                    />
                    <p className="text-[11px] mt-1" style={labelStyle}>
                        Automatisches Schließen für alle Popups.
                    </p>
                </div>
                <PercentSlider
                    label="Popup-Transparenz"
                    hint="0 % = deckend, höhere Werte lassen das Dashboard durchscheinen."
                    value={globalPopupTransparency ?? DEFAULT_POPUP_TRANSPARENCY}
                    max={MAX_POPUP_TRANSPARENCY}
                    onChange={setGlobalPopupTransparency}
                />
                <PercentSlider
                    label="Hintergrund abdunkeln"
                    hint="Abdunklung des Bereichs hinter dem Popup. 0 % = keine Abdunklung."
                    value={globalBackdropDim ?? DEFAULT_BACKDROP_DIM}
                    max={100}
                    onChange={setGlobalBackdropDim}
                />
                <PopupBackgroundField
                    label="Hintergrundfarbe"
                    hint="Fläche des Popups. Leer = Theme-Token --popup-bg, sonst die Oberflächenfarbe des Themes."
                    value={globalPopupBackground}
                    onChange={setGlobalPopupBackground}
                    inheritLabel="Theme"
                />
                <p className="text-[11px] sm:col-span-3" style={labelStyle}>
                    Standardwerte für alle Popups. Werden durch View- und Klick-Aktions-Einstellungen überschrieben.
                </p>
            </div>
        </section>
    );
}

// ── DP triggers section ───────────────────────────────────────────────────────

/** Known clients (id + display name) for the per-trigger scope filter. */
function useClientList(): { clientId: string; name: string }[] {
    const [clients, setClients] = useState<{ clientId: string; name: string }[]>([]);
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const result = await getObjectViewDirect('channel', `${NS}.clients.`, `${NS}.clients.香`);
            // Only direct client channels: aura.0.clients.<clientId> → exactly 4 dot-segments
            const rows = result.rows.filter((r) => r.id.split('.').length === 4);
            const data = await Promise.all(
                rows.map(async (row) => {
                    const cId = row.id.split('.')[3];
                    const nameState = await getStateDirect(`${row.id}.info.name`);
                    return { clientId: cId, name: nameState?.val ? String(nameState.val) : cId.slice(0, 8) };
                }),
            );
            if (!cancelled) setClients(data.sort((a, b) => byLabel(a.name, b.name)));
        })();
        return () => {
            cancelled = true;
        };
    }, []);
    return clients;
}

/** Short human label for a trigger's popup target, shown in the list row. */
function actionLabel(action: ClickAction | undefined): string {
    switch (action?.kind) {
        case 'popup-view':
            return 'Popup-View';
        case 'popup-image':
            return 'Bild';
        case 'popup-iframe':
            return 'Webseite';
        case 'popup-json':
            return 'JSON';
        case 'popup-html':
            return 'HTML';
        case 'popup-widget':
            return 'Widget-Inhalt';
        default:
            return 'kein Ziel';
    }
}

function TriggerEditModal({ trigger, onClose }: { trigger: PopupTrigger; onClose: () => void }) {
    const updateTrigger = usePopupConfigStore((s) => s.updateTrigger);
    const layouts = useDashboardStore((s) => s.layouts);
    const clients = useClientList();

    const patch = (p: Partial<PopupTrigger>) => updateTrigger(trigger.id, p);

    // A trigger can only open a popup — there is no click to navigate away from.
    // Rules stored before that restriction (or with the old 'none' placeholder)
    // are normalized on open so the mode dropdown shows a valid selection.
    const storedAction = trigger.host.options?.clickAction as ClickAction | undefined;
    useEffect(() => {
        if (storedAction?.kind.startsWith('popup-')) return;
        patch({
            host: {
                ...trigger.host,
                options: { ...trigger.host.options, clickAction: { kind: 'popup-view', viewId: '' } },
            },
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const tabsForLayout = (layouts.find((l) => l.id === trigger.layoutId)?.sections ?? []).flatMap((sec) =>
        sec.tabs.map((tab) => ({ tab, sectionName: sec.name })),
    );

    const toggleClient = (clientId: string) => {
        const cur = trigger.clientIds ?? [];
        patch({ clientIds: cur.includes(clientId) ? cur.filter((c) => c !== clientId) : [...cur, clientId] });
    };

    return (
        <ConfigModal title={`Trigger: ${trigger.name}`} maxWidth={720} padded onClose={onClose}>
            <div className="space-y-4">
                <div>
                    <label className="text-[11px] mb-1 block" style={labelStyle}>
                        Name
                    </label>
                    <input
                        type="text"
                        value={trigger.name}
                        onChange={(e) => patch({ name: e.target.value })}
                        className={inputCls}
                        style={inputStyle}
                    />
                </div>

                <div>
                    <label className="text-[11px] mb-1 block" style={labelStyle}>
                        Bedingung
                    </label>
                    <ClauseRow
                        clause={trigger.clause}
                        isFirst
                        logic="AND"
                        onLogicToggle={() => {}}
                        onChange={(clause) => patch({ clause })}
                        onDelete={() => patch({ clause: newClause() })}
                    />
                    <p className="text-[11px] mt-1.5" style={labelStyle}>
                        Das Popup öffnet bei der Flanke — also erst, wenn die Bedingung von {'„nicht erfüllt“'} auf{' '}
                        {'„erfüllt“'} wechselt. Steht der Datenpunkt beim Laden der Seite schon auf dem Trigger-Wert,
                        passiert nichts.
                    </p>
                </div>

                <div>
                    <label className="text-[11px] mb-1 block" style={labelStyle}>
                        Ziel
                    </label>
                    <div
                        className="rounded-xl px-3 py-3"
                        style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                    >
                        <ClickActionEditor config={trigger.host} onConfigChange={(host) => patch({ host })} popupOnly />
                    </div>
                    <p className="text-[11px] mt-1.5" style={labelStyle}>
                        Der Trigger-Datenpunkt ist im Popup als <span className="font-mono">{'{{dp}}'}</span> verfügbar
                        — eine Popup-View lässt sich so für mehrere Trigger wiederverwenden.
                    </p>
                </div>

                <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={trigger.resetDp}
                            onChange={(e) => patch({ resetDp: e.target.checked })}
                        />
                        <span style={{ color: 'var(--text-primary)' }}>
                            Datenpunkt nach dem Öffnen zurücksetzen (Tastermodus)
                        </span>
                    </label>
                    {trigger.resetDp && (
                        <div className="pl-6">
                            <input
                                type="text"
                                value={trigger.resetValue ?? ''}
                                onChange={(e) => patch({ resetValue: e.target.value })}
                                placeholder="false"
                                className={inputCls}
                                style={{ ...inputStyle, maxWidth: 200 }}
                            />
                            <p className="text-[11px] mt-1" style={labelStyle}>
                                Leer = <span className="font-mono">false</span>. Zahlen werden als Zahl geschrieben,
                                alles andere als Text.
                            </p>
                        </div>
                    )}
                    <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={!!trigger.closeOnFalse}
                            onChange={(e) => patch({ closeOnFalse: e.target.checked })}
                        />
                        <span style={{ color: 'var(--text-primary)' }}>
                            Popup schließen, wenn die Bedingung nicht mehr erfüllt ist
                        </span>
                    </label>
                    {trigger.closeOnFalse && trigger.resetDp && (
                        <p className="text-[11px] pl-6" style={{ color: 'var(--accent-red)' }}>
                            Zusammen mit dem Zurücksetzen schließt sich das Popup sofort wieder — nur eines von beiden
                            aktivieren.
                        </p>
                    )}
                </div>

                <div>
                    <label className="text-[11px] mb-1 block" style={labelStyle}>
                        Gültig auf Geräten (leer = alle)
                    </label>
                    {clients.length === 0 ? (
                        <p className="text-[11px]" style={labelStyle}>
                            Noch keine Geräte registriert.
                        </p>
                    ) : (
                        // Installations accumulate a lot of clients whose name is just the
                        // user-agent fallback, so the list is capped and scrolls, and every
                        // entry carries its short id to stay distinguishable.
                        <div
                            className="flex flex-wrap gap-1.5 overflow-y-auto rounded-lg p-1.5"
                            style={{ maxHeight: 110, border: '1px solid var(--app-border)' }}
                        >
                            {clients.map((c) => {
                                const on = !!trigger.clientIds?.includes(c.clientId);
                                return (
                                    <button
                                        key={c.clientId}
                                        onClick={() => toggleClient(c.clientId)}
                                        className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg hover:opacity-80"
                                        style={{
                                            background: on
                                                ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                                                : 'var(--app-bg)',
                                            color: on ? 'var(--accent)' : 'var(--text-primary)',
                                            border: `1px solid ${on ? 'var(--accent)44' : 'var(--app-border)'}`,
                                        }}
                                        title={c.clientId}
                                    >
                                        {on && <Check size={9} strokeWidth={3} />}
                                        {c.name}
                                        <span className="font-mono opacity-50">{c.clientId.slice(0, 6)}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="text-[11px] mb-1 block" style={labelStyle}>
                            Nur in Layout
                        </label>
                        <select
                            value={trigger.layoutId ?? ''}
                            onChange={(e) => patch({ layoutId: e.target.value || undefined, tabId: undefined })}
                            className={inputCls}
                            style={inputStyle}
                        >
                            <option value="">— alle Layouts —</option>
                            {layouts.map((l) => (
                                <option key={l.id} value={l.id}>
                                    {l.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-[11px] mb-1 block" style={labelStyle}>
                            Nur auf Tab
                        </label>
                        <select
                            value={trigger.tabId ?? ''}
                            onChange={(e) => patch({ tabId: e.target.value || undefined })}
                            disabled={!trigger.layoutId}
                            className={inputCls}
                            style={{ ...inputStyle, opacity: trigger.layoutId ? 1 : 0.5 }}
                        >
                            <option value="">— alle Tabs —</option>
                            {tabsForLayout.map(({ tab, sectionName }) => (
                                <option key={tab.id} value={tab.id}>
                                    {sectionName} › {tab.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>
        </ConfigModal>
    );
}

function PopupTriggersSection() {
    const triggers = usePopupConfigStore((s) => s.triggers);
    const addTrigger = usePopupConfigStore((s) => s.addTrigger);
    const updateTrigger = usePopupConfigStore((s) => s.updateTrigger);
    const removeTrigger = usePopupConfigStore((s) => s.removeTrigger);
    const copyTrigger = usePopupConfigStore((s) => s.copyTrigger);

    const [adding, setAdding] = useState(false);
    const [newName, setNewName] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);

    const list = triggers ?? [];
    const editing = list.find((t) => t.id === editingId) ?? null;

    const handleAdd = () => {
        if (!newName.trim()) return;
        const id = addTrigger(newName.trim());
        setNewName('');
        setAdding(false);
        setEditingId(id);
    };

    return (
        <section>
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Popup per Datenpunkt
                </h2>
                {!adding && (
                    <button
                        onClick={() => {
                            setAdding(true);
                            setNewName('');
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
                        style={{ background: 'var(--accent)', color: '#fff' }}
                    >
                        <Plus size={13} /> Trigger hinzufügen
                    </button>
                )}
            </div>

            <div className="space-y-2">
                {adding && (
                    <div
                        className="flex items-center gap-2 px-4 py-3 rounded-xl"
                        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
                    >
                        <input
                            autoFocus
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleAdd();
                                if (e.key === 'Escape') setAdding(false);
                            }}
                            placeholder="Trigger-Name"
                            className={inputCls}
                            style={inputStyle}
                        />
                        <button
                            onClick={handleAdd}
                            disabled={!newName.trim()}
                            className="flex items-center justify-center w-7 h-7 shrink-0 rounded-lg hover:opacity-80 disabled:opacity-40 transition-opacity"
                            style={{ background: 'var(--accent)', color: '#fff' }}
                        >
                            <Check size={13} />
                        </button>
                        <button
                            onClick={() => setAdding(false)}
                            className="flex items-center justify-center w-7 h-7 shrink-0 rounded-lg hover:opacity-80 transition-opacity"
                            style={{
                                color: 'var(--text-secondary)',
                                background: 'var(--app-bg)',
                                border: '1px solid var(--app-border)',
                            }}
                        >
                            <X size={13} />
                        </button>
                    </div>
                )}

                {list.length === 0 && !adding && (
                    <div
                        className="px-4 py-6 text-xs text-center rounded-xl"
                        style={{
                            color: 'var(--text-secondary)',
                            background: 'var(--app-surface)',
                            border: '1px solid var(--app-border)',
                        }}
                    >
                        Noch kein Trigger angelegt. Ein Trigger öffnet ein Popup, sobald ein beliebiger Datenpunkt seine
                        Bedingung erfüllt — ohne Klick auf ein Widget.
                    </div>
                )}

                {list.map((trigger) => (
                    <div
                        key={trigger.id}
                        className="flex items-center gap-2 px-4 py-3 rounded-xl"
                        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
                    >
                        <button
                            onClick={() => updateTrigger(trigger.id, { enabled: !trigger.enabled })}
                            className="relative w-8 h-4 rounded-full shrink-0 transition-colors"
                            style={{ background: trigger.enabled ? 'var(--accent)' : 'var(--app-border)' }}
                            title={trigger.enabled ? 'Aktiv — klicken zum Deaktivieren' : 'Inaktiv'}
                        >
                            <span
                                className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform shadow"
                                style={{ left: trigger.enabled ? 'calc(100% - 14px)' : '2px' }}
                            />
                        </button>

                        <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                                {trigger.name}
                            </div>
                            <div
                                className="text-[10px] font-mono truncate"
                                style={{ color: 'var(--text-secondary)' }}
                                title={trigger.clause.datapoint}
                            >
                                {trigger.clause.datapoint || '— kein Datenpunkt —'}
                            </div>
                        </div>

                        <span className="text-[10px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
                            {actionLabel(trigger.host.options?.clickAction as ClickAction | undefined)}
                        </span>
                        {trigger.resetDp && (
                            <span
                                className="text-[9px] px-1.5 py-0.5 rounded shrink-0 font-medium"
                                style={{
                                    background: 'var(--accent)22',
                                    color: 'var(--accent)',
                                    border: '1px solid var(--accent)44',
                                }}
                                title="Datenpunkt wird nach dem Öffnen zurückgesetzt"
                            >
                                Reset
                            </span>
                        )}

                        <button
                            onClick={() => setEditingId(trigger.id)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity shrink-0"
                            style={{
                                background: 'var(--app-bg)',
                                border: '1px solid var(--app-border)',
                                color: 'var(--text-primary)',
                            }}
                        >
                            <Pencil size={11} /> Bearbeiten
                        </button>
                        <button
                            onClick={() => setEditingId(copyTrigger(trigger.id))}
                            className="flex items-center justify-center w-7 h-7 shrink-0 rounded-lg hover:opacity-80 transition-opacity"
                            style={{
                                background: 'var(--app-bg)',
                                border: '1px solid var(--app-border)',
                                color: 'var(--text-secondary)',
                            }}
                            title="Kopieren"
                        >
                            <Plus size={11} />
                        </button>
                        <button
                            onClick={() => {
                                if (confirm(`Trigger "${trigger.name}" löschen?`)) removeTrigger(trigger.id);
                            }}
                            className="flex items-center justify-center w-7 h-7 shrink-0 rounded-lg hover:opacity-80 transition-opacity"
                            style={{
                                background: 'var(--app-bg)',
                                border: '1px solid var(--app-border)',
                                color: 'var(--accent-red)',
                            }}
                            title="Löschen"
                        >
                            <Trash2 size={11} />
                        </button>
                    </div>
                ))}
            </div>

            <p className="text-[11px] mt-2" style={labelStyle}>
                Zusätzlich kann ein Skript ein Popup direkt anstoßen: <span className="font-mono">{NS}.popup.open</span>{' '}
                (alle Geräte) oder{' '}
                <span className="font-mono">
                    {NS}.clients.{'<clientId>'}.popup.open
                </span>{' '}
                — Wert ist der Name oder die ID einer Popup-View.
            </p>

            {editing && <TriggerEditModal trigger={editing} onClose={() => setEditingId(null)} />}
        </section>
    );
}

// ── AdminPopups ───────────────────────────────────────────────────────────────

export function AdminPopups() {
    return (
        <div className="px-6 py-8 space-y-8">
            <div>
                <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    Popups
                </h1>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                    Eigene Popup-Views erstellen und als Standard für Widget-Typen zuweisen
                </p>
            </div>
            <GlobalSettingsSection />
            <PopupTriggersSection />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 items-start">
                <PopupViewsSection />
                <TypeDefaultsSection />
            </div>
        </div>
    );
}
