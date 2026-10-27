/**
 * News ("Nachrichten", #854) — articles of RSS/Atom feeds or of the
 * ioBroker.rssfeed adapter as a list, cards, a ticker or one rotating headline.
 *
 * URL feeds are fetched by Aura's server (`/feed`, lib/feedProxy.js: cached,
 * stale copy on failure) and parsed here; adapter feeds are read from the
 * rssfeed state. Parsing and merging live in feedParse.ts.
 *
 * Opening an article: `auto` asks the server once per host whether the site
 * lets itself be framed (`/feed/frame`) — before the click, because a new tab
 * opened after an await is eaten by the popup blocker.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Newspaper } from 'lucide-react';
import type { ClickAction, FeedSource, WidgetLayout, WidgetProps } from '../../types';
import { auraUrl } from '../../utils/basePath';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { subscribeDpValue } from '../../hooks/useIoBroker';
import { useT } from '../../i18n';
import { HeaderGroup, HeaderSlotsInline, HeaderSlotsRow2, TitleRow } from '../layout/HeaderSlotsContext';
import { WidgetClickPopup } from './popup/WidgetClickPopup';
import {
    ageParts,
    decodeFeedBytes,
    mergeFeeds,
    parseFeedXml,
    parseRssfeedState,
    type FeedItem,
    type ParsedFeed,
} from './feedParse';

export type FeedDateMode = 'none' | 'relative' | 'time' | 'dateTime';
export type FeedOpenMode = 'auto' | 'popup' | 'newTab' | 'none';

export const FEED_DATE_MODES: FeedDateMode[] = ['relative', 'time', 'dateTime', 'none'];
export const FEED_OPEN_MODES: FeedOpenMode[] = ['auto', 'popup', 'newTab', 'none'];
export const FEED_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

export const FEED_DEFAULTS = {
    maxItems: 10,
    maxAgeHours: 0,
    refreshMin: 15,
    summaryLines: 2,
    showDate: 'relative' as FeedDateMode,
    openMode: 'auto' as FeedOpenMode,
    rotateSec: 8,
    tickerSpeed: 60,
};

/** A swipe needs this many px sideways; less is a tap. */
const SWIPE_PX = 40;

/** `options.feeds` without the junk a hand-edited config can carry. */
export function feedSources(list: FeedSource[] | undefined): FeedSource[] {
    return Array.isArray(list) ? list.filter((s) => s && typeof s === 'object') : [];
}

/** What a source points at — the URL or the rssfeed datapoint. */
export function feedSourceTarget(s: FeedSource): string {
    return ((s.type === 'adapter' ? s.datapoint : s.url) ?? '').trim();
}

// ── loading ─────────────────────────────────────────────────────────────────

type FeedError = 'fetch' | 'parse' | 'adapter';

interface FeedState {
    feed: ParsedFeed | null;
    error: FeedError | null;
    /** The server could not refresh and answered its last good copy. */
    stale: boolean;
    at: number;
}

const EMPTY: FeedState = { feed: null, error: null, stale: false, at: 0 };

async function loadUrlFeed(url: string, ttlS: number): Promise<FeedState> {
    let res: Response;
    try {
        res = await fetch(auraUrl(`/feed?url=${encodeURIComponent(url)}&ttl=${ttlS}`), { cache: 'no-store' });
    } catch {
        return { ...EMPTY, error: 'fetch', at: Date.now() };
    }
    if (!res.ok) return { ...EMPTY, error: 'fetch', at: Date.now() };
    try {
        const text = decodeFeedBytes(await res.arrayBuffer(), res.headers.get('content-type') ?? '');
        return {
            feed: parseFeedXml(text, url),
            error: null,
            stale: res.headers.get('x-aura-stale') === '1',
            at: Number(res.headers.get('x-aura-fetched-at')) || Date.now(),
        };
    } catch {
        return { ...EMPTY, error: 'parse', at: Date.now() };
    }
}

/** One state per source, in source order. */
function useFeeds(sources: FeedSource[], refreshMin: number): FeedState[] {
    const [states, setStates] = useState<Record<string, FeedState>>({});
    const urls = sources.filter((s) => s.type !== 'adapter' && s.url?.trim()).map((s) => s.url!.trim());
    const dps = sources.filter((s) => s.type === 'adapter' && s.datapoint?.trim()).map((s) => s.datapoint!.trim());
    const urlKey = urls.join('\n');
    const dpKey = dps.join('\n');

    useEffect(() => {
        if (!urlKey) return;
        const list = urlKey.split('\n');
        let stopped = false;
        const ttlS = Math.max(60, refreshMin * 60);
        const load = () =>
            list.forEach(
                (url) =>
                    void loadUrlFeed(url, ttlS).then((st) => {
                        if (stopped) return;
                        setStates((prev) => {
                            const old = prev[`u:${url}`];
                            // A failed refresh keeps what was shown, flagged as stale.
                            const next = st.error && old?.feed ? { ...old, stale: true } : st;
                            return { ...prev, [`u:${url}`]: next };
                        });
                    }),
            );
        load();
        const timer = setInterval(load, Math.max(1, refreshMin) * 60_000);
        return () => {
            stopped = true;
            clearInterval(timer);
        };
    }, [urlKey, refreshMin]);

    useEffect(() => {
        if (!dpKey) return;
        const unsubs = dpKey.split('\n').map((dp) =>
            subscribeDpValue(dp, (val, state) => {
                const feed = parseRssfeedState(val);
                setStates((prev) => ({
                    ...prev,
                    [`d:${dp}`]: feed
                        ? { feed, error: null, stale: false, at: state?.ts ?? Date.now() }
                        : { ...EMPTY, error: 'adapter', at: Date.now() },
                }));
            }),
        );
        return () => unsubs.forEach((u) => u());
    }, [dpKey]);

    return sources.map((s) => {
        const target = feedSourceTarget(s);
        if (!target) return EMPTY;
        return states[`${s.type === 'adapter' ? 'd' : 'u'}:${target}`] ?? EMPTY;
    });
}

// ── opening an article ──────────────────────────────────────────────────────

/** host → embeddable, shared by every news widget on the page. */
const frameCache = new Map<string, boolean | Promise<boolean>>();

function hostOf(url: string): string {
    try {
        return new URL(url).host;
    } catch {
        return '';
    }
}

function probeFrame(url: string): void {
    const host = hostOf(url);
    if (!host || frameCache.has(host)) return;
    const p = fetch(auraUrl(`/feed/frame?url=${encodeURIComponent(url)}`), { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : { embeddable: false }))
        .then((b: { embeddable?: boolean }) => b.embeddable === true)
        .catch(() => false)
        .then((ok) => {
            frameCache.set(host, ok);
            return ok;
        });
    frameCache.set(host, p);
}

/** Known answer for the article's host; unknown (still probing) → false. */
function embeddable(url: string): boolean {
    return frameCache.get(hostOf(url)) === true;
}

// ── rendering ───────────────────────────────────────────────────────────────

function useNow(intervalMs: number): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs]);
    return now;
}

const TICKER_CSS = `
@keyframes aura-feed-ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.aura-feed-ticker-track { animation: aura-feed-ticker var(--aura-feed-ticker-s, 30s) linear infinite; }
.aura-feed-ticker:hover .aura-feed-ticker-track { animation-play-state: paused; }
@media (prefers-reduced-motion: reduce) { .aura-feed-ticker-track { animation: none; } }
`;

export function FeedWidget({ config, editMode, onLastChange }: WidgetProps) {
    const t = useT();
    const o = config.options ?? {};
    const layout = (config.layout as WidgetLayout | undefined) ?? 'default';
    const sources = feedSources(o.feeds as FeedSource[] | undefined).filter((s) => s.enabled !== false);
    const refreshMin = Math.max(1, Number(o.refreshMin) || FEED_DEFAULTS.refreshMin);
    const maxItems = Math.max(1, Number(o.maxItems) || FEED_DEFAULTS.maxItems);
    const maxAgeHours = Math.max(0, Number(o.maxAgeHours) || 0);
    const showImage = o.showImage !== false;
    const showSummary = o.showSummary === true;
    const summaryLines = Math.max(1, Number(o.summaryLines) || FEED_DEFAULTS.summaryLines);
    const showDate = (o.showDate as FeedDateMode | undefined) ?? FEED_DEFAULTS.showDate;
    const showSource = typeof o.showSource === 'boolean' ? o.showSource : sources.length > 1;
    const openMode = (o.openMode as FeedOpenMode | undefined) ?? FEED_DEFAULTS.openMode;
    const rotateSec = Math.max(2, Number(o.rotateSec) || FEED_DEFAULTS.rotateSec);
    const tickerSpeed = Math.max(10, Number(o.tickerSpeed) || FEED_DEFAULTS.tickerSpeed);
    const include = typeof o.includeKeywords === 'string' ? o.includeKeywords : '';
    const exclude = typeof o.excludeKeywords === 'string' ? o.excludeKeywords : '';

    const showTitle = o.showTitle !== false;
    const showIcon = o.showIcon !== false;
    const iconSize = (o.iconSize as number) || 20;
    const titleAlign = (o.titleAlign as string) ?? 'left';
    const WidgetIcon = getWidgetIcon(o.icon as string | undefined, Newspaper);

    const states = useFeeds(sources, refreshMin);
    const now = useNow(60_000);

    const items = useMemo(
        () =>
            mergeFeeds(
                states.map((s) => s.feed?.items ?? null),
                { maxItems, maxAgeHours, include, exclude, now },
            ),
        // `now` only matters for the age filter; without one a minute tick need not re-merge.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [states, maxItems, maxAgeHours, include, exclude, maxAgeHours > 0 ? now : 0],
    );

    const lastAt = Math.max(0, ...states.map((s) => s.at));
    useEffect(() => {
        if (lastAt) onLastChange?.(lastAt);
    }, [lastAt, onLastChange]);

    // Probe the article hosts ahead of the click (see header).
    const hostKey = openMode === 'auto' ? [...new Set(items.map((i) => hostOf(i.link)))].join(',') : '';
    useEffect(() => {
        if (!hostKey) return;
        for (const it of items) if (it.link) probeFrame(it.link);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hostKey]);

    const [popup, setPopup] = useState<{ action: ClickAction; title: string } | null>(null);
    const open = useCallback(
        (item: FeedItem, e: React.MouseEvent | React.KeyboardEvent) => {
            if (editMode || !item.link || openMode === 'none') return;
            e.stopPropagation();
            const inPopup = openMode === 'popup' || (openMode === 'auto' && embeddable(item.link));
            if (inPopup) setPopup({ action: { kind: 'popup-iframe', url: item.link }, title: item.title });
            else window.open(item.link, '_blank', 'noopener');
        },
        [editMode, openMode],
    );

    const sourceName = (i: number) => {
        const s = sources[i];
        return s?.name?.trim() || states[i]?.feed?.title || feedSourceTarget(s ?? ({} as FeedSource));
    };
    const sourceColor = (i: number) => sources[i]?.color || FEED_COLORS[i % FEED_COLORS.length];

    const dateLabel = (time: number): string => {
        if (!time || showDate === 'none') return '';
        if (showDate === 'relative') {
            const { n, unit } = ageParts(time, now);
            return t(`feed.age.${unit}`, { n });
        }
        const d = new Date(time);
        const clock = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        if (showDate === 'time') {
            return new Date(now).toDateString() === d.toDateString()
                ? clock
                : `${d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })} ${clock}`;
        }
        return `${d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' })} ${clock}`;
    };

    const failed = sources
        .map((s, i) => ({ s, st: states[i], i }))
        .filter(({ st }) => st.error || st.stale)
        .map(({ i, st }) => `${sourceName(i)}: ${t(st.error ? `feed.error.${st.error}` : 'feed.stale')}`);
    const loading = sources.length > 0 && states.every((s) => !s.feed && !s.error);
    const notice = !sources.length
        ? t('feed.noSources')
        : loading
          ? null
          : states.every((s) => !s.feed)
            ? (failed[0] ?? t('feed.error.fetch'))
            : !items.length
              ? t('feed.empty')
              : null;

    const header = (showTitle || showIcon || failed.length > 0) && (
        <HeaderGroup>
            <TitleRow align={titleAlign} className="flex items-center gap-1 shrink-0 mb-1 min-w-0">
                {showIcon && (
                    <WidgetIcon
                        className="aura-widget-icon"
                        size={iconSize}
                        style={{ '--aura-icon-color': 'var(--text-secondary)', flexShrink: 0 }}
                    />
                )}
                {showTitle && (
                    <p
                        className="aura-widget-title text-xs truncate flex-1 min-w-0"
                        style={{
                            '--aura-title-color': 'var(--text-secondary)',
                            textAlign: titleAlign as React.CSSProperties['textAlign'],
                        }}
                    >
                        {config.title}
                    </p>
                )}
                {failed.length > 0 && !notice && (
                    <span
                        className="aura-feed-warning shrink-0 ml-auto"
                        title={failed.join('\n')}
                        style={{ color: 'var(--accent-yellow, #f59e0b)' }}
                    >
                        <AlertTriangle size={12} />
                    </span>
                )}
                <HeaderSlotsInline />
            </TitleRow>
            <HeaderSlotsRow2 />
        </HeaderGroup>
    );

    const clickable = !editMode && openMode !== 'none';
    const itemProps = (item: FeedItem) => ({
        'data-aura-feed-item': item.id,
        role: clickable && item.link ? 'link' : undefined,
        tabIndex: clickable && item.link ? 0 : undefined,
        onClick: (e: React.MouseEvent) => open(item, e),
        onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'Enter') open(item, e);
        },
        style: { cursor: clickable && item.link ? 'pointer' : undefined },
    });

    const meta = (item: FeedItem) => {
        const date = dateLabel(item.time);
        if (!showSource && !date) return null;
        return (
            <div
                className="aura-feed-meta flex items-center gap-1 text-[11px] leading-tight min-w-0"
                style={{ color: 'var(--text-secondary)' }}
            >
                {showSource && (
                    <>
                        <span
                            className="aura-feed-source-dot w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ background: sourceColor(item.source) }}
                        />
                        <span className="aura-feed-source truncate">{sourceName(item.source)}</span>
                    </>
                )}
                {showSource && date && <span className="shrink-0">·</span>}
                {date && <span className="aura-feed-date shrink-0">{date}</span>}
            </div>
        );
    };

    const summary = (item: FeedItem, lines: number) =>
        item.summary ? (
            <p
                className="aura-feed-summary text-xs leading-snug"
                style={{
                    color: 'var(--text-secondary)',
                    display: '-webkit-box',
                    WebkitBoxOrient: 'vertical',
                    WebkitLineClamp: lines,
                    overflow: 'hidden',
                }}
            >
                {item.summary}
            </p>
        ) : null;

    const image = (item: FeedItem, className: string, style: React.CSSProperties) =>
        showImage && item.image ? (
            <img
                src={item.image}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className={`aura-feed-image ${className}`}
                style={{ objectFit: 'cover', ...style }}
                onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
            />
        ) : null;

    let body: React.ReactNode = null;
    if (notice) {
        body = (
            <div
                className="aura-feed-notice flex-1 flex flex-col items-center justify-center gap-2 p-3 text-center"
                style={{ color: 'var(--text-secondary)' }}
            >
                <Newspaper size={24} strokeWidth={1} />
                <span className="text-xs">{notice}</span>
            </div>
        );
    } else if (loading) {
        body = (
            <div className="flex-1 flex items-center justify-center">
                <div
                    className="w-5 h-5 border-2 rounded-full animate-spin"
                    style={{ borderColor: 'var(--app-border)', borderTopColor: 'var(--accent)' }}
                />
            </div>
        );
    } else if (layout === 'ticker') {
        body = (
            <FeedTicker
                items={items}
                speed={tickerSpeed}
                itemProps={itemProps}
                sourceColor={sourceColor}
                sourceName={showSource ? sourceName : undefined}
            />
        );
    } else if (layout === 'single') {
        body = (
            <FeedSingle
                items={items}
                rotateSec={rotateSec}
                running={!editMode}
                render={(item) => (
                    <div {...itemProps(item)} className="aura-feed-item aura-feed-single flex gap-3 h-full min-h-0">
                        {image(item, 'rounded-lg shrink-0 h-full', { width: '38%', maxWidth: 220 })}
                        <div className="flex flex-col gap-1 min-w-0 flex-1 justify-center">
                            {meta(item)}
                            <p
                                className="aura-feed-title text-base font-semibold leading-snug"
                                style={{
                                    color: 'var(--text-primary)',
                                    display: '-webkit-box',
                                    WebkitBoxOrient: 'vertical',
                                    WebkitLineClamp: 3,
                                    overflow: 'hidden',
                                }}
                            >
                                {item.title}
                            </p>
                            {showSummary && summary(item, summaryLines)}
                        </div>
                    </div>
                )}
            />
        );
    } else if (layout === 'card') {
        body = (
            <div
                className="aura-feed-cards flex-1 min-h-0 overflow-y-auto grid gap-2 content-start"
                // max-content rows: the clipped cards (overflow hidden) would otherwise be
                // squeezed into the widget's height instead of scrolling.
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gridAutoRows: 'max-content' }}
            >
                {items.map((item) => (
                    <div
                        key={`${item.source}:${item.id}`}
                        {...itemProps(item)}
                        className="aura-feed-item aura-feed-card flex flex-col rounded-lg overflow-hidden"
                        style={{
                            ...itemProps(item).style,
                            background: 'var(--app-bg)',
                            border: '1px solid var(--app-border)',
                        }}
                    >
                        {image(item, 'w-full shrink-0', { aspectRatio: '16 / 9' })}
                        <div className="flex flex-col gap-1 p-2 min-w-0">
                            <p
                                className="aura-feed-title text-sm font-medium leading-snug"
                                style={{
                                    color: 'var(--text-primary)',
                                    display: '-webkit-box',
                                    WebkitBoxOrient: 'vertical',
                                    WebkitLineClamp: 3,
                                    overflow: 'hidden',
                                }}
                            >
                                {item.title}
                            </p>
                            {showSummary && summary(item, summaryLines)}
                            {meta(item)}
                        </div>
                    </div>
                ))}
            </div>
        );
    } else {
        body = (
            <div className="aura-feed-list flex-1 min-h-0 overflow-y-auto flex flex-col">
                {items.map((item, idx) => (
                    <div
                        key={`${item.source}:${item.id}`}
                        {...itemProps(item)}
                        className="aura-feed-item aura-feed-row flex gap-2 py-1.5 min-w-0"
                        style={{
                            ...itemProps(item).style,
                            borderTop: idx ? '1px solid var(--app-border)' : undefined,
                        }}
                    >
                        {image(item, 'rounded shrink-0', { width: 48, height: 48 })}
                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                            <p
                                className="aura-feed-title text-sm leading-snug"
                                style={{
                                    color: 'var(--text-primary)',
                                    display: '-webkit-box',
                                    WebkitBoxOrient: 'vertical',
                                    WebkitLineClamp: 2,
                                    overflow: 'hidden',
                                }}
                            >
                                {item.title}
                            </p>
                            {showSummary && summary(item, summaryLines)}
                            {meta(item)}
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="aura-widget-row aura-feed flex flex-col h-full min-h-0" data-aura-feed-layout={layout}>
            {header}
            {body}
            {popup && (
                <WidgetClickPopup
                    widget={config}
                    action={popup.action}
                    titleOverride={popup.title}
                    onClose={() => setPopup(null)}
                />
            )}
        </div>
    );
}

// ── ticker ──────────────────────────────────────────────────────────────────

type ItemProps = (item: FeedItem) => React.HTMLAttributes<HTMLElement> & Record<string, unknown>;

function FeedTicker({
    items,
    speed,
    itemProps,
    sourceColor,
    sourceName,
}: {
    items: FeedItem[];
    speed: number;
    itemProps: ItemProps;
    sourceColor: (i: number) => string;
    sourceName?: (i: number) => string;
}) {
    const trackRef = useRef<HTMLDivElement>(null);
    const [seconds, setSeconds] = useState(30);
    const sig = items.map((i) => i.id).join('|');

    // The track holds the headlines twice and moves by half its width, so the
    // loop has no gap; its duration follows the width for a constant px/s.
    useEffect(() => {
        const el = trackRef.current;
        if (!el) return;
        const measure = () => setSeconds(Math.max(5, el.scrollWidth / 2 / speed));
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, [sig, speed]);

    const run = (copy: number) =>
        items.map((item) => (
            <span
                key={`${copy}:${item.source}:${item.id}`}
                {...(copy ? { 'aria-hidden': true } : {})}
                {...itemProps(item)}
                className="aura-feed-item aura-feed-ticker-item inline-flex items-center gap-1.5 pr-8"
            >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sourceColor(item.source) }} />
                {sourceName && (
                    <span className="aura-feed-source font-semibold" style={{ color: sourceColor(item.source) }}>
                        {sourceName(item.source)}
                    </span>
                )}
                <span className="aura-feed-title" style={{ color: 'var(--text-primary)' }}>
                    {item.title}
                </span>
            </span>
        ));

    return (
        <div className="aura-feed-ticker flex-1 min-h-0 flex items-center overflow-hidden">
            <style>{TICKER_CSS}</style>
            <div
                ref={trackRef}
                className="aura-feed-ticker-track flex whitespace-nowrap text-sm leading-normal"
                style={{ '--aura-feed-ticker-s': `${seconds}s` } as React.CSSProperties}
            >
                {run(0)}
                {run(1)}
            </div>
        </div>
    );
}

// ── single ──────────────────────────────────────────────────────────────────

function FeedSingle({
    items,
    rotateSec,
    running,
    render,
}: {
    items: FeedItem[];
    rotateSec: number;
    running: boolean;
    render: (item: FeedItem) => React.ReactNode;
}) {
    const [index, setIndex] = useState(0);
    const [paused, setPaused] = useState(false);
    const count = items.length;
    const step = useCallback((d: number) => setIndex((i) => (count ? (i + d + count) % count : 0)), [count]);

    useEffect(() => {
        if (!running || paused || count < 2) return;
        const id = setInterval(() => {
            if (!document.hidden) step(1);
        }, rotateSec * 1000);
        return () => clearInterval(id);
    }, [running, paused, count, rotateSec, step, index]);

    const downRef = useRef<{ x: number; y: number } | null>(null);
    const swipedRef = useRef(false);
    const item = items[index % Math.max(1, count)];
    if (!item) return null;

    return (
        <div
            className="aura-feed-single-stage flex-1 min-h-0 flex flex-col gap-1"
            onPointerEnter={(e) => e.pointerType === 'mouse' && setPaused(true)}
            onPointerLeave={() => setPaused(false)}
            onPointerDown={(e) => (downRef.current = { x: e.clientX, y: e.clientY })}
            onPointerUp={(e) => {
                const d = downRef.current;
                downRef.current = null;
                if (!d) return;
                const dx = e.clientX - d.x;
                swipedRef.current = Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(e.clientY - d.y);
                if (swipedRef.current) step(dx < 0 ? 1 : -1);
            }}
            onClickCapture={(e) => {
                // A swipe ends in a click on the article - it must not open it.
                if (!swipedRef.current) return;
                swipedRef.current = false;
                e.stopPropagation();
            }}
            style={{ touchAction: 'pan-y' }}
        >
            <div className="flex-1 min-h-0" key={item.id}>
                {render(item)}
            </div>
            {count > 1 && (
                <div className="aura-feed-dots flex justify-center gap-1 shrink-0">
                    {items.map((it, i) => (
                        <button
                            key={it.id}
                            type="button"
                            aria-label={String(i + 1)}
                            onClick={(e) => {
                                e.stopPropagation();
                                setIndex(i);
                            }}
                            className="w-1.5 h-1.5 rounded-full"
                            style={{
                                background: i === index % count ? 'var(--accent)' : 'var(--app-border)',
                            }}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
