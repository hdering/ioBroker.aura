import type { ConditionSet, WidgetConfig } from '../types';

// ── "Anzeige überschreiben": the non-CSS half of a condition effect ───────────
//
// Colours travel as CSS custom properties on the frame root, which is why they
// reach all 55 widget types for free. Which icon, how big, the title and the
// displayed value cannot: they are values a widget reads out of its own config
// (issue #96). So WidgetFrame hands the widget a *derived* copy of the config
// instead — the same channel `[[dp]]` titles already use.
//
// The derived copy must never be written back. stripRenderOverrides() undoes it
// before anything reaches onConfigChange, so a rule that currently paints a
// different icon cannot quietly persist it into the layout.

/** ConditionSet field → the `config.options` key it overrides. `title` is separate. */
const OPTION_KEYS: Record<string, string> = {
    showTitle: 'showTitle',
    icon: 'icon',
    iconSize: 'iconSize',
    showIcon: 'showIcon',
    valueText: 'valueTextOverride',
};

export const EMPTY_SET: ConditionSet = {};

export function isEmptySet(set: ConditionSet | undefined): boolean {
    if (!set) return true;
    return Object.values(set).every((v) => v === undefined);
}

/** The option patch a set produces, or null when it touches no option. */
export function conditionSetToOptions(set: ConditionSet | undefined): Record<string, unknown> | null {
    if (!set) return null;
    let out: Record<string, unknown> | null = null;
    for (const [field, optKey] of Object.entries(OPTION_KEYS)) {
        const v = (set as Record<string, unknown>)[field];
        if (v === undefined) continue;
        (out ??= {})[optKey] = v;
    }
    return out;
}

/**
 * The config a widget is rendered with.
 *
 * @param config        the stored config
 * @param renderedTitle the title after `[[dp]]` substitution — the caller resolves
 *                      `set.title ?? config.title`, so a conditional title can carry
 *                      live tokens too
 * @param set           the merged overrides of all matching rules
 *
 * Returns `config` itself when nothing applies: the identity matters, React bails
 * out of re-rendering the widget body on it.
 */
export function applyConditionSet(
    config: WidgetConfig,
    renderedTitle: string,
    set: ConditionSet | undefined,
): WidgetConfig {
    const title = config.options?.hideTitle ? '' : renderedTitle;
    const opts = conditionSetToOptions(set);
    const titleChanged = title !== config.title;
    if (!titleChanged && !opts) return config;
    return {
        ...config,
        ...(titleChanged ? { title } : null),
        ...(opts ? { options: { ...config.options, ...opts } } : null),
    };
}

/**
 * Reverse of applyConditionSet for the write path.
 *
 * A widget that calls onConfigChange spreads the config it was handed — the derived
 * one. Every key that differs between `derived` and `raw` is an override, so it is
 * restored to the stored value. A key the widget itself changed no longer carries
 * the derived value and is left alone.
 */
export function stripRenderOverrides(next: WidgetConfig, raw: WidgetConfig, derived: WidgetConfig): WidgetConfig {
    if (derived === raw) return next;

    let out = next;
    if (derived.title !== raw.title && next.title === derived.title) out = { ...out, title: raw.title };

    const dOpts = (derived.options ?? {}) as Record<string, unknown>;
    const rOpts = (raw.options ?? {}) as Record<string, unknown>;
    const nOpts = (next.options ?? {}) as Record<string, unknown>;
    let opts: Record<string, unknown> | null = null;
    for (const key of Object.keys(dOpts)) {
        if (dOpts[key] === rOpts[key]) continue; // not an override
        if (nOpts[key] !== dOpts[key]) continue; // the widget changed it on purpose
        opts ??= { ...nOpts };
        if (key in rOpts) opts[key] = rOpts[key];
        else delete opts[key];
    }
    if (opts) out = { ...out, options: opts };
    return out;
}

/**
 * The text a condition wants shown instead of the widget's own value. Only widgets
 * that declare the 'value' slot in widgetRegistry read this — the editor offers the
 * field nowhere else, so a configured override always has an effect.
 */
export function valueTextOverride(config: WidgetConfig): string | undefined {
    const v = config.options?.valueTextOverride;
    return typeof v === 'string' && v !== '' ? v : undefined;
}
