// Verifies that the "+/-" (stepper) display of both list widgets honours the
// configured colour thresholds - issue #559.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/list-stepper-color.mjs
//
// Uses the screenshot harness (__auraShot) so datapoint values live in the
// in-memory cache only - no socket write, no real datapoint is touched.
// Checked: the printed stepper value takes the threshold colour in every layout
// that renders a control, the band is picked by "< threshold" with the last
// colour above the top band, the entry's own scale beats the list-wide one, and
// an entry without a scale keeps the inherited colour.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const RED = 'rgb(239, 68, 68)'; // #ef4444
const AMBER = 'rgb(245, 158, 11)'; // #f59e0b
const GREEN = 'rgb(34, 197, 94)'; // #22c55e

// The scale from the issue: pH 6…8 with a green window in the middle.
const SCALE = [
    [6.3, '#ef4444'],
    [6.55, '#f59e0b'],
    [7.1, '#22c55e'],
    [7.4, '#f59e0b'],
    [8, '#ef4444'],
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

/** Renders one list widget and reports the stepper's value text + colour. */
async function stepper(type, layout, { entries, options = {}, values }) {
    const widget = {
        id: 'w-list',
        type,
        title: 'Testliste',
        datapoint: '',
        layout,
        gridPos: { x: 0, y: 0, w: 12, h: 8 },
        options: { entries, ...options },
    };
    await page.evaluate(
        ([w, vals]) => {
            window.__auraShot.mock(vals);
            window.__auraShot.mockServerState(vals);
            window.__auraShot.showWidgets([w]);
        },
        [widget, values],
    );
    await page.waitForTimeout(400);
    return page.evaluate(() => {
        // The stepper is the only control with a "−" button; its value sits in
        // the sibling span between the two buttons.
        const btn = document.querySelector('.react-grid-item button[aria-label="−"]');
        const span = btn?.parentElement?.querySelector('span');
        if (!span) return null;
        return { text: span.innerText.replace(/\s+/g, ' ').trim(), color: getComputedStyle(span).color };
    });
}

const phEntry = (patch = {}) => [
    {
        id: 'demo.ph',
        label: 'pH-Wert',
        role: 'state',
        displayType: 'stepper',
        stepMin: 6,
        stepMax: 8,
        stepStep: 0.1,
        decimals: 2,
        ...patch,
    },
];

// ── 1. The threshold colour reaches the stepper in every control layout ──────
for (const type of ['list', 'autolist']) {
    for (const layout of ['default', 'card', 'compact']) {
        const s = await stepper(type, layout, {
            entries: phEntry(),
            // The dynamic list only knows the list-wide scale, the static one
            // takes it as the fallback for entries without their own.
            options: { colorThresholds: SCALE, decimals: 2 },
            values: { 'demo.ph': 6.4 },
        });
        check(`${type}/${layout} renders the stepper`, !!s, JSON.stringify(s));
        check(`${type}/${layout} colours the value`, s?.color === AMBER, JSON.stringify(s));
    }
}

// ── 2. Bands are picked by "< threshold", above the top band the last wins ───
for (const [val, want, name] of [
    [6.1, RED, 'below the first threshold'],
    [6.4, AMBER, 'in the second band'],
    [7, GREEN, 'in the green window'],
    [7.2, AMBER, 'in the fourth band'],
    [9, RED, 'above the top threshold'],
]) {
    const s = await stepper('list', 'default', {
        entries: phEntry({ colorThresholds: SCALE, stepMax: 10 }),
        values: { 'demo.ph': val },
    });
    check(`${val} ${name}`, s?.color === want, JSON.stringify(s));
}

// ── 3. The entry's own scale beats the list-wide one ─────────────────────────
{
    const s = await stepper('list', 'default', {
        entries: phEntry({ colorThresholds: [[10, '#22c55e']] }),
        options: { colorThresholds: SCALE },
        values: { 'demo.ph': 6.4 },
    });
    check('entry scale beats the list-wide scale', s?.color === GREEN, JSON.stringify(s));
}

// ── 4. No scale → no inline colour, the row's text colour stays ──────────────
{
    const s = await stepper('list', 'default', { entries: phEntry(), values: { 'demo.ph': 6.4 } });
    const inline = await page.evaluate(() => {
        const btn = document.querySelector('.react-grid-item button[aria-label="−"]');
        return btn?.parentElement?.querySelector('span')?.style.color ?? 'NO SPAN';
    });
    check('value still renders without a scale', s?.text.includes('6.4') || s?.text.includes('6,4'), JSON.stringify(s));
    check('no scale leaves the colour inherited', inline === '', `inline=${inline}`);
}

// ── 5. The colour follows the printed value, not a display conversion ────────
// The stepper writes the raw value back, so it prints the raw one - a display
// factor must not shift the band it is matched against.
{
    const s = await stepper('list', 'default', {
        entries: phEntry({ colorThresholds: SCALE, valueTransform: 'custom', valueFactor: 100 }),
        values: { 'demo.ph': 6.4 },
    });
    check('a display factor does not shift the band', s?.color === AMBER, JSON.stringify(s));
}

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
