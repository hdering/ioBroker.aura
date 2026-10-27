// #859: the "widget references to missing DPs" check on the backend overview ran
// once on mount, before the config load. Group / device card children live only
// in RAM and arrive with that load, so after F5 every missing DP inside a group
// was left out — only "Aktualisieren" showed the full list. Now the check waits
// for the group defs and re-runs when they land.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/broken-dps-group-hydration.mjs
//
// Seeded through the screenshot harness (`?shot=1`); no datapoint is touched.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};

const LAYOUT = {
    id: 'l-broken',
    name: 'Broken',
    slug: 'broken',
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
                        {
                            id: 'w-top',
                            type: 'value',
                            title: 'Oben',
                            datapoint: 'fake.0.top.missing',
                            gridPos: { x: 0, y: 0, w: 4, h: 2 },
                            options: {},
                        },
                        {
                            id: 'g-1',
                            type: 'group',
                            title: 'Licht',
                            datapoint: '',
                            gridPos: { x: 4, y: 0, w: 10, h: 6 },
                            options: { defId: 'gd-light' },
                        },
                    ],
                },
            ],
        },
    ],
};

const GROUP_CHILDREN = {
    'gd-light': [
        {
            id: 'w-in-group',
            type: 'value',
            title: 'Flur Tür dunkel',
            datapoint: 'fake.0.group.missing',
            gridPos: { x: 0, y: 0, w: 4, h: 2 },
            options: {},
        },
    ],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

const rows = () => page.locator('[data-aura-health="broken"] [data-aura-broken-row]').allInnerTexts();

try {
    await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() =>
        localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })),
    );
    await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

    await page.evaluate(
        ({ layout }) => {
            window.location.hash = '#/';
            window.__auraShot.healthChecks(true);
            window.__auraShot.seed({ layouts: [layout] });
            // The admin boots like a real one: group children not loaded yet.
            window.__auraShot.groupDefsPending();
            window.__auraShot.mockSendTo({
                listTimers: { ok: true, items: [] },
                listLists: { ok: true, items: [] },
                listPanels: { ok: true, items: [] },
                checkDps: { ok: true, missing: ['fake.0.top.missing', 'fake.0.group.missing'] },
            });
            window.__auraShot.mockObjectView({
                instance: [{ id: 'system.adapter.aura.0', value: { native: { mcpEnabled: false } } }],
            });
        },
        { layout: LAYOUT },
    );
    await page.waitForTimeout(150);
    await page.evaluate(() => {
        window.location.hash = '#/admin';
    });
    await page.locator('[data-aura-health="broken"]').waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForTimeout(600);

    const before = await rows();
    check(
        'before the group defs arrive no partial list is shown',
        before.length === 0,
        `listed: ${JSON.stringify(before)}`,
    );

    // No click on "Aktualisieren" — the hydration alone must trigger the check.
    await page.evaluate((defs) => window.__auraShot.groupDefs(defs), GROUP_CHILDREN);
    await page
        .locator('[data-aura-health="broken"] [data-aura-broken-row]')
        .nth(1)
        .waitFor({ state: 'visible', timeout: 5000 });
    const after = await rows();
    check('once loaded, both references are listed', after.length === 2, JSON.stringify(after));
    check(
        'including the one inside the group',
        after.some((t) => t.includes('fake.0.group.missing') && t.includes('Flur Tür dunkel')),
        JSON.stringify(after),
    );

    check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
} finally {
    await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    failed.forEach((f) => console.log(`  FAIL ${f.name} — ${f.detail}`));
    process.exit(1);
}
