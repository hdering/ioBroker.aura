// Verifies that a click popup without a configured width sizes to its content.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/popup-auto-width.mjs
//
// Why: an empty "Breite" used to mean "at most 600 px". A popup view laid out wider
// than that kept its natural minimum width inside the 600 px dialog and had to be
// scrolled sideways — the setting promised "auto" but delivered a hard cap.
// Asserted here:
//
//   1. A wide popup view opens at its designed width (well beyond 600 px).
//   2. A narrow one stays narrow — auto does not mean "always full width".
//   3. An explicit popupWidth still wins.
//   4. Free-flowing HTML keeps its 600 px reading width.
//   5. On a phone the dialog never exceeds the screen.
//
// Popups are opened through the datapoint triggers like popup-padding.mjs.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const DP = 'demo.popupWidthTrigger';
const VIEW_ID = 'pv-width-test';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const valueWidget = (id, x, w) => ({
    id,
    type: 'value',
    title: id,
    datapoint: 'demo.value',
    gridPos: { x, y: 0, w, h: 2 },
    options: {},
});

const views = (w) => [{ id: VIEW_ID, name: 'Breiten-Test', widgets: [valueWidget('pw-a', 0, w)] }];

function trigger(options) {
    return {
        id: 'pt-width',
        name: 'Breite',
        enabled: true,
        clause: { datapoint: DP, operator: 'true', value: '' },
        host: {
            id: 'ptw-width',
            type: 'value',
            title: 'Popup',
            datapoint: DP,
            gridPos: { x: 0, y: 0, w: 1, h: 1 },
            options,
        },
        resetDp: false,
    };
}

const viewAction = { clickAction: { kind: 'popup-view', viewId: VIEW_ID } };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 90000 });

const settle = () => page.waitForTimeout(450);

/** Arm the trigger, drive the DP false→true, measure dialog + scroller. */
async function open(options, vs) {
    await page.keyboard.press('Escape');
    await settle();
    await page.evaluate(
        ([dp, rule, v]) => {
            window.__auraShot.mock({ 'demo.value': { val: 21.5, unit: '°C' }, [dp]: false });
            window.__auraShot.popupViews(v);
            window.__auraShot.dpTriggers([rule]);
        },
        [DP, trigger(options), vs],
    );
    await settle();
    await page.evaluate((dp) => window.__auraShot.mock({ [dp]: true }), DP);
    await settle();
    return page.evaluate(() => {
        const backdrop = document.querySelector('[data-aura-click-popup]');
        if (!backdrop) return null;
        const dialog = backdrop.firstElementChild;
        const scroller = backdrop.querySelector('.overflow-auto');
        const content = scroller?.firstElementChild?.firstElementChild;
        return {
            width: Math.round(dialog.getBoundingClientRect().width),
            contentWidth: content ? Math.round(content.getBoundingClientRect().width) : -1,
            hScroll: scroller ? scroller.scrollWidth - scroller.clientWidth > 1 : false,
        };
    });
}

// ── 1. Wide view → dialog follows its natural width ──────────────────────────
const wide = await open(viewAction, views(40));
check('Popup öffnet', !!wide);
check('breite View sprengt die alten 600 px', wide.width > 800, `${wide.width} px`);
check('breite View scrollt nicht seitlich', !wide.hScroll);

// ── 2. Narrow view stays narrow ───────────────────────────────────────────────
const narrow = await open(viewAction, views(3));
check('schmale View bleibt schmal', narrow.width < 500, `${narrow.width} px`);

// ── 3. Explicit width wins ────────────────────────────────────────────────────
const fixed = await open({ ...viewAction, popupWidth: 700 }, views(40));
check('feste Breite gilt weiter', Math.abs(fixed.width - 700) <= 1, `${fixed.width} px`);

// ── 4. HTML keeps its reading width ───────────────────────────────────────────
const html = await open(
    { clickAction: { kind: 'popup-html', html: `<p>${'Lorem ipsum dolor sit amet '.repeat(80)}</p>` } },
    views(3),
);
check('HTML-Fließtext bleibt bei 600 px', html.width <= 601 && html.width > 500, `${html.width} px`);

// ── 5. Phone: never wider than the screen ─────────────────────────────────────
await page.setViewportSize({ width: 390, height: 800 });
const phone = await open(viewAction, views(40));
check('Handy: Popup passt auf den Schirm', phone.width <= 390 - 16, `${phone.width} px`);

check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} Checks ok`);
process.exit(failed.length ? 1 : 0);
