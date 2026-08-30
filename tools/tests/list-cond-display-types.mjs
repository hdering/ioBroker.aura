// Does a row condition on the VALUE reach every "Darstellung" (displayType)?
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/list-cond-display-types.mjs
//
// Issue: a rule that sets the text size did nothing on the pill-shaped and the
// control-shaped values (labelled boolean, sensor role, state map, contact,
// slider, stepper) — only the plain text branches spread the condition style.
// One list per widget and layout, one entry per display type, one list-wide rule
// that always matches and sets an unmistakable size + colour.
//
// Values are injected through the screenshot harness (__auraShot.mock) — no socket
// write, no real datapoint is touched.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const SIZE = 23; // no Tailwind class renders 23px, so a hit is unambiguous
const COLOR = 'rgb(255, 0, 153)';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const RULE = {
    id: 'val',
    logic: 'AND',
    target: 'value',
    clauses: [{ datapoint: '{dp}', operator: 'contains', value: '' }],
    fontSize: SIZE,
    color: '#ff0099',
};

/**
 * One entry per display type. `text` says whether the value is drawn as text at
 * all — a bare toggle, the shutter buttons and the two input controls have no
 * value text a size could apply to. `alsoText` names the layouts that DO print it
 * anyway: a card cell is wide enough for a full-width "AN"/"AUS" caption where a
 * row only has space for the little sliding toggle.
 */
const CASES = [
    { dt: 'auto', dp: 'demo.num.A', val: 21.5, unit: '°C', text: true },
    { dt: 'auto', name: 'auto-bool', dp: 'demo.bool.A', val: true, text: false, alsoText: ['dynamic/card'] },
    {
        dt: 'auto',
        name: 'auto-labels',
        dp: 'demo.bool.B',
        val: true,
        text: true,
        extra: { trueLabel: 'AN', falseLabel: 'AUS' },
    },
    { dt: 'auto', name: 'auto-role', dp: 'demo.win.A', val: true, text: true, extra: { role: 'sensor.window' } },
    { dt: 'value', dp: 'demo.num.B', val: 42, unit: 'W', text: true },
    { dt: 'switch', dp: 'demo.bool.C', val: true, text: false, alsoText: ['static/card', 'dynamic/card'] },
    {
        dt: 'switch',
        name: 'switch-labels',
        dp: 'demo.bool.D',
        val: true,
        text: true,
        extra: { trueLabel: 'EIN', falseLabel: 'AUS' },
    },
    { dt: 'slider', dp: 'demo.num.C', val: 55, text: true },
    { dt: 'slider', name: 'slider-bar', dp: 'demo.num.D', val: 55, text: true, extra: { sliderBarStyle: true } },
    { dt: 'slider', name: 'slider-readonly', dp: 'demo.num.E', val: 55, text: true, extra: { writable: false } },
    { dt: 'stepper', dp: 'demo.num.F', val: 7, unit: 'x', text: true },
    {
        dt: 'states',
        dp: 'demo.st.A',
        val: 2,
        text: true,
        extra: { states: [{ value: '2', label: 'Auf', color: '#22c55e' }] },
    },
    { dt: 'contact', dp: 'demo.ct.A', val: 1, text: true },
    { dt: 'time', dp: 'demo.tm.A', val: '08:15', text: true },
    { dt: 'shutter', dp: 'demo.sh.A', val: 0, text: false },
    {
        dt: 'buttons',
        dp: 'demo.pr.A',
        val: 1,
        text: false,
        extra: {
            presets: [
                { value: 0, label: 'Aus' },
                { value: 1, label: 'Eco' },
                { value: 2, label: 'Komfort' },
            ],
        },
    },
    { dt: 'momentary', dp: 'demo.mo.A', val: false, text: false },
    { dt: 'datepicker', dp: 'demo.dt.A', val: '2026-08-30', text: true },
    { dt: 'input', dp: 'demo.in.A', val: 'Hallo', text: true },
];

// Row labels have to be collision-free: the row lookup below stops climbing when a
// neighbour's label appears, and "auto" is a substring of "auto-bool".
const caseName = (c, i) => `r${String(i + 1).padStart(2, '0')}`;
const caseTitle = (c, i) => `${caseName(c, i)} ${c.name ?? c.dt}`;

const entries = CASES.map((c, i) => ({
    id: c.dp,
    label: caseName(c, i),
    displayType: c.dt,
    ...(c.unit ? { unit: c.unit } : null),
    ...c.extra,
}));

const mockValues = Object.fromEntries(CASES.map((c) => [c.dp, c.val]));

const widget = (id, type, layout) => ({
    id,
    type,
    title: id,
    datapoint: '',
    layout,
    gridPos: { x: 0, y: 0, w: 24, h: 40 },
    options: {
        entries,
        rowConditions: [RULE],
        showDividers: false,
        syncIntervalMin: 999,
    },
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 2000 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
await page.evaluate((m) => {
    window.__auraShot.mock(m);
    window.__auraShot.mockServerState(m);
}, mockValues);

/**
 * Everything the row of `label` renders, with its computed size and colour.
 *
 * "Own text" rather than a leaf test: a pill draws its icon and its label in the
 * same element, so the leaf filter would skip exactly the elements this is about.
 * The row is found by climbing from the label until a sibling text appears —
 * stopping before the climb swallows a neighbouring row's label, which is what a
 * value with no text at all (a bare toggle) would otherwise do.
 */
const rowStyles = (widgetId, label, others) =>
    page.evaluate(
        ([w, l, rest]) => {
            const ownText = (e) =>
                [...e.childNodes]
                    .filter((n) => n.nodeType === 3)
                    .map((n) => n.textContent)
                    .join('')
                    .trim();
            const root = document.querySelector('.aura-widget-' + w);
            if (!root) return null;
            const labelEl = [...root.querySelectorAll('*')].find((e) => ownText(e) === l);
            if (!labelEl) return null;
            let row = labelEl;
            for (;;) {
                const up = row.parentElement;
                if (!up || up === root) break;
                if (rest.some((o) => up.innerText.includes(o))) break;
                row = up;
                if (row.innerText.trim() !== l) break;
            }
            return (
                [...row.querySelectorAll('*')]
                    // An input shows the value without holding a text node, so its
                    // `value` counts as the text it draws.
                    .map((e) => ({ e, text: /^(INPUT|TEXTAREA)$/.test(e.tagName) ? e.value : ownText(e) }))
                    .filter((x) => x.text && x.text !== l)
                    .map(({ e, text }) => {
                        const cs = getComputedStyle(e);
                        return { text, size: cs.fontSize, color: cs.color };
                    })
            );
        },
        [widgetId, label, others],
    );

for (const [widgetId, type, layout, title] of [
    ['cd-list', 'list', 'default', 'static/default'],
    ['cd-list-card', 'list', 'card', 'static/card'],
    ['cd-auto', 'autolist', 'default', 'dynamic/default'],
    ['cd-auto-card', 'autolist', 'card', 'dynamic/card'],
]) {
    await page.evaluate((w) => window.__auraShot.showWidgets([w]), widget(widgetId, type, layout));
    await page.waitForTimeout(900);
    console.log(`\n── ${title} ──`);
    for (const [i, c] of CASES.entries()) {
        const name = caseName(c, i);
        const title2 = caseTitle(c, i);
        const styles = await rowStyles(
            widgetId,
            name,
            CASES.map(caseName).filter((_, j) => j !== i),
        );
        if (!styles) {
            check(`${title} ${title2}: row renders`, false, 'row not found');
            continue;
        }
        const sized = styles.filter((s) => s.size === `${SIZE}px`);
        const painted = styles.filter((s) => s.color === COLOR);
        const seen = styles.map((s) => `${s.text}(${s.size})`).join(' ');
        if (c.text || c.alsoText?.includes(title)) {
            check(`${title} ${title2}: the rule sets the value size`, sized.length > 0, seen);
            check(`${title} ${title2}: the rule paints the value`, painted.length > 0, seen);
        } else {
            // No value text — nothing to size. Only asserted so a future change that
            // starts drawing text here shows up as a new, unchecked case.
            check(`${title} ${title2}: no value text to size (by design)`, sized.length === 0, seen);
        }
    }
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
await browser.close();
process.exit(failed.length ? 1 : 0);
