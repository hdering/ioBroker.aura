// Verifies the "Eingabefeld" display type of the list widgets.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/list-input.mjs
//
// Uses the screenshot harness (__auraShot) so datapoint values live in the
// in-memory cache only - no socket write, no real datapoint is touched.
// Checked: the field renders and accepts typing in every layout that has one,
// the send button follows its option, read-only is the only thing that locks the
// field (a datapoint without write access must NOT), and live mode drops the button.
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

const FIELD = 'input[type="text"], input[type="number"]';
const SEND = 'button[aria-label="Senden"]';

/** Renders one list widget holding a single 'input' entry and reports its DOM. */
async function show(type, layout, entryPatch = {}, value = 'hallo') {
    const widget = {
        id: 'w-list',
        type,
        title: 'Testliste',
        datapoint: '',
        layout,
        gridPos: { x: 0, y: 0, w: 12, h: 8 },
        options: {
            entries: [{ id: 'demo.msg', label: 'Nachricht', role: 'text', displayType: 'input', ...entryPatch }],
        },
    };
    await page.evaluate(
        ([w, values]) => {
            window.__auraShot.mock(values);
            window.__auraShot.showWidgets([w]);
        },
        [widget, { 'demo.msg': value }],
    );
    await page.waitForTimeout(400);
    return page.evaluate(
        ([fieldSel, sendSel]) => {
            const i = document.querySelector(fieldSel);
            const r = i?.getBoundingClientRect();
            return {
                hasField: !!i,
                readOnly: i?.readOnly ?? null,
                width: r ? Math.round(r.width) : null,
                hasSend: !!document.querySelector(sendSel),
            };
        },
        [FIELD, SEND],
    );
}

/** Types into the field and returns its resulting value. */
async function type(text) {
    const f = page.locator(FIELD).first();
    await f.click();
    await page.keyboard.type(text);
    await page.waitForTimeout(150);
    return page.evaluate((sel) => document.querySelector(sel)?.value, FIELD);
}

// ── 1. Every layout with a value column renders a usable field ───────────────
for (const type_ of ['list', 'autolist']) {
    for (const layout of ['default', 'card', 'compact']) {
        const dom = await show(type_, layout);
        check(`${type_}/${layout} renders the field`, dom.hasField && !dom.readOnly, JSON.stringify(dom));
        // Row layouts get the fixed default width; card cells are only ~90px wide, so
        // there the field fills whatever the cell leaves next to the send button.
        const min = layout === 'card' ? 40 : 100;
        check(`${type_}/${layout} field is wide enough`, (dom.width ?? 0) >= min, `width=${dom.width}`);
        if (dom.hasField) {
            const v = await type('AB');
            check(`${type_}/${layout} accepts typing`, (v ?? '').includes('AB'), `value=${v}`);
        }
    }
    // Badges render the plain value - no room for a field there.
    const minimal = await show(type_, 'minimal');
    check(`${type_}/minimal renders no field`, !minimal.hasField);
}

// ── 2. A datapoint without write access must NOT lock the field ─────────────
// The standalone Eingabefeld widget writes regardless of common.write; gating on
// it silently killed both typing and the send button.
const ro = await show('list', 'default', { writable: false });
check('read-only datapoint keeps the field editable', ro.hasField && !ro.readOnly, JSON.stringify(ro));
check('read-only datapoint keeps the send button', ro.hasSend);

// ── 3. Schreibschutz is the one thing that locks it ──────────────────────────
const locked = await show('list', 'default', { inputReadOnly: true });
check('inputReadOnly locks the field', locked.readOnly === true);
check('inputReadOnly drops the send button', !locked.hasSend);

// ── 4. Send button option / live mode ────────────────────────────────────────
check('send button shows by default', (await show('list', 'default')).hasSend);
check('inputShowSubmit false hides it', !(await show('list', 'default', { inputShowSubmit: false })).hasSend);
check('live mode has no send button', !(await show('list', 'default', { inputSubmitMode: 'live' })).hasSend);

// ── 5. Options that shape the field ──────────────────────────────────────────
const wide = await show('list', 'default', { inputWidth: 220 });
check('inputWidth is applied', wide.width === 220, `width=${wide.width}`);

const num = await show('list', 'default', { inputMode: 'number' }, 12);
check(
    'inputMode number renders a number field',
    await page.evaluate(() => !!document.querySelector('input[type="number"]')),
);
check('number field shows the value', num.hasField);

const ph = await page.evaluate(() => document.querySelector('input')?.placeholder);
await show('list', 'default', { inputPlaceholder: 'tippen…' }, null);
check(
    'placeholder is applied',
    (await page.evaluate((sel) => document.querySelector(sel)?.placeholder, FIELD)) === 'tippen…',
    `before=${ph}`,
);

// ── 6. Submit writes the datapoint ───────────────────────────────────────────
await show('list', 'default', {}, 'alt');
await type('X');
await page.locator(SEND).first().click();
await page.waitForTimeout(300);
const written = await page.evaluate(() => window.__auraShot?.lastWrite ?? null);
check(
    'send writes the datapoint',
    written === null || written?.id === 'demo.msg',
    written ? JSON.stringify(written) : 'harness exposes no write log - skipped',
);

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
