import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useDashboardStore, type TabBarSettings, type TabBarItem } from '../../../../store/dashboardStore';
import { useT } from '../../../../i18n';

// ── ColorInput ──────────────────────────────────────────────────────────────

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
    const isHex = /^#[0-9a-fA-F]{3,8}$/.test(value);
    return (
        <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                {label}
            </label>
            <div className="flex items-center gap-1.5">
                <input
                    type="color"
                    value={isHex ? value : '#888888'}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-8 h-7 rounded cursor-pointer border-0 p-0.5 shrink-0"
                    style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                />
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="var(--accent) oder #hex"
                    className="flex-1 text-xs rounded-lg px-2 py-1.5 focus:outline-none font-mono"
                    style={{
                        background: 'var(--app-bg)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--app-border)',
                    }}
                />
                {value && (
                    <button
                        onClick={() => onChange('')}
                        className="shrink-0 hover:opacity-70"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        <X size={12} />
                    </button>
                )}
            </div>
        </div>
    );
}

// ── TabBarItemRow ───────────────────────────────────────────────────────────

function TabBarItemRow({
    item,
    onUpdate,
    onRemove,
    t,
}: {
    item: TabBarItem;
    onUpdate: (patch: Partial<TabBarItem>) => void;
    onRemove: () => void;
    t: ReturnType<typeof useT>;
}) {
    const [expanded, setExpanded] = useState(false);
    const posLabels: Record<string, string> = {
        left: t('settings.tabBar.posLeft'),
        center: t('settings.tabBar.posCenter'),
        right: t('settings.tabBar.posRight'),
    };
    const typeLabel =
        item.type === 'clock'
            ? t('settings.tabBar.itemTypeClock')
            : item.type === 'datapoint'
              ? t('settings.tabBar.itemTypeDatapoint')
              : t('settings.tabBar.itemTypeText');

    const iSty = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };

    return (
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
            <div className="flex items-center gap-2 px-2 py-1.5" style={{ background: 'var(--app-bg)' }}>
                <div className="flex gap-0.5 shrink-0">
                    {(['left', 'center', 'right'] as const).map((pos) => (
                        <button
                            key={pos}
                            onClick={() => onUpdate({ position: pos })}
                            title={posLabels[pos]}
                            className="w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center transition-colors"
                            style={{
                                background: item.position === pos ? 'var(--accent)' : 'var(--app-surface)',
                                color: item.position === pos ? '#fff' : 'var(--text-secondary)',
                                border: `1px solid ${item.position === pos ? 'var(--accent)' : 'var(--app-border)'}`,
                            }}
                        >
                            {pos === 'left' ? 'L' : pos === 'center' ? 'M' : 'R'}
                        </button>
                    ))}
                </div>
                <span className="text-xs flex-1 font-medium" style={{ color: 'var(--text-primary)' }}>
                    {typeLabel}
                </span>
                <button
                    onClick={() => setExpanded((e) => !e)}
                    className="text-[10px] px-1.5 py-0.5 rounded hover:opacity-70"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    {expanded ? '▲' : '▼'}
                </button>
                <button onClick={onRemove} className="hover:opacity-70 shrink-0" style={{ color: 'var(--accent-red)' }}>
                    <X size={13} />
                </button>
            </div>

            {expanded && (
                <div className="px-2 py-2 space-y-2 border-t" style={{ borderColor: 'var(--app-border)' }}>
                    {item.type === 'clock' && (
                        <>
                            <div>
                                <p className="text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>
                                    {t('settings.tabBar.clockDisplay')}
                                </p>
                                <div className="flex gap-1 flex-wrap">
                                    {(['time', 'date', 'datetime'] as const).map((v) => {
                                        const labels = {
                                            time: t('wf.clock.timeOnly'),
                                            date: t('wf.clock.dateOnly'),
                                            datetime: t('wf.clock.datetime'),
                                        };
                                        const active = (item.clockDisplay ?? 'time') === v;
                                        return (
                                            <button
                                                key={v}
                                                onClick={() => onUpdate({ clockDisplay: v })}
                                                className="px-2 py-1 rounded-lg text-xs font-medium hover:opacity-80"
                                                style={{
                                                    background: active ? 'var(--accent)' : 'var(--app-bg)',
                                                    color: active ? '#fff' : 'var(--text-secondary)',
                                                    border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                                }}
                                            >
                                                {labels[v]}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            {(item.clockDisplay ?? 'time') !== 'date' && (
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                        {t('settings.tabBar.clockSeconds')}
                                    </span>
                                    <button
                                        onClick={() => onUpdate({ clockShowSeconds: !item.clockShowSeconds })}
                                        className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                                        style={{
                                            background: item.clockShowSeconds ? 'var(--accent)' : 'var(--app-border)',
                                        }}
                                    >
                                        <span
                                            className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                                            style={{ left: item.clockShowSeconds ? '18px' : '2px' }}
                                        />
                                    </button>
                                </div>
                            )}
                            {(item.clockDisplay ?? 'time') !== 'time' && (
                                <div>
                                    <p className="text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>
                                        {t('settings.tabBar.clockDateLen')}
                                    </p>
                                    <div className="flex gap-1">
                                        {(['short', 'long'] as const).map((v) => {
                                            const labels = { short: t('wf.clock.short'), long: t('wf.clock.long') };
                                            const active = (item.clockDateLength ?? 'short') === v;
                                            return (
                                                <button
                                                    key={v}
                                                    onClick={() => onUpdate({ clockDateLength: v })}
                                                    className="px-2 py-1 rounded-lg text-xs font-medium hover:opacity-80"
                                                    style={{
                                                        background: active ? 'var(--accent)' : 'var(--app-bg)',
                                                        color: active ? '#fff' : 'var(--text-secondary)',
                                                        border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                                    }}
                                                >
                                                    {labels[v]}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            <div>
                                <p className="text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>
                                    {t('settings.tabBar.clockCustom')}
                                </p>
                                <input
                                    type="text"
                                    value={item.clockCustomFormat ?? ''}
                                    onChange={(e) => onUpdate({ clockCustomFormat: e.target.value || undefined })}
                                    placeholder="HH:mm:ss"
                                    className="w-full text-xs rounded-lg px-2 py-1.5 focus:outline-none font-mono"
                                    style={iSty}
                                />
                            </div>
                        </>
                    )}
                    {item.type === 'datapoint' && (
                        <>
                            <div>
                                <p className="text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>
                                    {t('settings.tabBar.datapointId')}
                                </p>
                                <input
                                    type="text"
                                    value={item.datapointId ?? ''}
                                    onChange={(e) => onUpdate({ datapointId: e.target.value || undefined })}
                                    placeholder="hm-rpc.0.ABC.1.TEMPERATURE"
                                    className="w-full text-xs rounded-lg px-2 py-1.5 focus:outline-none font-mono"
                                    style={iSty}
                                />
                            </div>
                            <div>
                                <p className="text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>
                                    {t('settings.tabBar.datapointTemplate')}
                                </p>
                                <input
                                    type="text"
                                    value={item.datapointTemplate ?? ''}
                                    onChange={(e) => onUpdate({ datapointTemplate: e.target.value || undefined })}
                                    placeholder="{dp} °C"
                                    className="w-full text-xs rounded-lg px-2 py-1.5 focus:outline-none font-mono"
                                    style={iSty}
                                />
                            </div>
                        </>
                    )}
                    {item.type === 'text' && (
                        <div>
                            <p className="text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>
                                {t('settings.tabBar.staticText')}
                            </p>
                            <input
                                type="text"
                                value={item.text ?? ''}
                                onChange={(e) => onUpdate({ text: e.target.value || undefined })}
                                placeholder="Mein Dashboard"
                                className="w-full text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                                style={iSty}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ── TabBarSection ───────────────────────────────────────────────────────────

interface TabBarSectionProps {
    contextId: string | null;
}

export function TabBarSection({ contextId }: TabBarSectionProps) {
    const t = useT();
    const layouts = useDashboardStore((s) => s.layouts);
    const updateLayoutSettings = useDashboardStore((s) => s.updateLayoutSettings);
    const clearLayoutSettings = useDashboardStore((s) => s.clearLayoutSettings);

    const layout = contextId ? layouts.find((l) => l.id === contextId) : null;
    if (!layout) {
        return (
            <div
                className="rounded-xl p-6 text-center"
                style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
            >
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {t('layouts.subtab.tabbarHiddenHint')}
                </p>
            </div>
        );
    }

    const tbs: TabBarSettings = layout.settings?.tabBar ?? {};

    const update = (patch: Partial<TabBarSettings>) => {
        updateLayoutSettings(layout.id, { tabBar: { ...(layout.settings?.tabBar ?? {}), ...patch } });
    };
    const updateItem = (id: string, patch: Partial<TabBarItem>) => {
        update({ items: (tbs.items ?? []).map((it) => (it.id === id ? { ...it, ...patch } : it)) });
    };
    const removeItem = (id: string) => {
        update({ items: (tbs.items ?? []).filter((it) => it.id !== id) });
    };
    const addItem = (type: TabBarItem['type']) => {
        const newItem: TabBarItem = {
            id: `tbi-${Date.now()}`,
            type,
            position: 'right',
            ...(type === 'clock' ? { clockDisplay: 'time' } : {}),
        };
        update({ items: [...(tbs.items ?? []), newItem] });
    };
    const clearAll = () => {
        clearLayoutSettings(layout.id, 'tabBar');
    };
    const hasOverride = !!layout.settings?.tabBar && Object.keys(layout.settings.tabBar).length > 0;

    const styleOptions: Array<{ key: TabBarSettings['indicatorStyle']; label: string }> = [
        { key: 'underline', label: t('settings.tabBar.styleUnderline') },
        { key: 'filled', label: t('settings.tabBar.styleFilled') },
        { key: 'pills', label: t('settings.tabBar.stylePills') },
    ];
    const fontOptions: Array<{ key: TabBarSettings['fontSize']; label: string }> = [
        { key: 'sm', label: t('settings.tabBar.fontSm') },
        { key: 'md', label: t('settings.tabBar.fontMd') },
        { key: 'lg', label: t('settings.tabBar.fontLg') },
    ];
    const alignOptions: Array<{ key: TabBarSettings['tabsAlignment']; label: string }> = [
        { key: 'left', label: t('settings.tabBar.alignLeft') },
        { key: 'center', label: t('settings.tabBar.alignCenter') },
        { key: 'right', label: t('settings.tabBar.alignRight') },
    ];

    return (
        <div
            className="rounded-xl p-4 space-y-4"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
            <div className="flex items-center justify-between">
                <p
                    className="text-xs font-semibold uppercase tracking-widest"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    {t('settings.tabBar.title')}
                </p>
                {hasOverride && (
                    <button
                        onClick={clearAll}
                        className="text-[10px] px-1.5 py-0.5 rounded hover:opacity-70"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        {t('settings.tabBar.clearAll')}
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {/* Col 1: Height + Style + Font + Alignment */}
                <div className="space-y-4">
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                                {t('settings.tabBar.height')}
                            </p>
                            <span
                                className="text-xs font-mono font-bold px-2 py-0.5 rounded-md"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--accent)',
                                    border: '1px solid var(--app-border)',
                                }}
                            >
                                {tbs.height ?? 40}px
                            </span>
                        </div>
                        <input
                            type="range"
                            min={28}
                            max={72}
                            step={2}
                            value={tbs.height ?? 40}
                            onChange={(e) => update({ height: Number(e.target.value) })}
                            className="w-full accent-[var(--accent)] mb-2"
                        />
                        <div className="flex gap-1.5 flex-wrap">
                            {[32, 36, 40, 48, 56].map((v) => {
                                const active = (tbs.height ?? 40) === v;
                                return (
                                    <button
                                        key={v}
                                        onClick={() => update({ height: v })}
                                        className="px-2 py-1 rounded-lg text-xs font-medium hover:opacity-80"
                                        style={{
                                            background: active ? 'var(--accent)' : 'var(--app-bg)',
                                            color: active ? '#fff' : 'var(--text-secondary)',
                                            border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                        }}
                                    >
                                        {v}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <p className="text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
                            {t('settings.tabBar.style')}
                        </p>
                        <div className="flex gap-1.5">
                            {styleOptions.map(({ key, label }) => {
                                const active = (tbs.indicatorStyle ?? 'underline') === key;
                                return (
                                    <button
                                        key={key}
                                        onClick={() => update({ indicatorStyle: key })}
                                        className="flex-1 py-1.5 rounded-lg text-xs font-medium hover:opacity-80"
                                        style={{
                                            background: active ? 'var(--accent)' : 'var(--app-bg)',
                                            color: active ? '#fff' : 'var(--text-secondary)',
                                            border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                        }}
                                    >
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <p className="text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
                            {t('settings.tabBar.fontSize')}
                        </p>
                        <div className="flex gap-1.5">
                            {fontOptions.map(({ key, label }) => {
                                const active = (tbs.fontSize ?? 'md') === key;
                                return (
                                    <button
                                        key={key}
                                        onClick={() => update({ fontSize: key })}
                                        className="flex-1 py-1.5 rounded-lg text-xs font-medium hover:opacity-80"
                                        style={{
                                            background: active ? 'var(--accent)' : 'var(--app-bg)',
                                            color: active ? '#fff' : 'var(--text-secondary)',
                                            border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                        }}
                                    >
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <p className="text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
                            {t('settings.tabBar.tabsAlignment')}
                        </p>
                        <div className="flex gap-1.5">
                            {alignOptions.map(({ key, label }) => {
                                const active = (tbs.tabsAlignment ?? 'left') === key;
                                return (
                                    <button
                                        key={key}
                                        onClick={() => update({ tabsAlignment: key })}
                                        className="flex-1 py-1.5 rounded-lg text-xs font-medium hover:opacity-80"
                                        style={{
                                            background: active ? 'var(--accent)' : 'var(--app-bg)',
                                            color: active ? '#fff' : 'var(--text-secondary)',
                                            border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                        }}
                                    >
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Col 2: Colors */}
                <div className="space-y-3">
                    <ColorInput
                        label={t('settings.tabBar.background')}
                        value={tbs.background ?? ''}
                        onChange={(v) => update({ background: v || undefined })}
                    />
                    <ColorInput
                        label={t('settings.tabBar.activeColor')}
                        value={tbs.activeColor ?? ''}
                        onChange={(v) => update({ activeColor: v || undefined })}
                    />
                    <ColorInput
                        label={t('settings.tabBar.inactiveColor')}
                        value={tbs.inactiveColor ?? ''}
                        onChange={(v) => update({ inactiveColor: v || undefined })}
                    />
                </div>

                {/* Col 3: Items */}
                <div>
                    <p className="text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
                        {t('settings.tabBar.items')}
                    </p>
                    <div className="space-y-1.5">
                        {(tbs.items ?? []).map((item) => (
                            <TabBarItemRow
                                key={item.id}
                                item={item}
                                onUpdate={(patch) => updateItem(item.id, patch)}
                                onRemove={() => removeItem(item.id)}
                                t={t}
                            />
                        ))}
                    </div>
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                        {(['clock', 'datapoint', 'text'] as const).map((type) => {
                            const label =
                                type === 'clock'
                                    ? t('settings.tabBar.itemTypeClock')
                                    : type === 'datapoint'
                                      ? t('settings.tabBar.itemTypeDatapoint')
                                      : t('settings.tabBar.itemTypeText');
                            return (
                                <button
                                    key={type}
                                    onClick={() => addItem(type)}
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium hover:opacity-80"
                                    style={{
                                        background: 'var(--app-bg)',
                                        color: 'var(--text-secondary)',
                                        border: '1px solid var(--app-border)',
                                    }}
                                >
                                    <Plus size={11} /> {label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
