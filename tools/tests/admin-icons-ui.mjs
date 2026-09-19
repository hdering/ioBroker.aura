// UI test for Frontend design → Icons (#290): the inventory of the scope is
// checked against the adapter's cache, "Preload now" fills it and names what
// the icon source does not know, and the per-layout switch writes an override.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5199    (or set AURA_BASE)
//   AURA_BASE=http://localhost:5199 node tools/tests/admin-icons-ui.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5199';
const BOGUS = 'mdi:aura-test-no-such-icon-290';

let pass = 0;
const fails = [];
const check = (ok, label, detail = '') => {
    if (ok) pass++;
    else fails.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${!ok && detail ? ` — ${detail}` : ''}`);
};

const widget = (id, options, y) => ({
    id,
    type: 'universal',
    title: id,
    datapoint: '',
    gridPos: { x: 0, y, w: 12, h: 4 },
    options: { showTitle: true, showIcon: true, ...options },
});

/** Four distinct icons: the tab shares one with the state-icon's on-state. */
const LAYOUT = {
    id: 'layout-icons',
    name: 'Icons',
    slug: 'icons',
    activeSectionId: 'sec',
    settings: {},
    sections: [
        {
            id: 'sec',
            name: 'Section',
            slug: 'sec',
            activeTabId: 'tab',
            tabs: [
                {
                    id: 'tab',
                    name: 'Tab',
                    slug: 'tab',
                    icon: 'lucide:lightbulb',
                    widgets: [
                        widget(
                            'w-garage',
                            {
                                icon: 'mdi:garage',
                                customGrid: {
                                    cols: 1,
                                    rows: 1,
                                    cells: [
                                        {
                                            type: 'state-icon',
                                            dpId: 'demo.plug.STATE',
                                            trueIcon: 'lucide:lightbulb',
                                            falseIcon: 'lucide:lamp-ceiling',
                                        },
                                    ],
                                },
                            },
                            0,
                        ),
                        widget('w-bogus', { icon: BOGUS }, 4),
                    ],
                },
            ],
        },
    ],
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

async function seed() {
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
    await page.evaluate((layout) => {
        window.__auraShot.mock({});
        window.__auraShot.seed({ layouts: [layout], activeLayoutId: layout.id });
    }, LAYOUT);
}
async function open(hash) {
    await page.goto('about:blank');
    await page.goto(`${BASE}/?shot=1#/${hash}`, { waitUntil: 'networkidle' });
    await seed();
    await page.waitForTimeout(700);
}

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'networkidle' });
await seed();
await page.evaluate(() =>
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })),
);

// ── 1. global scope: the inventory of every layout ───────────────────────────
console.log('\n1. inventory (global)');
await open('admin/design?ctx=global&tab=icons');
check(await page.getByTestId('icons-inventory').isVisible(), 'the Icons section renders');
await page.waitForFunction(
    () => /vorhanden|held by/.test(document.querySelector('[data-testid="icons-summary"]')?.textContent ?? ''),
    { timeout: 15000 },
);
const summary = await page.getByTestId('icons-summary').innerText();
check(/allen Layouts|all layouts/.test(summary), 'global scope counts all layouts', summary);
check(/:\s*4\b/.test(summary), 'four distinct icons found (tab icon shared with the state-icon)', summary);

// ── 2. preload: the adapter fetches what it lacks, the bogus id stays missing ─
console.log('\n2. preload');
await page.getByTestId('icons-preload').click();
await page.getByTestId('icons-result').waitFor({ timeout: 45000 });
// The status re-check after the preload is asynchronous — wait for the bogus id to be reported.
await page.waitForFunction(
    (bogus) => (document.querySelector('[data-testid="icons-missing"]')?.textContent ?? '').includes(bogus),
    BOGUS,
    { timeout: 15000 },
);
const result = await page.getByTestId('icons-result').innerText();
check(/\b3\b.*(geladen|loaded)/.test(result), 'three icons loaded', result);
check(/\b1\b.*(unbekannt|unknown)/.test(result), 'one id unknown to the icon source', result);
const after = await page.getByTestId('icons-summary').innerText();
check(/\b3\b\s*(im Adapter|held)/.test(after), 'three icons now held by the adapter', after);
check(/\b1\b\s*(noch nicht|not held)/.test(after), 'one still missing', after);
check((await page.getByTestId('icons-missing').innerText()).includes(BOGUS), 'the missing list names the bogus id');

// ── 3. layout scope: the switch writes a layout override ─────────────────────
console.log('\n3. layout switch');
await open('admin/design?ctx=layout-icons&tab=icons');
await page.getByTestId('icons-summary').waitFor({ timeout: 15000 });
check(
    /diesem Layout|this layout/.test(await page.getByTestId('icons-summary').innerText()),
    'layout scope names the layout inventory',
);
// The section root holds the scoped "reset" button first, then the toggle row, then the inventory.
const section = page.getByTestId('icons-inventory').locator('xpath=..');
const reset = section.locator('button[title]').first();
check(!(await reset.isEnabled()), 'nothing overridden yet — reset is disabled');
// ToggleRow root = the justify-between flex box that carries label, hint and the button.
const row = section
    .locator('div.justify-between')
    .filter({ hasText: /Icons für Offline-Geräte vorladen|Preload icons for offline devices/ })
    .first();
const toggle = row.locator('button').first();
// The toggle has no aria state; its knob slides (translate-x-4) when on.
const knobOn = () => toggle.locator('span').evaluate((el) => el.className.includes('translate-x-4'));
check(!(await knobOn()), 'the switch starts off');
await toggle.click();
await page.waitForTimeout(400);
check(await knobOn(), 'the switch flips on');
check(await reset.isEnabled(), 'the override is written to the layout — reset is enabled');
await reset.click();
await page.waitForTimeout(400);
check(!(await knobOn()), 'reset drops the override again');

check(errors.length === 0, 'no page errors', errors.slice(0, 2).join(' | '));

await browser.close();
console.log(`\nadmin-icons-ui: ${pass} checks passed, ${fails.length} failed`);
for (const f of fails) console.log(`  FAIL ${f}`);
process.exit(fails.length ? 1 : 0);
