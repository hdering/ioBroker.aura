import type { UserTheme } from '../themes';

/**
 * Import / export of own themes (#640).
 *
 * A theme is worth sharing — between two ioBroker installations, or with the
 * forum — so it travels as a small JSON file rather than through a backup of
 * the whole configuration. Kept pure and separate from the UI so the format has
 * a unit test of its own.
 */

export const THEME_FILE_KIND = 'aura-theme';
export const THEME_FILE_VERSION = 1;

export interface ThemeFile {
    kind: typeof THEME_FILE_KIND;
    version: number;
    themes: Omit<UserTheme, 'id'>[];
}

/** The export payload — ids are dropped, the importing side assigns its own. */
export function serializeThemes(themes: UserTheme[]): string {
    const file: ThemeFile = {
        kind: THEME_FILE_KIND,
        version: THEME_FILE_VERSION,
        themes: themes.map(({ name, dark, baseId, vars }) => ({ name, dark, baseId, vars })),
    };
    return JSON.stringify(file, null, 2);
}

function isVarRecord(v: unknown): v is Record<string, string> {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    return Object.entries(v as Record<string, unknown>).every(
        ([k, val]) => k.startsWith('--') && typeof val === 'string',
    );
}

function asTheme(raw: unknown): Omit<UserTheme, 'id'> | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    if (typeof o.name !== 'string' || !o.name.trim()) return null;
    if (!isVarRecord(o.vars)) return null;
    return {
        name: o.name.trim().slice(0, 40),
        dark: o.dark === true,
        baseId: typeof o.baseId === 'string' && o.baseId ? o.baseId : o.dark === true ? 'dark' : 'light',
        vars: o.vars,
    };
}

/**
 * Read an exported file back.
 *
 * Takes the wrapper, a bare list and a single theme object — a user who copies
 * one theme out of a file by hand should not have to rebuild the envelope.
 * Returns an empty list rather than throwing; the caller shows one message.
 */
export function parseThemeFile(text: string): Omit<UserTheme, 'id'>[] {
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        return [];
    }
    const list = Array.isArray(data)
        ? data
        : data && typeof data === 'object' && Array.isArray((data as ThemeFile).themes)
          ? (data as ThemeFile).themes
          : [data];
    return list.map(asTheme).filter((t): t is Omit<UserTheme, 'id'> => t !== null);
}

/** A name that is not taken yet ("Mein Theme", "Mein Theme 2", …). */
export function uniqueThemeName(name: string, taken: string[]): string {
    if (!taken.includes(name)) return name;
    let n = 2;
    while (taken.includes(`${name} ${n}`)) n++;
    return `${name} ${n}`;
}
