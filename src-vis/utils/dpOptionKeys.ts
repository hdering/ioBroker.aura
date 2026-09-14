/**
 * The codebase-wide naming convention for a datapoint-carrying option key:
 * the top-level `datapoint` plus every option ending in `Dp` or `Datapoint`.
 *
 * Lives on its own so the rule has exactly one home and the modules that only
 * need to *classify* a key (widget style copy) do not have to pull in the widget
 * registry the preset walker uses.
 */
export function isDpOptionKey(key: string): boolean {
    return key === 'datapoint' || key.endsWith('Dp') || key.endsWith('Datapoint');
}
