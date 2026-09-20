import { createContext, useContext } from 'react';
import { useThemeEpoch } from '../store/themeEpoch';
import { brightnessFromColorScheme } from '../utils/iframeColorScheme';

/**
 * Which brightness the surrounding theme has — the answer a light/dark colour
 * pair is resolved against (utils/dualColor.ts, issue #689).
 *
 * Not the same as "the global theme is dark": a layout or section may override a
 * dark global design with a light one, and the header's sun/moon button and the
 * mode datapoint switch brightness too (#573). So the brightness is taken from
 * the DOM, where `color-scheme` already carries exactly that — ThemeProvider
 * writes it from the global theme, App.tsx from the scoped one, and both bump the
 * theme epoch afterwards.
 *
 * The context is the override for subtrees the DOM cannot answer for: an admin
 * preview that shows a widget in the FRONTEND theme while the admin around it is
 * light, or a test that pins a brightness.
 */
export const BrightnessContext = createContext<boolean | undefined>(undefined);

/**
 * Read once per theme epoch, not once per widget.
 *
 * `getComputedStyle` forces layout, and every widget on the dashboard asks this
 * question. The epoch only moves when the applied variables moved, so caching on
 * it is exact rather than merely cheap.
 */
let cachedEpoch = -1;
let cachedDark = false;

function readDomBrightness(): boolean {
    if (typeof document === 'undefined') return false;
    // The frontend's scoped theme lives on this element; <html> only carries the
    // global one. Reading the scope first is what makes a light layout on a dark
    // installation resolve to "light".
    const scope = document.querySelector('[data-aura-app="frontend"]') ?? document.documentElement;
    const scheme = brightnessFromColorScheme(getComputedStyle(scope).colorScheme);
    if (scheme) return scheme === 'dark';
    // `color-scheme: normal` (or a UA that reports nothing): ThemeProvider also
    // toggles this class, so it is the same answer from a second source.
    return document.documentElement.classList.contains('dark');
}

function domBrightness(epoch: number): boolean {
    if (epoch !== cachedEpoch) {
        cachedEpoch = epoch;
        cachedDark = readDomBrightness();
    }
    return cachedDark;
}

/** True while a dark theme is being rendered here. */
export function useIsDarkTheme(): boolean {
    const declared = useContext(BrightnessContext);
    // Subscribing to the epoch is what re-renders this component on a theme
    // switch — without it a widget would keep the brightness it mounted in.
    const epoch = useThemeEpoch();
    return declared ?? domBrightness(epoch);
}
