'use strict';

/**
 * Guards the generated AI widget schema (public/ai/aura-widget-schema.json).
 *
 * The schema is what a language model reads to produce an importable widget or
 * tab JSON, so a gap in it does not fail loudly — it just makes the model invent
 * an option that silently does nothing. These checks turn that into a red test:
 *
 *   1. It covers exactly the widget types the app knows.
 *   2. Every layout it offers is a real WidgetLayout.
 *   3. Every `ref` and every `commonOptions` entry resolves.
 *   4. Every option key used by a REAL config (the screenshot harness) exists in
 *      the schema for that type. This is the check with teeth: it caught
 *      `gauge.min` / `gauge.max` / `header.title` being set on widgets that never
 *      read them.
 *
 * Freshness (schema vs. current sources) is a separate step: `npm run schema:check`.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const schema = JSON.parse(read('public/ai/aura-widget-schema.json'));

// ── 1. Type coverage ─────────────────────────────────────────────────────────
const union = (name) =>
    read('src-vis/types/index.ts')
        .split(`export type ${name} =`)[1]
        .split(';')[0]
        .split('|')
        .map((s) => s.trim().replace(/^'|'$/g, ''))
        .filter(Boolean);

const widgetTypes = union('WidgetType');
const layoutTypes = union('WidgetLayout');
assert.ok(widgetTypes.length > 40, `expected the WidgetType union, got ${widgetTypes.length}`);

const inSchema = Object.keys(schema.widgets);
assert.deepStrictEqual(
    widgetTypes.filter((t) => !inSchema.includes(t)),
    [],
    'widget types missing from the schema — run: npm run schema',
);
assert.deepStrictEqual(
    inSchema.filter((t) => !widgetTypes.includes(t)),
    [],
    'schema describes widget types that no longer exist — run: npm run schema',
);

// ── 2./3. Internal consistency ───────────────────────────────────────────────
const refsOf = (entry) => [entry.ref, entry.items && entry.items.ref].filter(Boolean);

for (const [type, w] of Object.entries(schema.widgets)) {
    assert.ok(w.layouts.length > 0, `${type}: no layouts`);
    for (const l of w.layouts) {
        assert.ok(layoutTypes.includes(l), `${type}: "${l}" is not a WidgetLayout`);
    }
    for (const key of w.commonOptions) {
        assert.ok(schema.commonOptions[key], `${type}: commonOptions "${key}" is not defined`);
    }
    for (const [key, entry] of Object.entries(w.options)) {
        for (const ref of refsOf(entry)) {
            assert.ok(schema.types[ref], `${type}.${key}: ref "${ref}" is not in types`);
        }
    }
}
for (const [key, entry] of Object.entries(schema.commonOptions)) {
    for (const ref of refsOf(entry)) {
        assert.ok(schema.types[ref], `commonOptions.${key}: ref "${ref}" is not in types`);
    }
}

// ── 4. Cross-check against real widget configs ───────────────────────────────
// The screenshot harness configures every widget the way the documentation shows
// it, so its option keys are a working sample of what people actually write.
(async () => {
    const { WIDGETS } = await import('../tools/screenshots/widgets-meta.mjs');

    const unknown = [];
    const check = (type, options) => {
        const w = schema.widgets[type];
        if (!w) {
            return unknown.push(`${type} (whole type)`);
        }
        for (const key of Object.keys(options ?? {})) {
            if (!(key in w.options) && !w.commonOptions.includes(key)) {
                unknown.push(`${type}.${key}`);
            }
        }
    };

    let checked = 0;
    for (const w of WIDGETS) {
        if (w.runtime) {
            check(w.type, w.runtime.options);
            checked++;
        }
        for (const shot of w.shots ?? []) {
            check(w.type, shot.options);
            checked++;
        }
    }

    // Widgets that need real adapter data have `runtime: null` and contribute
    // nothing here; the rest is a broad enough sample.
    assert.ok(checked > 15, `expected the harness to configure many widgets, got ${checked}`);
    assert.deepStrictEqual(
        unknown,
        [],
        'option keys used by the screenshot harness that no widget reads — ' +
            'either the schema is stale (npm run schema) or the harness sets a dead option',
    );

    const described = Object.values(schema.widgets).reduce(
        (n, w) => n + Object.values(w.options).filter((o) => o.description).length,
        0,
    );
    const total = Object.values(schema.widgets).reduce((n, w) => n + Object.keys(w.options).length, 0);
    console.log(
        `widget schema: ${inSchema.length} types, ${checked} real configs cross-checked, ` +
            `${described}/${total} widget options described`,
    );
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
