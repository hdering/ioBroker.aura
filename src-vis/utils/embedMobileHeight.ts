/**
 * How tall an embedded-page widget (iframe, html) is in the narrow mobile/tablet
 * flow, where the desktop width no longer applies. (issues #645, #772)
 *
 * - `aspect` Keep the desktop aspect ratio (default). Right for content that scales
 *            with the frame's width, like the energy-flow SVG: without it the shrunken
 *            content sat in a tall empty box (#645).
 * - `rows`   The stored row count, like on the desktop grid. Right for responsive
 *            pages (Grafana, …) that reflow to the width and want their height —
 *            the aspect ratio squashed those to a flat strip (#772).
 * - `px`     A fixed height in pixels, only for the mobile flow.
 */
export type EmbedMobileHeightMode = 'aspect' | 'rows' | 'px';

export const EMBED_MOBILE_HEIGHT_MODES: { value: EmbedMobileHeightMode; label: string }[] = [
    { value: 'aspect', label: 'Seitenverhältnis vom Desktop' },
    { value: 'rows', label: 'Zeilenhöhe wie am Desktop' },
    { value: 'px', label: 'Feste Höhe (px)' },
];

export const EMBED_MOBILE_HEIGHT_PX_DEFAULT = 300;

export function resolveEmbedMobileHeight(opts: Record<string, unknown> | undefined): {
    mode: EmbedMobileHeightMode;
    px: number;
} {
    const stored = opts?.mobileHeight;
    const mode: EmbedMobileHeightMode = stored === 'rows' || stored === 'px' ? stored : 'aspect';
    const rawPx = Number(opts?.mobileHeightPx);
    const px = Number.isFinite(rawPx) && rawPx > 0 ? Math.round(rawPx) : EMBED_MOBILE_HEIGHT_PX_DEFAULT;
    return { mode, px };
}
