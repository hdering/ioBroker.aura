// Verifies that the backend overview keeps its shape no matter how damaged the
// installation is. Before this, the two health cards grew with the number of
// orphaned DPs and broken widget references and pushed the MCP setup guide far
// below the fold — exactly the user who never cleans up never saw it.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/admin-overview-layout.mjs
//
// Everything is seeded through the screenshot harness (`?shot=1`): the layout,
// the sendTo answers behind both health checks and the instance's MCP switches.
// No datapoint is touched. `__auraShot.healthChecks(true)` re-arms the health
// hooks, which are otherwise silent in screenshot mode.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

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

/** Rows a health list is allowed to show inline — mirrors PREVIEW_ROWS. */
const PREVIEW_ROWS = 5;

const MISSING_DPS = Array.from({ length: 9 }, (_, i) => `demo.0.gone.dp${i + 1}`);

const widget = (id, dp) => ({
    id,
    type: 'info',
    title: id,
    datapoint: dp,
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 10, h: 6 },
    options: { showTitle: true },
});

const LAYOUT = {
    id: 'l-overview',
    name: 'Overview',
    slug: 'overview',
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
                    widgets: MISSING_DPS.map((dp, i) => widget(`w-${i + 1}`, dp)),
                },
            ],
        },
    ],
};

/** Adapter answer for listTimers / listLists / listPanels. */
const orphans = (prefix, n) => ({
    ok: true,
    items: Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}`, name: `${prefix} ${i + 1}` })),
});

const ORPHAN_TIMERS = 12;
const ORPHAN_LISTS = 7;
const ORPHAN_PANELS = 2;
const ORPHAN_TOTAL = ORPHAN_TIMERS + ORPHAN_LISTS + ORPHAN_PANELS;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

// The admin sits behind a PIN. Same bypass the documentation screenshots use —
// the flag has to be in place before the auth store hydrates, hence the reload.
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() =>
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })),
);
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

/** Seed the harness and open the overview. `mcpEnabled` decides which shape the
 *  MCP card takes — both hooks read their source once when the page mounts, so
 *  every state gets its own fresh mount via a detour over the dashboard route. */
async function openOverview(mcpEnabled, mcpMode = 'read') {
    await page.evaluate(
        ({ layout, sendTo, mcp }) => {
            window.location.hash = '#/';
            window.__auraShot.healthChecks(true);
            window.__auraShot.seed({ layouts: [layout] });
            window.__auraShot.mockSendTo(sendTo);
            window.__auraShot.mockObjectView({
                instance: [{ id: 'system.adapter.aura.0', value: { native: mcp } }],
            });
        },
        {
            layout: LAYOUT,
            sendTo: {
                listTimers: orphans('timer', ORPHAN_TIMERS),
                listLists: orphans('list', ORPHAN_LISTS),
                listPanels: orphans('panel', ORPHAN_PANELS),
                checkDps: { ok: true, missing: MISSING_DPS },
            },
            mcp: { mcpEnabled, mcpMode },
        },
    );
    await page.waitForTimeout(150);
    await page.evaluate(() => {
        window.location.hash = '#/admin';
    });
    await page.locator('[data-aura-health="orphans"]').waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('[data-aura-mcp-card]').waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForTimeout(400);
}

const top = async (sel) => {
    const box = await page.locator(sel).first().boundingBox();
    return box ? Math.round(box.y) : null;
};
const count = (sel) => page.locator(sel).count();

try {
    // ── 1. The guide sits above the health cards ─────────────────────────────
    await openOverview(false);

    const mcpTop = await top('[data-aura-mcp-card]');
    const orphansTop = await top('[data-aura-health="orphans"]');
    const brokenTop = await top('[data-aura-health="broken"]');
    check(
        'the MCP card is rendered above the orphans card',
        mcpTop !== null && orphansTop !== null && mcpTop < orphansTop,
        `mcp ${mcpTop}, orphans ${orphansTop}`,
    );
    check(
        'the MCP card is rendered above the broken-references card',
        mcpTop !== null && brokenTop !== null && mcpTop < brokenTop,
        `mcp ${mcpTop}, broken ${brokenTop}`,
    );
    check(
        'and it is inside the first viewport even with 21 orphans and 9 broken refs',
        mcpTop !== null && mcpTop < 1000,
        `mcp top ${mcpTop}`,
    );

    // ── 2. The health data actually arrived ──────────────────────────────────
    check(
        'the orphans card counts every orphan',
        (await page.locator('[data-aura-health="orphans"] h2').innerText()).includes(String(ORPHAN_TOTAL)),
        await page.locator('[data-aura-health="orphans"] h2').innerText(),
    );
    check(
        'the broken-references card found the seeded widgets',
        (await page.locator('[data-aura-health="broken"] h2').innerText()).includes(String(MISSING_DPS.length)),
        await page.locator('[data-aura-health="broken"] h2').innerText(),
    );

    // ── 3. Inline lists are capped ───────────────────────────────────────────
    eq(
        'the timer list shows at most five rows inline',
        await count('[data-aura-orphan-row="timers"] [data-aura-orphan-item]'),
        PREVIEW_ROWS,
    );
    eq(
        'the list-DP list shows at most five rows inline',
        await count('[data-aura-orphan-row="lists"] [data-aura-orphan-item]'),
        PREVIEW_ROWS,
    );
    eq(
        'a group below the cap stays complete',
        await count('[data-aura-orphan-row="panels"] [data-aura-orphan-item]'),
        ORPHAN_PANELS,
    );
    check(
        'the truncated timer list says how many are hidden',
        (await page.locator('[data-aura-orphan-row="timers"] [data-aura-orphan-more]').innerText()).includes(
            String(ORPHAN_TIMERS - PREVIEW_ROWS),
        ),
    );
    eq('the broken-reference table shows five rows inline', await count('[data-aura-broken-row]'), PREVIEW_ROWS);

    // ── 4. The dialogs carry the full lists ──────────────────────────────────
    await page.locator('[data-aura-action="orphans-show-all"]').click();
    await page.locator('.aura-config-modal').waitFor({ state: 'visible', timeout: 5000 });
    eq(
        'the orphans dialog lists every orphan',
        await count('.aura-config-modal [data-aura-orphan-item]'),
        ORPHAN_TOTAL,
    );
    eq('and drops the "n more" line', await count('.aura-config-modal [data-aura-orphan-more]'), 0);
    await page.keyboard.press('Escape');
    await page.locator('.aura-config-modal').waitFor({ state: 'hidden', timeout: 5000 });

    await page.locator('[data-aura-action="broken-show-all"]').click();
    await page.locator('.aura-config-modal').waitFor({ state: 'visible', timeout: 5000 });
    eq(
        'the broken-references dialog lists every reference',
        await count('.aura-config-modal [data-aura-broken-row]'),
        MISSING_DPS.length,
    );
    await page.keyboard.press('Escape');
    await page.locator('.aura-config-modal').waitFor({ state: 'hidden', timeout: 5000 });

    // ── 5. Not set up → the full guide ───────────────────────────────────────
    eq(
        'an unconfigured MCP shows the setup card',
        await page.locator('[data-aura-mcp-card]').getAttribute('data-aura-mcp-state'),
        'setup',
    );
    eq('with all four steps', await count('[data-aura-mcp-steps] li'), 4);

    // ── 6. Set up → a status line that expands on demand ─────────────────────
    await openOverview(true, 'write');
    eq(
        'a configured MCP shows the status card',
        await page.locator('[data-aura-mcp-card]').getAttribute('data-aura-mcp-state'),
        'active',
    );
    eq('the steps are collapsed away', await count('[data-aura-mcp-steps]'), 0);
    eq(
        'and the card names the level the AI runs at',
        await page.locator('[data-aura-mcp-mode]').getAttribute('data-aura-mcp-mode'),
        'write',
    );

    const activeMcpHeight = (await page.locator('[data-aura-mcp-card]').boundingBox())?.height ?? 0;
    check(
        'the collapsed card is a status line, not a panel',
        activeMcpHeight < 110,
        `${Math.round(activeMcpHeight)} px`,
    );

    await page.locator('[data-aura-action="mcp-toggle-guide"]').click();
    await page.waitForTimeout(200);
    eq('the guide can be unfolded again', await count('[data-aura-mcp-steps] li'), 4);
    await page.locator('[data-aura-action="mcp-toggle-guide"]').click();
    await page.waitForTimeout(200);
    eq('and folded back', await count('[data-aura-mcp-steps]'), 0);

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
