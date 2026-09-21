// First-start pointer to the "Erste Schritte" guide.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/admin-getting-started.mjs
//
// The admin overview carries a dismissible getting-started card above the MCP
// guide; the dismissal is a browser preference (aura-admin-prefs) and survives
// a reload. An empty tab in the frontend links to the admin and to the guide.
// Everything runs through the screenshot harness (`?shot=1`), no datapoint is
// touched.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const DOCS_START = 'https://hdering.github.io/ioBroker.aura/start/';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

/** One layout, one section, one tab without widgets — the state a fresh
 *  installation is in right after the first login. */
const LAYOUT = {
    id: 'l-start',
    name: 'Start',
    slug: 'start',
    activeSectionId: 'sec',
    sections: [
        {
            id: 'sec',
            name: 'Bereich',
            slug: 'bereich',
            activeTabId: 'tab',
            tabs: [{ id: 'tab', name: 'Tab', slug: 'tab', widgets: [] }],
        },
    ],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

// Login bypass, same as the documentation screenshots use — the flag has to be
// in place before the auth store hydrates, hence the reload.
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 }));
    localStorage.removeItem('aura-admin-prefs');
});
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const card = page.locator('[data-aura-start-card]');

/** The MCP card renders nothing until the instance config answered, so its
 *  switches are mocked the same way the overview test does it. */
async function seedInstance() {
    await page.evaluate((layout) => {
        window.__auraShot.seed({ layouts: [layout] });
        window.__auraShot.mockObjectView({
            instance: [{ id: 'system.adapter.aura.0', value: { native: { mcpEnabled: false, mcpMode: 'read' } } }],
        });
    }, LAYOUT);
    await page.waitForTimeout(150);
}

async function openAdmin() {
    await seedInstance();
    await page.evaluate(() => {
        window.location.hash = '#/admin';
    });
    await page.locator('[data-aura-mcp-card]').waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForTimeout(300);
}

const top = async (sel) => {
    const box = await page.locator(sel).first().boundingBox();
    return box ? Math.round(box.y) : null;
};

try {
    // ── 1. Fresh browser: the card is there, above the MCP guide ─────────────
    await openAdmin();
    check('the getting-started card is visible on a fresh admin', await card.isVisible());
    const cardTop = await top('[data-aura-start-card]');
    const mcpTop = await top('[data-aura-mcp-card]');
    check(
        'and sits above the MCP card',
        cardTop !== null && mcpTop !== null && cardTop < mcpTop,
        `start ${cardTop}, mcp ${mcpTop}`,
    );
    eq('it lists six steps', await card.locator('[data-aura-start-steps] li').count(), 6);
    eq(
        'the docs link points at the guide',
        await card.locator('[data-aura-start-docs]').getAttribute('href'),
        DOCS_START,
    );
    check(
        'the docs link opens in a new tab',
        (await card.locator('[data-aura-start-docs]').getAttribute('target')) === '_blank',
    );
    const stepLinks = await card
        .locator('[data-aura-start-steps] a')
        .evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    eq('the steps link to the admin pages they describe', stepLinks, [
        '#/admin/design?ctx=global&tab=theme',
        '#/admin/design?ctx=global&tab=guidelines',
        '#/admin/design?ctx=global&tab=grid',
        '#/admin/layouts',
        '#/admin/editor',
    ]);

    // ── 2. Dismiss: gone now, gone after a reload ────────────────────────────
    await card.locator('[data-aura-action="start-dismiss"]').click();
    await card.waitFor({ state: 'detached', timeout: 5000 });
    eq('dismissing removes the card', await card.count(), 0);
    check(
        'and nothing about it lands in the dashboard config (plain admin prefs only)',
        await page.evaluate(() => {
            const prefs = JSON.parse(localStorage.getItem('aura-admin-prefs') ?? '{}');
            return prefs?.state?.gettingStartedDismissed === true;
        }),
    );

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
    await openAdmin();
    eq('the dismissal survives a reload', await card.count(), 0);

    // ── 3. Reset the preference: the card is back ────────────────────────────
    await page.evaluate(() => localStorage.removeItem('aura-admin-prefs'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
    await openAdmin();
    check('clearing the preference brings the card back', await card.isVisible());

    // ── 4. Frontend: the empty tab points at admin and guide ─────────────────
    await seedInstance();
    await page.evaluate(() => {
        window.location.hash = '#/';
    });
    const links = page.locator('[data-aura-empty-links]');
    await links.waitFor({ state: 'visible', timeout: 20000 });
    eq(
        'the empty frontend tab links to the guide',
        await page.locator('[data-aura-empty-docs]').getAttribute('href'),
        DOCS_START,
    );
    eq('and to the admin', await links.locator('a').first().getAttribute('href'), '#/admin');

    eq('no page errors', pageErrors, []);
} finally {
    await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
