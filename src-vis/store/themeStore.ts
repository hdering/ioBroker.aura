import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { managedStorage } from './persistManager';
import {
    DEFAULT_THEME_ID,
    THEMES,
    USER_THEME_PREFIX,
    getTheme,
    isUserThemeId,
    setUserThemes,
    type AllVars,
    type UserTheme,
} from '../themes';
import type { VarScope, VarSets } from '../utils/themeVars';

interface ThemeState {
    themeId: string;
    /** Shared overrides — apply to every brightness (this is the historic customVars). */
    customVars: Partial<AllVars>;
    /** Overrides that only apply while a LIGHT theme is rendered (#640). */
    customVarsLight: Partial<AllVars>;
    /** Overrides that only apply while a DARK theme is rendered (#640). */
    customVarsDark: Partial<AllVars>;
    /** Themes the user made themselves (#640). */
    userThemes: UserTheme[];
    adminThemeId: string;
    followBrowser: boolean;
    browserDarkThemeId: string;
    browserLightThemeId: string;
    setTheme: (id: string) => void;
    applyThemePreset: (id: string) => void;
    setCustomVar: (key: keyof AllVars, value: string, scope?: VarScope) => void;
    clearCustomVar: (key: keyof AllVars, scope?: VarScope) => void;
    resetCustom: (scope?: VarScope) => void;
    setAdminTheme: (id: string) => void;
    setFollowBrowser: (v: boolean) => void;
    setBrowserDarkThemeId: (id: string) => void;
    setBrowserLightThemeId: (id: string) => void;
    addUserTheme: (theme: Omit<UserTheme, 'id'>) => string;
    updateUserTheme: (id: string, patch: Partial<Omit<UserTheme, 'id'>>) => void;
    removeUserTheme: (id: string) => void;
}

const SET_KEY: Record<VarScope, 'customVars' | 'customVarsLight' | 'customVarsDark'> = {
    base: 'customVars',
    light: 'customVarsLight',
    dark: 'customVarsDark',
};

/** A readable, collision-free id for an own theme. */
function newUserThemeId(existing: UserTheme[]): string {
    let n = existing.length + 1;
    let id = `${USER_THEME_PREFIX}${n}`;
    while (existing.some((t) => t.id === id)) id = `${USER_THEME_PREFIX}${++n}`;
    return id;
}

/**
 * A theme id that still exists, or the default.
 *
 * Deleting an own theme that some scope still points at must not leave the
 * frontend on a theme that is gone — getTheme() would silently fall back to
 * THEMES[0] on every read, which looks like "my design reverted for no reason".
 */
function fallbackId(id: string, themes: UserTheme[]): string {
    if (!isUserThemeId(id)) return id;
    return themes.some((t) => t.id === id) ? id : DEFAULT_THEME_ID;
}

export const useThemeStore = create<ThemeState>()(
    persist(
        (set) => ({
            themeId: DEFAULT_THEME_ID,
            customVars: {},
            customVarsLight: {},
            customVarsDark: {},
            userThemes: [],
            adminThemeId: 'light',
            followBrowser: false,
            browserDarkThemeId: 'dark',
            browserLightThemeId: 'light',
            setTheme: (id) => set({ themeId: id }),
            // Atomic preset switch: set the theme AND clear custom overrides in a
            // single persist write. Doing this as two calls (setTheme + resetCustom)
            // produced a byte-identical aura-theme blob on the second write whenever
            // customVars was already empty, which managedStorage's no-op detection
            // treated as a revert and cleared the just-set dirty flag → no save button.
            // All three var sets go: a preset is a fresh start, and leaving the
            // light/dark halves behind would carry colours of the OLD preset into
            // the new one for exactly one brightness (#640).
            applyThemePreset: (id) => set({ themeId: id, customVars: {}, customVarsLight: {}, customVarsDark: {} }),
            setCustomVar: (key, value, scope = 'base') =>
                set((s) => ({ [SET_KEY[scope]]: { ...s[SET_KEY[scope]], [key]: value } }) as Partial<ThemeState>),
            clearCustomVar: (key, scope = 'base') =>
                set((s) => {
                    const next = { ...s[SET_KEY[scope]] };
                    delete next[key];
                    return { [SET_KEY[scope]]: next } as Partial<ThemeState>;
                }),
            // No argument clears every set — that is what "reset to defaults" on
            // the whole panel means.
            resetCustom: (scope) =>
                set(
                    scope
                        ? ({ [SET_KEY[scope]]: {} } as Partial<ThemeState>)
                        : { customVars: {}, customVarsLight: {}, customVarsDark: {} },
                ),
            setAdminTheme: (id) => set({ adminThemeId: id }),
            setFollowBrowser: (v) => set({ followBrowser: v }),
            setBrowserDarkThemeId: (id) => set({ browserDarkThemeId: id }),
            setBrowserLightThemeId: (id) => set({ browserLightThemeId: id }),
            addUserTheme: (theme) => {
                const id = newUserThemeId(useThemeStore.getState().userThemes);
                set((s) => ({ userThemes: [...s.userThemes, { ...theme, id }] }));
                return id;
            },
            updateUserTheme: (id, patch) =>
                set((s) => ({ userThemes: s.userThemes.map((t) => (t.id === id ? { ...t, ...patch, id } : t)) })),
            removeUserTheme: (id) =>
                set((s) => {
                    const userThemes = s.userThemes.filter((t) => t.id !== id);
                    return {
                        userThemes,
                        themeId: fallbackId(s.themeId, userThemes),
                        browserDarkThemeId: fallbackId(s.browserDarkThemeId, userThemes),
                        browserLightThemeId: fallbackId(s.browserLightThemeId, userThemes),
                        adminThemeId: fallbackId(s.adminThemeId, userThemes),
                    };
                }),
        }),
        { name: 'aura-theme', storage: createJSONStorage(() => managedStorage) },
    ),
);

// ── Registry bridge ──────────────────────────────────────────────────────────
// getTheme() is a plain function — canvas colours, the boot path and the admin
// all call it outside React — so the own themes have to reach the themes module
// itself. Zustand's persist hydrates from localStorage while the store is being
// created, so this first call already sees the saved themes: the registry is
// complete before createRoot, and the first paint uses the right palette instead
// of falling back to the default (same reason the icon cache restores this
// early, #636).
let mirrored: UserTheme[] | null = null;
function mirrorUserThemes(list: UserTheme[]) {
    if (list === mirrored) return;
    mirrored = list;
    setUserThemes(list);
}
mirrorUserThemes(useThemeStore.getState().userThemes ?? []);
useThemeStore.subscribe((s) => mirrorUserThemes(s.userThemes ?? []));

/** The three var sets of the global scope, as the shape the resolver expects. */
export function globalVarSets(s: ThemeState): VarSets {
    return { base: s.customVars, light: s.customVarsLight, dark: s.customVarsDark };
}

/**
 * A snapshot of what the frontend shows right now, as an own theme.
 *
 * The base is the preset the look is built on: a built-in is its own base, an
 * own theme hands its base along (see materializeUserTheme — bases never chain).
 */
export function snapshotUserTheme(themeId: string, vars: Partial<AllVars>, name: string): Omit<UserTheme, 'id'> {
    const source = useThemeStore.getState().userThemes.find((t) => t.id === themeId);
    const theme = getTheme(themeId);
    const baseId = source ? source.baseId : THEMES.some((t) => t.id === themeId) ? themeId : DEFAULT_THEME_ID;
    return {
        name,
        dark: theme.dark,
        baseId,
        vars: { ...(source?.vars ?? {}), ...vars },
    };
}
