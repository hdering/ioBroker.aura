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

/**
 * Key of a datapoint reference anywhere inside a widget's options — the option
 * rule above plus the field names nested shapes use (`dp`, `dpId`,
 * `datapointId` of echart series, `statusDpId` …).
 */
function isNestedDpKey(key: string): boolean {
    return isDpOptionKey(key) || key === 'dp' || key === 'dpId' || key === 'datapointId' || key.endsWith('DpId');
}

/**
 * Every datapoint id a widget references: the main `datapoint` plus all DP
 * fields found by walking its options (series, custom-grid cells, list
 * entries, background image …). Deduplicated, order of first occurrence.
 */
export function collectWidgetDpIds(config: { datapoint?: string; options?: Record<string, unknown> }): string[] {
    const out = new Set<string>();
    const add = (v: unknown) => {
        if (typeof v === 'string' && v.trim()) out.add(v.trim());
    };
    add(config.datapoint);
    const seen = new Set<object>();
    const walk = (node: unknown): void => {
        if (!node || typeof node !== 'object' || seen.has(node)) return;
        seen.add(node);
        if (Array.isArray(node)) {
            for (const item of node) walk(item);
            return;
        }
        for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
            if (typeof val === 'string') {
                if (isNestedDpKey(key)) add(val);
            } else walk(val);
        }
    };
    walk(config.options);
    return [...out];
}
