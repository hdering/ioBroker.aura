// Pins the size the evcc widget renders at when it is freshly added: the same as
// every other widget — a 12 px title next to a 20 px icon.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/evcc-scale.mjs
//
// The widget sizes itself in inline pixels off a `scale` factor. That factor used
// to run up to 2.2× with the tile width, so a widget added at the default 12
// columns already came out bigger than its neighbours and a full-width one towered
// over them (26 px title, 44 px icon). The automatic part now only ever shrinks —
// growing is the user's decision, via the scale sliders or a raised `autoScaleMax`.
//
// A button widget of the same size is rendered next to it as the reference: the
// assertions compare against what IT measures, not against a hard-coded 12 px, so
// they keep meaning if the shared title size ever moves.
//
// No evcc datapoint exists in the harness, so the widget renders its zero state —
// which is exactly the layout under test (header, flow row, loadpoint card).
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) => check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const near = (name, got, want, tol = 0.6) =>
    check(name, Math.abs(got - want) <= tol, `got ${got}, want ${want} ±${tol}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

/** evcc at `w` columns, plus a plain button widget below it as the size reference. */
async function show(w, options = {}, showOpts = {}) {
    await page.evaluate(
        ([w, options, showOpts]) => {
            window.__auraShot.showWidgets(
                [
                    {
                        id: 'evcc',
                        type: 'evcc',
                        title: 'Wallbox',
                        datapoint: '',
                        gridPos: { x: 0, y: 0, w, h: 8 },
                        // What AdminEditor writes for a freshly added evcc widget.
                        options: { evccPrefix: 'evcc.0', loadpointCount: 1, showBattery: true, ...options },
                    },
                    {
                        id: 'ref',
                        type: 'button',
                        title: 'Referenz',
                        datapoint: '',
                        gridPos: { x: 0, y: 8, w: 6, h: 2 },
                        options: {},
                    },
                ],
                showOpts,
            );
        },
        [w, options, showOpts],
    );
    await page.waitForFunction(() => !!document.querySelector('.aura-widget-evcc .aura-widget-title'), {
        timeout: 10000,
    });
    await page.waitForTimeout(350);
}

/** Everything the scale factor is visible in, in one read. */
async function probe() {
    return await page.evaluate(() => {
        const box = document.querySelector('.aura-widget-evcc');
        const ref = document.querySelector('.aura-widget-ref');
        const fs = (el) => (el ? parseFloat(getComputedStyle(el).fontSize) : null);
        const icon = box?.querySelector('svg.aura-widget-icon');
        // The four mode buttons of the loadpoint card carry `loadpointScale`.
        const modeBtn = [...(box?.querySelectorAll('button') ?? [])][0] ?? null;
        // The smallest label in the widget is the 9 px flow caption ("Solar" …).
        const leafSizes = [...(box?.querySelectorAll('span,p') ?? [])]
            .filter((e) => e.textContent?.trim() && !e.querySelector('span,p'))
            .map((e) => parseFloat(getComputedStyle(e).fontSize));
        return {
            width: Math.round(box?.getBoundingClientRect().width ?? 0),
            titleFs: fs(box?.querySelector('.aura-widget-title')),
            iconW: icon ? Math.round(icon.getBoundingClientRect().width) : null,
            modeFs: fs(modeBtn),
            modeH: modeBtn ? Math.round(modeBtn.getBoundingClientRect().height) : null,
            smallestFs: leafSizes.length ? Math.min(...leafSizes) : null,
            refTitleFs: fs(ref?.querySelector('.aura-widget-title')),
        };
    });
}

// ── a freshly added widget (AdminEditor defaults to 12 columns) ───────────────
await show(12);
let p = await probe();
check('the default width is the one the flow row was drawn for', p.width >= 280, `${p.width}px`);
eq('a fresh widget titles like every other widget', p.titleFs, p.refTitleFs);
eq('… and its header icon is the plain 20 px', p.iconW, 20);
near('… the loadpoint mode buttons read at 11 px', p.modeFs, 11);
near('… and stand 28 px tall', p.modeH, 28);
near('… the flow captions are the intended 9 px', p.smallestFs, 9);

// ── the case that prompted this: a full-width tile ────────────────────────────
await show(24);
const wide = await probe();
check('a full-width tile really is much wider', wide.width > 700, `${wide.width}px`);
eq('but it does not grow the title', wide.titleFs, p.titleFs);
eq('nor the icon', wide.iconW, p.iconW);
eq('nor the flow captions', wide.smallestFs, p.smallestFs);

// ── narrow: shrinking is what the automatic scaling is FOR ────────────────────
await show(6);
const narrow = await probe();
check('a tile too narrow for the flow row shrinks', narrow.titleFs < p.titleFs, `${narrow.titleFs}px`);
near('… in proportion to how far it undershoots the 280 px', narrow.titleFs, 12 * Math.max(0.6, 176 / 280), 0.4);

// ── switching the automatic part off pins scale 1 at any width ────────────────
await show(6, { autoScale: false });
eq('with auto-scaling off a narrow tile keeps the normal size', (await probe()).titleFs, p.titleFs);
await show(24, { autoScale: false });
eq('and so does a wide one', (await probe()).titleFs, p.titleFs);

// ── the user can still scale up ───────────────────────────────────────────────
await show(12, { sizeScale: 1.5 });
let up = await probe();
near('the global slider still enlarges everything', up.titleFs, 18);
eq('… including the icon', up.iconW, 30);
await show(12, { headerScale: 2 });
up = await probe();
near('a section slider enlarges just its section', up.titleFs, 24);
near('… and leaves the loadpoint card alone', up.modeFs, 11);
await show(24, { autoScaleMax: 2.2 });
check('raising autoScaleMax brings the old width-driven growth back', (await probe()).titleFs > 20);

// ── the global font scale now reaches the widget, as it does everywhere else ──
await show(12, {}, { fontScale: 1.5 });
const scaled = await probe();
const ratio = scaled.titleFs / scaled.refTitleFs;
near('the widget follows the layout font scale …', ratio, 1, 0.01);
near('… by actually growing with it', scaled.titleFs, 18);
eq('… icons included', scaled.iconW, 30);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
}
