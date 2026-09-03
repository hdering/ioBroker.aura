import { create } from 'zustand';

/**
 * "The theme's CSS variables are now in the DOM."
 *
 * Anything that has to READ a token in JavaScript (a canvas colour: eCharts) has
 * an ordering problem without this. React runs effects child first, so a widget
 * that re-renders on a theme switch reads `getComputedStyle` BEFORE
 * ThemeProvider's effect has written the new values — it would resolve the old
 * theme and then never hear about it again.
 *
 * So the two writers (ThemeProvider for the global variables, App for the
 * layout/section-scoped `<style>`) bump this counter right after writing, and the
 * readers subscribe to it. The signal is the write, not the store it came from —
 * which also covers the dark/light mode datapoint and a theme picked per section.
 */
interface ThemeEpochState {
    epoch: number;
}

export const useThemeEpochStore = create<ThemeEpochState>()(() => ({ epoch: 0 }));

/** Call after the variables have been applied to the DOM. */
export function bumpThemeEpoch(): void {
    useThemeEpochStore.setState((s) => ({ epoch: s.epoch + 1 }));
}

/** Subscribe: the value changes whenever the applied variables changed. */
export function useThemeEpoch(): number {
    return useThemeEpochStore((s) => s.epoch);
}
