import { useEffect } from 'react';
import { RefreshCw, Search, Check, X, ChevronDown, ChevronUp, Ban, Plus, PlusCircle } from 'lucide-react';
import { MultiSelect } from '../MultiSelect';
import { DatapointPicker } from '../DatapointPicker';
import type { AutoListOptions, DiscoveredDp } from '../../widgets/AutoListWidget';
import type { DpDiscovery } from '../../../hooks/useDpDiscovery';
import { useT } from '../../../i18n';

const PRESETS_ID: { label: string; value: string }[] = [
    { label: 'endet auf .POWER', value: '/\\.POWER$/i' },
    { label: 'endet auf .STATE', value: '/\\.STATE$/i' },
    { label: 'endet auf .SET', value: '/\\.SET$/i' },
    { label: 'enthält .ENERGY', value: '/\\.ENERGY/i' },
    { label: 'endet auf .ACTUAL', value: '/\\.ACTUAL$/i' },
];

const PRESETS_EXCLUDE: { label: string; value: string }[] = [
    { label: '.info.', value: '.info.' },
    { label: '.connection', value: '.connection' },
    { label: 'powerSave', value: '/powerSaveMode/i' },
    { label: 'powerFactor', value: '/powerFactor/i' },
    { label: '_REMOTE_', value: '_REMOTE_' },
    { label: 'Indikatoren', value: '/\\.indicator\\./i' },
];

function appendPattern(current: string, value: string): string {
    const trimmed = current.trim();
    return trimmed ? `${trimmed}, ${value}` : value;
}

function PresetChips({ presets, onAdd }: { presets: { label: string; value: string }[]; onAdd: (v: string) => void }) {
    return (
        <div className="flex flex-wrap gap-1 mt-1">
            {presets.map((p) => (
                <button
                    key={p.value}
                    type="button"
                    onClick={() => onAdd(p.value)}
                    title={p.value}
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] hover:opacity-80 transition-opacity"
                    style={{ background: 'var(--app-border)', color: 'var(--text-secondary)' }}
                >
                    <PlusCircle size={8} />
                    {p.label}
                </button>
            ))}
        </div>
    );
}

/**
 * "Suchen & Filter" tab of the datapoint dialog: which datapoints the dynamic list
 * pulls in. All state lives in the caller's useDpDiscovery hook so filter drafts and
 * search results survive closing the dialog - see the hook for why.
 */
export function AutoDiscoveryPanel({
    opts,
    onOptsChange,
    discovery,
    onApplied,
}: {
    opts: AutoListOptions;
    onOptsChange: (patch: Partial<AutoListOptions>) => void;
    discovery: DpDiscovery;
    /** Called after "Übernehmen" with the first newly added entry, if any. */
    onApplied?: (firstNewId?: string) => void;
}) {
    const t = useT();
    const {
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
        toggle,
        canSearch,
    } = discovery;

    // The filter values need a full object scan; only pay for it once this tab exists.
    useEffect(() => {
        ensureOptionsLoaded();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const apply = () => onApplied?.(discovery.apply());

    const iSty = {
        background: 'var(--app-bg)',
        color: 'var(--text-primary)',
        border: '1px solid var(--app-border)',
    } as React.CSSProperties;
    const iCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';

    return (
        <>
            {/* ── Filters ── */}
            <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                    <MultiSelect
                        label="Adapter"
                        options={availAdapters}
                        selected={selAdapters}
                        onChange={(v) => {
                            setSelAdapters(v);
                            resetSearch();
                        }}
                        loading={optLoading}
                    />
                </div>
                <MultiSelect
                    label={t('autolist.roles')}
                    options={availRoles}
                    selected={selRoles}
                    onChange={(v) => {
                        setSelRoles(v);
                        resetSearch();
                    }}
                    loading={optLoading}
                />
                <MultiSelect
                    label={t('autolist.room')}
                    options={availRooms}
                    selected={selRooms}
                    onChange={(v) => {
                        setSelRooms(v);
                        resetSearch();
                    }}
                    loading={optLoading}
                />
                <MultiSelect
                    label={t('autolist.func')}
                    options={availFuncs}
                    selected={selFuncs}
                    onChange={(v) => {
                        setSelFuncs(v);
                        resetSearch();
                    }}
                    loading={optLoading}
                />
                {(availEnums.length > 0 || selEnums.length > 0) && (
                    <div className="col-span-2">
                        <MultiSelect
                            label={t('autolist.categories')}
                            options={availEnums.map((e) => ({
                                value: e.id,
                                label: e.label,
                                group: e.categoryLabel,
                            }))}
                            selected={selEnums}
                            onChange={(v) => {
                                setSelEnums(v);
                                resetSearch();
                            }}
                            loading={optLoading}
                        />
                        <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                            {t('autolist.categoriesHint')}
                        </p>
                    </div>
                )}
                <div>
                    <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                        {t('autolist.idContains')} <span className="opacity-60">(kommagetrennt, OR)</span>
                    </label>
                    <input
                        className={iCls}
                        style={iSty}
                        placeholder="shelly, /\.POWER$/i"
                        value={idPat}
                        onChange={(e) => {
                            setIdPat(e.target.value);
                            resetSearch();
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && canSearch && search()}
                    />
                    <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        Text = Teilstring · <span className="font-mono">/regex/flags</span> möglich
                    </p>
                    <PresetChips
                        presets={PRESETS_ID}
                        onAdd={(v) => {
                            setIdPat((p) => appendPattern(p, v));
                            resetSearch();
                        }}
                    />
                </div>
                <div className="col-span-2">
                    <MultiSelect
                        label="Typen"
                        options={availTypes}
                        selected={selTypes}
                        onChange={(v) => {
                            setSelTypes(v);
                            resetSearch();
                        }}
                        loading={optLoading}
                    />
                </div>
            </div>

            {/* ── Exclude section ── */}
            <div className="space-y-2 pt-0.5">
                <div className="flex items-center gap-1.5">
                    <Ban size={10} style={{ color: 'var(--text-secondary)' }} />
                    <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        Ausschlüsse
                    </span>
                </div>
                <div>
                    <label className="text-[10px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                        ID-Muster ausschließen <span className="opacity-60">(kommagetrennt)</span>
                    </label>
                    <input
                        className={iCls}
                        style={iSty}
                        placeholder=".info., .connection, /powerSaveMode/i"
                        value={excludePats}
                        onChange={(e) => {
                            setExcludePats(e.target.value);
                            resetSearch();
                        }}
                    />
                    <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        Text = Teilstring · <span className="font-mono">/regex/flags</span> möglich
                    </p>
                    <PresetChips
                        presets={PRESETS_EXCLUDE}
                        onAdd={(v) => {
                            setExcludePats((p) => appendPattern(p, v));
                            resetSearch();
                        }}
                    />
                </div>
                <div>
                    <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                            DPs gezielt ausschließen{' '}
                            {excludeIds.length > 0 && <span className="opacity-60">({excludeIds.length})</span>}
                        </label>
                        <button
                            type="button"
                            onClick={() => setShowExcludePicker(true)}
                            className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded hover:opacity-80"
                            style={{ background: 'var(--app-border)', color: 'var(--text-secondary)' }}
                        >
                            <Plus size={9} /> Auswählen
                        </button>
                    </div>
                    {excludeIds.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {excludeIds.map((id) => (
                                <span
                                    key={id}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono"
                                    style={{
                                        background: 'color-mix(in srgb, #ef4444 12%, transparent)',
                                        color: '#ef4444',
                                        border: '1px solid color-mix(in srgb, #ef4444 30%, transparent)',
                                    }}
                                >
                                    <span className="max-w-[120px] truncate">{id.split('.').slice(-2).join('.')}</span>
                                    <button
                                        onClick={() => {
                                            setExcludeIds((prev) => prev.filter((x) => x !== id));
                                            resetSearch();
                                        }}
                                        className="hover:opacity-70 shrink-0"
                                    >
                                        <X size={8} />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <button
                onClick={search}
                disabled={loading || !canSearch}
                className="w-full flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg hover:opacity-80 disabled:opacity-40"
                style={{ background: 'var(--accent)', color: '#fff' }}
            >
                {loading ? <RefreshCw size={11} className="animate-spin" /> : <Search size={11} />}
                {t('autolist.search')}
            </button>

            {/* ── Search results ── */}
            {searched && results.length === 0 && (
                <p className="text-[11px] text-center py-2" style={{ color: 'var(--text-secondary)' }}>
                    {t('autolist.noneFound')}
                </p>
            )}
            {searched &&
                results.length > 0 &&
                (() => {
                    const relevant = results.filter((d) => d.isRelevant);
                    const others = results.filter((d) => !d.isRelevant);
                    const DpRow = ({ dp, dimmed }: { dp: DiscoveredDp; dimmed?: boolean }) => (
                        <label
                            key={dp.id}
                            className="flex items-center gap-2 px-2.5 py-2 rounded cursor-pointer hover:opacity-90"
                            style={{
                                background: selected.has(dp.id)
                                    ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
                                    : 'transparent',
                                opacity: dimmed ? 0.55 : 1,
                            }}
                        >
                            <div
                                className="w-3.5 h-3.5 rounded shrink-0 flex items-center justify-center"
                                style={{ background: selected.has(dp.id) ? 'var(--accent)' : 'var(--app-border)' }}
                            >
                                {selected.has(dp.id) && <Check size={9} color="#fff" />}
                            </div>
                            <input
                                type="checkbox"
                                className="sr-only"
                                checked={selected.has(dp.id)}
                                onChange={() => toggle(dp.id)}
                            />
                            <div className="min-w-0 flex-1">
                                <div className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>
                                    {dp.name}
                                    {dp.unit && (
                                        <span className="ml-1 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                            [{dp.unit}]
                                        </span>
                                    )}
                                </div>
                                <div
                                    className="text-[10px] truncate font-mono"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    {dp.id}
                                    {dp.rooms.length > 0 ? ` · ${dp.rooms[0]}` : ''}
                                </div>
                            </div>
                        </label>
                    );
                    return (
                        <>
                            <div className="flex items-center justify-between">
                                <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                    {t('autolist.found', { count: results.length, selected: selected.size })}
                                </span>
                                <div className="flex gap-2">
                                    <button
                                        className="text-[10px] hover:opacity-70"
                                        style={{ color: 'var(--accent)' }}
                                        onClick={() => {
                                            setSelected(new Set(results.map((d) => d.id)));
                                            setShowOthers(true);
                                        }}
                                    >
                                        {t('common.all')}
                                    </button>
                                    <button
                                        className="text-[10px] hover:opacity-70"
                                        style={{ color: 'var(--text-secondary)' }}
                                        onClick={() => setSelected(new Set())}
                                    >
                                        {t('common.none')}
                                    </button>
                                </div>
                            </div>
                            <div className="aura-scroll space-y-0.5 max-h-56 overflow-y-auto -mx-1 px-1">
                                {relevant.map((dp) => (
                                    <DpRow key={dp.id} dp={dp} />
                                ))}
                                {others.length > 0 && (
                                    <>
                                        <button
                                            onClick={() => setShowOthers((v) => !v)}
                                            className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] hover:opacity-80 transition-opacity mt-1"
                                            style={{ background: 'var(--app-border)', color: 'var(--text-secondary)' }}
                                        >
                                            {showOthers ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                                            <span>Weitere Datenpunkte ({others.length})</span>
                                        </button>
                                        {showOthers && others.map((dp) => <DpRow key={dp.id} dp={dp} dimmed />)}
                                    </>
                                )}
                            </div>
                            <button
                                onClick={apply}
                                disabled={selected.size === 0}
                                className="w-full flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg hover:opacity-80 disabled:opacity-40"
                                style={{ background: 'var(--accent-green)', color: '#fff' }}
                            >
                                <Check size={11} /> {t('autolist.apply', { count: selected.size })}
                            </button>
                        </>
                    );
                })()}
            {/* ── Auto-sync: how the filters keep pulling datapoints in ── */}
            <div style={{ height: 1, background: 'var(--app-border)' }} />
            <div className="flex items-end gap-3">
                <div className="flex-1 min-w-0">
                    <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                        {t('autolist.syncMin')}
                    </label>
                    <input
                        type="number"
                        min={1}
                        className={iCls}
                        style={iSty}
                        value={opts.syncIntervalMin ?? 5}
                        onChange={(e) => onOptsChange({ syncIntervalMin: Number(e.target.value) })}
                    />
                </div>
                <div className="flex-1 flex items-center justify-between gap-2 pb-2">
                    <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        Nur relevante DPs (Auto-Sync)
                    </label>
                    <button
                        onClick={() => onOptsChange({ filterRelevant: !(opts.filterRelevant ?? false) })}
                        className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                        style={{ background: (opts.filterRelevant ?? false) ? 'var(--accent)' : 'var(--app-border)' }}
                    >
                        <span
                            className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                            style={{ left: (opts.filterRelevant ?? false) ? '18px' : '2px' }}
                        />
                    </button>
                </div>
            </div>

            {/* ── DatapointPicker for exclude blacklist ── */}
            {showExcludePicker && (
                <DatapointPicker
                    currentValue=""
                    onSelect={() => setShowExcludePicker(false)}
                    onClose={() => setShowExcludePicker(false)}
                    multiSelect
                    onMultiSelect={(picks) => {
                        setExcludeIds((prev) => {
                            const next = new Set(prev);
                            picks.forEach((p) => next.add(p.id));
                            return [...next];
                        });
                        resetSearch();
                        setShowExcludePicker(false);
                    }}
                />
            )}
        </>
    );
}
