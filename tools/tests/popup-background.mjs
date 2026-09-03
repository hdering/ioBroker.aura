// Verifies the configurable popup background (issue #611) against the dev server.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/popup-background.mjs
//
// The popup surface resolves through four levels: click action > popup view >
// global setting > theme (`--popup-bg`, itself falling back to `--app-surface`).
// Only the levels are asserted here, not a colour value — a hex written into the
// config must come back out of `getComputedStyle` unchanged, and an unset level
// must fall through to the next one.
//
// Popups are opened via the datapoint triggers (__auraShot.dpTriggers) instead of
// a widget click: the trigger host carries a full click action, so every level
// can be exercised without building a dashboard around it. A false→true edge is
// what opens the popup, so each case re-arms the datapoint. The global level sits
// in the same `??` chain but has no screenshot-harness setter, so it is not
// asserted here — the Admin page writes it through the store like every other
// global popup setting.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const DP = 'demo.popupBgTrigger';
const VIEW_ID = 'pv-bg-test';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/** #rrggbb → the `rgb(r, g, b)` string getComputedStyle answers with. */
function rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

function trigger(action) {
    return {
        id: 'pt-bg',
        name: 'Hintergrund',
        enabled: true,
        clause: { datapoint: DP, operator: 'true', value: '' },
        host: {
            id: 'ptw-bg',
            type: 'value',
            title: 'Popup',
            datapoint: DP,
            gridPos: { x: 0, y: 0, w: 1, h: 1 },
            options: action,
        },
        resetDp: false,
    };
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

const settle = () => page.waitForTimeout(400);
/** The dialog itself — the backdrop is the z-[300] element, the surface its child. */
const dialog = page.locator('div[class*="z-[300]"] > div').first();

/** Arm the trigger with `options`, then drive the datapoint false→true. */
async function open(options, views) {
    await page.keyboard.press('Escape');
    await settle();
    await page.evaluate(
        ([dp, rule, vs]) => {
            if (vs) window.__auraShot.popupViews(vs);
            window.__auraShot.mock({ [dp]: false });
            window.__auraShot.dpTriggers([rule]);
        },
        [DP, trigger(options), views ?? null],
    );
    await settle();
    await page.evaluate((dp) => window.__auraShot.mock({ [dp]: true }), DP);
    await settle();
    return dialog.evaluate((el) => getComputedStyle(el).backgroundColor);
}

/** What `--app-surface` / `--popup-bg` are worth in the running frontend. */
const surface = await page.evaluate(() => {
    const el = document.querySelector('[data-aura-app="frontend"]') ?? document.documentElement;
    const probe = document.createElement('div');
    probe.style.background = 'var(--popup-bg, var(--app-surface))';
    el.appendChild(probe);
    const v = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return v;
});

const htmlAction = { clickAction: { kind: 'popup-html', html: '<b>BG</b>' } };
const viewAction = { clickAction: { kind: 'popup-view', viewId: VIEW_ID } };
const view = (background) => [{ id: VIEW_ID, name: 'BG-Test', widgets: [], ...(background ? { background } : {}) }];

// ── 1. Nothing configured → the theme surface ─────────────────────────────────
check('unconfigured popup keeps the theme surface', (await open(htmlAction)) === surface, surface);

// ── 2. The `--popup-bg` theme token colours every popup ───────────────────────
const TOKEN = '#101820';
await page.evaluate((c) => {
    const el = document.querySelector('[data-aura-app="frontend"]');
    if (el) el.style.setProperty('--popup-bg', c);
}, TOKEN);
const tokenBg = await open(htmlAction);
check('--popup-bg colours a popup with no own setting', tokenBg === rgb(TOKEN), tokenBg);

// ── 3. A view setting wins over the token ─────────────────────────────────────
const VIEW_BG = '#3b0764';
const viewBg = await open(viewAction, view(VIEW_BG));
check('popup view background wins over the theme token', viewBg === rgb(VIEW_BG), viewBg);

// ── 4. The click action wins over the view ────────────────────────────────────
const ACTION_BG = '#7f1d1d';
const actionBg = await open({ ...viewAction, popupBackground: ACTION_BG }, view(VIEW_BG));
check('click-action background wins over the view', actionBg === rgb(ACTION_BG), actionBg);

// ── 5. Clearing a level falls back through, it does not stick ─────────────────
const clearedBg = await open(viewAction, view(undefined));
check('a view without a background falls back to the token', clearedBg === rgb(TOKEN), clearedBg);

await page.evaluate(() => {
    const el = document.querySelector('[data-aura-app="frontend"]');
    if (el) el.style.removeProperty('--popup-bg');
});
const restored = await open(htmlAction);
check('removing the token returns the theme surface', restored === surface, restored);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
