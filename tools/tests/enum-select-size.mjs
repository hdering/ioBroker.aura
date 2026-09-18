// The Auswahlfeld (enum) widget's dropdown size and width (#679).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/enum-select-size.mjs
//
// Three things are worth pinning here:
//  * `sm` is the size the control always had — an existing widget must not move
//    by a pixel, which is also what the measured minimum (74 px) still assumes.
//  * the sizes are Tailwind `text-*` classes, not inline px, because those carry
//    `--font-scale` (index.css). A dashboard font scale has to multiply ON TOP of
//    the chosen size; inline px would swallow it silently.
//  * a fixed width has to STAY fixed on a longer entry — that is the whole point
//    of the option (the control otherwise hugs whatever is selected).
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) => check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const DP = 'aura-selftest.0.enum-size.mode';
const ENTRIES = [
    { value: '0', label: 'SV' },
    { value: '1', label: 'SV Gesamt Wohnzimmer Erdgeschoss' },
];

await page.evaluate(() => window.__auraShot.captureWrites(true));

// Each mount gets its own widget id. The dev server here has no ioBroker behind
// it, so `connected` stays false and useDatapoint never subscribes — a value
// injected AFTER the mount would never arrive. Seeding the cache and then
// mounting a fresh widget is the only way to render a given entry offline.
let seq = 0;
let SEL = '';

/** Mounts the widget on the given value and returns the closed control's metrics. */
async function show(options, { fontScale, value = 0 } = {}) {
    const id = `sel${++seq}`;
    SEL = `.aura-widget-${id}`;
    await page.evaluate(
        ([wid, opts, dp, entries, scale, val]) => {
            window.__auraShot.mock({ [dp]: val });
            window.__auraShot.mockServerState({ [dp]: val });
            window.__auraShot.showWidgets(
                [
                    {
                        id: wid,
                        type: 'enum',
                        title: 'Stromverbrauch Summen',
                        datapoint: dp,
                        layout: 'compact',
                        gridPos: { x: 0, y: 0, w: 20, h: 4 },
                        options: { entries, showValue: false, ...opts },
                    },
                ],
                scale ? { fontScale: scale } : undefined,
            );
        },
        [id, options, DP, ENTRIES, fontScale, value],
    );
    await page.waitForSelector(`${SEL} .aura-widget-action button`, { timeout: 10000 });
    await page.waitForTimeout(400);
    return control();
}

const control = () =>
    page.evaluate((sel) => {
        const el = document.querySelector(`${sel} .aura-widget-action button`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
            h: Math.round(r.height),
            w: Math.round(r.width),
            font: Math.round(parseFloat(cs.fontSize)),
            text: el.textContent,
        };
    }, SEL);

/** Opens the dropdown and reads one menu row's font size. */
async function menuFont() {
    await page.click(`${SEL} .aura-widget-action button`);
    await page.waitForTimeout(200);
    const f = await page.evaluate(() => {
        const el = document.querySelector('.z-\\[9999\\] button');
        return el ? Math.round(parseFloat(getComputedStyle(el).fontSize)) : null;
    });
    await page.mouse.click(5, 5);
    await page.waitForTimeout(200);
    return f;
}

// ── 1. No option = the size the control always had ───────────────────────────
const base = await show({});
eq('default font size is 12 px (text-xs, unchanged)', base.font, 12);
eq('default height is 30 px (unchanged)', base.h, 30);
eq('default menu rows match the control', await menuFont(), 12);

// Explicit sm must be identical to leaving it out — that is what the measured
// minimum of 74 px is based on.
const sm = await show({ selectSize: 'sm' });
eq('selectSize sm equals the default height', sm.h, base.h);
eq('selectSize sm equals the default font', sm.font, base.font);

// ── 2. md and lg grow, by the amount the metrics file records (+8 / +16) ─────
const md = await show({ selectSize: 'md' });
eq('md font size is 14 px', md.font, 14);
eq('md is 8 px taller — the measured modifier', md.h - base.h, 8);
eq('md menu rows grow with it', await menuFont(), 14);

const lg = await show({ selectSize: 'lg' });
eq('lg font size is 16 px', lg.font, 16);
eq('lg is 16 px taller — the measured modifier', lg.h - base.h, 16);
eq('lg menu rows grow with it', await menuFont(), 16);

// ── 3. The dashboard font scale multiplies on top of the size ────────────────
// The sizes are text-* classes for exactly this reason; inline px would ignore it.
const scaled = await show({ selectSize: 'md' }, { fontScale: 1.5 });
eq('a font scale of 1.5 still reaches the control', scaled.font, 21);
check('and the control got taller with it', scaled.h > md.h, `${scaled.h} vs ${md.h}`);

// ── 4. Without a width the control hugs the entry, with one it does not ──────
const hugShort = await show({}, { value: 0 });
const hugLong = await show({}, { value: 1 });
check('the long entry really is rendered', hugLong.text.startsWith('SV Gesamt'), hugLong.text);
check(
    'without a width the control follows the entry',
    hugLong.w > hugShort.w + 20,
    `short ${hugShort.w}, long ${hugLong.w}`,
);

const fixedShort = await show({ selectWidth: 180 }, { value: 0 });
eq('a fixed width is honoured', fixedShort.w, 180);
const fixedLong = await show({ selectWidth: 180 }, { value: 1 });
eq('and it stays put on a much longer entry', fixedLong.w, 180);

// A width that cannot fit the label must truncate rather than overflow the card.
const overflow = await page.evaluate((sel) => {
    const btn = document.querySelector(`${sel} .aura-widget-action button`);
    const card = document.querySelector(sel);
    return btn.getBoundingClientRect().right - card.getBoundingClientRect().right;
}, SEL);
check('the long entry does not push out of the card', overflow <= 1, `${Math.round(overflow)} px over`);

// ── 5. Size and width combine ────────────────────────────────────────────────
const both = await show({ selectSize: 'lg', selectWidth: 200 });
eq('width holds at size lg', both.w, 200);
eq('height still follows the size', both.h - base.h, 16);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\nenum-select-size: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
