// ─────────────────────────────────────────────────────────────────────────────
// Rollladen — up/stop/down stay clickable in a short card (issue #739)
// ─────────────────────────────────────────────────────────────────────────────
// The default layout stacks the three buttons next to the graphic. When that row
// was shorter than the column, the lower buttons slid under the value/slider row,
// which swallowed their clicks while the slider kept working. Each button must be
// the element under its own centre, and a click must write the datapoint.
//
//   npm run dev                       (or set AURA_BASE)
//   node tools/tests/shutter-buttons-hit.mjs
//
// Writes are captured (captureWrites), nothing reaches the instance.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const DP = 'daikin-cloud.0.aura-selftest-device.level';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

let seq = 0;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 90000 });

async function show(w, h, options = {}) {
    const cfg = {
        id: `w-shb-${++seq}`,
        type: 'shutter',
        title: 'Rollo',
        datapoint: DP,
        layout: 'default',
        gridPos: { x: 0, y: 0, w, h },
        options: { showTitle: true, ...options },
    };
    await page.evaluate(
        ([c, dp]) => {
            window.__auraShot.captureWrites(true);
            window.__auraShot.mockServerState({ [dp]: 40 });
            window.__auraShot.mock({ [dp]: 40 });
            window.__auraShot.showWidgets([c]);
        },
        [cfg, DP],
    );
    await page.waitForTimeout(400);
}

/** For each button: is it the topmost element at its centre? */
const hitTest = () =>
    page.evaluate(() => {
        const item = document.querySelector('.react-grid-item');
        return [...item.querySelectorAll('.aura-widget-action button')].map((b) => {
            const r = b.getBoundingClientRect();
            const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return {
                ok: b.contains(el),
                hit: el ? `${el.tagName}.${String(el.className?.baseVal ?? el.className).slice(0, 30)}` : null,
                h: Math.round(r.height),
            };
        });
    });

const NAMES = ['up', 'stop', 'down'];
for (const h of [3, 4, 5, 6, 8]) {
    for (const w of [3, 4, 8]) {
        for (const opts of [{}, { showSlider: false }, { showValue: false }]) {
            await show(w, h, opts);
            const hits = await hitTest();
            const label = `${w}x${h}${Object.keys(opts).length ? ` ${JSON.stringify(opts)}` : ''}`;
            check(`${label}: three buttons`, hits.length === 3, `${hits.length}`);
            hits.forEach((x, i) =>
                check(`${label}: ${NAMES[i]} on top`, x.ok, x.ok ? `${x.h}px` : `covered by ${x.hit}`),
            );
        }
    }
}

// A real click on the down button at the default size writes 0.
await show(8, 5);
await page.evaluate(() => window.__auraShot.writes(true));
await page
    .locator('.react-grid-item .aura-widget-action button')
    .nth(2)
    .click({ timeout: 3000 })
    .catch(() => {});
await page.waitForTimeout(200);
const wr = await page.evaluate(() => window.__auraShot.writes());
check(
    '8x5: click on down writes 0',
    JSON.stringify(wr).includes(DP) && wr.some((x) => x.val === 0 || x.value === 0),
    JSON.stringify(wr),
);

// Plenty of room: the configured size is kept, nothing shrinks.
await show(8, 10, { buttonSize: 14 });
const big = await hitTest();
check(
    '8x10: full-size buttons (24px)',
    big.every((x) => x.h === 24),
    big.map((x) => x.h).join(','),
);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
