import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, Search, X, Check, Folder, File as FileIcon, ChevronRight } from 'lucide-react';
import { useDatapointList, type DatapointEntry } from '../../hooks/useDatapointList';
import { useFsRoots, useFsList } from '../../hooks/useFsList';
import { useT } from '../../i18n';
import { isRelevantDp } from '../../utils/dpRelevance';
import { usePortalThemeVars } from '../../contexts/PortalTargetContext';
import { getSocket } from '../../hooks/useIoBroker';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PickerResult =
    | { kind: 'dp'; id: string; unit?: string; name?: string; role?: string; dpType?: string }
    | { kind: 'file'; path: string; mime?: string; size?: number; url: string };

interface DatapointPickerProps {
    currentValue: string;
    /** Legacy callback for DP-only consumers — still supported */
    onSelect?: (id: string, unit?: string, name?: string, role?: string, dpType?: string) => void;
    /** New unified callback that receives either a dp or file result */
    onPickResult?: (r: PickerResult) => void;
    onClose: () => void;
    multiSelect?: boolean;
    onMultiSelect?: (picks: DatapointEntry[]) => void;
    allowedTypes?: string[];
    /** Which modes to offer: ['dp'] = DP only (default), ['files'] = files only, ['dp','files'] = both */
    modes?: ('dp' | 'files')[];
    defaultMode?: 'dp' | 'files';
    /** Mime whitelist for file mode, e.g. ['image/*'] */
    acceptMime?: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function formatValue(val: unknown): string {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    if (typeof val === 'number') {
        if (!Number.isFinite(val)) return String(val);
        return val % 1 !== 0 ? val.toFixed(2).replace(/\.?0+$/, '') : String(val);
    }
    if (typeof val === 'string') return val.length > 15 ? `${val.slice(0, 15)}…` : val;
    return String(val);
}

// ── DP Mode body ──────────────────────────────────────────────────────────────

const MAX_DISPLAY = 250;

function DpModeBody({
    currentValue,
    onSelect,
    onClose,
    allowedTypes,
    multiSelect,
    onMultiSelect,
    loading,
    loaded,
    datapoints,
}: {
    currentValue: string;
    onSelect: (id: string, unit?: string, name?: string, role?: string, dpType?: string) => void;
    onClose: () => void;
    allowedTypes?: string[];
    multiSelect?: boolean;
    onMultiSelect?: (picks: DatapointEntry[]) => void;
    loading: boolean;
    loaded: boolean;
    datapoints: DatapointEntry[];
}) {
    const t = useT();
    const [search, setSearch] = useState(() => currentValue ?? '');
    const [adapter, setAdapter] = useState('');
    const [room, setRoom] = useState('');
    const [func, setFunc] = useState('');
    const [role, setRole] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [unitFilter, setUnitFilter] = useState('');
    const [historyFilter, setHistoryFilter] = useState(false);
    const [showInactive, setShowInactive] = useState(false);
    const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
    const [values, setValues] = useState<Map<string, unknown>>(new Map());
    const fetchedIds = useRef<Set<string>>(new Set());

    // States of disabled/uninstalled adapters (and orphaned/manually imported states
    // with no matching instance) are hidden by default. The toggle reveals them so a
    // freshly imported DP whose adapter isn't running yet can still be picked.
    const hasInactive = useMemo(() => datapoints.some((dp) => dp.active === false), [datapoints]);
    const base = useMemo(
        () => (showInactive ? datapoints : datapoints.filter((dp) => dp.active !== false)),
        [datapoints, showInactive],
    );

    const adapters = useMemo(() => Array.from(new Set(base.map((dp) => dp.id.split('.')[0]))).sort(), [base]);
    const rooms = useMemo(() => Array.from(new Set(base.flatMap((dp) => dp.rooms))).sort(), [base]);
    const funcs = useMemo(() => Array.from(new Set(base.flatMap((dp) => dp.funcs))).sort(), [base]);
    const roles = useMemo(
        () => Array.from(new Set(base.map((dp) => dp.role).filter(Boolean) as string[])).sort(),
        [base],
    );
    const types = useMemo(() => {
        const all = Array.from(new Set(base.map((dp) => dp.type).filter(Boolean) as string[])).sort();
        return allowedTypes?.length ? all.filter((ty) => allowedTypes.includes(ty)) : all;
    }, [base, allowedTypes]);
    const units = useMemo(
        () => Array.from(new Set(base.map((dp) => dp.unit).filter(Boolean) as string[])).sort(),
        [base],
    );
    const hasHistory = useMemo(() => base.some((dp) => dp.logging.length > 0), [base]);

    const filtered = useMemo(() => {
        let list = base;
        if (allowedTypes?.length) list = list.filter((dp) => dp.type != null && allowedTypes.includes(dp.type));
        if (adapter) list = list.filter((dp) => dp.id.startsWith(`${adapter}.`));
        if (room) list = list.filter((dp) => dp.rooms.includes(room));
        if (func) list = list.filter((dp) => dp.funcs.includes(func));
        if (role) list = list.filter((dp) => dp.role === role);
        if (typeFilter) list = list.filter((dp) => dp.type === typeFilter);
        if (unitFilter) list = list.filter((dp) => dp.unit === unitFilter);
        if (historyFilter) list = list.filter((dp) => dp.logging.length > 0);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter((dp) => dp.id.toLowerCase().includes(q) || dp.name.toLowerCase().includes(q));
        }
        return list;
    }, [base, search, adapter, room, func, role, typeFilter, unitFilter, historyFilter, allowedTypes]);

    const shown = useMemo(() => filtered.slice(0, MAX_DISPLAY), [filtered]);

    const countLabel =
        filtered.length > MAX_DISPLAY
            ? t('dp.picker.showing', { max: MAX_DISPLAY, count: filtered.length })
            : t('dp.picker.count', { count: filtered.length });

    const toggleCheck = (dp: DatapointEntry) => {
        setCheckedIds((prev) => {
            const next = new Set(prev);
            next.has(dp.id) ? next.delete(dp.id) : next.add(dp.id);
            return next;
        });
    };
    const selectAllShown = () =>
        setCheckedIds((prev) => {
            const next = new Set(prev);
            shown.forEach((dp) => next.add(dp.id));
            return next;
        });
    const selectRelevantShown = () =>
        setCheckedIds((prev) => {
            const next = new Set(prev);
            shown.filter((dp) => isRelevantDp(dp.role, dp.type)).forEach((dp) => next.add(dp.id));
            return next;
        });
    const clearAll = () => setCheckedIds(new Set());
    const confirmMulti = () => {
        onMultiSelect?.(datapoints.filter((dp) => checkedIds.has(dp.id)));
    };

    useEffect(() => {
        if (!loaded) return;
        const idsToFetch = shown.map((dp) => dp.id).filter((id) => !fetchedIds.current.has(id));
        if (idsToFetch.length === 0) return;
        const pending: [string, unknown][] = [];
        let flushTimer: ReturnType<typeof setTimeout> | null = null;
        const flush = () => {
            const batch = pending.splice(0);
            if (batch.length)
                setValues((prev) => {
                    const next = new Map(prev);
                    batch.forEach(([id, v]) => next.set(id, v));
                    return next;
                });
            flushTimer = null;
        };
        for (const id of idsToFetch) {
            fetchedIds.current.add(id);
            getSocket().emit('getState', id, (_err: unknown, state: { val?: unknown } | null) => {
                pending.push([id, state?.val ?? null]);
                if (flushTimer) clearTimeout(flushTimer);
                flushTimer = setTimeout(flush, 60);
            });
        }
        return () => {
            if (flushTimer) clearTimeout(flushTimer);
        };
    }, [shown, loaded]);

    const showFilters =
        adapters.length > 0 ||
        rooms.length > 0 ||
        funcs.length > 0 ||
        roles.length > 0 ||
        types.length > 1 ||
        allowedTypes?.length === 1 ||
        units.length > 1 ||
        hasHistory ||
        hasInactive;

    return (
        <div className="flex flex-col flex-1 min-h-0">
            {/* Filter bar */}
            <div className="px-5 py-3 shrink-0 space-y-2" style={{ borderBottom: '1px solid var(--app-border)' }}>
                <div
                    className="flex items-center gap-2 rounded-lg px-3 py-2"
                    style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                >
                    <Search size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                    <input
                        autoFocus
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('dp.picker.search')}
                        className="flex-1 min-w-0 text-sm bg-transparent focus:outline-none"
                        style={{ color: 'var(--text-primary)' }}
                    />
                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            className="hover:opacity-60"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>
                {showFilters && (
                    <div className="flex items-center gap-2 flex-wrap">
                        {adapters.length > 0 && (
                            <select
                                value={adapter}
                                onChange={(e) => setAdapter(e.target.value)}
                                className="rounded-lg px-3 py-1.5 text-xs focus:outline-none shrink-0"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--app-border)',
                                }}
                            >
                                <option value="">{t('dp.picker.allAdapters')}</option>
                                {adapters.map((a) => (
                                    <option key={a} value={a}>
                                        {a}
                                    </option>
                                ))}
                            </select>
                        )}
                        {rooms.length > 0 && (
                            <select
                                value={room}
                                onChange={(e) => setRoom(e.target.value)}
                                className="rounded-lg px-3 py-1.5 text-xs focus:outline-none shrink-0"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--app-border)',
                                }}
                            >
                                <option value="">{t('dp.picker.allRooms')}</option>
                                {rooms.map((r) => (
                                    <option key={r} value={r}>
                                        {r}
                                    </option>
                                ))}
                            </select>
                        )}
                        {funcs.length > 0 && (
                            <select
                                value={func}
                                onChange={(e) => setFunc(e.target.value)}
                                className="rounded-lg px-3 py-1.5 text-xs focus:outline-none shrink-0"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--app-border)',
                                }}
                            >
                                <option value="">{t('dp.picker.allFuncs')}</option>
                                {funcs.map((f) => (
                                    <option key={f} value={f}>
                                        {f}
                                    </option>
                                ))}
                            </select>
                        )}
                        {roles.length > 0 && (
                            <select
                                value={role}
                                onChange={(e) => setRole(e.target.value)}
                                className="rounded-lg px-3 py-1.5 text-xs focus:outline-none shrink-0"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--app-border)',
                                }}
                            >
                                <option value="">{t('dp.picker.allRoles')}</option>
                                {roles.map((r) => (
                                    <option key={r} value={r}>
                                        {r}
                                    </option>
                                ))}
                            </select>
                        )}
                        {types.length > 1 && (
                            <select
                                value={typeFilter}
                                onChange={(e) => setTypeFilter(e.target.value)}
                                className="rounded-lg px-3 py-1.5 text-xs focus:outline-none shrink-0"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--app-border)',
                                }}
                            >
                                <option value="">{t('dp.picker.allTypes')}</option>
                                {types.map((ty) => {
                                    const tc =
                                        ty === 'boolean'
                                            ? '#f59e0b'
                                            : ty === 'number'
                                              ? '#3b82f6'
                                              : ty === 'string'
                                                ? '#8b5cf6'
                                                : 'var(--text-primary)';
                                    return (
                                        <option key={ty} value={ty} style={{ color: tc }}>
                                            {ty}
                                        </option>
                                    );
                                })}
                            </select>
                        )}
                        {units.length > 1 && (
                            <select
                                value={unitFilter}
                                onChange={(e) => setUnitFilter(e.target.value)}
                                className="rounded-lg px-3 py-1.5 text-xs focus:outline-none shrink-0"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--app-border)',
                                }}
                            >
                                <option value="">{t('dp.picker.allUnits')}</option>
                                {units.map((u) => (
                                    <option key={u} value={u}>
                                        {u}
                                    </option>
                                ))}
                            </select>
                        )}
                        {hasHistory && (
                            <button
                                onClick={() => setHistoryFilter((v) => !v)}
                                className="rounded-lg px-3 py-1.5 text-xs shrink-0 transition-colors"
                                style={{
                                    background: historyFilter ? '#10b98122' : 'var(--app-bg)',
                                    color: historyFilter ? '#10b981' : 'var(--text-secondary)',
                                    border: `1px solid ${historyFilter ? '#10b981' : 'var(--app-border)'}`,
                                }}
                            >
                                {t('dp.picker.historyOnly')}
                            </button>
                        )}
                        {hasInactive && (
                            <button
                                onClick={() => setShowInactive((v) => !v)}
                                title={t('dp.picker.showInactiveHint')}
                                className="rounded-lg px-3 py-1.5 text-xs shrink-0 transition-colors"
                                style={{
                                    background: showInactive ? '#f59e0b22' : 'var(--app-bg)',
                                    color: showInactive ? '#f59e0b' : 'var(--text-secondary)',
                                    border: `1px solid ${showInactive ? '#f59e0b' : 'var(--app-border)'}`,
                                }}
                            >
                                {t('dp.picker.showInactive')}
                            </button>
                        )}
                        {allowedTypes?.length === 1 &&
                            (() => {
                                const ty = allowedTypes[0];
                                const tc =
                                    ty === 'boolean'
                                        ? '#f59e0b'
                                        : ty === 'number'
                                          ? '#3b82f6'
                                          : ty === 'string'
                                            ? '#8b5cf6'
                                            : 'var(--accent)';
                                return (
                                    <span
                                        className="text-[10px] px-2 py-1 rounded font-medium shrink-0"
                                        style={{ background: `${tc}22`, color: tc }}
                                    >
                                        {t('dp.picker.typeHint', { type: ty })}
                                    </span>
                                );
                            })()}
                    </div>
                )}
            </div>

            {/* Count + multi-select controls */}
            {loaded && (
                <div
                    className="px-5 py-1.5 shrink-0 flex items-center gap-3"
                    style={{ borderBottom: '1px solid var(--app-border)' }}
                >
                    <p className="text-[11px] flex-1" style={{ color: 'var(--text-secondary)' }}>
                        {countLabel}
                        {multiSelect && checkedIds.size > 0 && (
                            <span className="ml-2 font-medium" style={{ color: 'var(--accent)' }}>
                                · {checkedIds.size} ausgewählt
                            </span>
                        )}
                    </p>
                    {multiSelect && (
                        <div className="flex gap-2">
                            <button
                                onClick={selectRelevantShown}
                                className="text-[10px] hover:opacity-70 px-2 py-0.5 rounded"
                                style={{
                                    background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                                    color: 'var(--accent)',
                                }}
                            >
                                Relevante
                            </button>
                            <button
                                onClick={selectAllShown}
                                className="text-[10px] hover:opacity-70"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                Alle
                            </button>
                            <button
                                onClick={clearAll}
                                className="text-[10px] hover:opacity-70"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                Keine
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Column headers */}
            {loaded && shown.length > 0 && (
                <div
                    className="px-5 flex items-center shrink-0 text-[10px] font-semibold uppercase tracking-wide"
                    style={{
                        borderBottom: '1px solid var(--app-border)',
                        color: 'var(--text-secondary)',
                        paddingTop: 6,
                        paddingBottom: 6,
                    }}
                >
                    {multiSelect && <div style={{ width: 26, flexShrink: 0 }} />}
                    <div className="flex-1 min-w-0 pr-2">{t('dp.picker.col.name')}</div>
                    <div style={{ width: 88, flexShrink: 0, textAlign: 'right', paddingRight: 8 }}>
                        {t('dp.picker.col.value')}
                    </div>
                    <div style={{ width: 56, flexShrink: 0, textAlign: 'right', paddingRight: 8 }}>
                        {t('dp.picker.col.unit')}
                    </div>
                    <div style={{ width: 68, flexShrink: 0, textAlign: 'center' }}>{t('dp.picker.col.type')}</div>
                    <div style={{ width: 44, flexShrink: 0, textAlign: 'center' }}>{t('dp.picker.col.history')}</div>
                </div>
            )}

            {/* List */}
            <div className="aura-scroll flex-1 overflow-y-auto">
                {!loaded && loading ? (
                    <div className="flex items-center justify-center py-16 gap-3">
                        <div
                            className="w-5 h-5 border-2 rounded-full animate-spin"
                            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
                        />
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            {t('dp.picker.loading')}
                        </p>
                    </div>
                ) : shown.length === 0 ? (
                    <div className="flex items-center justify-center py-12">
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            {t('dp.picker.noResults')}
                        </p>
                    </div>
                ) : (
                    shown.map((dp) => {
                        const isSelected = dp.id === currentValue;
                        const isChecked = checkedIds.has(dp.id);
                        const relevant = isRelevantDp(dp.role, dp.type);
                        const hasVal = values.has(dp.id);
                        const val = values.get(dp.id);
                        const tc =
                            dp.type === 'boolean'
                                ? '#f59e0b'
                                : dp.type === 'number'
                                  ? '#3b82f6'
                                  : dp.type === 'string'
                                    ? '#8b5cf6'
                                    : 'var(--accent)';
                        const valColor =
                            typeof val === 'boolean'
                                ? val
                                    ? '#10b981'
                                    : '#f59e0b'
                                : typeof val === 'number'
                                  ? '#3b82f6'
                                  : typeof val === 'string'
                                    ? '#8b5cf6'
                                    : 'var(--text-secondary)';
                        return (
                            <button
                                key={dp.id}
                                onClick={() =>
                                    multiSelect ? toggleCheck(dp) : onSelect(dp.id, dp.unit, dp.name, dp.role, dp.type)
                                }
                                className="w-full text-left px-5 py-2 flex items-center hover:opacity-80 transition-opacity"
                                style={{
                                    background: (multiSelect ? isChecked : isSelected)
                                        ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                                        : 'transparent',
                                    borderBottom: '1px solid var(--app-border)',
                                    opacity: multiSelect && !relevant ? 0.55 : 1,
                                }}
                            >
                                {multiSelect && (
                                    <div
                                        className="rounded shrink-0 flex items-center justify-center mr-3"
                                        style={{
                                            width: 14,
                                            height: 14,
                                            background: isChecked ? 'var(--accent)' : 'var(--app-border)',
                                        }}
                                    >
                                        {isChecked && <Check size={9} color="#fff" />}
                                    </div>
                                )}
                                {/* Name + ID */}
                                <div className="flex-1 min-w-0 pr-2">
                                    <p
                                        className="text-sm font-medium truncate"
                                        style={{
                                            color: (multiSelect ? isChecked : isSelected)
                                                ? 'var(--accent)'
                                                : 'var(--text-primary)',
                                        }}
                                    >
                                        {dp.name || dp.id.split('.').pop() || dp.id}
                                    </p>
                                    <p
                                        className="font-mono text-[11px] truncate mt-0.5"
                                        style={{ color: 'var(--text-secondary)' }}
                                    >
                                        {dp.id}
                                    </p>
                                </div>
                                {/* Value */}
                                <div style={{ width: 88, flexShrink: 0, textAlign: 'right', paddingRight: 8 }}>
                                    <span
                                        className="text-xs font-mono"
                                        style={{ color: hasVal ? valColor : 'var(--app-border)' }}
                                    >
                                        {hasVal ? formatValue(val) : '·'}
                                    </span>
                                </div>
                                {/* Unit */}
                                <div style={{ width: 56, flexShrink: 0, textAlign: 'right', paddingRight: 8 }}>
                                    {dp.unit && (
                                        <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>
                                            {dp.unit}
                                        </span>
                                    )}
                                </div>
                                {/* Type */}
                                <div style={{ width: 68, flexShrink: 0, textAlign: 'center' }}>
                                    {dp.type && (
                                        <span
                                            className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                                            style={{ background: `${tc}22`, color: tc }}
                                        >
                                            {dp.type}
                                        </span>
                                    )}
                                </div>
                                {/* History */}
                                <div
                                    style={{
                                        width: 44,
                                        flexShrink: 0,
                                        display: 'flex',
                                        justifyContent: 'center',
                                        gap: 2,
                                    }}
                                >
                                    {dp.logging.length > 0 ? (
                                        dp.logging.map((adapterId) => {
                                            const adapterName = adapterId.replace(/\.\d+$/, '');
                                            const label =
                                                adapterName === 'history'
                                                    ? 'H'
                                                    : adapterName === 'influxdb'
                                                      ? 'flux'
                                                      : adapterName === 'sql'
                                                        ? 'SQL'
                                                        : adapterName.slice(0, 4);
                                            return (
                                                <span
                                                    key={adapterId}
                                                    title={adapterId}
                                                    className="text-[9px] px-1 py-0.5 rounded font-bold"
                                                    style={{ background: '#10b98122', color: '#10b981' }}
                                                >
                                                    {label}
                                                </span>
                                            );
                                        })
                                    ) : (
                                        <span className="text-[10px]" style={{ color: 'var(--app-border)' }}>
                                            –
                                        </span>
                                    )}
                                </div>
                            </button>
                        );
                    })
                )}
            </div>

            {/* Multi-select confirm footer */}
            {multiSelect && (
                <div
                    className="px-5 py-3 shrink-0 flex gap-2 justify-end"
                    style={{ borderTop: '1px solid var(--app-border)' }}
                >
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm rounded-lg hover:opacity-80"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--app-border)',
                        }}
                    >
                        Abbrechen
                    </button>
                    <button
                        onClick={confirmMulti}
                        disabled={checkedIds.size === 0}
                        className="px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-80 disabled:opacity-30 flex items-center gap-1.5"
                        style={{ background: 'var(--accent-green, #22c55e)' }}
                    >
                        <Check size={14} /> {checkedIds.size} hinzufügen
                    </button>
                </div>
            )}
        </div>
    );
}

// ── File mode body ────────────────────────────────────────────────────────────

function FileModeBody({
    onSelect,
    acceptMime,
    pickerWidth,
}: {
    onSelect: (r: PickerResult) => void;
    acceptMime?: string[];
    pickerWidth: number;
}) {
    const t = useT();
    const { roots, loading: rootsLoading } = useFsRoots();
    const [currentPath, setCurrentPath] = useState<string | null>(null);
    const [previewEntry, setPreviewEntry] = useState<{ path: string; mime: string | null } | null>(null);
    const [search, setSearch] = useState('');

    const { listing, loading: listLoading, refresh } = useFsList(currentPath);
    const showPreview = pickerWidth >= 720;

    const filteredEntries = useMemo(() => {
        if (!listing) return [];
        let entries = listing.entries;
        if (search.trim()) {
            const q = search.toLowerCase();
            entries = entries.filter((e) => e.name.toLowerCase().includes(q));
        }
        if (acceptMime?.length) {
            entries = entries.filter((e) => {
                if (e.isDir) return true;
                if (!e.mime) return false;
                return acceptMime.some((pattern) => {
                    if (pattern.endsWith('/*')) return e.mime!.startsWith(`${pattern.slice(0, -2)}/`);
                    return e.mime === pattern;
                });
            });
        }
        return entries;
    }, [listing, search, acceptMime]);

    const breadcrumbs = useMemo(() => {
        if (!currentPath || roots.length === 0) return [];
        const root = roots.find((r) => currentPath === r.path || currentPath.startsWith(`${r.path}/`));
        if (!root) return [];
        const relative = currentPath.slice(root.path.length).replace(/^\//, '');
        const parts = relative ? relative.split('/') : [];
        const crumbs: { label: string; path: string }[] = [{ label: root.label, path: root.path }];
        let p = root.path;
        for (const part of parts) {
            p = `${p}/${part}`;
            crumbs.push({ label: part, path: p });
        }
        return crumbs;
    }, [currentPath, roots]);

    const handleFileSelect = (entryPath: string, mime: string | null, size: number | null) => {
        const url = `/fs/read?path=${encodeURIComponent(entryPath)}`;
        if (showPreview) {
            setPreviewEntry({ path: entryPath, mime });
        } else {
            onSelect({ kind: 'file', path: entryPath, url, mime: mime ?? undefined, size: size ?? undefined });
        }
    };

    const handleConfirmPreview = () => {
        if (!previewEntry) return;
        const url = `/fs/read?path=${encodeURIComponent(previewEntry.path)}`;
        const entryName = previewEntry.path.split('/').pop() ?? '';
        const entry = listing?.entries.find((e) => e.name === entryName);
        onSelect({
            kind: 'file',
            path: previewEntry.path,
            url,
            mime: previewEntry.mime ?? undefined,
            size: entry?.size ?? undefined,
        });
    };

    const navigateTo = (p: string | null) => {
        setCurrentPath(p);
        setPreviewEntry(null);
        setSearch('');
    };

    // Root selection screen
    if (!currentPath) {
        return (
            <div className="flex flex-col flex-1 min-h-0">
                <div className="aura-scroll flex-1 overflow-y-auto">
                    {rootsLoading ? (
                        <div className="flex items-center justify-center py-16 gap-3">
                            <div
                                className="w-5 h-5 border-2 rounded-full animate-spin"
                                style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
                            />
                        </div>
                    ) : roots.length === 0 ? (
                        <div className="flex items-center justify-center py-12">
                            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                {t('fs.picker.noRoots')}
                            </p>
                        </div>
                    ) : (
                        roots.map((r) => (
                            <button
                                key={r.path}
                                onClick={() => navigateTo(r.path)}
                                className="w-full text-left px-5 py-3.5 flex items-center gap-3 hover:opacity-80 transition-opacity"
                                style={{ borderBottom: '1px solid var(--app-border)' }}
                            >
                                <Folder size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                                        {r.label}
                                    </p>
                                    <p
                                        className="text-xs font-mono mt-0.5 truncate"
                                        style={{ color: 'var(--text-secondary)' }}
                                    >
                                        {r.path}
                                    </p>
                                </div>
                                <ChevronRight size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                            </button>
                        ))
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col flex-1 min-h-0">
            {/* Breadcrumbs */}
            <div
                className="px-5 py-2 flex items-center gap-1 flex-wrap shrink-0"
                style={{ borderBottom: '1px solid var(--app-border)' }}
            >
                <button
                    onClick={() => navigateTo(null)}
                    className="text-xs hover:opacity-70 px-1 rounded"
                    style={{ color: 'var(--accent)' }}
                >
                    {t('fs.picker.roots')}
                </button>
                {breadcrumbs.map((crumb, i) => (
                    <span key={crumb.path} className="flex items-center gap-0.5">
                        <ChevronRight size={11} style={{ color: 'var(--text-secondary)' }} />
                        <button
                            onClick={() => navigateTo(crumb.path)}
                            disabled={i === breadcrumbs.length - 1}
                            className="text-xs hover:opacity-70 disabled:opacity-100 disabled:cursor-default px-1 rounded"
                            style={{ color: i === breadcrumbs.length - 1 ? 'var(--text-primary)' : 'var(--accent)' }}
                        >
                            {crumb.label}
                        </button>
                    </span>
                ))}
                <button
                    onClick={refresh}
                    disabled={listLoading}
                    title={t('dp.picker.refresh')}
                    className="ml-auto hover:opacity-70 disabled:opacity-40 shrink-0"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <RefreshCw size={11} className={listLoading ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* Search */}
            <div className="px-5 py-2 shrink-0" style={{ borderBottom: '1px solid var(--app-border)' }}>
                <div
                    className="flex items-center gap-2 rounded-lg px-3 py-2"
                    style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                >
                    <Search size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('fs.picker.search')}
                        className="flex-1 min-w-0 text-sm bg-transparent focus:outline-none"
                        style={{ color: 'var(--text-primary)' }}
                    />
                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            className="hover:opacity-60"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>
            </div>

            {/* List + preview */}
            <div className="flex flex-1 min-h-0">
                {/* File/folder list */}
                <div
                    className={`aura-scroll overflow-y-auto ${showPreview ? 'w-1/2' : 'flex-1'}`}
                    style={showPreview ? { borderRight: '1px solid var(--app-border)' } : undefined}
                >
                    {listLoading ? (
                        <div className="flex items-center justify-center py-16">
                            <div
                                className="w-5 h-5 border-2 rounded-full animate-spin"
                                style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
                            />
                        </div>
                    ) : filteredEntries.length === 0 ? (
                        <div className="flex items-center justify-center py-12">
                            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                {search ? t('dp.picker.noResults') : t('fs.picker.empty')}
                            </p>
                        </div>
                    ) : (
                        filteredEntries.map((entry) => {
                            const entryFullPath = `${currentPath}/${entry.name}`;
                            const isPreviewed = previewEntry?.path === entryFullPath;
                            return (
                                <button
                                    key={entry.name}
                                    onClick={() => {
                                        if (entry.isDir) {
                                            navigateTo(entryFullPath);
                                        } else {
                                            handleFileSelect(entryFullPath, entry.mime, entry.size);
                                        }
                                    }}
                                    className="w-full text-left px-5 py-2.5 flex items-center gap-3 hover:opacity-80 transition-opacity"
                                    style={{
                                        borderBottom: '1px solid var(--app-border)',
                                        background: isPreviewed
                                            ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                                            : 'transparent',
                                    }}
                                >
                                    {entry.isDir ? (
                                        <Folder size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                                    ) : (
                                        <FileIcon size={15} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p
                                            className="text-sm truncate"
                                            style={{
                                                color: isPreviewed ? 'var(--accent)' : 'var(--text-primary)',
                                                fontWeight: entry.isDir ? 500 : 400,
                                            }}
                                        >
                                            {entry.name}
                                        </p>
                                        {!entry.isDir && (entry.size != null || entry.mime) && (
                                            <p
                                                className="text-[11px] flex gap-1.5"
                                                style={{ color: 'var(--text-secondary)' }}
                                            >
                                                {entry.mime && <span>{entry.mime.split('/').pop()}</span>}
                                                {entry.size != null && <span>{formatSize(entry.size)}</span>}
                                            </p>
                                        )}
                                    </div>
                                    {entry.isDir ? (
                                        <ChevronRight
                                            size={14}
                                            style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
                                        />
                                    ) : (
                                        !showPreview && (
                                            <span
                                                className="text-[10px] px-2 py-1 rounded shrink-0"
                                                style={{
                                                    background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                                                    color: 'var(--accent)',
                                                }}
                                            >
                                                {t('fs.picker.select')}
                                            </span>
                                        )
                                    )}
                                </button>
                            );
                        })
                    )}
                </div>

                {/* Preview panel */}
                {showPreview && (
                    <div
                        className="flex-1 flex flex-col items-center justify-center gap-3 p-4 overflow-hidden"
                        style={{ background: 'color-mix(in srgb, var(--app-bg) 60%, transparent)' }}
                    >
                        {!previewEntry ? (
                            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                {t('fs.picker.previewNone')}
                            </p>
                        ) : (
                            (() => {
                                const mime = previewEntry.mime || '';
                                const url = `/fs/read?path=${encodeURIComponent(previewEntry.path)}`;
                                const entryName = previewEntry.path.split('/').pop() ?? '';
                                const entry = listing?.entries.find((e) => e.name === entryName);
                                return (
                                    <>
                                        {mime.startsWith('image/') ? (
                                            <img
                                                src={url}
                                                alt={entryName}
                                                className="rounded-lg"
                                                style={{
                                                    maxWidth: '100%',
                                                    maxHeight: 'calc(100% - 100px)',
                                                    objectFit: 'contain',
                                                }}
                                            />
                                        ) : (
                                            <div className="text-center">
                                                <FileIcon
                                                    size={48}
                                                    style={{ color: 'var(--text-secondary)', margin: '0 auto' }}
                                                />
                                                <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                                                    {mime || 'file'}
                                                </p>
                                            </div>
                                        )}
                                        <p
                                            className="text-xs font-medium truncate max-w-full"
                                            style={{ color: 'var(--text-primary)' }}
                                        >
                                            {entryName}
                                        </p>
                                        {entry?.size != null && (
                                            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                                {formatSize(entry.size)}
                                            </p>
                                        )}
                                        <button
                                            onClick={handleConfirmPreview}
                                            className="px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-80 shrink-0"
                                            style={{ background: 'var(--accent)' }}
                                        >
                                            {t('fs.picker.select')}
                                        </button>
                                    </>
                                );
                            })()
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DatapointPicker({
    currentValue,
    onSelect,
    onPickResult,
    onClose,
    multiSelect,
    onMultiSelect,
    allowedTypes,
    modes = ['dp'],
    defaultMode,
    acceptMime,
}: DatapointPickerProps) {
    const t = useT();
    const themeVars = usePortalThemeVars();
    const { datapoints, loading, loaded, load } = useDatapointList();

    const effectiveModes = modes.length > 0 ? modes : ['dp' as const];
    const [mode, setMode] = useState<'dp' | 'files'>(() => {
        if (defaultMode && (effectiveModes as string[]).includes(defaultMode)) return defaultMode;
        return effectiveModes[0];
    });

    const [size, setSize] = useState({ w: 1080, h: 600 });
    const [pos, setPos] = useState(() => ({
        x: Math.round((window.innerWidth - 1080) / 2),
        y: Math.round((window.innerHeight - 600) / 2),
    }));
    const posRef = useRef(pos);
    const sizeRef = useRef(size);
    const dragOrigin = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
    const resizeOrigin = useRef<{ mx: number; my: number; pw: number; ph: number } | null>(null);

    const onDragMouseDown = useCallback((e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('button')) return;
        e.preventDefault();
        e.stopPropagation();
        dragOrigin.current = { mx: e.clientX, my: e.clientY, px: posRef.current.x, py: posRef.current.y };
        const onMove = (ev: MouseEvent) => {
            if (!dragOrigin.current) return;
            const { mx, my, px, py } = dragOrigin.current;
            const next = {
                x: Math.max(0, Math.min(window.innerWidth - sizeRef.current.w, px + ev.clientX - mx)),
                y: Math.max(0, Math.min(window.innerHeight - sizeRef.current.h, py + ev.clientY - my)),
            };
            posRef.current = next;
            setPos(next);
        };
        const onUp = () => {
            dragOrigin.current = null;
            window.removeEventListener('mousemove', onMove, true);
            window.removeEventListener('mouseup', onUp, true);
        };
        window.addEventListener('mousemove', onMove, true);
        window.addEventListener('mouseup', onUp, true);
    }, []);

    const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        resizeOrigin.current = { mx: e.clientX, my: e.clientY, pw: sizeRef.current.w, ph: sizeRef.current.h };
        const onMove = (ev: MouseEvent) => {
            if (!resizeOrigin.current) return;
            const { mx, my, pw, ph } = resizeOrigin.current;
            const next = {
                w: Math.max(480, Math.min(window.innerWidth - posRef.current.x - 16, pw + ev.clientX - mx)),
                h: Math.max(300, Math.min(window.innerHeight - posRef.current.y - 16, ph + ev.clientY - my)),
            };
            sizeRef.current = next;
            setSize(next);
        };
        const onUp = () => {
            resizeOrigin.current = null;
            window.removeEventListener('mousemove', onMove, true);
            window.removeEventListener('mouseup', onUp, true);
        };
        window.addEventListener('mousemove', onMove, true);
        window.addEventListener('mouseup', onUp, true);
    }, []);

    // Cancel any drag active in underlying RGL when the picker opens.
    useEffect(() => {
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    }, []);

    useEffect(() => {
        if (!loaded) load();
    }, [loaded, load]);

    const handleDpSelect = (id: string, unit?: string, name?: string, role?: string, dpType?: string) => {
        if (onPickResult) onPickResult({ kind: 'dp', id, unit, name, role, dpType });
        if (onSelect) onSelect(id, unit, name, role, dpType);
        onClose();
    };

    const handleFileSelect = (r: PickerResult) => {
        if (onPickResult) onPickResult(r);
        onClose();
    };

    return createPortal(
        <div
            className="fixed inset-0 bg-black/70 z-[9999]"
            style={themeVars}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseMove={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
        >
            <div
                className="rounded-xl flex flex-col shadow-2xl"
                style={{
                    background: 'linear-gradient(var(--app-surface), var(--app-surface)), var(--app-bg)',
                    border: '1px solid var(--app-border)',
                    position: 'fixed',
                    left: pos.x,
                    top: pos.y,
                    width: size.w,
                    height: size.h,
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header – drag handle */}
                <div
                    className="flex items-center gap-3 px-5 py-4 shrink-0"
                    style={{ borderBottom: '1px solid var(--app-border)', cursor: 'move', userSelect: 'none' }}
                    onMouseDown={onDragMouseDown}
                >
                    <h2 className="font-bold flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>
                        {mode === 'files' ? t('fs.picker.title') : t('dp.picker.title')}
                    </h2>
                    {effectiveModes.length > 1 && (
                        <div
                            className="flex rounded-lg overflow-hidden shrink-0"
                            style={{ border: '1px solid var(--app-border)' }}
                        >
                            {effectiveModes.map((m) => (
                                <button
                                    key={m}
                                    onClick={() => setMode(m)}
                                    className="px-3 py-1.5 text-xs transition-colors"
                                    style={{
                                        background: mode === m ? 'var(--accent)' : 'var(--app-bg)',
                                        color: mode === m ? '#fff' : 'var(--text-secondary)',
                                    }}
                                >
                                    {m === 'dp' ? t('fs.picker.tab.dp') : t('fs.picker.tab.files')}
                                </button>
                            ))}
                        </div>
                    )}
                    {mode === 'dp' && (
                        <button
                            onClick={() => load(true)}
                            disabled={loading}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs hover:opacity-80 disabled:opacity-40 transition-opacity shrink-0"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--app-border)',
                            }}
                        >
                            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                            {t('dp.picker.refresh')}
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="hover:opacity-60 transition-opacity shrink-0"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                {mode === 'dp' ? (
                    <DpModeBody
                        currentValue={currentValue}
                        onSelect={handleDpSelect}
                        onClose={onClose}
                        allowedTypes={allowedTypes}
                        multiSelect={multiSelect}
                        onMultiSelect={onMultiSelect}
                        loading={loading}
                        loaded={loaded}
                        datapoints={datapoints}
                    />
                ) : (
                    <FileModeBody onSelect={handleFileSelect} acceptMime={acceptMime} pickerWidth={size.w} />
                )}

                {/* Resize handle – bottom-right corner */}
                <div
                    onMouseDown={onResizeMouseDown}
                    title="Größe ändern"
                    style={{
                        position: 'absolute',
                        bottom: 0,
                        right: 0,
                        width: 18,
                        height: 18,
                        cursor: 'nwse-resize',
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'flex-end',
                        padding: '3px',
                        borderBottomRightRadius: '0.75rem',
                    }}
                >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path
                            d="M9 1L1 9M9 5L5 9M9 9"
                            stroke="var(--text-secondary)"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            opacity="0.5"
                        />
                    </svg>
                </div>
            </div>
        </div>,
        document.body,
    );
}
