// Verifies the carousel's per-state element labels (#603): an item can carry its
// own text for the active and the inactive state, e.g. "Auto" / "Manuell".
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/carousel-state-label.mjs
//
// Uses the screenshot harness (__auraShot) so datapoint values live in the
// in-memory cache only - no socket write, no real datapoint is touched.
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

const DP = 'demo.carousel.mode';

// A fresh widget id per call - the strip keeps scroll/rotation state per widget.
let seq = 0;

async function show(items, values, options = {}) {
    const widget = {
        id: `w-carousel-${++seq}`,
        type: 'carousel',
        title: 'Modus',
        datapoint: '',
        layout: 'default',
        gridPos: { x: 0, y: 0, w: 12, h: 4 },
        options: { items, ...options },
    };
    await page.evaluate(
        ([w, vals]) => {
            window.__auraShot.mock(vals);
            window.__auraShot.mockServerState(vals);
            window.__auraShot.showWidgets([w]);
        },
        [widget, values],
    );
    await page.waitForTimeout(350);
}

// Chip captions, in strip order. MarqueeText duplicates the text when it
// overflows, so collapse repeats of the same caption down to one.
const chipTexts = () =>
    page.evaluate(() =>
        [...document.querySelectorAll('.react-grid-item button')]
            .map((b) => b.innerText.replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .map((s) => {
                const half = s.slice(0, Math.floor(s.length / 2)).trim();
                return half && s.startsWith(half) && s.slice(half.length).trim() === half ? half : s;
            }),
    );

const item = (extra) => ({ id: 'i1', label: 'Betriebsart', dp: DP, ...extra });

for (const mode of ['carousel', 'single']) {
    const opts = mode === 'single' ? { mode: 'single' } : {};
    const tag = `${mode}`;

    // ── Explicit active / inactive values ────────────────────────────────────
    const both = [item({ value: 'true', inactiveValue: 'false', labelActive: 'Auto', labelInactive: 'Manuell' })];

    await show(both, { [DP]: true }, opts);
    check(
        `${tag}: active DP shows the active label`,
        (await chipTexts())[0] === 'Auto',
        JSON.stringify(await chipTexts()),
    );

    await show(both, { [DP]: false }, opts);
    check(
        `${tag}: inactive DP shows the inactive label`,
        (await chipTexts())[0] === 'Manuell',
        JSON.stringify(await chipTexts()),
    );

    // ── Only one side filled - the other falls back to the base label ────────
    const onlyActive = [item({ value: 'true', inactiveValue: 'false', labelActive: 'Auto' })];
    await show(onlyActive, { [DP]: true }, opts);
    check(`${tag}: only labelActive - active uses it`, (await chipTexts())[0] === 'Auto');
    await show(onlyActive, { [DP]: false }, opts);
    check(`${tag}: only labelActive - inactive keeps the base label`, (await chipTexts())[0] === 'Betriebsart');

    const onlyInactive = [item({ value: 'true', inactiveValue: 'false', labelInactive: 'Manuell' })];
    await show(onlyInactive, { [DP]: false }, opts);
    check(`${tag}: only labelInactive - inactive uses it`, (await chipTexts())[0] === 'Manuell');
    await show(onlyInactive, { [DP]: true }, opts);
    check(`${tag}: only labelInactive - active keeps the base label`, (await chipTexts())[0] === 'Betriebsart');

    // ── No labels at all - unchanged behaviour ───────────────────────────────
    const plain = [item({ value: 'true', inactiveValue: 'false' })];
    await show(plain, { [DP]: true }, opts);
    check(`${tag}: without state labels the base label stays`, (await chipTexts())[0] === 'Betriebsart');
}

// ── Labels without comparison values: the DP is read as a plain on/off flag ──
const bare = [item({ labelActive: 'Auto', labelInactive: 'Manuell' })];
for (const [val, expect] of [
    [true, 'Auto'],
    [false, 'Manuell'],
    [1, 'Auto'],
    [0, 'Manuell'],
    ['on', 'Auto'],
    ['off', 'Manuell'],
    ['false', 'Manuell'],
]) {
    await show(bare, { [DP]: val });
    check(
        `labels-only: ${JSON.stringify(val)} -> ${expect}`,
        (await chipTexts())[0] === expect,
        JSON.stringify(await chipTexts()),
    );
}

// A DP that never delivered a value must not read as active.
await show(bare, {});
check(
    'labels-only: missing value reads as inactive',
    (await chipTexts())[0] === 'Manuell',
    JSON.stringify(await chipTexts()),
);

// ── Several items keep their own state ───────────────────────────────────────
await show(
    [
        {
            id: 'a',
            label: 'A',
            dp: 'demo.a',
            value: 'true',
            inactiveValue: 'false',
            labelActive: 'A an',
            labelInactive: 'A aus',
        },
        {
            id: 'b',
            label: 'B',
            dp: 'demo.b',
            value: 'true',
            inactiveValue: 'false',
            labelActive: 'B an',
            labelInactive: 'B aus',
        },
        { id: 'c', label: 'C', dp: 'demo.c' },
    ],
    { 'demo.a': true, 'demo.b': false, 'demo.c': true },
);
const many = await chipTexts();
check('multi: each item resolves its own state', JSON.stringify(many) === '["A an","B aus","C"]', JSON.stringify(many));

// ── The editor writes the two fields onto the item ───────────────────────────
// The per-item fields sit in the widget edit panel, right below the matching
// Aktiv-/Inaktiv-Wert input.
await page.evaluate(() => {
    window.__auraShot.showWidgets(
        [
            {
                id: 'w-carousel-edit',
                type: 'carousel',
                title: 'Modus',
                datapoint: '',
                gridPos: { x: 0, y: 0, w: 12, h: 4 },
                options: { items: [{ id: 'i1', label: 'Betriebsart', dp: 'demo.carousel.mode' }] },
            },
        ],
        { editMode: true },
    );
    window.__auraShot.setEditMode(true);
});
const editOpts = () => page.evaluate(() => window.__auraShot.widgetOptions('w-carousel-edit'));

await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();

const labelField = (text) => page.locator(`label:text-is("${text}") + input`).first();
const activeField = labelField('Aktiv-Beschriftung (leer = Beschriftung oben)');
await activeField.waitFor({ timeout: 10000 });
await activeField.fill('Auto');
await page.waitForTimeout(200);
check('editor: the active field writes labelActive', (await editOpts()).items[0].labelActive === 'Auto');

const inactiveField = labelField('Inaktiv-Beschriftung (leer = Beschriftung oben)');
await inactiveField.fill('Manuell');
await page.waitForTimeout(200);
check('editor: the inactive field writes labelInactive', (await editOpts()).items[0].labelInactive === 'Manuell');

// Clearing a field drops the key again so the base label takes over.
await activeField.fill('');
await page.waitForTimeout(200);
check('editor: clearing the field removes the key', (await editOpts()).items[0].labelActive === undefined);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
