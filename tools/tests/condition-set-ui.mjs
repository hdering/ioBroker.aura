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

function rule(id, elements, style = {}) {
    return {
        id,
        label: id,
        logic: 'AND',
        clauses: [{ datapoint: ALARM, operator: 'true', value: '' }],
        style,
        elements,
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
const colorOf = (sel) =>
    page.evaluate((s) => {
        const el = document.querySelector(`.aura-widget-cs-test ${s}`);
        return el ? getComputedStyle(el).color : null;
    }, sel);
const cssVar = (name) =>
    page.evaluate((n) => {
        const el = document.querySelector('.aura-widget-cs-test');
        return el ? el.style.getPropertyValue(n).trim() || null : null;
    }, name);

await mock({ [VAL]: 21.5, [ALARM]: false });

// ── 1. Baseline: no rule matches ─────────────────────────────────────────────
await show([
    rule('r1', {
        title: { show: true, text: 'Alarm' },
        icon: { show: true, icon: 'AlertTriangle', iconSize: 40 },
        value: { show: true, text: 'STÖRUNG' },
    }),
]);

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
await show([rule('r1', { title: { show: true, text: 'Alarm [[demo.csValue]]°' } })]);
await mock({ [ALARM]: true });
await settle();
eq('title override resolves [[dp]]', await text('.aura-widget-title'), 'Alarm 21.5°');

// ── 5. Hiding title and icon ─────────────────────────────────────────────────
await show([rule('r1', { title: { show: false }, icon: { show: false } })]);
await mock({ [ALARM]: true });
await settle();
eq('showTitle false removes the title', await text('.aura-widget-title'), null);
eq('showIcon false removes the icon', await attr('.aura-widget-icon', 'width'), null);

await mock({ [ALARM]: false });
await settle();
check('both come back when the rule stops matching', (await text('.aura-widget-title')) === 'Küche');

// ── 6. Several matching rules stack, later wins per field ────────────────────
await show([
    rule('r1', { title: { show: true, text: 'Erst' }, icon: { show: true, iconSize: 40 } }),
    rule('r2', { title: { show: true, text: 'Zuletzt' } }),
]);
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

// ── 8. bold / italic, the two the element rules always had ──────────────────
const fontOf = (sel) =>
    page.evaluate((s) => {
        const el = document.querySelector(`.aura-widget-cs-test ${s}`);
        if (!el) return null;
        const cs = getComputedStyle(el);
        return `${cs.fontWeight}/${cs.fontStyle}`;
    }, sel);

await show([rule('r1', {}, { bold: true, italic: true })]);
await mock({ [ALARM]: false });
await settle();
const plain = await fontOf('.aura-widget-title');
await mock({ [ALARM]: true });
await settle();
eq('style: bold and italic reach the title', await fontOf('.aura-widget-title'), '700/italic');
check('style: they were not there before', plain !== '700/italic', String(plain));

await mock({ [ALARM]: false });
await settle();
eq('style: and go away again', await fontOf('.aura-widget-title'), plain);

// ── 8a. painting ONE element instead of the whole card ──────────────────────
// The card-wide colours are CSS variables and hit everything the widget draws;
// this reaches a single element through the class it already carries.
const partRule = (part, look) => rule('rp', { [part]: look });

await show([partRule('title', { color: '#ff00ff', bold: true })]);
await mock({ [ALARM]: false });
await settle();
const titleBefore = await fontOf('.aura-widget-title');
await mock({ [ALARM]: true });
await settle();
eq('part: the title takes the rule colour', await colorOf('.aura-widget-title'), 'rgb(255, 0, 255)');
eq('part: and its weight', (await fontOf('.aura-widget-title'))?.split('/')[0], '700');
check(
    'part: the value is left alone',
    (await colorOf('.aura-widget-value')) !== 'rgb(255, 0, 255)',
    String(await colorOf('.aura-widget-value')),
);
await mock({ [ALARM]: false });
await settle();
eq('part: released again', await fontOf('.aura-widget-title'), titleBefore);

await show([partRule('value', { color: '#00ffff' })]);
await mock({ [ALARM]: true });
await settle();
eq('part: the value can be targeted too', await colorOf('.aura-widget-value'), 'rgb(0, 255, 255)');
check(
    'part: and then the title is left alone',
    (await colorOf('.aura-widget-title')) !== 'rgb(0, 255, 255)',
    String(await colorOf('.aura-widget-title')),
);

await show([partRule('icon', { show: false })]);
await mock({ [ALARM]: true });
await settle();
// display:none leaves the element (and its width attribute) in the DOM.
const displayOf = (sel) =>
    page.evaluate((x) => {
        const el = document.querySelector(`.aura-widget-cs-test ${x}`);
        return el ? getComputedStyle(el).display : null;
    }, sel);
// Hiding now goes through the widget's own showIcon, so the element is gone
// entirely; the CSS class is the fallback for widgets that ignore the option.
check(
    'part: hiding one element',
    ['none', null].includes(await displayOf('.aura-widget-icon')),
    String(await displayOf('.aura-widget-icon')),
);
await mock({ [ALARM]: false });
await settle();
await iconReady();
check('part: the icon comes back', (await displayOf('.aura-widget-icon')) !== 'none');

// ── 8b. hiding the value ────────────────────────────────────────────────────
// Only the value widget had an own showValue; the others needed wiring, or
// "ausblenden" would have been a setting that does nothing.
await show([rule('r1', { value: { show: false } })]);
await mock({ [ALARM]: false });
await settle();
eq('value visible while the rule sleeps', await text('.aura-widget-value'), '21.5°C');
await mock({ [ALARM]: true });
await settle();
// The value widget drops the element entirely; widgets without an own showValue
// render it empty. Both count as hidden.
check('value hidden by the rule', !(await text('.aura-widget-value')), String(await text('.aura-widget-value')));
await mock({ [ALARM]: false });
await settle();
eq('value comes back', await text('.aura-widget-value'), '21.5°C');

// ── 9. the same overrides inside a custom layout ────────────────────────────
// A custom layout draws its own title cell and normally ignores showTitle — the
// user placed the cell, after all. A rule that hides the title still has to reach
// it, which it did not.
const customWidget = {
    id: 'cs-custom',
    type: 'switch',
    title: 'Lampe',
    datapoint: 'demo.csSwitch',
    gridPos: { x: 0, y: 0, w: 12, h: 6 },
    layout: 'custom',
    options: {
        icon: 'Lightbulb',
        customGrid: {
            cols: 1,
            rows: 2,
            cells: [{ type: 'title' }, { type: 'value' }],
        },
        conditions: [rule('r1', { title: { show: false } })],
    },
};

await mock({ 'demo.csSwitch': true, [ALARM]: false });
await page.evaluate((w) => window.__auraShot.showWidgets([w]), customWidget);
await settle();
const customText = () => page.evaluate(() => document.querySelector('.aura-widget-cs-custom')?.innerText ?? '');
check('custom layout: the title is there while the rule sleeps', (await customText()).includes('Lampe'));

await mock({ [ALARM]: true });
await settle();
check(
    'custom layout: the rule hides the title cell',
    !(await customText()).includes('Lampe'),
    (await customText()).replace(/\n/g, ' | '),
);

await mock({ [ALARM]: false });
await settle();
check('custom layout: and brings it back', (await customText()).includes('Lampe'));

// ── Effect "only the border pulses" ────────────────────────────────────────
// The other two effects fade the whole card; this one must leave the content at
// full opacity and animate a ring instead — and only outside edit mode.
const ringWidget = {
    ...widget([{ ...rule('rb', undefined, { accent: '#ef4444' }), effect: 'border' }]),
    id: 'cs-ring',
};
await mock({ [ALARM]: false });
await page.evaluate((w) => window.__auraShot.showWidgets([w]), ringWidget);
await settle();
const ring = () =>
    page.evaluate(() => {
        const el = document.querySelector('.aura-widget-cs-ring');
        const cs = getComputedStyle(el);
        // The ring lives on a pseudo-element so the card keeps its own box-shadow.
        const after = getComputedStyle(el, '::after');
        return {
            cls: el.className.includes('aura-cond-ring'),
            anim: after.animationName,
            shadow: cs.boxShadow,
            opacity: cs.opacity,
            color: cs.getPropertyValue('--cond-ring').trim(),
        };
    });
eq('border effect: no ring while the rule sleeps', (await ring()).cls, false);

await mock({ [ALARM]: true });
await settle();
const on = await ring();
eq('border effect: the ring class is set', on.cls, true);
eq('border effect: the ring animates', on.anim, 'auraCondRingPulse');
check('border effect: the card keeps its own shadow', on.shadow !== 'none', on.shadow);
eq('border effect: the card keeps full opacity', on.opacity, '1');
eq('border effect: the ring takes the accent of the rule', on.color, '#ef4444');

await mock({ [ALARM]: false });
await settle();
eq('border effect: the ring goes again', (await ring()).cls, false);

// A ring colour of its own beats the colours the rule sets for the card.
await page.evaluate((w) => window.__auraShot.showWidgets([w]), {
    ...ringWidget,
    options: {
        ...ringWidget.options,
        conditions: [
            {
                ...rule('rb', undefined, { accent: '#ef4444', ringColor: '#3b82f6' }),
                effect: 'border',
            },
        ],
    },
});
await mock({ [ALARM]: true });
await settle();
eq('border effect: an explicit ring colour wins', (await ring()).color, '#3b82f6');

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
