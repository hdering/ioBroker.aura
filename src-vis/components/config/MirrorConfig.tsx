import { useState } from 'react';
import type { WidgetConfig } from '../../types';
import { useDashboardStore } from '../../store/dashboardStore';
import { tabFitOf, tabSourceLocked } from '../widgets/TabMirror';
import { useT } from '../../i18n';

const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const labelCls = 'text-[11px] mb-1 block';
const labelStyle: React.CSSProperties = { color: 'var(--text-secondary)' };

interface Props {
    config: WidgetConfig;
    onConfigChange: (config: WidgetConfig) => void;
}

/**
 * Editor for the "Spiegel" (mirror) widget: a whole tab (TabSourcePicker) or, by
 * default, the source widget whose content should be shown here. The widget list
 * reuses the whole-dashboard picker UX from ClickActionEditor's popup-widget branch; the mirror only stores the source's id
 * in `options.targetWidgetId`.
 */
export function MirrorConfig({ config, onConfigChange }: Props) {
    const t = useT();
    const kind = config.options?.sourceKind === 'tab' ? 'tab' : 'widget';
    const setKind = (next: 'widget' | 'tab') =>
        onConfigChange({ ...config, options: { ...config.options, sourceKind: next === 'tab' ? 'tab' : undefined } });

    return (
        <div className="space-y-3">
            <div>
                <label className={labelCls} style={labelStyle}>
                    {t('mirror.source')}
                </label>
                <div className="flex gap-1">
                    {(
                        [
                            ['widget', t('mirror.kindWidget')],
                            ['tab', t('mirror.kindTab')],
                        ] as const
                    ).map(([k, label]) => (
                        <button
                            key={k}
                            type="button"
                            data-aura-mirror-kind={k}
                            onClick={() => setKind(k)}
                            className="flex-1 text-xs rounded-lg px-2.5 py-1.5"
                            style={{
                                background: kind === k ? 'var(--accent)' : 'var(--app-bg)',
                                color: kind === k ? '#fff' : 'var(--text-primary)',
                                border: '1px solid var(--app-border)',
                            }}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>
            {kind === 'tab' ? (
                <TabSourcePicker config={config} onConfigChange={onConfigChange} />
            ) : (
                <WidgetSourcePicker config={config} onConfigChange={onConfigChange} />
            )}
        </div>
    );
}

/**
 * Tab mode: pick the tab to show, and how it fits the box. Tabs behind a PIN are
 * listed but not selectable (the mirror would show them without the code); the
 * tab this mirror sits on is left out (it would contain itself).
 */
function TabSourcePicker({ config, onConfigChange }: Props) {
    const t = useT();
    const layouts = useDashboardStore((s) => s.layouts);
    const [search, setSearch] = useState('');
    const selectedId = (config.options?.targetTabId as string | undefined) ?? '';
    const fit = tabFitOf(config.options?.tabFit);
    const tabWidth = Number(config.options?.tabWidth) || 0;

    const rows = layouts.flatMap((layout) =>
        layout.sections.flatMap((section) =>
            section.tabs
                .filter((tab) => !(tab.widgets ?? []).some((w) => w.id === config.id))
                .map((tab) => {
                    const source = { layout, section, tab };
                    return {
                        id: tab.id,
                        tab: tab.name,
                        where: `${layout.name} / ${section.name}`,
                        count: (tab.widgets ?? []).length,
                        locked: tabSourceLocked(source),
                    };
                }),
        ),
    );
    const q = search.toLowerCase();
    const shown = q
        ? rows.filter((r) => r.tab.toLowerCase().includes(q) || r.where.toLowerCase().includes(q) || r.id.includes(q))
        : rows;

    const setO = (patch: Record<string, unknown>) =>
        onConfigChange({ ...config, options: { ...config.options, ...patch } });
    const select = (id: string | undefined) =>
        // The tab's widgets bring their own cards — a card around them would frame
        // the copy twice, so the first pick makes the mirror transparent.
        setO(
            id && !config.options?.targetTabId
                ? { targetTabId: id, transparent: config.options?.transparent ?? true }
                : { targetTabId: id },
        );

    const rowStyle = (id: string, locked = false): React.CSSProperties => ({
        padding: '4px 8px',
        cursor: locked ? 'not-allowed' : 'pointer',
        opacity: locked ? 0.45 : 1,
        background: selectedId === id ? 'var(--accent)' : 'transparent',
        color: selectedId === id ? '#fff' : 'var(--text-primary)',
        borderRadius: 4,
    });

    return (
        <div className="space-y-3">
            <div className="space-y-1.5">
                <label className={labelCls} style={labelStyle}>
                    {t('mirror.tab')}
                </label>
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('mirror.tabSearch')}
                    className={inputCls}
                    style={inputStyle}
                />
                <div
                    style={{ ...inputStyle, padding: '4px', maxHeight: 220, overflowY: 'auto', borderRadius: 8 }}
                    data-aura-mirror-tab-list
                >
                    <div
                        className="grid gap-x-2 px-2 rounded text-xs"
                        style={{ ...rowStyle(''), gridTemplateColumns: '1fr 1fr 40px' }}
                        onClick={() => select(undefined)}
                    >
                        <span className="truncate italic">{t('mirror.noTab')}</span>
                        <span />
                        <span />
                    </div>
                    {shown.map((r) => (
                        <div
                            key={r.id}
                            data-aura-mirror-tab={r.id}
                            className="grid gap-x-2 px-2 rounded text-xs"
                            style={{ ...rowStyle(r.id, r.locked), gridTemplateColumns: '1fr 1fr 40px' }}
                            title={r.locked ? t('mirror.tabLocked') : undefined}
                            onClick={() => !r.locked && select(r.id)}
                        >
                            <span className="truncate">
                                {r.locked ? '🔒 ' : ''}
                                {r.tab || '–'}
                            </span>
                            <span className="truncate" style={{ opacity: 0.7 }}>
                                {r.where}
                            </span>
                            <span className="text-right" style={{ opacity: 0.6 }}>
                                {r.count}
                            </span>
                        </div>
                    ))}
                    {shown.length === 0 && (
                        <div className="px-2 py-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {t('mirror.noTabs')}
                        </div>
                    )}
                </div>
            </div>
            <div>
                <label className={labelCls} style={labelStyle}>
                    {t('mirror.fit')}
                </label>
                <select
                    value={fit}
                    onChange={(e) => {
                        const next = tabFitOf(e.target.value);
                        setO({ tabFit: next === 'width' ? undefined : next });
                    }}
                    className={inputCls}
                    style={inputStyle}
                    data-aura-mirror-fit
                >
                    <option value="width">{t('mirror.fitWidth')}</option>
                    <option value="contain">{t('mirror.fitContain')}</option>
                    <option value="none">{t('mirror.fitNone')}</option>
                </select>
            </div>
            {fit !== 'none' && (
                <div>
                    <label className={labelCls} style={labelStyle}>
                        {t('mirror.tabWidth')}
                    </label>
                    <input
                        type="number"
                        min={0}
                        step={10}
                        value={tabWidth || ''}
                        placeholder={t('mirror.tabWidthAuto')}
                        onChange={(e) => {
                            const n = Math.max(0, Math.round(Number(e.target.value) || 0));
                            setO({ tabWidth: n > 0 ? n : undefined });
                        }}
                        className={inputCls}
                        style={inputStyle}
                    />
                </div>
            )}
        </div>
    );
}

function WidgetSourcePicker({ config, onConfigChange }: Props) {
    const t = useT();
    const layouts = useDashboardStore((s) => s.layouts);
    const [search, setSearch] = useState('');

    const selectedId = (config.options?.targetWidgetId as string | undefined) ?? '';

    // Candidates: every widget on the dashboard, except this mirror itself and any
    // other mirror (no mirror chains → no cycles).
    const allWidgets = layouts.flatMap((l) => l.sections.flatMap((s) => s.tabs.flatMap((t) => t.widgets)));
    const candidates = allWidgets
        .filter((w) => w.id !== config.id && w.type !== 'mirror')
        .sort((a, b) => (a.title || a.type).localeCompare(b.title || b.type, 'de'))
        .filter((w) => {
            if (!search) return true;
            const q = search.toLowerCase();
            return (
                (w.title || w.type).toLowerCase().includes(q) ||
                w.id.toLowerCase().includes(q) ||
                w.type.toLowerCase().includes(q)
            );
        });

    const select = (id: string | undefined) => {
        // Make the mirror start out as a visual clone of the source: adopt its
        // size (w/h — the mirror keeps its own position x/y) and the frame-level
        // appearance options WidgetFrame reads from the mirror's OWN config
        // (transparent/transparency/styleOverride/bgImage). The content already comes
        // from the source live via MirrorWidget, but those frame options don't —
        // so without copying them a mirror of e.g. a transparent group would
        // still draw a card. Picking "— Kein Widget —" leaves everything as is.
        const target = id ? allWidgets.find((w) => w.id === id) : undefined;
        if (!target) {
            onConfigChange({ ...config, options: { ...config.options, targetWidgetId: id } });
            return;
        }
        onConfigChange({
            ...config,
            gridPos: { ...config.gridPos, w: target.gridPos.w, h: target.gridPos.h },
            options: {
                ...config.options,
                targetWidgetId: id,
                transparent: target.options?.transparent,
                transparency: target.options?.transparency,
                styleOverride: target.options?.styleOverride,
                bgImage: target.options?.bgImage,
            },
        });
    };

    const rowStyle = (id: string): React.CSSProperties => ({
        padding: '4px 8px',
        cursor: 'pointer',
        background: selectedId === id ? 'var(--accent)' : 'transparent',
        color: selectedId === id ? '#fff' : 'var(--text-primary)',
        borderRadius: 4,
    });

    return (
        <div className="space-y-1.5">
            <label className={labelCls} style={labelStyle}>
                {t('mirror.widget')}
            </label>
            <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('mirror.widgetSearch')}
                className={inputCls}
                style={inputStyle}
            />
            <div style={{ ...inputStyle, padding: '4px', maxHeight: 220, overflowY: 'auto', borderRadius: 8 }}>
                {/* header */}
                <div
                    className="grid gap-x-2 px-2 pb-1 text-[10px]"
                    style={{
                        gridTemplateColumns: '1fr 90px 1fr',
                        color: 'var(--text-secondary)',
                        borderBottom: '1px solid var(--app-border)',
                    }}
                >
                    <span>{t('mirror.colTitle')}</span>
                    <span>{t('mirror.colType')}</span>
                    <span>{t('mirror.colId')}</span>
                </div>
                {/* "none" row */}
                <div
                    className="grid gap-x-2 px-2 rounded text-xs"
                    style={{ ...rowStyle(''), gridTemplateColumns: '1fr 90px 1fr' }}
                    onClick={() => select(undefined)}
                >
                    <span className="truncate italic">{t('mirror.noWidget')}</span>
                    <span />
                    <span />
                </div>
                {candidates.map((w) => (
                    <div
                        key={w.id}
                        className="grid gap-x-2 px-2 rounded text-xs"
                        style={{ ...rowStyle(w.id), gridTemplateColumns: '1fr 90px 1fr' }}
                        onClick={() => select(w.id)}
                    >
                        <span className="truncate">{w.title || '–'}</span>
                        <span className="truncate" style={{ opacity: 0.75 }}>
                            {w.type}
                        </span>
                        <span className="truncate" style={{ opacity: 0.6, fontFamily: 'monospace' }}>
                            {w.id}
                        </span>
                    </div>
                ))}
                {candidates.length === 0 && (
                    <div className="px-2 py-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {t('mirror.noWidgets')}
                    </div>
                )}
            </div>
        </div>
    );
}
