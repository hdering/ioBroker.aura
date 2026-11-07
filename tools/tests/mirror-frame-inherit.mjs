// A widget mirror takes its source's conditions, badges and click action (#945).
//
//   AURA_BASE=http://127.0.0.1:5245 node tools/tests/mirror-frame-inherit.mjs
//
// The mirror's frame evaluated only its own options, which are empty — so the
// source's condition ring, its badge and its click action (stored or the type
// default) never showed on the mirror. A mirror's own settings still win.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const SRC_ID = 'inh-src';
const MIR_ID = 'inh-mir';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};

const source = (options = {}) => ({
    id: SRC_ID,
    type: 'dimmer',
    title: 'Quelle',
    datapoint: 'demo.0.level',
    gridPos: { x: 0, y: 0, w: 8, h: 4 },
    options: {
        conditions: [
            {
                id: 'c1',
                logic: 'AND',
                clauses: [{ datapoint: 'demo.0.level', operator: '>', value: '0' }],
                style: { borderWidth: '4px' },
                effect: 'border',
            },
        ],
        badges: [
            {
                id: 'b1',
                style: 'dot',
                corner: 'top-right',
                visibility: 'always',
                clauses: [{ datapoint: 'demo.0.alarm', operator: 'active', value: '' }],
            },
        ],
        clickAction: { kind: 'popup-html', html: '<b>SRC-POPUP</b>' },
        ...options,
    },
});

const mirror = (options = {}) => ({
    id: MIR_ID,
    type: 'mirror',
    title: 'Spiegel',
    datapoint: '',
    gridPos: { x: 8, y: 0, w: 8, h: 4 },
    options: { targetWidgetId: SRC_ID, ...options },
});

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1400, height: 800 } })).newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
await page.evaluate(() => window.__auraShot.mock({ 'demo.0.level': { val: 60, unit: '%' }, 'demo.0.alarm': true }));

const card = (id) => page.locator(`.aura-widget-${id}`).first();
const show = async (src, mir) => {
    await page.evaluate(([s, m]) => window.__auraShot.showWidgets([s, m]), [src, mir]);
    await page.waitForTimeout(600);
};
/** Clicks the card's top-left corner (icon/title, no control) and returns the popup text. */
const popupText = async (id) => {
    const box = await card(id).boundingBox();
    await page.mouse.click(box.x + 20, box.y + 20);
    const popup = page.locator('[data-aura-click-popup]');
    const text = await popup
        .first()
        .innerText({ timeout: 2000 })
        .catch(() => '');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    return text;
};

// ── Mirror without own settings: everything comes from the source ──────────
await show(source(), mirror());
const ring = (id) => card(id).evaluate((el) => el.classList.contains('aura-cond-ring'));
const badges = (id) => card(id).locator('.aura-badge-corner').count();

check('source shows its condition ring', await ring(SRC_ID));
check('mirror shows the source condition ring', await ring(MIR_ID));
check('source shows its badge', (await badges(SRC_ID)) > 0);
check('mirror shows the source badge', (await badges(MIR_ID)) > 0, `${await badges(MIR_ID)} badges`);
const inherited = await popupText(MIR_ID);
check('mirror click opens the source action', inherited.includes('SRC-POPUP'), inherited.trim());

// ── Mirror with its own settings: those win ────────────────────────────────
await show(
    source(),
    mirror({
        conditions: [
            {
                id: 'c2',
                logic: 'AND',
                clauses: [{ datapoint: 'demo.0.level', operator: '<', value: '0' }],
                effect: 'border',
            },
        ],
        clickAction: { kind: 'popup-html', html: '<b>MIR-POPUP</b>' },
    }),
);
check('own (false) condition overrides the source', !(await ring(MIR_ID)));
const own = await popupText(MIR_ID);
check('own click action overrides the source', own.includes('MIR-POPUP') && !own.includes('SRC-POPUP'), own.trim());

// ── An explicit "no action" on the mirror stays without action ─────────────
await show(source(), mirror({ clickAction: { kind: 'none' } }));
check('explicit none on the mirror opens nothing', (await popupText(MIR_ID)) === '');

check('no page error', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
