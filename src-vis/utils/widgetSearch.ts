/**
 * Free-text search inside the "Neues Widget" dialog.
 *
 * An entry's haystack is deliberately wider than its own label: a template also
 * carries the widget type behind it, so "Wert" finds every template that ends up
 * as a Wert-Anzeige — not just the one literally called "Messwert".
 *
 * Pure string work on purpose — tools/tests/widget-search.mjs pins the rules
 * without a dev server.
 */

/** Written-out umlauts, so "waermepumpe" finds "Wärmepumpe". */
const FOLD: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

/** Lowercase, drop diacritics, reduce everything else to single spaces. */
function plain(input: string): string {
    return input
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/** What the user typed, reduced to plain lowercase words. */
export function normalizeQuery(input: string | undefined | null): string {
    return plain(input ?? '');
}

/**
 * The searchable text of one entry. Both spellings of an umlaut end up in it
 * ("warme" and "waerme"), so either way of typing it hits — the query itself is
 * only stripped, never expanded.
 */
export function buildHaystack(parts: (string | undefined | null)[]): string {
    const text = parts.filter(Boolean).join(' ');
    const stripped = plain(text);
    const folded = plain(text.toLowerCase().replace(/[äöüß]/g, (c) => FOLD[c]));
    return folded === stripped ? stripped : `${stripped} ${folded}`;
}

/** The bits of a widget type a search should find it by. */
export interface SearchableWidgetMeta {
    type: string;
    label?: string;
    shortLabel?: string;
    hint?: string;
}

/**
 * Searchable text of a quick-select template. Besides its own label it carries
 * the widget type behind it and the category it sits in, which is the whole
 * point: "Wert" has to bring up the Messwerte column and everything that ends up
 * as a Wert-Anzeige, not only the one template literally called "Messwert".
 */
export function templateHaystack(
    tpl: { label: string; hint?: string; widgetType: string },
    meta?: SearchableWidgetMeta,
    categoryLabel?: string,
): string {
    return buildHaystack([
        tpl.label,
        tpl.hint,
        tpl.widgetType,
        categoryLabel,
        meta?.label,
        meta?.shortLabel,
        meta?.hint,
    ]);
}

/** Searchable text of a widget type listed under "Weitere Widgets". */
export function widgetHaystack(meta: SearchableWidgetMeta): string {
    return buildHaystack([meta.label, meta.shortLabel, meta.hint, meta.type]);
}

/** Every word of the query has to appear somewhere in the haystack. */
export function matchesQuery(haystack: string, query: string): boolean {
    const words = query.split(' ').filter(Boolean);
    if (!words.length) return true;
    return words.every((word) => haystack.includes(word));
}
