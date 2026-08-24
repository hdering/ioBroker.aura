// Verifies the condition effect "Anzeige überschreiben" (issue #96) against the
// dev server.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/condition-set-ui.mjs
//
// Colours reach a widget as CSS variables, which is why they work everywhere. Icon,
// title and value text cannot: they are values the widget reads out of its own
// config, so WidgetFrame hands the body a derived copy instead. This test drives
// that channel end to end — the derived values must appear while the rule matches
// and disappear again when it stops.
//
// Datapoint values are injected into the in-memory cache via the screenshot harness
// (__auraShot.mock) — no socket write, no real datapoint is touched.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const VAL = 'demo.csValue';
const ALARM = 'demo.csAlarm';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) => check(name, got === want, got === want ? '' : `got ${got}, want ${want}`);

function rule(id, set, style = {}) {
    return {
        id,
        label: id,
        logic: 'AND',
        clauses: [{ datapoint: ALARM, operator: 'true', value: '' }],
        style,
        set,
        effect: 'none',
    };
}

function widget(conditions) {
    return {
        id: 'cs-test',
        type: 'value',
        title: 'Küche',
        datapoint: VAL,
        gridPos: { x: 0, y: 0, w: 12, h: 6 },
        options: { icon: 'Thermometer', iconSize: 20, decimals: 1, unit: '°C', conditions },
    };
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

const settle = () => page.waitForTimeout(500);
/** The Iconify wrapper renders dimensionless until the icon set has loaded. */
const iconReady = () =>
    page
        .waitForFunction(
            () => !!document.querySelector('.aura-widget-cs-test .aura-widget-icon')?.getAttribute('width'),
            {
                timeout: 10000,
            },
        )
        .catch(() => {});
const mock = (map) => page.evaluate((m) => window.__auraShot.mock(m), map);
const show = async (conditions) => {
    await page.evaluate((w) => window.__auraShot.showWidgets([w]), widget(conditions));
    await settle();
};

const text = (sel) =>
    page.evaluate((s) => document.querySelector(`.aura-widget-cs-test ${s}`)?.textContent?.trim() ?? null, sel);
const attr = (sel, name) =>
    page.evaluate(
        ([s, a]) => document.querySelector(`.aura-widget-cs-test ${s}`)?.getAttribute(a) ?? null,
        [sel, name],
    );
const cssVar = (name) =>
    page.evaluate((n) => {
        const el = document.querySelector('.aura-widget-cs-test');
        return el ? el.style.getPropertyValue(n).trim() || null : null;
    }, name);

await mock({ [VAL]: 21.5, [ALARM]: false });

// ── 1. Baseline: no rule matches ─────────────────────────────────────────────
await show([rule('r1', { icon: 'AlertTriangle', iconSize: 40, title: 'Alarm', valueText: 'STÖRUNG' })]);

await iconReady();
eq('baseline: own title', await text('.aura-widget-title'), 'Küche');
eq('baseline: own icon size', await attr('.aura-widget-icon', 'width'), '20');
// The value element holds number + unit; the unit is a sibling span inside it.
eq('baseline: own value', await text('.aura-widget-value'), '21.5°C');

// ── 2. Rule matches: the overrides arrive ────────────────────────────────────
await mock({ [ALARM]: true });
await settle();

eq('match: title overridden', await text('.aura-widget-title'), 'Alarm');
eq('match: icon size overridden', await attr('.aura-widget-icon', 'width'), '40');
// The override *is* the text — appending "°C" behind "STÖRUNG" would be nonsense.
eq('match: value text overridden, unit dropped', await text('.aura-widget-value'), 'STÖRUNG');

// ── 3. Rule stops matching: everything reverts ───────────────────────────────
await mock({ [ALARM]: false });
await settle();

eq('revert: title', await text('.aura-widget-title'), 'Küche');
eq('revert: icon size', await attr('.aura-widget-icon', 'width'), '20');
eq('revert: value and unit', await text('.aura-widget-value'), '21.5°C');

// ── 4. A title override may carry a live [[dp]] token ────────────────────────
await show([rule('r1', { title: 'Alarm [[demo.csValue]]°' })]);
await mock({ [ALARM]: true });
await settle();
eq('title override resolves [[dp]]', await text('.aura-widget-title'), 'Alarm 21.5°');

// ── 5. Hiding title and icon ─────────────────────────────────────────────────
await show([rule('r1', { showTitle: false, showIcon: false })]);
await mock({ [ALARM]: true });
await settle();
eq('showTitle false removes the title', await text('.aura-widget-title'), null);
eq('showIcon false removes the icon', await attr('.aura-widget-icon', 'width'), null);

await mock({ [ALARM]: false });
await settle();
check('both come back when the rule stops matching', (await text('.aura-widget-title')) === 'Küche');

// ── 6. Several matching rules stack, later wins per field ────────────────────
await show([rule('r1', { title: 'Erst', iconSize: 40 }), rule('r2', { title: 'Zuletzt' })]);
await mock({ [ALARM]: true });
await settle();
eq('stacking: the later rule wins for the shared field', await text('.aura-widget-title'), 'Zuletzt');
eq('stacking: a field only the first rule sets survives', await attr('.aura-widget-icon', 'width'), '40');

// ── 7. The new style fields land as CSS variables ────────────────────────────
await show([rule('r1', {}, { borderWidth: '3px', radius: '2px', opacity: '0.5' })]);
await mock({ [ALARM]: true });
await settle();
eq('style: border width', await cssVar('--widget-border-width'), '3px');
eq('style: corner radius', await cssVar('--widget-radius'), '2px');
eq('style: opacity', await cssVar('--widget-opacity'), '0.5');

await mock({ [ALARM]: false });
await settle();
eq('style: opacity is dropped again', await cssVar('--widget-opacity'), null);

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
