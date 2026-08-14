// Verifies the separators of the static list: a row of its own in `entries`, added and
// dragged like a datapoint, rendering a rule that opens a new section (issue #524).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/list-dividers.mjs
//
// Uses the screenshot harness (__auraShot) so datapoint values live in the in-memory
// cache only - no socket write, no real datapoint is touched.
// Checked: the separator renders in all four row layouts and spans the full width
// there, a bare rule before the first row is suppressed while a heading is kept, the
// styling (position, font size, colour, rule on/off) reaches the DOM, a separator whose
// section is emptied by the value filter disappears, an active sort order sorts WITHIN
// the sections instead of across them, separators never reach the datapoint count, and
// the two-column compact layout restarts its column parity after one.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

const VALUES = { 'demo.a': true, 'demo.b': false, 'demo.c': true, 'demo.d': false };

async function show(layout, entries, options = {}) {
    const widget = {
        id: 'w-list',
        type: 'list',
        title: 'Gliederung',
        datapoint: '',
        layout,
        gridPos: { x: 0, y: 0, w: 12, h: 10 },
        options: { entries, ...options },
    };
    await page.evaluate(
        ([w, vals]) => {
            window.__auraShot.mock(vals);
            window.__auraShot.mockServerState(vals);
            window.__auraShot.showWidgets([w]);
        },
        [widget, VALUES],
    );
    await page.waitForTimeout(400);
}

/** Heading of every separator in DOM order. textContent, not innerText: the CSS
 *  uppercases the heading and innerText would report it that way. */
const breakTexts = () =>
    page.evaluate(() =>
        [...document.querySelectorAll('.aura-section-break')].map((el) => el.textContent.replace(/\s+/g, ' ').trim()),
    );

const breakCount = () => page.locator('.aura-section-break').count();

/** The rendered widget as one flat string — used for order assertions. */
const widgetText = () =>
    page.evaluate(() => {
        const el = document.querySelector('.react-grid-item');
        return el ? el.innerText.replace(/\s+/g, ' ').trim() : 'NO WIDGET';
    });

/** How many rules (the label-less spans) the separators draw. */
const ruleCount = () =>
    page.evaluate(
        () => [...document.querySelectorAll('.aura-section-break span')].filter((s) => !s.textContent.trim()).length,
    );

const ENTRIES = [
    { id: 'demo.a', label: 'Alpha' },
    { id: 'divider:1', divider: true, dividerLabel: 'Erdgeschoss' },
    { id: 'demo.b', label: 'Bravo' },
    { id: 'demo.c', label: 'Charlie' },
    { id: 'divider:2', divider: true, dividerLabel: 'Keller' },
    { id: 'demo.d', label: 'Delta' },
];

// ── 1. Renders in every row layout, spanning the full width ──────────────────
for (const layout of ['default', 'card', 'compact', 'minimal']) {
    await show(layout, ENTRIES);
    const texts = await breakTexts();
    check(`${layout}: both section headings render`, texts.join('|') === 'Erdgeschoss|Keller', JSON.stringify(texts));
    const spans = await page.evaluate(() => {
        const parent = document.querySelector('.aura-section-break')?.parentElement;
        const br = document.querySelector('.aura-section-break');
        if (!parent || !br) return null;
        // The container's CONTENT box: clientWidth already leaves out the scrollbar,
        // the paddings have to come off by hand.
        const cs = getComputedStyle(parent);
        const content = parent.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        return Math.abs(br.getBoundingClientRect().width - content) < 2;
    });
    check(`${layout}: the separator spans the full width`, spans === true, String(spans));
}

// ── 2. A bare rule before the first row is suppressed, a heading is not ──────
await show('default', [{ id: 'divider:0', divider: true }, ...ENTRIES]);
check('a rule without heading before the first row is dropped', (await breakCount()) === 2, 'only the two named ones');

await show('default', [{ id: 'divider:0', divider: true, dividerLabel: 'Oben' }, ...ENTRIES]);
check('a heading before the first row is kept', (await breakTexts())[0] === 'Oben');

// A separator with nothing after it would rule off the end of the list.
await show('default', [
    { id: 'demo.a', label: 'Alpha' },
    { id: 'divider:9', divider: true, dividerLabel: 'Leer' },
]);
check('a trailing separator with no rows after it is dropped', (await breakCount()) === 0);

// ── 3. Styling reaches the DOM ───────────────────────────────────────────────
await show('default', [
    { id: 'demo.a', label: 'Alpha' },
    {
        id: 'divider:1',
        divider: true,
        dividerLabel: 'Bunt',
        dividerAlign: 'right',
        dividerFontSize: 17,
        dividerColor: '#ff0000',
    },
    { id: 'demo.b', label: 'Bravo' },
]);
{
    const style = await page.evaluate(() => {
        const spans = [...document.querySelectorAll('.aura-section-break span')];
        const label = spans.find((s) => s.textContent.trim());
        if (!label) return null;
        const cs = getComputedStyle(label);
        const rules = spans.filter((s) => !s.textContent.trim());
        // Right aligned = the rule sits BEFORE the heading in DOM order.
        const first = document.querySelector('.aura-section-break')?.firstElementChild;
        return { fontSize: cs.fontSize, color: cs.color, rules: rules.length, ruleFirst: first === rules[0] };
    });
    check('font size is applied', style?.fontSize === '17px', JSON.stringify(style));
    check('colour is applied', style?.color === 'rgb(255, 0, 0)', JSON.stringify(style));
    check('right aligned draws the rule before the heading', style?.ruleFirst === true, JSON.stringify(style));
    check('right aligned draws exactly one rule', style?.rules === 1, JSON.stringify(style));
}

await show('default', [
    { id: 'demo.a', label: 'Alpha' },
    { id: 'divider:1', divider: true, dividerLabel: 'Mitte', dividerAlign: 'center' },
    { id: 'demo.b', label: 'Bravo' },
]);
check('centred draws a rule on both sides', (await ruleCount()) === 2);

await show('default', [
    { id: 'demo.a', label: 'Alpha' },
    { id: 'divider:1', divider: true, dividerLabel: 'Ohne Linie', dividerLine: false },
    { id: 'demo.b', label: 'Bravo' },
]);
check('rule switched off draws no rule', (await ruleCount()) === 0);
check('rule switched off keeps the heading', (await breakTexts())[0] === 'Ohne Linie');

// ── 4. Filtering: a section that lost every row loses its separator ──────────
// 'active' keeps only truthy values: Charlie (true) holds the Erdgeschoss section open,
// while Delta (false) is the Keller section's only member, so that one goes entirely.
await show('default', ENTRIES, { backendValueFilter: 'active', valueFilter: 'active' });
{
    const texts = await breakTexts();
    check('a section that still has a row keeps its separator', texts.includes('Erdgeschoss'), JSON.stringify(texts));
    check('a section without any visible row disappears', !texts.includes('Keller'), JSON.stringify(texts));
}

// ── 5. Sorting happens WITHIN a section, not across the whole list ───────────
// Descending by name would put Delta first globally; with sections it may only reorder
// Bravo/Charlie inside the Erdgeschoss section.
await show('default', ENTRIES, { sortBy: 'label', sortOrder: 'desc' });
{
    const t = await widgetText();
    // Lower-cased: the CSS uppercases the headings and innerText reports them that way.
    const flat = t.toLowerCase();
    const pos = (s) => flat.indexOf(s.toLowerCase());
    check(
        'the sections keep their order while the rows inside sort',
        pos('Alpha') < pos('Erdgeschoss') && pos('Erdgeschoss') < pos('Keller') && pos('Keller') < pos('Delta'),
        t,
    );
    check('inside a section the sort order applies', pos('Charlie') < pos('Bravo'), t);
}

// ── 6. A separator is never counted as a datapoint ──────────────────────────
await show('default', ENTRIES, { showCount: true });
check('the header counts only the datapoints', (await widgetText()).includes('(4)'), await widgetText());

// ── 7. Compact restarts its column parity after a separator ─────────────────
// Three rows before it would leave the next one in the right column if the parity were
// derived from the index; after a separator it has to start on the left.
await show('compact', [
    { id: 'demo.a', label: 'Alpha' },
    { id: 'demo.b', label: 'Bravo' },
    { id: 'demo.c', label: 'Charlie' },
    { id: 'divider:1', divider: true, dividerLabel: 'Neu' },
    { id: 'demo.d', label: 'Delta' },
]);
{
    const leftAligned = await page.evaluate(() => {
        const grid = document.querySelector('.aura-section-break')?.parentElement;
        const cells = [...(grid?.children ?? [])].filter((c) => !c.classList.contains('aura-section-break'));
        const last = cells[cells.length - 1];
        if (!grid || !last) return null;
        return Math.abs(last.getBoundingClientRect().left - grid.getBoundingClientRect().left) < 2;
    });
    check('the first cell after a separator starts in the left column', leftAligned === true, String(leftAligned));
}

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
