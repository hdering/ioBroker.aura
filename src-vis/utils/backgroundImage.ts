/**
 * Background images for widget cards and popups (issue #442).
 *
 * The image is painted by its own layer (BackgroundImageLayer) instead of being
 * folded into the `background` shorthand: the card colour can be anything a
 * theme puts into `--widget-bg` — a gradient, a `light-dark()` pair — and a
 * colour layer behind an image layer only parses for a plain colour. A broken
 * shorthand would drop the whole declaration and leave the card without any
 * background.
 */
import type { CSSProperties } from 'react';
import type { BackgroundImage, BackgroundImageFit, BackgroundImagePosition } from '../types';
import { resolveImageSource } from './assetUrl';

export const BG_IMAGE_FITS: BackgroundImageFit[] = ['cover', 'contain', 'stretch', 'repeat'];
export const BG_IMAGE_POSITIONS: BackgroundImagePosition[] = [
    'top left',
    'top',
    'top right',
    'left',
    'center',
    'right',
    'bottom left',
    'bottom',
    'bottom right',
];
/** Darker than this and the image is gone — the colour picker is the tool for that. */
export const MAX_BG_IMAGE_DIM = 90;

/** A stored value that actually names an image (fixed source or datapoint), else undefined (inherit / off). */
export function activeBgImage(raw: unknown): BackgroundImage | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const bg = raw as BackgroundImage;
    const hasSrc = typeof bg.src === 'string' && bg.src.trim() !== '';
    const hasDp = typeof bg.dp === 'string' && bg.dp.trim() !== '';
    return hasSrc || hasDp ? bg : undefined;
}

/** Quote a URL for `url("…")` — data URIs of raw SVG markup carry quotes and parentheses. */
function cssUrl(src: string): string {
    return `url("${src.replace(/["\\\n\r]/g, (c) => (c === '\n' || c === '\r' ? '' : `\\${c}`))}")`;
}

const GRADIENT_RE = /^(repeating-)?(linear|radial|conic)-gradient\(.*\)$/is;
const COLOR_FN_RE = /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark|var)\(.*\)$/is;

/**
 * A source that is CSS paint instead of an image (#830): a gradient
 * (`linear-gradient(…)`, `radial-gradient(…)`, `conic-gradient(…)`) or a colour
 * (`red`, `#e66465`, `rgba(100,234,23,0.5)`, `var(--accent)`). An image path
 * never matches — paths carry a dot or a slash, colour names do not.
 */
export function bgPaint(raw: unknown): { image: string } | { color: string } | undefined {
    if (typeof raw !== 'string') return undefined;
    const v = raw.trim();
    if (!v) return undefined;
    if (GRADIENT_RE.test(v)) return { image: v };
    if (/^#[0-9a-f]{3,8}$/i.test(v) || COLOR_FN_RE.test(v)) return { color: v };
    if (/^[a-z]+$/i.test(v) && typeof CSS !== 'undefined' && CSS.supports?.('color', v)) return { color: v };
    return undefined;
}

type BgSource = { image: string } | { color: string } | { url: string };

function bgSource(raw: unknown): BgSource | undefined {
    const paint = bgPaint(raw);
    if (paint) return paint;
    const url = resolveImageSource(raw);
    return url ? { url } : undefined;
}

/**
 * Styles of the image layer itself; undefined when the value names no image.
 * `dpValue` is the current value of `bg.dp` — while it holds an image it wins
 * over the fixed `src`, which stays the fallback (#775). Either may also be a
 * gradient or a colour (#830).
 */
export function bgImageStyle(raw: unknown, dpValue?: unknown): CSSProperties | undefined {
    const bg = activeBgImage(raw);
    if (!bg) return undefined;
    const source = bgSource(dpValue) ?? bgSource(bg.src);
    if (!source) return undefined;
    const dim = Math.max(0, Math.min(MAX_BG_IMAGE_DIM, Number(bg.dim) || 0)) / 100;
    const filter = dim > 0 ? `brightness(${1 - dim})` : undefined;
    // A plain colour has no size or position — it simply fills the layer.
    if ('color' in source) return { backgroundColor: source.color, filter };
    const fit = bg.fit ?? 'cover';
    return {
        backgroundImage: 'image' in source ? source.image : cssUrl(source.url),
        backgroundSize: fit === 'stretch' ? '100% 100%' : fit === 'repeat' ? 'auto' : fit,
        backgroundRepeat: fit === 'repeat' ? 'repeat' : 'no-repeat',
        backgroundPosition: bg.position ?? 'center',
        // A filter on the layer, not a black veil: the layer holds nothing but the
        // image, so only image pixels darken — the card colour around a "contain"
        // image keeps its tone.
        filter,
    };
}

/**
 * The image behind a tab's widgets: the tab's own, else its section's, else its
 * layout's — like the settings cascade, the nearest level that sets one wins.
 */
export function tabBgImage(
    layout: { backgroundImage?: unknown } | undefined,
    section: { backgroundImage?: unknown } | undefined,
    tab: { backgroundImage?: unknown } | undefined,
): BackgroundImage | undefined {
    return (
        activeBgImage(tab?.backgroundImage) ??
        activeBgImage(section?.backgroundImage) ??
        activeBgImage(layout?.backgroundImage)
    );
}

/** One colour of a gradient; `pos` is its place in % (unset = spread evenly). */
export interface GradientStop {
    color: string;
    pos?: number;
}
/** What the gradient builder edits (#830) — `color` is a single fill, no gradient. */
export interface PaintSpec {
    kind: 'color' | 'linear' | 'radial';
    angle: number; // linear only, degrees
    shape: 'ellipse' | 'circle'; // radial only
    stops: GradientStop[];
}

export const DEFAULT_PAINT: PaintSpec = {
    kind: 'linear',
    angle: 180,
    shape: 'ellipse',
    stops: [{ color: '#e66465' }, { color: '#9198e5' }],
};

const SIDE_ANGLES: Record<string, number> = {
    'to top': 0,
    'to top right': 45,
    'to right top': 45,
    'to right': 90,
    'to bottom right': 135,
    'to right bottom': 135,
    'to bottom': 180,
    'to bottom left': 225,
    'to left bottom': 225,
    'to left': 270,
    'to top left': 315,
    'to left top': 315,
};

/** Split at commas outside parentheses — `rgba(1,2,3,.5), red` is two parts. */
function splitTopLevel(s: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let cur = '';
    for (const ch of s) {
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        if (ch === ',' && depth === 0) {
            out.push(cur.trim());
            cur = '';
        } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
}

/** Read a colour or simple linear/radial gradient back into the builder; undefined when it is anything else. */
export function parsePaint(raw: string): PaintSpec | undefined {
    const v = raw.trim();
    const paint = bgPaint(v);
    if (!paint) return undefined;
    if ('color' in paint) return { ...DEFAULT_PAINT, kind: 'color', stops: [{ color: v }, DEFAULT_PAINT.stops[1]] };
    const m = v.match(/^(linear|radial)-gradient\((.*)\)$/is);
    if (!m) return undefined;
    const kind = m[1].toLowerCase() as 'linear' | 'radial';
    const parts = splitTopLevel(m[2]);
    const spec: PaintSpec = { ...DEFAULT_PAINT, kind, stops: [] };
    const first = parts[0]?.toLowerCase() ?? '';
    if (kind === 'linear') {
        const deg = first.match(/^(-?[\d.]+)deg$/);
        if (deg) spec.angle = Number(deg[1]);
        if (deg || first in SIDE_ANGLES) {
            if (!deg) spec.angle = SIDE_ANGLES[first];
            parts.shift();
        }
    } else if (/^(circle|ellipse)$/.test(first)) {
        spec.shape = first as 'circle' | 'ellipse';
        parts.shift();
    }
    for (const p of parts) {
        const sm = p.match(/^(.*?)\s+(-?[\d.]+)%$/s);
        const color = (sm ? sm[1] : p).trim();
        if (!bgPaint(color) || !('color' in bgPaint(color)!)) return undefined;
        spec.stops.push(sm ? { color, pos: Number(sm[2]) } : { color });
    }
    return spec.stops.length >= 2 ? spec : undefined;
}

/** The CSS value of a builder state. */
export function buildPaint(spec: PaintSpec): string {
    if (spec.kind === 'color') return spec.stops[0]?.color ?? '';
    const stops = spec.stops.map((s) => (s.pos === undefined ? s.color : `${s.color} ${s.pos}%`)).join(', ');
    if (spec.kind === 'radial') return `radial-gradient(${spec.shape === 'circle' ? 'circle, ' : ''}${stops})`;
    return `linear-gradient(${spec.angle === 180 ? '' : `${spec.angle}deg, `}${stops})`;
}
