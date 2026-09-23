// Health card "widget references to missing DPs" vs. the `{mode}` placeholder of
// the air-control widget (#701). The Daikin profile stores mode-dependent ids
// with a literal `{mode}` that the widget fills live; the check used to probe the
// literal id, which never exists, and flagged every such field as missing.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/broken-dps-mode.mjs
//
// Now a `{mode}` id is probed once per mode slug and only reported when no
// variant exists. Device A owns the "cooling" variants, device B owns none.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};

const SLUGS = ['fanOnly', 'heating', 'cooling', 'auto', 'dry'];
const REL = 'climateControl.temperatureControl.operationModes.{mode}.setpoints.roomTemperature';
const ROOT_A = 'daikin-cloud.0.dev-a';
const ROOT_B = 'daikin-cloud.0.dev-b';

const withMode = (root, slug) => `${root}.${REL}`.replace('{mode}', slug);
const MISSING = [
    ...SLUGS.filter((s) => s !== 'cooling').map((s) => withMode(ROOT_A, s)),
    ...SLUGS.map((s) => withMode(ROOT_B, s)),
    // What the old check asked for — must no longer decide anything.
    `${ROOT_A}.${REL}`,
    `${ROOT_B}.${REL}`,
];

const widget = (id, root, deviceType) => ({
    id,
    type: 'aircontrol',
    title: id,
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 10, h: 8 },
    options: { deviceType, targetTempDp: `${root}.${REL}` },
});

const LAYOUT = {
    id: 'l-mode',
    name: 'Mode',
    slug: 'mode',
    activeSectionId: 'sec',
    sections: [
        {
            id: 'sec',
            name: 'Test',
            slug: 'test',
            activeTabId: 'tab',
            tabs: [
                {
                    id: 'tab',
                    name: 'Tab',
                    slug: 'tab',
                    widgets: [
                        widget('dev-a', ROOT_A, 'daikin-cloud'),
                        widget('dev-b', ROOT_B, 'daikin-cloud'),
                        // No profile named: falls back to the slugs of every profile.
                        widget('dev-b-custom', ROOT_B, 'custom'),
                    ],
                },
            ],
        },
    ],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() =>
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })),
);
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

try {
    await page.evaluate(
        ({ layout, missing }) => {
            window.location.hash = '#/';
            window.__auraShot.healthChecks(true);
            window.__auraShot.seed({ layouts: [layout] });
            window.__auraShot.mockSendTo({
                listTimers: { ok: true, items: [] },
                listLists: { ok: true, items: [] },
                listPanels: { ok: true, items: [] },
                checkDps: { ok: true, missing },
            });
            window.__auraShot.mockObjectView({});
        },
        { layout: LAYOUT, missing: MISSING },
    );
    await page.waitForTimeout(150);
    await page.evaluate(() => {
        window.location.hash = '#/admin';
    });
    await page.locator('[data-aura-health="broken"]').waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForTimeout(600);

    const rows = await page.locator('[data-aura-broken-row]').allInnerTexts();
    // Row text starts with the widget title, directly followed by "· <type>".
    const has = (id) => rows.some((r) => r.split('·')[0].trim() === id);
    check('two references reported', rows.length === 2, JSON.stringify(rows));
    check('device A (owns the cooling setpoint) is not reported', !has('dev-a'), JSON.stringify(rows));
    check('device B (no variant at all) is reported', has('dev-b'), JSON.stringify(rows));
    check('device B without a profile is reported too', has('dev-b-custom'), JSON.stringify(rows));
    check(
        'the row shows the id as configured, with {mode}',
        rows.every((r) => r.includes('{mode}')),
        JSON.stringify(rows),
    );
    check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
} finally {
    await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
