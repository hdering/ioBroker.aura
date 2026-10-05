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

/** A stored value that actually names an image, else undefined (inherit / off). */
export function activeBgImage(raw: unknown): BackgroundImage | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const bg = raw as BackgroundImage;
    return typeof bg.src === 'string' && bg.src.trim() ? bg : undefined;
}

/** Quote a URL for `url("…")` — data URIs of raw SVG markup carry quotes and parentheses. */
function cssUrl(src: string): string {
    return `url("${src.replace(/["\\\n\r]/g, (c) => (c === '\n' || c === '\r' ? '' : `\\${c}`))}")`;
}

/** Styles of the image layer itself; undefined when the value names no image. */
export function bgImageStyle(raw: unknown): CSSProperties | undefined {
    const bg = activeBgImage(raw);
    if (!bg) return undefined;
    const src = resolveImageSource(bg.src);
    if (!src) return undefined;
    const fit = bg.fit ?? 'cover';
    const dim = Math.max(0, Math.min(MAX_BG_IMAGE_DIM, Number(bg.dim) || 0)) / 100;
    return {
        backgroundImage: cssUrl(src),
        backgroundSize: fit === 'stretch' ? '100% 100%' : fit === 'repeat' ? 'auto' : fit,
        backgroundRepeat: fit === 'repeat' ? 'repeat' : 'no-repeat',
        backgroundPosition: bg.position ?? 'center',
        // A filter on the layer, not a black veil: the layer holds nothing but the
        // image, so only image pixels darken — the card colour around a "contain"
        // image keeps its tone.
        filter: dim > 0 ? `brightness(${1 - dim})` : undefined,
    };
}
