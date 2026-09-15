import { useEffect } from 'react';
import { Sun, Moon, Circle } from 'lucide-react';
import { useThemeStore } from '../../../../store/themeStore';
import { useThemeModeStore } from '../../../../utils/themeModeCache';
import { getTheme } from '../../../../themes';
import type { VarScope } from '../../../../utils/themeVars';
import { browserBrightness, useEditBrightness } from './editBrightness';
import { useT } from '../../../../i18n';

/**
 * Two brightnesses are in play on this installation.
 *
 * True while the theme follows the browser or a dark/light-mode datapoint is
 * set — the two cases where one installation shows a light AND a dark theme, so
 * "which one am I editing?" is a real question. With neither, there is exactly
 * one theme and the extra control would only be noise.
 */
export function useHasTwoBrightnesses(): boolean {
    const followBrowser = useThemeStore((s) => s.followBrowser);
    const mode = useThemeModeStore((s) => s.mode);
    return followBrowser || mode !== null;
}

/**
 * The half that is on screen right now — same order of precedence the frontend
 * uses: an explicit dark/light mode beats everything, then the browser sync,
 * then the polarity of the design that is simply set.
 *
 * The admin runs outside <App/>, so neither the mode datapoint subscription nor
 * the browser-sync effect is mounted here; both sources are read from what they
 * left behind (the mode store is seeded from its cache in main.tsx).
 */
export function useShownBrightness(): 'light' | 'dark' {
    const themeId = useThemeStore((s) => s.themeId);
    const followBrowser = useThemeStore((s) => s.followBrowser);
    const mode = useThemeModeStore((s) => s.mode);
    if (mode) return mode;
    if (followBrowser) return browserBrightness();
    return getTheme(themeId).dark ? 'dark' : 'light';
}

/**
 * Open the Design page on the half the user is looking at (#640).
 *
 * It used to start on "Gemeinsam" every time, which is the safe half (it feeds
 * both) but not the visible one: whoever clicked "Hell" or "Dunkel" once and
 * then set a colour on the wrong half saw nothing change and read it as the
 * accent overriding their value. Only the opening choice is made here — the
 * moment a tab is clicked the page stops deciding, and the Design page forgets
 * the choice again when it unmounts, so the next visit re-reads the screen.
 */
export function useStartBrightness(): void {
    const twoBrightnesses = useHasTwoBrightnesses();
    const shown = useShownBrightness();
    const startAt = useEditBrightness((s) => s.startAt);
    const forget = useEditBrightness((s) => s.forget);
    useEffect(() => {
        startAt(twoBrightnesses ? shown : 'base');
    }, [twoBrightnesses, shown, startAt]);
    useEffect(() => forget, [forget]);
}

interface BrightnessTabsProps {
    value: VarScope;
    onChange: (scope: VarScope) => void;
    /** Drop the "shared" tab where only the two halves make sense (preset picker). */
    scopes?: VarScope[];
    /** Scopes that currently carry something — marked with a dot. */
    filled?: VarScope[];
}

/** Segmented control: shared / light / dark. */
export function BrightnessTabs({
    value,
    onChange,
    scopes = ['base', 'light', 'dark'],
    filled = [],
}: BrightnessTabsProps) {
    const t = useT();
    const label: Record<VarScope, string> = {
        base: t('theme.scope.base'),
        light: t('theme.scope.light'),
        dark: t('theme.scope.dark'),
    };
    const icon: Record<VarScope, React.ReactNode> = {
        base: <Circle size={12} />,
        light: <Sun size={12} />,
        dark: <Moon size={12} />,
    };
    return (
        <div
            className="inline-flex rounded-lg p-0.5 gap-0.5"
            style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
        >
            {scopes.map((s) => (
                <button
                    key={s}
                    data-aura-brightness={s}
                    aria-pressed={value === s}
                    onClick={() => onChange(s)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
                    style={{
                        background: value === s ? 'color-mix(in srgb, var(--accent) 18%, transparent)' : 'transparent',
                        color: value === s ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                >
                    {icon[s]}
                    {label[s]}
                    {filled.includes(s) && (
                        <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: value === s ? 'var(--accent)' : 'var(--text-secondary)' }}
                        />
                    )}
                </button>
            ))}
        </div>
    );
}
