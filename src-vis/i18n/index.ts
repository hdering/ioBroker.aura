import { useConfigStore } from '../store/configStore';
import { de, type TranslationKey } from './de';
import { en } from './en';
import { NS } from '../utils/namespace';
import { APPLE_KEY_LABELS, isApplePlatform, type ShortcutKey } from '../utils/platformKeys';

export type Language = 'de' | 'en';

const TRANSLATIONS: Record<Language, Record<TranslationKey, string>> = { de, en };

/**
 * Name of a shortcut key as this user's keyboard prints it: ⌘/⌥/⌫ on Apple,
 * the translated Strg/Ctrl, Alt, Entf/Del everywhere else (#651).
 */
export function keyLabel(key: ShortcutKey, lang?: Language): string {
    if (isApplePlatform()) return APPLE_KEY_LABELS[key];
    const l = lang ?? ((useConfigStore.getState().frontend.language ?? 'de') as Language);
    return (TRANSLATIONS[l] ?? TRANSLATIONS.de)[`keys.${key}` as TranslationKey];
}

// Variables auto-injected into every translation. `{ns}` resolves to the
// current ioBroker instance namespace (aura.0, aura.1, …) so hint strings
// reference the actual running instance; `{mod}`, `{alt}` and `{del}` to the
// key names of the platform the browser runs on.
function defaultVars(lang: Language): Record<string, string> {
    return { ns: NS, mod: keyLabel('mod', lang), alt: keyLabel('alt', lang), del: keyLabel('del', lang) };
}

/**
 * Interpolate variables in a translation string.
 * Replaces `{key}` placeholders with values from `vars`.
 */
function interpolate(str: string, lang: Language, vars?: Record<string, string | number>): string {
    // Nothing to substitute — skip building the defaults, which is the common case.
    if (!str.includes('{')) return str;
    const merged = vars ? { ...defaultVars(lang), ...vars } : defaultVars(lang);
    return str.replace(/\{(\w+)\}/g, (_, k) => String(merged[k] ?? `{${k}}`));
}

/**
 * Module-level t() — reads current language directly from the store (no hook).
 * Safe to call inside render functions, event handlers, and utility functions.
 * When the language changes, any React component using `useT()` will re-render
 * and call this function again with the updated language.
 */
export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
    const lang = (useConfigStore.getState().frontend.language ?? 'de') as Language;
    const dict = TRANSLATIONS[lang] ?? TRANSLATIONS.de;
    const str = dict[key] ?? TRANSLATIONS.de[key] ?? key;
    return interpolate(str, lang, vars);
}

/**
 * React hook — subscribes to language changes and triggers re-renders.
 * Use this in React components that need to update when the language changes.
 * Returns a `t()` function bound to the current language.
 */
export function useT(): (key: TranslationKey, vars?: Record<string, string | number>) => string {
    const lang = useConfigStore((s) => (s.frontend.language ?? 'de') as Language);
    return (key: TranslationKey, vars?: Record<string, string | number>): string => {
        const dict = TRANSLATIONS[lang] ?? TRANSLATIONS.de;
        const str = dict[key] ?? TRANSLATIONS.de[key] ?? key;
        return interpolate(str, lang, vars);
    };
}

export type { TranslationKey };
