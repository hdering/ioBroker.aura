// Verifies that removing rows from a dynamic list survives the periodic sync.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/autolist-remove-exclude.mjs
//
// The sync re-adds every datapoint the stored filter matches and `entries` lacks, so a
// plain removal came back a few minutes later (forum post 1357166). With a stored filter
// a removed row therefore goes onto excludeIds as well; "Alle löschen" drops the stored
// filter instead, since excluding everything would leave a fresh search empty. Without
// a filter nothing re-adds rows, and removal stays a plain removal.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

const listWith = (options) => ({
    id: 'rx-list',
    type: 'autolist',
    title: 'Liste',
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 14, h: 7 },
    options: {
        entries: [
            { id: 'demo.dev1.LEVEL', label: 'Eins' },
            { id: 'demo.dev2.LEVEL', label: 'Zwei' },
            { id: 'demo.dev3.LEVEL', label: 'Drei' },
        ],
        syncIntervalMin: 999,
        ...options,
    },
});

const browser = await chromium.launch();
const pageErrors = [];

/** Fresh context per scenario — the harness remembers widgets across showWidgets. */
async function openDialog(options) {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1200 }, ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
    await page.evaluate((w) => {
        window.__auraShot.showWidgets([w], { editMode: true });
        window.__auraShot.setEditMode(true);
    }, listWith(options));
    await page.locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    const trigger = page.locator('button:has-text("Datenpunkte verwalten")').first();
    await trigger.waitFor({ timeout: 10000 });
    await trigger.click();
    const dlg = page.locator('.aura-config-modal');
    await dlg.locator('button:has-text("Einträge (")').first().click();
    const opts = () => page.evaluate(() => window.__auraShot.widgetOptions('rx-list'));
    return { ctx, page, dlg, opts };
}

const removeFirst = async (page, dlg) => {
    await dlg.locator('button[title="Entfernen"]:visible').first().click();
    await page.waitForTimeout(300);
};

// ── with a stored filter ────────────────────────────────────────────────────
{
    const { ctx, page, dlg, opts } = await openDialog({ filterIdPattern: 'demo.' });
    await removeFirst(page, dlg);
    let o = await opts();
    eq(
        'filter: the row leaves the list',
        (o.entries ?? []).map((e) => e.id),
        ['demo.dev2.LEVEL', 'demo.dev3.LEVEL'],
    );
    eq('filter: and lands on excludeIds', o.excludeIds, ['demo.dev1.LEVEL']);

    await removeFirst(page, dlg);
    o = await opts();
    eq('filter: a second removal adds to excludeIds', o.excludeIds, ['demo.dev1.LEVEL', 'demo.dev2.LEVEL']);

    await dlg.locator('button:text-is("Suchen & Filter")').first().click();
    check(
        'filter: the search tab lists the exclusions',
        (await dlg.locator('text=DPs gezielt ausschließen').locator('..').textContent())?.includes('(2)'),
    );

    await dlg.locator('button:has-text("Einträge (")').first().click();
    await dlg.locator('button:text-is("Alle löschen"):visible').click();
    await page.waitForTimeout(300);
    o = await opts();
    eq('remove all: the list is empty', o.entries, []);
    eq('remove all: the stored filter is dropped', o.filterIdPattern, undefined);
    eq('remove all: earlier exclusions stay', o.excludeIds, ['demo.dev1.LEVEL', 'demo.dev2.LEVEL']);
    await ctx.close();
}

// ── without a filter ────────────────────────────────────────────────────────
{
    const { ctx, page, dlg, opts } = await openDialog({});
    await removeFirst(page, dlg);
    const o = await opts();
    eq('no filter: the row leaves the list', (o.entries ?? []).length, 2);
    eq('no filter: excludeIds stays untouched', o.excludeIds, undefined);
    await ctx.close();
}

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
