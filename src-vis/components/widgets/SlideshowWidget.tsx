/**
 * Slideshow ("Diashow", #848) — photos and videos from a folder on the Aura
 * server, one after another, as a tile or as the content of a screensaver popup.
 *
 * The folder lies below one of the instance's allowed roots (`fsRoots`); the
 * server lists it with capture dates (`/fs/media`, lib/mediaLibrary.js) and
 * serves the files with byte ranges (`/fs/read`). Order, rounds and the "where
 * did it stop" memory live in slideshowOrder.ts.
 *
 * Two stacked layers carry a change: the outgoing and the incoming item, each
 * animated by a CSS keyframe of the chosen transition. The next image is
 * decoded before the change, so a slow file never shows half-drawn, and a file
 * that cannot be loaded is skipped.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Images, Pause, VolumeX } from 'lucide-react';
import type { WidgetProps } from '../../types';
import { auraUrl } from '../../utils/basePath';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { useT } from '../../i18n';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useSpeechStore } from '../../store/speechStore';
import { HeaderGroup, HeaderSlotsInline, HeaderSlotsRow2, TitleRow } from '../layout/HeaderSlotsContext';
import {
    currentItem,
    peekNext,
    stepPosition,
    type MediaItem,
    type SlideshowOrder,
    type SlideshowPosition,
} from './slideshowOrder';

export type SlideshowTransition = 'none' | 'fade' | 'fadeBlack' | 'slide' | 'pageTurn';
export type SlideshowCaption = 'none' | 'name' | 'date' | 'nameDate';

export const SLIDESHOW_TRANSITIONS: SlideshowTransition[] = ['fadeBlack', 'fade', 'slide', 'pageTurn', 'none'];
export const SLIDESHOW_CAPTIONS: SlideshowCaption[] = ['none', 'name', 'date', 'nameDate'];

export const SLIDESHOW_DEFAULTS = {
    order: 'random' as SlideshowOrder,
    intervalSec: 10,
    transition: 'fadeBlack' as SlideshowTransition,
    transitionMs: 800,
    fit: 'contain' as 'contain' | 'cover',
    background: '#000000',
    rescanMin: 30,
    videoVolume: 60,
};

/** While dates are still being read on the server, ask again this soon. */
const PENDING_RETRY_MS = 20_000;
/** A file that has not decoded by then is treated as broken. */
const LOAD_TIMEOUT_MS = 20_000;
/** Broken files skipped in a row before the show gives up for this step. */
const MAX_SKIP = 10;
/** A swipe needs this many px sideways; less is a tap. */
const SWIPE_PX = 40;

const fileUrl = (p: string) => auraUrl(`/fs/read?path=${encodeURIComponent(p)}`);

type ListError = 'forbidden' | 'notFound' | 'failed';

/** The media list of a folder, re-read every `rescanMs` (sooner while dates are pending). */
function useMediaList(folder: string, recursive: boolean, rescanMs: number) {
    const [state, setState] = useState<{ items: MediaItem[] | null; error: ListError | null; truncated: boolean }>({
        items: null,
        error: null,
        truncated: false,
    });
    const sigRef = useRef<string | null>(null);

    useEffect(() => {
        sigRef.current = null;
        setState({ items: null, error: null, truncated: false });
        if (!folder) return;
        let stopped = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const load = async () => {
            let next = rescanMs;
            try {
                const res = await fetch(
                    auraUrl(`/fs/media?path=${encodeURIComponent(folder)}&recursive=${recursive ? 1 : 0}`),
                    { cache: 'no-store' },
                );
                if (stopped) return;
                if (!res.ok) {
                    const error: ListError =
                        res.status === 403 ? 'forbidden' : res.status === 404 ? 'notFound' : 'failed';
                    setState((s) => (s.error === error ? s : { ...s, error }));
                } else {
                    const body = (await res.json()) as { items: MediaItem[]; truncated: boolean; pending: number };
                    if (stopped) return;
                    // Only a real change re-renders - the list is re-read all day long.
                    const sig = body.items.map((i) => `${i.path}|${i.time}`).join('\n');
                    if (sig !== sigRef.current) {
                        sigRef.current = sig;
                        setState({ items: body.items, error: null, truncated: body.truncated });
                    }
                    if (body.pending > 0) next = Math.min(next, PENDING_RETRY_MS);
                }
            } catch {
                if (!stopped) setState((s) => (s.items ? s : { ...s, error: 'failed' }));
            }
            if (!stopped) timer = setTimeout(load, next);
        };
        void load();
        return () => {
            stopped = true;
            clearTimeout(timer);
        };
    }, [folder, recursive, rescanMs]);

    return state;
}

/** Decode an image before it is shown; false = broken or too slow. */
function preloadImage(src: string): Promise<boolean> {
    return new Promise((resolve) => {
        const img = new Image();
        const state = { done: false, timer: undefined as ReturnType<typeof setTimeout> | undefined };
        const finish = (ok: boolean) => {
            if (state.done) return;
            state.done = true;
            clearTimeout(state.timer);
            resolve(ok);
        };
        state.timer = setTimeout(() => finish(false), LOAD_TIMEOUT_MS);
        img.onerror = () => finish(false);
        img.src = src;
        img.decode().then(
            () => finish(true),
            () => finish(img.complete && img.naturalWidth > 0),
        );
    });
}

function storageKey(widgetId: string): string {
    return `aura-slideshow-pos:${widgetId}`;
}

function loadPosition(widgetId: string): SlideshowPosition | null {
    try {
        const raw = sessionStorage.getItem(storageKey(widgetId));
        if (!raw) return null;
        const p = JSON.parse(raw) as SlideshowPosition;
        return typeof p.seed === 'number' && typeof p.round === 'number' ? p : null;
    } catch {
        return null;
    }
}

function savePosition(widgetId: string, pos: SlideshowPosition): void {
    try {
        sessionStorage.setItem(storageKey(widgetId), JSON.stringify(pos));
    } catch {
        /* private mode / quota: the show just starts over next time */
    }
}

/** Keyframes of all transitions; durations come from --aura-ss-ms on the layer. */
const SLIDESHOW_CSS = `
@keyframes aura-ss-fade-in { from { opacity: 0 } to { opacity: 1 } }
@keyframes aura-ss-fade-out { from { opacity: 1 } to { opacity: 0 } }
@keyframes aura-ss-slide-in-fwd { from { transform: translateX(100%) } to { transform: none } }
@keyframes aura-ss-slide-out-fwd { from { transform: none } to { transform: translateX(-100%) } }
@keyframes aura-ss-slide-in-back { from { transform: translateX(-100%) } to { transform: none } }
@keyframes aura-ss-slide-out-back { from { transform: none } to { transform: translateX(100%) } }
@keyframes aura-ss-turn-out { 0% { transform: rotateY(0) } 100% { transform: rotateY(-100deg) } }
@keyframes aura-ss-turn-in { 0% { transform: rotateY(-100deg) } 100% { transform: rotateY(0) } }
@keyframes aura-ss-turn-shade { 0% { opacity: 0 } 60% { opacity: .55 } 100% { opacity: .8 } }
.aura-slideshow-layer { position: absolute; inset: 0; overflow: hidden; backface-visibility: hidden; animation-fill-mode: both; animation-timing-function: ease-in-out; }
.aura-slideshow-layer[data-anim="fade-in"] { animation-name: aura-ss-fade-in; animation-duration: var(--aura-ss-ms); }
.aura-slideshow-layer[data-anim="black-out"] { animation-name: aura-ss-fade-out; animation-duration: calc(var(--aura-ss-ms) / 2); }
.aura-slideshow-layer[data-anim="black-in"] { animation-name: aura-ss-fade-in; animation-duration: calc(var(--aura-ss-ms) / 2); animation-delay: calc(var(--aura-ss-ms) / 2); }
.aura-slideshow-layer[data-anim="slide-in-fwd"] { animation-name: aura-ss-slide-in-fwd; animation-duration: var(--aura-ss-ms); }
.aura-slideshow-layer[data-anim="slide-out-fwd"] { animation-name: aura-ss-slide-out-fwd; animation-duration: var(--aura-ss-ms); }
.aura-slideshow-layer[data-anim="slide-in-back"] { animation-name: aura-ss-slide-in-back; animation-duration: var(--aura-ss-ms); }
.aura-slideshow-layer[data-anim="slide-out-back"] { animation-name: aura-ss-slide-out-back; animation-duration: var(--aura-ss-ms); }
.aura-slideshow-layer[data-anim="turn-out"] { transform-origin: left center; animation-name: aura-ss-turn-out; animation-duration: var(--aura-ss-ms); animation-timing-function: ease-in; }
.aura-slideshow-layer[data-anim="turn-in"] { transform-origin: left center; animation-name: aura-ss-turn-in; animation-duration: var(--aura-ss-ms); animation-timing-function: ease-out; }
.aura-slideshow-layer[data-anim="turn-out"]::after, .aura-slideshow-layer[data-anim="turn-in"]::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(to right, rgba(0,0,0,.05), rgba(0,0,0,.6)); animation: aura-ss-turn-shade var(--aura-ss-ms) both; }
.aura-slideshow-layer[data-anim="turn-in"]::after { animation-direction: reverse; }
`;

type Role = 'in' | 'out';
interface Layer {
    item: MediaItem;
    key: number;
    role: Role;
    /** False for the very first item: it just appears. */
    animate: boolean;
}

/** Animation name and stacking of one layer for a change in direction `dir`. */
function layerAnim(transition: SlideshowTransition, role: Role, dir: 1 | -1): { anim?: string; z: number } {
    switch (transition) {
        case 'fade':
            return role === 'in' ? { anim: 'fade-in', z: 2 } : { z: 1 };
        case 'fadeBlack':
            return role === 'in' ? { anim: 'black-in', z: 1 } : { anim: 'black-out', z: 2 };
        case 'slide':
            return { anim: `slide-${role}-${dir > 0 ? 'fwd' : 'back'}`, z: role === 'in' ? 2 : 1 };
        case 'pageTurn':
            // Forward the page on top turns away; back the previous page turns in on top.
            if (dir > 0) return role === 'out' ? { anim: 'turn-out', z: 2 } : { z: 1 };
            return role === 'in' ? { anim: 'turn-in', z: 2 } : { z: 1 };
        default:
            return { z: role === 'in' ? 2 : 1 };
    }
}

export function SlideshowWidget({ config, editMode }: WidgetProps) {
    const t = useT();
    const o = config.options ?? {};
    // A datapoint may name the folder instead (#880): a script or timer switches the
    // album by writing a path. Empty or not a string = the fixed folder.
    const { value: dpFolder } = useDatapoint(((o.folderDp as string | undefined) ?? '').trim());
    const folder = (
        (typeof dpFolder === 'string' && dpFolder.trim()) ||
        ((o.folder as string | undefined) ?? '')
    ).trim();
    const recursive = o.recursive === true;
    const order = (o.order as SlideshowOrder | undefined) ?? SLIDESHOW_DEFAULTS.order;
    const intervalMs = Math.max(2, Number(o.intervalSec) || SLIDESHOW_DEFAULTS.intervalSec) * 1000;
    const reducedMotion =
        typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const configuredTransition = (o.transition as SlideshowTransition | undefined) ?? SLIDESHOW_DEFAULTS.transition;
    const transition: SlideshowTransition =
        reducedMotion && configuredTransition !== 'none' ? 'fade' : configuredTransition;
    const transitionMs =
        transition === 'none'
            ? 0
            : Math.min(
                  reducedMotion ? 300 : 5000,
                  Math.max(100, Number(o.transitionMs) || SLIDESHOW_DEFAULTS.transitionMs),
              );
    const fit = (o.fit as 'contain' | 'cover' | undefined) ?? SLIDESHOW_DEFAULTS.fit;
    const background = (o.background as string | undefined) || SLIDESHOW_DEFAULTS.background;
    const blurBackground = o.blurBackground === true;
    const caption = (o.showCaption as SlideshowCaption | undefined) ?? 'none';
    const rescanMs = Math.max(1, Number(o.rescanMin) || SLIDESHOW_DEFAULTS.rescanMin) * 60_000;
    const includeVideos = o.includeVideos === true;
    const videoMode = (o.videoMode as 'full' | 'interval' | undefined) ?? 'full';
    const videoSound = o.videoSound === true;
    const videoVolume = Math.min(100, Math.max(0, Number(o.videoVolume ?? SLIDESHOW_DEFAULTS.videoVolume)));
    const controls = o.controls !== false && !editMode;

    const showTitle = o.showTitle !== false;
    const showIcon = o.showIcon !== false;
    const iconSize = (o.iconSize as number) || 20;
    const titleAlign = (o.titleAlign as string) ?? 'left';
    const WidgetIcon = getWidgetIcon(o.icon as string | undefined, Images);

    const list = useMediaList(folder, recursive, rescanMs);
    const items = useMemo(
        () => (list.items ?? []).filter((i) => includeVideos || i.kind === 'image'),
        [list.items, includeVideos],
    );

    const [pos, setPos] = useState<SlideshowPosition>(
        () => loadPosition(config.id) ?? { seed: Math.floor(Math.random() * 2 ** 31), round: 0, path: null },
    );
    const posRef = useRef(pos);
    posRef.current = pos;
    const [layers, setLayers] = useState<Layer[]>([]);
    const layersRef = useRef(layers);
    layersRef.current = layers;
    const keyRef = useRef(0);
    const tokenRef = useRef(0);
    const badRef = useRef(new Set<string>());
    const [paused, setPaused] = useState(false);
    const [visible, setVisible] = useState(true);
    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const speechPlaying = useSpeechStore((s) => s.playing);
    const [soundBlocked, setSoundBlocked] = useState(false);

    const shown = layers.find((l) => l.role === 'in')?.item ?? null;

    useEffect(() => savePosition(config.id, pos), [config.id, pos]);

    const dirRef = useRef<1 | -1>(1);
    // Show `item` (already loaded) as the new incoming layer.
    const present = useCallback(
        (item: MediaItem, dir: 1 | -1, animate: boolean) => {
            const key = ++keyRef.current;
            const prev = layersRef.current.find((l) => l.role === 'in');
            const next: Layer[] = [];
            if (animate && prev && prev.item.path !== item.path && transitionMs > 0) {
                next.push({ ...prev, role: 'out', animate: true });
            }
            next.push({ item, key, role: 'in', animate });
            dirRef.current = dir;
            setLayers(next);
        },
        [transitionMs],
    );

    // Move one step, skipping files that do not load.
    const go = useCallback(
        async (dir: 1 | -1) => {
            if (!items.length) return;
            const token = ++tokenRef.current;
            let p = posRef.current;
            for (let n = 0; n < MAX_SKIP; n++) {
                const step = stepPosition(items, order, p, dir);
                p = step.pos;
                const item = step.item;
                if (!item) return;
                if (badRef.current.has(item.path) && badRef.current.size < items.length) continue;
                const ok = item.kind === 'video' ? true : await preloadImage(fileUrl(item.path));
                if (token !== tokenRef.current) return; // a newer step took over
                if (!ok) {
                    badRef.current.add(item.path);
                    continue;
                }
                setPos(p);
                present(item, dir, true);
                return;
            }
            setPos(p);
        },
        [items, order, present],
    );

    // First item, and whenever the list or order changes: keep what is on screen if it is still there.
    useEffect(() => {
        if (!items.length) {
            setLayers([]);
            return;
        }
        const onScreen = layersRef.current.find((l) => l.role === 'in')?.item;
        if (onScreen && items.some((i) => i.path === onScreen.path)) return;
        const restored = posRef.current.path;
        if (restored && !onScreen && !editMode) {
            // Mounted anew (screensaver): continue after the item shown last time.
            void go(1);
            return;
        }
        const first = currentItem(items, order, posRef.current);
        if (!first) return;
        setPos((p) => ({ ...p, path: first.path }));
        present(first, 1, false);
    }, [items, order, editMode, go, present]);

    // Drop the outgoing layer once its animation is over.
    useEffect(() => {
        if (!layers.some((l) => l.role === 'out')) return;
        const timer = setTimeout(() => setLayers((ls) => ls.filter((l) => l.role === 'in')), transitionMs + 50);
        return () => clearTimeout(timer);
    }, [layers, transitionMs]);

    // Only run while the widget can be seen: a tab in the background stays mounted.
    useEffect(() => {
        const el = containerRef.current;
        let inView = true;
        let pageVisible = !document.hidden;
        const update = () => setVisible(inView && pageVisible);
        const onVis = () => {
            pageVisible = !document.hidden;
            update();
        };
        document.addEventListener('visibilitychange', onVis);
        let obs: IntersectionObserver | undefined;
        if (el && typeof IntersectionObserver !== 'undefined') {
            obs = new IntersectionObserver(([e]) => {
                inView = e.isIntersecting;
                update();
            });
            obs.observe(el);
        }
        return () => {
            document.removeEventListener('visibilitychange', onVis);
            obs?.disconnect();
        };
    }, []);

    const running = !editMode && !paused && visible && items.length > 1;
    const shownKey = layers.find((l) => l.role === 'in')?.key;

    // Timer for images (and videos in interval mode); full videos advance on `ended`.
    useEffect(() => {
        if (!running || !shown) return;
        if (shown.kind === 'video' && videoMode === 'full') return;
        const timer = setTimeout(() => void go(1), intervalMs + transitionMs);
        return () => clearTimeout(timer);
    }, [running, shown, shownKey, videoMode, intervalMs, transitionMs, go]);

    // Warm the cache for the next image while this one is on screen.
    useEffect(() => {
        if (editMode || !items.length || !shown) return;
        const next = peekNext(items, order, posRef.current);
        if (next && next.kind === 'image' && next.path !== shown.path) {
            const img = new Image();
            img.src = fileUrl(next.path);
        }
    }, [shownKey, items, order, editMode, shown]);

    // Video playback: sound only when wanted, allowed and no announcement is speaking.
    useEffect(() => {
        const v = videoRef.current;
        if (!v || shown?.kind !== 'video') return;
        v.volume = videoVolume / 100;
        if (editMode) {
            v.pause();
            return;
        }
        if (!visible || paused) {
            v.pause();
            return;
        }
        v.muted = !videoSound || speechPlaying || soundBlocked;
        v.play().catch((err: DOMException) => {
            if (err?.name !== 'NotAllowedError' || v.muted) return;
            // Autoplay with sound refused until the first tap on the page: play muted meanwhile.
            v.muted = true;
            setSoundBlocked(true);
            v.play().catch(() => {});
        });
    }, [shownKey, shown, visible, paused, editMode, videoSound, videoVolume, speechPlaying, soundBlocked]);

    // The first tap anywhere on the page allows sound (also the speech output's "Ton aktivieren").
    useEffect(() => {
        if (!soundBlocked) return;
        const onGesture = () => {
            const v = videoRef.current;
            if (v) v.muted = useSpeechStore.getState().playing;
            setSoundBlocked(false);
        };
        window.addEventListener('pointerdown', onGesture, true);
        window.addEventListener('keydown', onGesture, true);
        return () => {
            window.removeEventListener('pointerdown', onGesture, true);
            window.removeEventListener('keydown', onGesture, true);
        };
    }, [soundBlocked]);

    // Swipe / tap: sides step, middle pauses.
    const downRef = useRef<{ x: number; y: number } | null>(null);
    const onPointerDown = (e: React.PointerEvent) => {
        if (!controls) return;
        downRef.current = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = (e: React.PointerEvent) => {
        const d = downRef.current;
        downRef.current = null;
        if (!controls || !d) return;
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
            void go(dx < 0 ? 1 : -1);
            return;
        }
        if (Math.abs(dx) > SWIPE_PX || Math.abs(dy) > SWIPE_PX) return;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const rel = (e.clientX - rect.left) / Math.max(1, rect.width);
        if (rel < 0.25) void go(-1);
        else if (rel > 0.75) void go(1);
        else setPaused((p) => !p);
    };

    const header = (showTitle || showIcon) && (
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
                <HeaderSlotsInline />
            </TitleRow>
            <HeaderSlotsRow2 />
        </HeaderGroup>
    );

    const notice = !folder
        ? t('slideshow.noFolder')
        : list.error
          ? t(`slideshow.error.${list.error}`)
          : list.items && !items.length
            ? t('slideshow.empty')
            : null;

    const captionText = (item: MediaItem) => {
        const date = new Date(item.time).toLocaleDateString(undefined, {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
        if (caption === 'name') return item.name;
        if (caption === 'date') return date;
        return `${date} · ${item.name}`;
    };

    const renderMedia = (layer: Layer) => {
        const { item } = layer;
        const src = fileUrl(item.path);
        const isCurrent = layer.role === 'in';
        const mediaStyle: React.CSSProperties = {
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: fit,
        };
        return (
            <>
                {blurBackground && fit === 'contain' && item.kind === 'image' && (
                    <img
                        src={src}
                        alt=""
                        aria-hidden
                        className="aura-slideshow-backdrop"
                        style={{
                            ...mediaStyle,
                            objectFit: 'cover',
                            filter: 'blur(24px) brightness(0.6)',
                            transform: 'scale(1.15)',
                        }}
                    />
                )}
                {item.kind === 'video' ? (
                    <video
                        ref={isCurrent ? videoRef : undefined}
                        src={src}
                        className="aura-slideshow-media"
                        style={mediaStyle}
                        playsInline
                        muted
                        preload={editMode ? 'metadata' : 'auto'}
                        loop={items.length === 1}
                        onEnded={() => {
                            if (isCurrent && running && videoMode === 'full') void go(1);
                        }}
                        onError={() => {
                            if (!isCurrent || editMode) return;
                            badRef.current.add(item.path);
                            if (items.length > 1) void go(1);
                        }}
                    />
                ) : (
                    <img src={src} alt={item.name} className="aura-slideshow-media" style={mediaStyle} />
                )}
            </>
        );
    };

    return (
        <div className="aura-widget-row aura-slideshow flex flex-col h-full">
            {header}
            <div
                ref={containerRef}
                className="aura-widget-value aura-slideshow-stage"
                data-aura-slideshow-paused={paused ? '' : undefined}
                onPointerDown={onPointerDown}
                onPointerUp={onPointerUp}
                onPointerCancel={() => (downRef.current = null)}
                style={{
                    flex: '1 1 0',
                    minHeight: 0,
                    position: 'relative',
                    overflow: 'hidden',
                    background,
                    borderRadius: 'inherit',
                    perspective: transition === 'pageTurn' ? 1600 : undefined,
                    touchAction: controls ? 'pan-y' : undefined,
                    cursor: controls ? 'pointer' : undefined,
                    userSelect: 'none',
                }}
            >
                <style>{SLIDESHOW_CSS}</style>
                {layers.map((layer) => {
                    const { anim, z } = layerAnim(transition, layer.role, dirRef.current);
                    return (
                        <div
                            key={layer.key}
                            className="aura-slideshow-layer"
                            data-aura-slideshow-item={layer.role === 'in' ? layer.item.name : undefined}
                            data-anim={layer.animate ? anim : undefined}
                            style={
                                {
                                    zIndex: z,
                                    background,
                                    '--aura-ss-ms': `${transitionMs}ms`,
                                } as React.CSSProperties
                            }
                        >
                            {renderMedia(layer)}
                            {caption !== 'none' && layer.role === 'in' && (
                                <div
                                    className="aura-slideshow-caption absolute left-0 right-0 bottom-0 px-3 py-2 text-xs truncate"
                                    style={{
                                        color: '#fff',
                                        background: 'linear-gradient(to top, rgba(0,0,0,.6), transparent)',
                                        textShadow: '0 1px 2px rgba(0,0,0,.6)',
                                    }}
                                >
                                    {captionText(layer.item)}
                                </div>
                            )}
                        </div>
                    );
                })}
                {notice && (
                    <div
                        className="aura-slideshow-notice absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center"
                        style={{ color: 'rgba(255,255,255,.75)' }}
                    >
                        <Images size={28} strokeWidth={1} />
                        <span className="text-xs">{notice}</span>
                    </div>
                )}
                {!notice && !list.items && folder && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div
                            className="w-5 h-5 border-2 rounded-full animate-spin"
                            style={{ borderColor: 'rgba(255,255,255,.6)', borderTopColor: 'transparent' }}
                        />
                    </div>
                )}
                {editMode && list.items && items.length > 0 && (
                    <div
                        className="absolute top-2 right-2 px-2 py-0.5 rounded text-[10px]"
                        style={{ zIndex: 5, background: 'rgba(0,0,0,.55)', color: '#fff' }}
                    >
                        {t('slideshow.count', { n: items.length })}
                        {list.truncated ? '+' : ''}
                    </div>
                )}
                {paused && (
                    <div
                        className="aura-slideshow-paused absolute top-2 right-2 p-1.5 rounded-full"
                        style={{ zIndex: 5, background: 'rgba(0,0,0,.5)', color: '#fff' }}
                    >
                        <Pause size={14} />
                    </div>
                )}
                {soundBlocked && shown?.kind === 'video' && (
                    <button
                        type="button"
                        className="aura-slideshow-sound absolute bottom-2 right-2 p-1.5 rounded-full"
                        title={t('slideshow.enableSound')}
                        style={{ zIndex: 5, background: 'rgba(0,0,0,.5)', color: '#fff' }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onPointerUp={(e) => e.stopPropagation()}
                    >
                        <VolumeX size={14} />
                    </button>
                )}
            </div>
        </div>
    );
}
