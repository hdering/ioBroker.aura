// UI test for the import dialog in the dashboard editor (#684): Escape has to close
// it like every other modal, and it must not steal the key from the datapoint picker
// that opens on top of it.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5199    (or set AURA_BASE)
//   AURA_BASE=http://localhost:5199 node tools/tests/editor-import-dialog.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5199';

const WIDGET_JSON = JSON.stringify({
    type: 'value',
    title: 'Import Test',
    datapoint: '',
    layout: 'default',
    options: {},
    gridPos: { x: 0, y: 0, w: 11, h: 6 },
});

const LAYOUTS = [
    {
        id: 'layout-a',
        name: 'Layout A',
        slug: 'a',
        sections: [
            {
                id: 'home',
                name: 'Home',
                slug: 'home',
                tabs: [{ id: 'home', name: 'Home', slug: 'home', widgets: [] }],
                activeTabId: 'home',
            },
        ],
        activeSectionId: 'home',
    },
];

let passed = 0;
let failed = 0;
const check = (ok, label, detail = '') => {
    if (ok) passed++;
    else failed++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate((layouts) => {
    window.__auraShot.mock({});
    window.__auraShot.seed({ layouts, activeLayoutId: 'layout-a' });
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 }));
}, LAYOUTS);

await page.goto('about:blank');
await page.goto(`${BASE}/?shot=1#/admin/editor`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate((layouts) => {
    window.__auraShot.mock({});
    window.__auraShot.seed({ layouts, activeLayoutId: 'layout-a' });
}, LAYOUTS);
await page.waitForTimeout(700);

const dialog = page.getByRole('heading', { name: /importieren/i });
const openDialog = async () => {
    await page.getByRole('button', { name: 'Importieren' }).click();
    await page.waitForTimeout(200);
};

console.log('\n1. Escape closes the dialog');
await openDialog();
check(await dialog.isVisible(), 'dialog opens');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
check((await dialog.count()) === 0, 'Escape closes the dialog');

console.log('\n2. Escape belongs to the datapoint picker on top');
await openDialog();
await page.locator('textarea').fill(WIDGET_JSON);
await page.waitForTimeout(300);
await page.locator('button:has(svg.lucide-database)').click();
await page.waitForTimeout(400);
const picker = page.getByPlaceholder('ID oder Name suchen…');
check(await picker.first().isVisible(), 'datapoint picker is open');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check((await picker.count()) === 0, 'Escape closes the picker');
check((await dialog.count()) === 1, 'Escape does not close the dialog behind the picker');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
check((await dialog.count()) === 0, 'the next Escape closes the dialog');

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
