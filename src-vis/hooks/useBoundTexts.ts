import { useMemo } from 'react';
import { useT } from '../i18n';
import { useTemplateStates } from './useTemplateValues';
import { useTemplateSpecials } from './useTemplateSpecials';
import { extractTemplateDpRefs, renderTemplate } from '../utils/htmlTemplate';
import { formatNum } from '../utils/formatValue';
import { useGlobalSettingsStore } from '../store/globalSettingsStore';
import type { WidgetConfig } from '../types';

/**
 * A list of short texts (series names, legend labels, group titles) with their bindings resolved
 * (issue #919) — `{dp.id}`, `{dp.id;date(DD.MM.)}`, `{{ a + b }}`.
 *
 * Same binding layer as free HTML and the section title's subtitle (utils/htmlTemplate,
 * docs/widgets/bindings.md). A text without a brace subscribes to nothing and comes back as
 * typed. While a text's datapoints have not arrived yet, `fallback(idx)` stands in for it
 * instead of a dash. The returned array keeps its identity as long as no text changes, so a
 * caller can key a memo on it.
 */
export function useBoundTexts(
    texts: (string | undefined)[],
    config: WidgetConfig,
    fallback: (idx: number) => string | undefined = () => '',
): (string | undefined)[] {
    const t = useT();
    const { defaultDecimals, numberFormat } = useGlobalSettingsStore();
    const templatesKey = texts.map((s) => (s?.includes('{') ? s : '')).join('\u0000');
    const templates = useMemo(() => templatesKey.split('\u0000'), [templatesKey]);
    const refsPerText = useMemo(() => templates.map((tpl) => (tpl ? extractTemplateDpRefs(tpl) : [])), [templates]);
    const allRefs = useMemo(() => [...new Set(refsPerText.flat())], [refsPerText]);
    const states = useTemplateStates(allRefs);
    const specials = useTemplateSpecials(config);

    const rendered = texts.map((text, idx) => {
        const tpl = templates[idx];
        if (!tpl) return text;
        if (refsPerText[idx]?.some((ref) => !states[ref])) return fallback(idx);
        const fmt = (v: unknown): string => {
            if (v === null || v === undefined) return '–';
            return typeof v === 'number' ? formatNum(v, defaultDecimals, numberFormat) : String(v);
        };
        return renderTemplate(tpl, {
            vars: Object.fromEntries(Object.entries(specials).map(([k, v]) => [k, String(v)])),
            resolve: (ref) => fmt(states[ref]?.val),
            resolveRaw: (ref, field) => states[ref]?.[field] ?? null,
            rawVars: { ...specials },
            ops: { formatNum: (v, d) => formatNum(v, d, numberFormat), decimals: defaultDecimals, t },
        });
    });

    // Keyed on the rendered text: a state update that leaves every text as it was must not
    // hand out a fresh array. `undefined` and '' are kept apart, a caller may treat them differently.
    const renderedKey = JSON.stringify(rendered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return useMemo(() => rendered, [renderedKey]);
}
