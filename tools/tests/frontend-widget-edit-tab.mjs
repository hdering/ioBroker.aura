// In-place widget edits in the frontend land on the tab the frontend shows (#731).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/frontend-widget-edit-tab.mjs
//
// The frontend routes its own layout/tab from the URL; the store's active tab is
// whatever the admin editor last had open. Dashboard used to patch a widget edit
// into the store's active tab, so a timer on any other tab dropped every edit —
// the master switch snapped back, new events never appeared. Seeds two tabs with
// the store pointing at the first, opens the second in the frontend and toggles
// the timer master switch there.
// Runs through the screenshot harness (`?shot=1`): no datapoint is written.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};

const TIMER = {
    id: 'w-timer',
    type: 'timer',
    title: 'Uhr',
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 8, h: 8 },
    options: { stateBaseId: 'aura.0.timers.t-test', targetDp: 'demo.target', value: 'true', showMasterSwitch: true },
};

const LAYOUT = {
    id: 'l-main',
    name: 'Main',
    slug: 'main',
    activeSectionId: 'sec',
    sections: [
        {
            id: 'sec',
            name: 'Bereich',
            slug: 'bereich',
            // The admin had the first tab open — the frontend shows the second.
            activeTabId: 'tab-a',
            tabs: [
                { id: 'tab-a', name: 'A', slug: 'a', widgets: [] },
                { id: 'tab-b', name: 'B', slug: 'b', widgets: [TIMER] },
            ],
        },
    ],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate((layout) => window.__auraShot.seed({ layouts: [layout] }), LAYOUT);
await page.evaluate(() => {
    window.location.hash = '#/view/main/s/bereich/tab/b';
});

const master = page.getByRole('button', { name: 'Zeitschaltuhr ein/aus' });
await master.waitFor({ timeout: 15000 });

const enabled = () => page.evaluate(() => window.__auraShot.widgetOptions('w-timer')?.enabled);
check('master starts unset (= on)', (await enabled()) === undefined, String(await enabled()));

await master.click();
await page.waitForTimeout(300);
check('master toggle on a non-active tab is stored', (await enabled()) === false, String(await enabled()));

await master.click();
await page.waitForTimeout(300);
check('second toggle is stored too', (await enabled()) === true, String(await enabled()));

const tabA = await page.evaluate(() => {
    const l = window.__auraShot && JSON.parse(localStorage.getItem('aura-dashboard') ?? 'null');
    return l?.state?.layouts?.[0]?.sections?.[0]?.tabs?.[0]?.widgets?.length ?? null;
});
check('active admin tab got no stray widget', tabA === null || tabA === 0, String(tabA));

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
