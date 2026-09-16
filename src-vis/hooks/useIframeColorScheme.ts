import { useEffect, useState, type RefObject } from 'react';
import { useThemeEpoch } from '../store/themeEpoch';
import {
    brightnessFromColorScheme,
    iframeColorSchemeValue,
    resolveIframeColorSchemeMode,
} from '../utils/iframeColorScheme';

/**
 * The `color-scheme` an embedded frame should carry, ready to spread into a
 * `style` prop. (issue #663)
 *
 * The brightness is read at `ref`, so a layout- or section-scoped design counts
 * too — and it has to come from the DOM at all because WebKit only hands a scheme
 * down to the embedded document when the frame element declares one itself; an
 * inherited value computes the same and changes nothing (see
 * utils/iframeColorScheme).
 *
 * Re-read on every theme epoch: that subscription is what causes a commit when the
 * user switches theme, and the embedded page follows the new value without a
 * reload — which matters for a frame holding a running stream or a filled form.
 */
export function useIframeColorScheme(
    ref: RefObject<HTMLElement | null>,
    opts: Record<string, unknown> | undefined,
): { colorScheme?: string } {
    const epoch = useThemeEpoch();
    const mode = resolveIframeColorSchemeMode(opts);
    const [brightness, setBrightness] = useState<'dark' | 'light' | undefined>(undefined);

    useEffect(() => {
        const el = ref.current;
        const next = el ? brightnessFromColorScheme(getComputedStyle(el).colorScheme) : undefined;
        setBrightness((prev) => (prev === next ? prev : next));
    }, [epoch, ref, mode]);

    const value = iframeColorSchemeValue(mode, brightness);
    return value ? { colorScheme: value } : {};
}
