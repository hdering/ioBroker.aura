import { useConfigStore } from '../store/configStore';
import { de, type TranslationKey } from './de';
import { en } from './en';

export type Language = 'de' | 'en';

const TRANSLATIONS: Record<Language, Record<TranslationKey, string>> = { de, en };

/**
 * Interpolate variables in a translation string.
 * Replaces `{key}` placeholders with values from `vars`.
 */
function interpolate(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
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
  return interpolate(str, vars);
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
    return interpolate(str, vars);
  };
}

export type { TranslationKey };
