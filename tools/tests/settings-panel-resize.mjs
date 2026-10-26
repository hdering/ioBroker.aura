// Section / tab settings popovers: wide enough for marker conditions, and draggable
// wider (#850). The section popover used to be a fixed 340 px, which squeezed the
// datapoint field of a marker's WENN row to zero width.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5198    (or set AURA_BASE)
//   AURA_BASE=http://localhost:5198 node tools/tests/settings-panel-resize.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5198';

let passed = 0;
let failed = 0;
const check = (ok, label, detail = '') => {
    if (ok) passed++;
    else failed++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const condBadge = (id) => ({
    id,
    style: 'dot',
    corner: 'top-right',
    visibility: 'condition',
    clauses: [{ datapoint: '', operator: 'gt', value: '0' }],
});
const LAYOUTS = [
    {
        id: 'l-850',
        name: 'Test',
        slug: 'test',
        activeSectionId: 'sec-a',
        sections: [
            {
                id: 'sec-a',
                name: 'System',
                slug: 'system',
                activeTabId: 't-a',
                badges: [condBadge('b1')],
                tabs: [{ id: 't-a', name: 'Adapter', slug: 'adapter', badges: [condBadge('b2')], widgets: [] }],
            },
        ],
    },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

async function open() {
    await page.goto('about:blank');
    await page.goto(`${BASE}/?shot=1#/admin/editor`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
    await page.evaluate((LAYOUTS) => {
        window.__auraShot.mock({});
        window.__auraShot.seed({ layouts: LAYOUTS, activeLayoutId: 'l-850' });
    }, LAYOUTS);
    await page.waitForTimeout(700);
}

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'networkidle' });
await page.evaluate(() => {
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 }));
    for (const k of Object.keys(localStorage)) if (k.startsWith('aura-panel-width:')) localStorage.removeItem(k);
});

const panel = () => page.locator('[data-aura-panel-resize]').locator('..');
// The pointer grabs the middle of the handle, not the exact edge — a few px slack.
const near = (got, want) => Math.abs(got - want) <= 4;
const width = async () => Math.round((await panel().boundingBox()).width);

/** The datapoint input of the first clause row in the open panel. */
const dpInputWidth = async () =>
    Math.round((await panel().locator('input.font-mono').first().boundingBox())?.width ?? 0);

async function drag(dx) {
    const h = await page.locator('[data-aura-panel-resize]').boundingBox();
    const x = h.x + h.width / 2;
    const y = h.y + h.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx / 2, y, { steps: 4 });
    await page.mouse.move(x + dx, y, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(100);
}

// ── 1. Section popover ──────────────────────────────────────────────────────
console.log('\n1. section popover');
await open();
await page.locator('button[title="Marker"]').first().click();
await page.waitForTimeout(200);
check((await width()) === 340, 'collapsed popover keeps 340 px', `got ${await width()}`);
await panel()
    .getByRole('button', { name: /Marker/ })
    .first()
    .click();
await page.waitForTimeout(200);
check((await width()) === 600, 'markers open → 600 px', `got ${await width()}`);
const dp0 = await dpInputWidth();
check(dp0 >= 120, 'datapoint field of the WENN row is usable', `${dp0} px`);

await drag(140);
check(near(await width(), 740), 'dragging the edge widens the popover', `got ${await width()}`);
const dp1 = await dpInputWidth();
check(dp1 > dp0, 'the datapoint field grows with it', `${dp0} → ${dp1}`);

await drag(-400);
const narrow = await width();
check(near(narrow, 340), 'dragging back narrows it', `got ${narrow}`);
const dp2 = await dpInputWidth();
check(dp2 >= 120, 'narrow: the row wraps instead of squeezing the field', `${dp2} px`);

await drag(160);
await page.keyboard.press('Escape');
await open();
await page.locator('button[title="Marker"]').first().click();
await panel()
    .getByRole('button', { name: /Marker/ })
    .first()
    .click();
await page.waitForTimeout(200);
check(near(await width(), 500), 'width is remembered after reload', `got ${await width()}`);

await page.locator('[data-aura-panel-resize]').dblclick();
await page.waitForTimeout(100);
check((await width()) === 600, 'double-click resets to the default', `got ${await width()}`);

// ── 2. Tab popover, scrolled ─────────────────────────────────────────────────
console.log('\n2. tab popover');
await page.mouse.click(5, 990);
await page.waitForTimeout(200);
await page.locator('button:not([title]):has(svg.lucide-settings)').first().click();
await page.waitForTimeout(300);
if ((await page.locator('[data-aura-panel-resize]').count()) === 0) {
    check(false, 'tab settings popover opens');
} else {
    check((await width()) === 256, 'tab popover starts at 256 px', `got ${await width()}`);
    await drag(100);
    check(near(await width(), 356), 'tab popover is draggable too', `got ${await width()}`);
}

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
