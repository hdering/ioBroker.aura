// "Datenpunkte verwalten" on a phone: the entry list sits beside the detail and
// left the detail no room. Below 640 px the dialog stacks the panes, folds the
// list into a bar above the detail and folds it again once an entry is picked.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5199    (or set AURA_BASE)
//   AURA_BASE=http://localhost:5199 node tools/tests/dp-manager-narrow.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5199';
const SHOT = process.env.AURA_SHOT_DIR;

let failed = 0;
const check = (ok, label, detail = '') => {
    if (!ok) failed++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const ENTRIES = [
    { id: 'aura-test.none.a', label: 'Erster Punkt' },
    { id: 'aura-test.none.b', label: 'Zweiter Punkt' },
    { id: 'aura-test.none.c', label: 'Dritter Punkt' },
];

const browser = await chromium.launch();

async function openDialog(width) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
    await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
    await page.evaluate((entries) => {
        window.__auraShot.mock({});
        window.__auraShot.showWidgets(
            [
                {
                    id: 'w-dpm',
                    type: 'list',
                    title: 'Liste',
                    datapoint: '',
                    gridPos: { x: 0, y: 0, w: 12, h: 6 },
                    options: { entries },
                },
            ],
            { editMode: true },
        );
        window.__auraShot.setEditMode(true);
    }, ENTRIES);
    await page.locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    const trigger = page.locator('button:has-text("Datenpunkte verwalten")').first();
    await trigger.waitFor({ timeout: 10000 });
    await trigger.click();
    const dlg = page.locator('.aura-config-modal').last();
    await dlg.waitFor({ timeout: 10000 });
    await page.waitForTimeout(400);
    return { ctx, page, dlg };
}

// ── Phone ─────────────────────────────────────────────────────────────────────
console.log('\n1. phone width');
{
    const { ctx, page, dlg } = await openDialog(390);
    const toggle = dlg.getByTestId('dp-manager-list-toggle');
    const listRow = (name) => dlg.locator(`text=${name}`).first();
    check(await toggle.isVisible(), 'the list folds into a bar');
    check((await toggle.getAttribute('aria-expanded')) === 'false', 'folded while the first entry is open');
    check(
        (await toggle.innerText()).includes('Erster Punkt'),
        'the bar names the open entry',
        await toggle.innerText(),
    );
    check(!(await listRow('Zweiter Punkt').isVisible()), 'the other entries are out of the way');
    if (SHOT) await page.screenshot({ path: `${SHOT}/dpm-folded.png` });

    await toggle.click();
    await page.waitForTimeout(200);
    check((await toggle.getAttribute('aria-expanded')) === 'true', 'the bar unfolds the list');
    check(await listRow('Zweiter Punkt').isVisible(), 'the list shows every entry');
    if (SHOT) await page.screenshot({ path: `${SHOT}/dpm-open.png` });

    await listRow('Zweiter Punkt').click();
    await page.waitForTimeout(200);
    check((await toggle.getAttribute('aria-expanded')) === 'false', 'picking an entry folds the list again');
    check((await toggle.innerText()).includes('Zweiter Punkt'), 'and the bar names it', await toggle.innerText());

    const box = await dlg.boundingBox();
    const docW = await page.evaluate(() => document.documentElement.scrollWidth);
    check(docW <= 390 && box && box.x + box.width <= 391, 'the dialog stays inside the screen', `${docW}`);
    await ctx.close();
}

// ── Desktop ───────────────────────────────────────────────────────────────────
console.log('\n2. desktop width');
{
    const { ctx, dlg } = await openDialog(1280);
    check((await dlg.getByTestId('dp-manager-list-toggle').count()) === 0, 'no bar beside a wide detail');
    check(await dlg.locator('text=Zweiter Punkt').first().isVisible(), 'the list stays open beside the detail');
    await ctx.close();
}

await browser.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
