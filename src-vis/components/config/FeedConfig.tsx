/**
 * FeedConfig — settings of the news widget (#854): the feeds (an RSS/Atom
 * address or a state of the ioBroker.rssfeed adapter), what an article shows,
 * filters, and what a tap on an article does.
 */
import { useEffect, useState } from 'react';
import { Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import { ConfigSection } from './ConfigSection';
import { ColorPicker } from '../common/ColorPicker';
import type { FeedSource, WidgetConfig, WidgetLayout } from '../../types';
import { getObjectViewDirect } from '../../hooks/useIoBroker';
import { useT } from '../../i18n';
import {
    FEED_COLORS,
    FEED_DATE_MODES,
    FEED_DEFAULTS,
    FEED_IMAGE_PROXY,
    FEED_OPEN_MODES,
    feedSources,
    type FeedDateMode,
    type FeedImageProxy,
    type FeedOpenMode,
} from '../widgets/FeedWidget';

interface Props {
    config: WidgetConfig;
    onConfigChange: (config: WidgetConfig) => void;
}

const fieldCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const fieldSty: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const smallCls = 'flex-1 min-w-0 text-xs rounded px-2 py-1 focus:outline-none';
const labelCls = 'text-[11px] mb-1 block';
const labelSty: React.CSSProperties = { color: 'var(--text-secondary)' };
const hintSty: React.CSSProperties = { color: 'var(--text-secondary)', opacity: 0.7 };

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="rounded" />
            <span className="text-[11px]" style={labelSty}>
                {label}
            </span>
        </label>
    );
}

function NumberField({
    label,
    value,
    min,
    max,
    onChange,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    onChange: (v: number) => void;
}) {
    return (
        <div className="flex-1 min-w-0">
            <label className={labelCls} style={labelSty}>
                {label}
            </label>
            <input
                type="number"
                min={min}
                max={max}
                value={value}
                onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
                }}
                className={fieldCls}
                style={fieldSty}
            />
        </div>
    );
}

function Select<T extends string>({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: T;
    options: { id: T; label: string }[];
    onChange: (v: T) => void;
}) {
    return (
        <div>
            <label className={labelCls} style={labelSty}>
                {label}
            </label>
            <select value={value} onChange={(e) => onChange(e.target.value as T)} className={fieldCls} style={fieldSty}>
                {options.map((o) => (
                    <option key={o.id} value={o.id}>
                        {o.label}
                    </option>
                ))}
            </select>
        </div>
    );
}

/** States of all rssfeed instances that hold a feed (everything but info.*). */
function useRssfeedStates(active: boolean): { ids: string[]; loading: boolean } {
    const [ids, setIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    useEffect(() => {
        if (!active) return;
        let cancelled = false;
        setLoading(true);
        void getObjectViewDirect('state', 'rssfeed.', 'rssfeed.香').then((res) => {
            if (cancelled) return;
            setIds(
                (res.rows ?? [])
                    .map((r) => r.id)
                    .filter((id) => /^rssfeed\.\d+\./.test(id) && !/^rssfeed\.\d+\.info\./.test(id))
                    .sort(),
            );
            setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [active]);
    return { ids, loading };
}

function SourcesEditor({ sources, onChange }: { sources: FeedSource[]; onChange: (s: FeedSource[]) => void }) {
    const t = useT();
    const [adding, setAdding] = useState(sources.length === 0);
    const [type, setType] = useState<FeedSource['type']>('url');
    const [url, setUrl] = useState('');
    const [dp, setDp] = useState('');
    const [name, setName] = useState('');
    const rss = useRssfeedStates(adding && type === 'adapter');

    useEffect(() => {
        if (type === 'adapter' && !dp && rss.ids.length) setDp(rss.ids[0]);
    }, [type, dp, rss.ids]);

    const update = (id: string, patch: Partial<FeedSource>) =>
        onChange(sources.map((s) => (s.id === id ? { ...s, ...patch } : s)));

    const target = type === 'adapter' ? dp.trim() : url.trim();
    const add = () => {
        if (!target) return;
        const next: FeedSource = {
            id: Date.now().toString(36),
            type,
            ...(type === 'adapter' ? { datapoint: target } : { url: target }),
            ...(name.trim() ? { name: name.trim() } : {}),
            color: FEED_COLORS[sources.length % FEED_COLORS.length],
        };
        onChange([...sources, next]);
        setUrl('');
        setDp('');
        setName('');
        setAdding(false);
    };

    return (
        <div className="space-y-1.5">
            {sources.map((s) => (
                <div
                    key={s.id}
                    data-aura-feed-source={s.id}
                    className="rounded-lg p-2 space-y-1"
                    style={{ ...fieldSty, opacity: s.enabled === false ? 0.55 : 1 }}
                >
                    <div className="flex items-center gap-1.5">
                        <ColorPicker
                            value={s.color || FEED_COLORS[sources.indexOf(s) % FEED_COLORS.length]}
                            onChange={(v) => update(s.id, { color: v || undefined })}
                            dual={false}
                            className="w-5 h-5 rounded cursor-pointer border-0 p-0 shrink-0"
                        />
                        <input
                            type="text"
                            value={s.name ?? ''}
                            onChange={(e) => update(s.id, { name: e.target.value || undefined })}
                            placeholder={t('feed.cfg.nameAuto')}
                            className={smallCls}
                            style={{ ...fieldSty, background: 'var(--app-surface)' }}
                        />
                        <button
                            type="button"
                            onClick={() => update(s.id, { enabled: s.enabled === false ? undefined : false })}
                            className="hover:opacity-70 shrink-0"
                            style={{ color: 'var(--text-secondary)' }}
                            title={t(s.enabled === false ? 'feed.cfg.show' : 'feed.cfg.hide')}
                        >
                            {s.enabled === false ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                        <button
                            type="button"
                            onClick={() => onChange(sources.filter((x) => x.id !== s.id))}
                            className="hover:opacity-70 shrink-0"
                            style={{ color: 'var(--accent-red)' }}
                            title={t('feed.cfg.remove')}
                        >
                            <Trash2 size={12} />
                        </button>
                    </div>
                    <p className="text-[10px] font-mono truncate" style={labelSty}>
                        {s.type === 'adapter' ? `${t('feed.cfg.srcAdapter')}: ${s.datapoint}` : s.url}
                    </p>
                </div>
            ))}

            {adding ? (
                <div className="rounded-lg p-2 space-y-1.5" style={fieldSty}>
                    <div className="flex gap-1">
                        {(['url', 'adapter'] as const).map((k) => (
                            <button
                                key={k}
                                type="button"
                                data-aura-feed-type={k}
                                onClick={() => setType(k)}
                                className="flex-1 py-1 text-[11px] rounded-md hover:opacity-80"
                                style={{
                                    background: type === k ? 'var(--accent)' : 'var(--app-surface)',
                                    color: type === k ? '#fff' : 'var(--text-secondary)',
                                    border: '1px solid var(--app-border)',
                                }}
                            >
                                {t(k === 'adapter' ? 'feed.cfg.srcAdapter' : 'feed.cfg.srcUrl')}
                            </button>
                        ))}
                    </div>
                    {type === 'adapter' ? (
                        rss.ids.length ? (
                            <select
                                value={dp}
                                onChange={(e) => setDp(e.target.value)}
                                className={fieldCls}
                                style={fieldSty}
                            >
                                {rss.ids.map((id) => (
                                    <option key={id} value={id}>
                                        {id}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <>
                                <p className="text-[10px]" style={hintSty}>
                                    {t(rss.loading ? 'feed.cfg.adapterLoading' : 'feed.cfg.noAdapter')}
                                </p>
                                <input
                                    type="text"
                                    value={dp}
                                    onChange={(e) => setDp(e.target.value)}
                                    placeholder="rssfeed.0.ntv"
                                    className={`${fieldCls} font-mono`}
                                    style={fieldSty}
                                />
                            </>
                        )
                    ) : (
                        <input
                            type="url"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && add()}
                            placeholder="https://www.n-tv.de/rss"
                            className={`${fieldCls} font-mono`}
                            style={fieldSty}
                            data-aura-feed-url=""
                        />
                    )}
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t('feed.cfg.nameAuto')}
                        className={fieldCls}
                        style={fieldSty}
                    />
                    <div className="flex gap-1.5">
                        <button
                            type="button"
                            data-aura-feed-add-confirm=""
                            disabled={!target}
                            onClick={add}
                            className="flex-1 py-1.5 text-xs rounded-lg hover:opacity-80 disabled:opacity-40"
                            style={{ background: 'var(--accent)', color: '#fff' }}
                        >
                            {t('feed.cfg.add')}
                        </button>
                        {sources.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setAdding(false)}
                                className="px-3 py-1.5 text-xs rounded-lg hover:opacity-80"
                                style={{ ...fieldSty, color: 'var(--text-secondary)' }}
                            >
                                {t('feed.cfg.cancel')}
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    data-aura-feed-add=""
                    onClick={() => setAdding(true)}
                    className="w-full flex items-center justify-center gap-1 py-1.5 text-xs rounded-lg hover:opacity-80"
                    style={{ ...fieldSty, color: 'var(--text-secondary)', borderStyle: 'dashed' }}
                >
                    <Plus size={12} /> {t('feed.cfg.addFeed')}
                </button>
            )}
        </div>
    );
}

export function FeedConfig({ config, onConfigChange }: Props) {
    const t = useT();
    const o = config.options ?? {};
    const set = (patch: Record<string, unknown>) => onConfigChange({ ...config, options: { ...o, ...patch } });
    const layout = (config.layout as WidgetLayout | undefined) ?? 'default';
    const sources = feedSources(o.feeds as FeedSource[] | undefined);
    const showSource = typeof o.showSource === 'boolean' ? (o.showSource ? 'on' : 'off') : 'auto';

    return (
        <>
            <ConfigSection
                title={t('feed.cfg.feeds')}
                sectionKey="datapoints"
                count={sources.length ? String(sources.length) : undefined}
            >
                <SourcesEditor sources={sources} onChange={(feeds) => set({ feeds })} />
                <div className="flex gap-2">
                    <NumberField
                        label={t('feed.cfg.maxItems')}
                        value={Number(o.maxItems) || FEED_DEFAULTS.maxItems}
                        min={1}
                        max={100}
                        onChange={(v) => set({ maxItems: v })}
                    />
                    <NumberField
                        label={t('feed.cfg.refresh')}
                        value={Number(o.refreshMin) || FEED_DEFAULTS.refreshMin}
                        min={5}
                        max={1440}
                        onChange={(v) => set({ refreshMin: v })}
                    />
                </div>
                <p className="text-[10px] -mt-1" style={hintSty}>
                    {t('feed.cfg.refreshHint')}
                </p>
            </ConfigSection>

            <ConfigSection title={t('cfg.section.look')} sectionKey="look">
                {layout !== 'ticker' && (
                    <>
                        <Check
                            checked={o.showImage !== false}
                            onChange={(v) => set({ showImage: v ? undefined : false })}
                            label={t('feed.cfg.showImage')}
                        />
                        {o.showImage !== false && (
                            <>
                                <Select
                                    label={t('feed.cfg.imageProxy')}
                                    value={(o.imageProxy as FeedImageProxy | undefined) ?? FEED_DEFAULTS.imageProxy}
                                    options={FEED_IMAGE_PROXY.map((id) => ({ id, label: t(`feed.imageProxy.${id}`) }))}
                                    onChange={(v) =>
                                        set({ imageProxy: v === FEED_DEFAULTS.imageProxy ? undefined : v })
                                    }
                                />
                                <p className="text-[10px] -mt-1" style={hintSty}>
                                    {t('feed.cfg.imageProxyHint')}
                                </p>
                            </>
                        )}
                        <Check
                            checked={o.showSummary === true}
                            onChange={(v) => set({ showSummary: v || undefined })}
                            label={t('feed.cfg.showSummary')}
                        />
                        {o.showSummary === true && (
                            <NumberField
                                label={t('feed.cfg.summaryLines')}
                                value={Number(o.summaryLines) || FEED_DEFAULTS.summaryLines}
                                min={1}
                                max={10}
                                onChange={(v) => set({ summaryLines: v })}
                            />
                        )}
                        <Select
                            label={t('feed.cfg.showDate')}
                            value={(o.showDate as FeedDateMode | undefined) ?? FEED_DEFAULTS.showDate}
                            options={FEED_DATE_MODES.map((id) => ({ id, label: t(`feed.date.${id}`) }))}
                            onChange={(v) => set({ showDate: v === FEED_DEFAULTS.showDate ? undefined : v })}
                        />
                    </>
                )}
                <Select
                    label={t('feed.cfg.showSource')}
                    value={showSource}
                    options={[
                        { id: 'auto', label: t('feed.source.auto') },
                        { id: 'on', label: t('feed.source.on') },
                        { id: 'off', label: t('feed.source.off') },
                    ]}
                    onChange={(v) => set({ showSource: v === 'auto' ? undefined : v === 'on' })}
                />
                {layout === 'ticker' && (
                    <NumberField
                        label={t('feed.cfg.tickerSpeed')}
                        value={Number(o.tickerSpeed) || FEED_DEFAULTS.tickerSpeed}
                        min={10}
                        max={400}
                        onChange={(v) => set({ tickerSpeed: v })}
                    />
                )}
                {layout === 'single' && (
                    <NumberField
                        label={t('feed.cfg.rotate')}
                        value={Number(o.rotateSec) || FEED_DEFAULTS.rotateSec}
                        min={2}
                        max={600}
                        onChange={(v) => set({ rotateSec: v })}
                    />
                )}
            </ConfigSection>

            <ConfigSection title={t('feed.cfg.filter')} sectionKey="filter">
                <div>
                    <label className={labelCls} style={labelSty}>
                        {t('feed.cfg.include')}
                    </label>
                    <input
                        type="text"
                        value={(o.includeKeywords as string | undefined) ?? ''}
                        onChange={(e) => set({ includeKeywords: e.target.value || undefined })}
                        placeholder={t('feed.cfg.keywordsPlaceholder')}
                        className={fieldCls}
                        style={fieldSty}
                    />
                </div>
                <div>
                    <label className={labelCls} style={labelSty}>
                        {t('feed.cfg.exclude')}
                    </label>
                    <input
                        type="text"
                        value={(o.excludeKeywords as string | undefined) ?? ''}
                        onChange={(e) => set({ excludeKeywords: e.target.value || undefined })}
                        placeholder={t('feed.cfg.keywordsPlaceholder')}
                        className={fieldCls}
                        style={fieldSty}
                    />
                </div>
                <NumberField
                    label={t('feed.cfg.maxAge')}
                    value={Number(o.maxAgeHours) || 0}
                    min={0}
                    max={720}
                    onChange={(v) => set({ maxAgeHours: v || undefined })}
                />
            </ConfigSection>

            <ConfigSection title={t('cfg.section.behavior')} sectionKey="behavior">
                <Select
                    label={t('feed.cfg.openMode')}
                    value={(o.openMode as FeedOpenMode | undefined) ?? FEED_DEFAULTS.openMode}
                    options={FEED_OPEN_MODES.map((id) => ({ id, label: t(`feed.open.${id}`) }))}
                    onChange={(v) => set({ openMode: v === FEED_DEFAULTS.openMode ? undefined : v })}
                />
                <p className="text-[10px] -mt-1" style={hintSty}>
                    {t('feed.cfg.openHint')}
                </p>
            </ConfigSection>

            <ConfigSection title={t('feed.cfg.newSection')} sectionKey="news">
                <Check
                    checked={o.markNew === true}
                    onChange={(v) => set({ markNew: v || undefined })}
                    label={t('feed.cfg.markNew')}
                />
                <p className="text-[10px] -mt-1" style={hintSty}>
                    {t('feed.cfg.markNewHint')}
                </p>
                <Check
                    checked={o.speakNew === true}
                    onChange={(v) => set({ speakNew: v || undefined })}
                    label={t('feed.cfg.speakNew')}
                />
                <p className="text-[10px] -mt-1" style={hintSty}>
                    {t('feed.cfg.speakNewHint')}
                </p>
                <Check
                    checked={o.speakButton === true}
                    onChange={(v) => set({ speakButton: v || undefined })}
                    label={t('feed.cfg.speakButton')}
                />
                {o.speakButton === true && (
                    <NumberField
                        label={t('feed.cfg.speakCount')}
                        value={Number(o.speakCount) || FEED_DEFAULTS.speakCount}
                        min={1}
                        max={20}
                        onChange={(v) => set({ speakCount: v })}
                    />
                )}
            </ConfigSection>
        </>
    );
}
