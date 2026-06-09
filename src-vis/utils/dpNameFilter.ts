import { useGlobalSettingsStore } from '../store/globalSettingsStore';

function filterPart(s: string, suffixes: string[], replaceDots: boolean): string {
    let result = s;
    for (const suffix of suffixes) {
        if (result.toLowerCase().endsWith(suffix.toLowerCase())) {
            result = result.slice(0, result.length - suffix.length).trimEnd();
        }
    }
    if (replaceDots) result = result.replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
    return result || s;
}

/** Apply configured DP name transformations to each part of a "parent › state" name. */
export function applyDpNameFilter(name: string): string {
    const { dpNameSuffixes, dpNameReplaceDots } = useGlobalSettingsStore.getState();
    if (!dpNameSuffixes && !dpNameReplaceDots) return name;
    const suffixes = dpNameSuffixes
        ? dpNameSuffixes
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
        : [];
    const parts = name.split(' › ');
    return parts.map((p) => filterPart(p, suffixes, dpNameReplaceDots)).join(' › ') || name;
}
