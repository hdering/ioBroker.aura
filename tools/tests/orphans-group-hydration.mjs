// #788: the orphan check on the backend overview ran before the config load.
// Group / device card children live only in RAM and arrive with that load, so a
// timer inside a group was listed as orphaned on every first visit — and
// "Aufräumen" would have deleted its datapoints. Now the check waits for the
// group defs and counts their children.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/orphans-group-hydration.mjs
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
    id: 'l-orph',
    name: 'Orphans',
    slug: 'orphans',
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
                            id: 'g-1',
                            type: 'group',
                            title: 'Gruppe',
                            datapoint: '',
                            gridPos: { x: 0, y: 0, w: 10, h: 6 },
                            options: { defId: 'gd-timers' },
                        },
                    ],
                },
            ],
        },
    ],
};

const GROUP_CHILDREN = {
    'gd-timers': [
        {
            id: 'w-timer-in-group',
            type: 'timer',
            title: 'Zeitschaltuhr 1',
            datapoint: '',
            gridPos: { x: 0, y: 0, w: 4, h: 4 },
            options: { stateBaseId: 'aura.0.timers.t-in-group' },
        },
    ],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

const items = () => page.locator('[data-aura-orphan-row="timers"] [data-aura-orphan-item]').allInnerTexts();

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
                listTimers: {
                    ok: true,
                    items: [
                        { id: 't-in-group', name: 'Zeitschaltuhr 1' },
                        { id: 't-orphan', name: 'Alt' },
                    ],
                },
                listLists: { ok: true, items: [] },
                listPanels: { ok: true, items: [] },
                checkDps: { ok: true, missing: [] },
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
    await page.locator('[data-aura-health="orphans"]').waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForTimeout(600);

    const before = await items();
    check('before the group defs arrive nothing is reported', before.length === 0, `listed: ${JSON.stringify(before)}`);
    check(
        'and the clean-up button is not offered',
        (await page.locator('[data-aura-health="orphans"] button:has-text("Aufräumen")').count()) === 0,
    );

    await page.evaluate((defs) => window.__auraShot.groupDefs(defs), GROUP_CHILDREN);
    await page
        .locator('[data-aura-orphan-row="timers"] [data-aura-orphan-item]')
        .first()
        .waitFor({ state: 'visible', timeout: 5000 });
    const after = await items();
    check(
        'once loaded, the real orphan is listed',
        after.length === 1 && after[0].includes('t-orphan'),
        JSON.stringify(after),
    );
    check('the timer inside the group is not', !after.some((t) => t.includes('t-in-group')), JSON.stringify(after));

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
