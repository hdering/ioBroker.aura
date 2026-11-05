// Popup view opened from a list row: widgets with a "show on match" rule on a
// `{{parent}}` datapoint must never flash before their rule hides them (#924).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/popup-view-condition-flash.mjs
//
// Every frame from the click on is sampled: a variant counts as shown when its card
// is in the popup and not visibility:hidden. Only the matching one may ever show.
// Run twice — cold (rule value arrives with getState) and warm (already cached).
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const ROW_DP = 'demo924.lamp.ON';
const TYPE_DP = 'demo924.typ.demo924.lamp';
const VARIANTS = ['a', 'b', 'c', 'd'];

const LIST = {
    id: 'w-list',
    type: 'list',
    title: 'Lampen',
    datapoint: '',
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 12, h: 4 },
    options: {
        rowClickAction: { kind: 'popup-view', viewId: 'v-924' },
        entries: [{ id: ROW_DP, label: 'Spot Flur', role: 'switch.light' }],
    },
};

const VIEW = {
    id: 'v-924',
    name: 'Licht',
    widgets: VARIANTS.map((v, i) => ({
        id: `w-${v}`,
        type: 'value',
        title: `VARIANT-${v.toUpperCase()}`,
        datapoint: '{{dp}}',
        layout: 'default',
        gridPos: { x: 0, y: i * 2, w: 4, h: 2 },
        options: {
            conditions: [
                {
                    id: 'typ',
                    clauses: [{ datapoint: 'demo924.typ.{{parent}}', operator: '==', value: v }],
                    style: {},
                    hideWidget: true,
                    visibilityMode: 'showOnMatch',
                    reflow: true,
                },
            ],
        },
    })),
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 60000 });

async function run(label, cached) {
    await page.evaluate(
        ([list, view, rowDp, typeDp, cached]) => {
            const values = { [rowDp]: true, [typeDp]: 'b' };
            // Cold: only getState knows the rule's value, and it answers late.
            window.__auraShot.mockServerState(values);
            window.__auraShot.mock(cached ? values : { [rowDp]: true });
            window.__auraShot.popupViews([view]);
            window.__auraShot.showWidgets([list]);
        },
        [LIST, VIEW, ROW_DP, TYPE_DP, cached],
    );
    await page.waitForTimeout(400);

    // Sampler: one entry per animation frame, listing the variants on screen.
    await page.evaluate(() => {
        window.__flash = [];
        const tick = () => {
            const shown = [];
            for (const cell of document.querySelectorAll('[data-aura-popup-widget]')) {
                const card = cell.querySelector('.aura-widget') ?? cell;
                if (getComputedStyle(card).visibility === 'hidden') continue;
                const r = card.getBoundingClientRect();
                if (r.width === 0 || r.height === 0) continue;
                shown.push(cell.getAttribute('data-aura-popup-widget'));
            }
            window.__flash.push(shown.join(','));
            if (window.__flash.length < 60) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
    await page.locator('text=Spot Flur').first().click();
    await page.waitForTimeout(1200);
    const frames = await page.evaluate(() => window.__flash);
    const wrong = frames.filter((f) => f.split(',').some((id) => id && id !== 'w-b'));
    check(`${label}: no other variant ever shows`, wrong.length === 0, wrong.slice(0, 3).join(' | '));
    check(`${label}: the matching variant ends up visible`, frames.at(-1) === 'w-b', `last=${frames.at(-1)}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
}

await run('cold', false);
await run('warm', true);

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
