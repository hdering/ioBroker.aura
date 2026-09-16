/**
 * Which brightness an embedded document is told to use. (issue #663)
 *
 * A browser that follows the spec hands the embedder's color scheme down to the
 * embedded document, whose `prefers-color-scheme` then answers with Aura's
 * brightness instead of the device setting. WebKit (Safari) and Gecko (Firefox) do
 * this, Blink (Chrome, Android WebView) does not — there the embedded page always
 * follows the device and none of these modes can change that.
 *
 * Inheriting is not enough: WebKit only passes on a scheme *declared on the frame
 * element itself*. An iframe that merely inherits `dark` from <html> computes to
 * `dark` and still hands the device setting to its document, so the widget has to
 * read the brightness at its own position in the DOM (which also picks up a
 * layout- or section-scoped theme) and write it onto the frame — see
 * hooks/useIframeColorScheme.
 *
 * The lever cuts both ways, which is why this is a setting and not a constant:
 *
 * - `theme`   Aura's brightness, taken from the widget's surroundings.
 * - `device`  `light dark` — the frame accepts both, so the embedded page falls
 *             back to the device setting even inside a themed Aura.
 * - `neutral` `normal` — the frame declares no scheme at all. An embedded document
 *             without a background of its own then composites transparently over the
 *             widget card instead of getting an opaque white canvas painted behind
 *             it (f229a2fe). The price is that WebKit reads `normal` as light, so an
 *             adaptive page can never go dark — exactly the report in #663, back when
 *             this was a blanket rule for every iframe.
 */
export type IframeColorSchemeMode = 'theme' | 'device' | 'neutral';

export const IFRAME_COLOR_SCHEME_MODES: { value: IframeColorSchemeMode; label: string }[] = [
    { value: 'theme', label: 'Aura-Theme weitergeben' },
    { value: 'device', label: 'Gerät entscheidet' },
    { value: 'neutral', label: 'Neutral (transparenter Hintergrund)' },
];

export function resolveIframeColorSchemeMode(opts: Record<string, unknown> | undefined): IframeColorSchemeMode {
    const stored = opts?.iframeColorScheme;
    if (stored === 'theme' || stored === 'device' || stored === 'neutral') return stored;
    return 'theme';
}

/**
 * The surrounding `color-scheme` boiled down to one brightness.
 *
 * A computed value can be `normal`, a single keyword or a list (`light dark`), and
 * only a definite answer is worth forcing on an embedded page: anything else means
 * Aura itself has no opinion, so the device keeps deciding.
 */
export function brightnessFromColorScheme(computed: string | undefined): 'dark' | 'light' | undefined {
    if (!computed) return undefined;
    const words = computed.toLowerCase().split(/\s+/).filter(Boolean);
    const hasDark = words.includes('dark');
    const hasLight = words.includes('light');
    if (hasDark && !hasLight) return 'dark';
    if (hasLight && !hasDark) return 'light';
    return undefined;
}

/** The `color-scheme` for the frame element, or `undefined` to leave it unset. */
export function iframeColorSchemeValue(
    mode: IframeColorSchemeMode,
    brightness: 'dark' | 'light' | undefined,
): string | undefined {
    if (mode === 'device') return 'light dark';
    if (mode === 'neutral') return 'normal';
    return brightness;
}
