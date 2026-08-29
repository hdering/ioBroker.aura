import { useEffect, useMemo, useState } from 'react';
import { Copy, Check, Sparkles } from 'lucide-react';
import { ConfigModal } from './ConfigModal';
import { MultiSelect, type MultiSelectOption } from './MultiSelect';
import { useDatapointList } from '../../hooks/useDatapointList';
import { useDashboardStore } from '../../store/dashboardStore';
import { useConfigStore } from '../../store/configStore';
import { copyToClipboard } from '../../utils/clipboard';
import { useT } from '../../i18n';
import {
    buildAiPrompt,
    estimateTokens,
    filterDatapoints,
    MAX_DATAPOINTS,
    type WidgetSchema,
    type PromptDatapoint,
} from '../../utils/aiPrompt';

const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};

/** The generated schema, served from public/ai/ (copied into www/ by the build). */
const SCHEMA_URL = `${import.meta.env.BASE_URL}ai/aura-widget-schema.json`;

// Fetched once per session — it is ~270 KB and never changes at runtime.
let schemaCache: WidgetSchema | null = null;

/** Widgets of the tab the import will land in, for context in the prompt. */
function useActiveTabWidgets() {
    return useDashboardStore((s) => {
        const layout = s.layouts.find((l) => l.id === s.activeLayoutId) ?? s.layouts[0];
        const section = layout?.sections.find((x) => x.id === layout.activeSectionId) ?? layout?.sections[0];
        const tab = section?.tabs.find((t) => t.id === section.activeTabId) ?? section?.tabs[0];
        return tab ? { name: tab.name, widgets: tab.widgets } : null;
    });
}

/**
 * How many columns the dashboard currently offers. Mirrors Dashboard.tsx, which
 * derives the count from the grid's own width — a wrong number here is the one
 * mistake that makes every generated layout overflow, so measure the real grid
 * when it is on screen and only fall back to the viewport.
 */
function currentCols(snapX: number, gap: number, minCols: number): number {
    const grid = document.querySelector('.react-grid-layout');
    const width = grid?.clientWidth || window.innerWidth;
    const fit = Math.max(2, Math.floor((width - gap) / (snapX + gap)));
    return Math.max(fit, minCols);
}

export function AiPromptDialog({ onClose }: { onClose: () => void }) {
    const t = useT();
    const { datapoints, loading, load } = useDatapointList();
    const activeTab = useActiveTabWidgets();
    const frontend = useConfigStore((s) => s.frontend);

    const [schema, setSchema] = useState<WidgetSchema | null>(schemaCache);
    const [schemaError, setSchemaError] = useState('');

    const [target, setTarget] = useState<'widget' | 'tab'>('widget');
    const [task, setTask] = useState('');
    const [types, setTypes] = useState<string[]>([]);
    const [rooms, setRooms] = useState<string[]>([]);
    const [funcs, setFuncs] = useState<string[]>([]);
    const [search, setSearch] = useState('');
    const [writableOnly, setWritableOnly] = useState(false);
    const [withTab, setWithTab] = useState(true);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        if (schemaCache) {
            return;
        }
        let alive = true;
        fetch(SCHEMA_URL)
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((json: WidgetSchema) => {
                schemaCache = json;
                if (alive) {
                    setSchema(json);
                }
            })
            .catch((e: Error) => alive && setSchemaError(e.message));
        return () => {
            alive = false;
        };
    }, []);

    const entries: PromptDatapoint[] = datapoints;

    const roomOptions = useMemo(
        () => [...new Set(entries.flatMap((d) => d.rooms))].sort((a, b) => a.localeCompare(b)),
        [entries],
    );
    const funcOptions = useMemo(
        () => [...new Set(entries.flatMap((d) => d.funcs))].sort((a, b) => a.localeCompare(b)),
        [entries],
    );

    const typeOptions: MultiSelectOption[] = useMemo(() => {
        if (!schema) {
            return [];
        }
        const groupLabel = new Map(schema.groups.map((g) => [g.id, g.label]));
        return Object.entries(schema.widgets)
            .filter(([, w]) => !w.deprecated)
            .map(([type, w]) => ({ value: type, label: `${w.label} (${type})`, group: groupLabel.get(w.group) }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [schema]);

    // No room/function picked = no datapoints, rather than the whole installation:
    // an unfiltered tree is thousands of rows and useless as prompt context.
    const selectedDps = useMemo(() => {
        if (!rooms.length && !funcs.length && !search.trim()) {
            return [];
        }
        return filterDatapoints(entries, { rooms, funcs, search, writableOnly });
    }, [entries, rooms, funcs, search, writableOnly]);

    const prompt = useMemo(() => {
        if (!schema) {
            return '';
        }
        const gap = frontend.gridGap ?? 10;
        const snapX = frontend.gridSnapX ?? frontend.gridRowHeight ?? 20;
        const minCols = (activeTab?.widgets ?? []).reduce((m, w) => Math.max(m, w.gridPos.x + w.gridPos.w), 2);
        return buildAiPrompt({
            schema,
            task,
            types,
            datapoints: selectedDps,
            grid: { cols: currentCols(snapX, gap, minCols), rowHeight: frontend.gridRowHeight ?? 20, snapX, gap },
            currentTab: withTab ? activeTab : null,
            target,
        });
    }, [schema, task, types, selectedDps, frontend, activeTab, withTab, target]);

    const handleCopy = () => {
        copyToClipboard(prompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
    };

    const targetButton = (value: 'widget' | 'tab', label: string) => (
        <button
            onClick={() => setTarget(value)}
            className="flex-1 text-xs rounded-lg px-3 py-2 transition-colors"
            style={{
                background: target === value ? 'var(--accent)' : 'var(--app-bg)',
                color: target === value ? '#fff' : 'var(--text-secondary)',
                border: '1px solid var(--app-border)',
            }}
        >
            {label}
        </button>
    );

    const toggleRow = (checked: boolean, onToggle: () => void, label: string, hint?: string) => (
        <button onClick={onToggle} className="flex items-start gap-2 text-left w-full">
            <span
                className="w-4 h-4 rounded shrink-0 mt-0.5 flex items-center justify-center"
                style={{
                    background: checked ? 'var(--accent)' : 'var(--app-bg)',
                    border: '1px solid var(--app-border)',
                }}
            >
                {checked && <Check size={11} color="#fff" />}
            </span>
            <span className="min-w-0">
                <span className="text-xs block" style={{ color: 'var(--text-primary)' }}>
                    {label}
                </span>
                {hint && (
                    <span className="text-[10px] block" style={{ color: 'var(--text-secondary)' }}>
                        {hint}
                    </span>
                )}
            </span>
        </button>
    );

    return (
        <ConfigModal title={t('aiPrompt.title')} maxWidth={620} padded onClose={onClose} storageKey="aura-ai-prompt">
            <div className="space-y-3.5">
                <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {t('aiPrompt.intro')}
                </p>

                <div className="flex gap-2">
                    {targetButton('widget', t('aiPrompt.targetWidget'))}
                    {targetButton('tab', t('aiPrompt.targetTab'))}
                </div>

                <div>
                    <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
                        {t('aiPrompt.task')}
                    </label>
                    <textarea
                        value={task}
                        onChange={(e) => setTask(e.target.value)}
                        rows={3}
                        placeholder={t('aiPrompt.taskPlaceholder')}
                        className={`${inputCls} resize-none`}
                        style={inputStyle}
                    />
                </div>

                <MultiSelect
                    label={t('aiPrompt.types')}
                    options={typeOptions}
                    selected={types}
                    onChange={setTypes}
                    loading={!schema && !schemaError}
                    placeholder={t('aiPrompt.typesPlaceholder')}
                />

                <div className="grid grid-cols-2 gap-2">
                    <MultiSelect
                        label={t('aiPrompt.rooms')}
                        options={roomOptions}
                        selected={rooms}
                        onChange={setRooms}
                        loading={loading}
                        placeholder={t('common.all')}
                    />
                    <MultiSelect
                        label={t('aiPrompt.funcs')}
                        options={funcOptions}
                        selected={funcs}
                        onChange={setFuncs}
                        loading={loading}
                        placeholder={t('common.all')}
                    />
                </div>

                <div>
                    <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
                        {t('aiPrompt.search')}
                    </label>
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('aiPrompt.searchPlaceholder')}
                        className={inputCls}
                        style={inputStyle}
                    />
                </div>

                <div className="space-y-2">
                    {toggleRow(writableOnly, () => setWritableOnly((v) => !v), t('aiPrompt.writableOnly'))}
                    {activeTab &&
                        toggleRow(
                            withTab,
                            () => setWithTab((v) => !v),
                            t('aiPrompt.withTab', { name: activeTab.name }),
                            t('aiPrompt.withTabHint', { count: activeTab.widgets.length }),
                        )}
                </div>

                <div
                    className="rounded-lg px-3 py-2 text-[11px]"
                    style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                >
                    {schemaError ? (
                        <span style={{ color: 'var(--accent-red)' }}>
                            {t('aiPrompt.schemaError', { error: schemaError })}
                        </span>
                    ) : !schema ? (
                        <span style={{ color: 'var(--text-secondary)' }}>{t('common.loading')}</span>
                    ) : (
                        <span style={{ color: 'var(--text-secondary)' }}>
                            {t('aiPrompt.summary', {
                                dps: Math.min(selectedDps.length, MAX_DATAPOINTS),
                                types: types.length,
                                tokens: Math.round(estimateTokens(prompt) / 100) / 10,
                            })}
                        </span>
                    )}
                </div>

                {selectedDps.length === 0 && !schemaError && (
                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                        {t('aiPrompt.noDpHint')}
                    </p>
                )}

                <div className="flex justify-end gap-2 pt-1">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm rounded-lg hover:opacity-80"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--app-border)',
                        }}
                    >
                        {t('common.close')}
                    </button>
                    <button
                        onClick={handleCopy}
                        disabled={!schema}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-80 disabled:opacity-40"
                        style={{ background: 'var(--accent)' }}
                    >
                        {copied ? <Check size={13} /> : <Copy size={13} />}
                        {copied ? t('aiPrompt.copied') : t('aiPrompt.copy')}
                    </button>
                </div>
            </div>
        </ConfigModal>
    );
}

/** Small entry point for the import dialog's header. */
export function AiPromptButton({ onClick }: { onClick: () => void }) {
    const t = useT();
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg hover:opacity-80"
            style={{
                background: 'var(--app-bg)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--app-border)',
            }}
        >
            <Sparkles size={12} /> {t('aiPrompt.open')}
        </button>
    );
}
