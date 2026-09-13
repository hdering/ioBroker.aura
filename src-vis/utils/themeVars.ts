import type { AllVars } from '../themes';

/**
 * Custom theme variables, split by the brightness they apply to (#640).
 *
 * Before this there was ONE set of overrides, laid on top of whatever theme was
 * active. With "theme follows the browser" (or the dark/light-mode datapoint)
 * two themes are in play on the same installation, so an accent that works on
 * the light one was forced onto the dark one as well — the user could not give
 * the two halves different colours at all.
 *
 * `base` is the shared layer and keeps every stored `customVars` working exactly
 * as before; `light` / `dark` are laid on top of it for the matching brightness
 * only. The brightness comes from the theme that is actually being rendered, NOT
 * from the followBrowser flag — the mode datapoint and the header sun/moon
 * button switch brightness too (#573).
 */
export interface VarSets {
    base?: Partial<AllVars>;
    light?: Partial<AllVars>;
    dark?: Partial<AllVars>;
}

/** Which of the three sets an editor writes to. */
export type VarScope = 'base' | 'light' | 'dark';

export const VAR_SCOPES: VarScope[] = ['base', 'light', 'dark'];

/** The per-scope keys as they are stored on a layout / section. */
export const VAR_SET_KEYS = {
    base: 'customVars',
    light: 'customVarsLight',
    dark: 'customVarsDark',
} as const;

/** The overrides that apply to a theme of the given brightness. */
export function resolveThemeVars(dark: boolean, sets: VarSets | undefined): Partial<AllVars> {
    if (!sets) return {};
    const polarity = dark ? sets.dark : sets.light;
    if (!polarity || !Object.keys(polarity).length) return sets.base ?? {};
    return { ...sets.base, ...polarity };
}

/** The value a single var resolves to, or undefined when nothing overrides it. */
export function resolveVar(key: keyof AllVars, dark: boolean, sets: VarSets | undefined): string | undefined {
    if (!sets) return undefined;
    const polarity = dark ? sets.dark : sets.light;
    return polarity?.[key] ?? sets.base?.[key];
}

/** True when any of the three sets carries at least one override. */
export function hasVars(sets: VarSets | undefined): boolean {
    if (!sets) return false;
    return VAR_SCOPES.some((s) => Object.keys(sets[s] ?? {}).length > 0);
}

/** Every key touched in any of the three sets (what "reset all" would clear). */
export function varKeys(sets: VarSets | undefined): (keyof AllVars)[] {
    if (!sets) return [];
    const out = new Set<string>();
    for (const s of VAR_SCOPES) Object.keys(sets[s] ?? {}).forEach((k) => out.add(k));
    return [...out] as (keyof AllVars)[];
}

/** All three sets flattened for the given brightness — used when saving an own theme. */
export function flattenVars(dark: boolean, sets: VarSets | undefined): Partial<AllVars> {
    return resolveThemeVars(dark, sets);
}
