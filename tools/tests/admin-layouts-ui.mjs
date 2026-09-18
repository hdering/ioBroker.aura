// UI test for the Layouts admin page (master-detail: tree rail + layout / section
// detail). Runs against a dev server with the screenshot harness (`?shot=1`),
// seeds three layouts and checks selection, URL state, inline edits, the tab list
// and the two-step delete menu through the DOM only.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5199    (or set AURA_BASE)
//   AURA_BASE=http://localhost:5199 node tools/tests/admin-layouts-ui.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5199';

let nid = 0;
const W = (type, title, datapoint) => ({ id: `w-${nid++}`, type, title, datapoint, layout: 'default', options: {} });
const place = (ws) =>
    ws.map((wg, i) => ({ ...wg, gridPos: { x: (i % 3) * 12, y: Math.floor(i / 3) * 7, w: 11, h: 6 } }));
const tab = (id, name, n = 2, extra = {}) => ({
    id,
    name,
    slug: id,
    ...extra,
    widgets: place(Array.from({ length: n }, (_, i) => W('value', `${name} ${i + 1}`, `demo.${id}.${i}`))),
});
const sec = (id, name, tabs, extra = {}) => ({ id, name, slug: id, tabs, activeTabId: tabs[0].id, ...extra });

const LAYOUTS = [
    {
        id: 'layout-tablet',
        name: 'Tablet Wohnzimmer',
        slug: 'tablet',
        sections: [
            sec('home', 'Home', [
                tab('home', 'Home'),
                tab('steuerung', 'Steuerung'),
                tab('wetter', 'Wetter'),
                tab('bad', 'Bad', 1, { hidden: true }),
            ]),
            sec('server', 'Server', [tab('nuc', 'NUC-PVE1'), tab('grafana', 'Grafana')]),
            sec(
                'systeme',
                'Systeme',
                [tab('qnap', 'Qnap'), tab('fritz', 'Fritz!Box'), tab('fritz-traffic', 'Fritz!Box Traffic')],
                { hidden: true },
            ),
        ],
        activeSectionId: 'home',
        defaultSectionId: 'home',
    },
    {
        id: 'layout-handy',
        name: 'Handy',
        slug: 'handy',
        sections: [sec('h-home', 'Home', [tab('h-uebersicht', 'Übersicht'), tab('h-licht', 'Licht')])],
        activeSectionId: 'h-home',
    },
    {
        id: 'layout-garage',
        name: 'Garage Display',
        slug: 'garage',
        sections: [
            sec('g-main', 'Anzeige', [tab('g-status', 'Status')]),
            sec('g-service', 'Service', [tab('g-log', 'Log')]),
        ],
        activeSectionId: 'g-main',
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

async function seed() {
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
    await page.evaluate((LAYOUTS) => {
        window.__auraShot.mock({});
        window.__auraShot.seed({ layouts: LAYOUTS, activeLayoutId: 'layout-tablet' });
    }, LAYOUTS);
}
// A hash-only change does not reload the document — go through about:blank so
// every case starts from a fresh, freshly seeded page.
async function open(hash) {
    await page.goto('about:blank');
    await page.goto(`${BASE}/?shot=1#/${hash}`, { waitUntil: 'networkidle' });
    await seed();
    await page.waitForTimeout(700);
}
const hashOf = () => page.evaluate(() => location.hash);

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'networkidle' });
await seed();
await page.evaluate(() =>
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })),
);

// ── 1. Default selection = first layout ──────────────────────────────────────
console.log('\n1. default selection');
await open('admin/layouts');
check(await page.getByTestId('layout-detail').isVisible(), 'first layout is shown by default');
check((await page.locator('[data-testid^="tree-layout-"]').count()) === 3, 'tree lists 3 layouts');
check((await page.locator('[data-testid^="tree-section-"]').count()) === 6, 'tree lists 6 sections');
check((await page.getByTestId('layout-name').innerText()).includes('Tablet Wohnzimmer'), 'head shows the layout name');
check(
    (await page.getByTestId('section-list').locator('[data-testid^="section-row-"]').count()) === 3,
    'section list has 3 rows',
);
const hiddenRowOpacity = await page
    .getByTestId('tree-section-systeme')
    .locator('button')
    .evaluate((el) => getComputedStyle(el).opacity);
check(Number(hiddenRowOpacity) < 1, 'hidden section is dimmed in the tree', hiddenRowOpacity);

// ── 2. Select a section from the tree ────────────────────────────────────────
console.log('\n2. section selection');
await page.getByTestId('tree-section-home').locator('button').click();
await page.waitForTimeout(300);
check((await hashOf()).includes('ctx=home'), 'URL carries ctx=home', await hashOf());
check(await page.getByTestId('section-detail').isVisible(), 'section detail is shown');
check(
    (await page.getByTestId('section-breadcrumb').innerText()) === 'Tablet Wohnzimmer',
    'breadcrumb names the layout',
);
check((await page.locator('[data-testid^="tab-row-"]').count()) === 4, 'tab list has 4 rows');
check(
    (await page.getByTestId('tab-default-home').getAttribute('aria-checked')) === 'true',
    'first tab is the default tab',
);
check(
    (await page.getByTestId('tab-hidden-bad').getAttribute('title')) === 'In der Tab-Leiste anzeigen',
    'hidden tab offers "show"',
);

// ── 3. Tab list: default radio, hidden toggle, search ────────────────────────
console.log('\n3. tab list');
await page.getByTestId('tab-default-wetter').click();
await page.waitForTimeout(200);
check(
    (await page.getByTestId('tab-default-wetter').getAttribute('aria-checked')) === 'true',
    'default tab moves to "Wetter"',
);
check(
    (await page.getByTestId('tab-default-home').getAttribute('aria-checked')) === 'false',
    'previous default is cleared',
);
await page.getByTestId('tab-hidden-steuerung').click();
await page.waitForTimeout(200);
check(
    (await page.getByTestId('tab-hidden-steuerung').getAttribute('title')) === 'In der Tab-Leiste anzeigen',
    'eye toggle hides the tab',
);
await page.getByTestId('tab-search').fill('wet');
await page.waitForTimeout(200);
check((await page.locator('[data-testid^="tab-row-"]').count()) === 1, 'search narrows the list to 1 row');
await page.getByTestId('tab-search').fill('zzz');
await page.waitForTimeout(200);
check(await page.getByText('Kein Tab passt zur Suche.').isVisible(), 'empty search shows the no-match line');
await page.getByTestId('tab-search').fill('');

// ── 4. Inline rename of the section ──────────────────────────────────────────
console.log('\n4. inline rename');
await page.getByTestId('section-name-edit').click();
await page.getByTestId('section-name').fill('Wohnen');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
check((await page.getByTestId('tree-section-home').innerText()).includes('Wohnen'), 'tree shows the new section name');
check((await page.getByTestId('section-name').innerText()) === 'Wohnen', 'read view shows the committed name');
check(await page.getByTestId('section-detail').getByText('Wohnen').first().isVisible(), 'detail shows the new name');

// ── 5. Section visibility + default from the section detail ──────────────────
console.log('\n5. section visibility');
await open('admin/layouts?ctx=server');
await page.getByTestId('section-make-default').click();
await page.waitForTimeout(200);
check((await page.getByTestId('section-make-default').count()) === 0, 'default button turns into the default chip');
await page.getByTestId('tree-layout-layout-tablet').locator('button').first().click();
await page.waitForTimeout(300);
check(
    (await page.getByTestId('section-row-server').innerText()).includes('Standard'),
    'section list marks "Server" as default',
);

// ── 6. New section from the layout detail selects it ─────────────────────────
console.log('\n6. new section');
await open('admin/layouts?ctx=layout-garage');
await page.getByTestId('section-new').click();
await page.getByTestId('section-new-name').fill('Garten');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
check(await page.getByTestId('section-detail').isVisible(), 'new section opens in the detail pane');
check(
    (await page.getByTestId('section-breadcrumb').innerText()) === 'Garage Display',
    'breadcrumb is the parent layout',
);
check((await page.locator('[data-testid^="tree-section-"]').count()) === 7, 'tree now lists 7 sections');
check((await page.locator('[data-testid^="tab-row-"]').count()) === 1, 'new section starts with one tab');

// ── 7. Two-step delete from the "⋯" menu ─────────────────────────────────────
console.log('\n7. delete menu');
await page.getByTestId('section-menu').click();
const del = page.getByTestId('section-menu-menu').getByRole('menuitem', { name: 'Bereich löschen' });
check(await del.isVisible(), 'menu offers "Bereich löschen"');
await del.click();
await page.waitForTimeout(150);
check(
    await page.getByTestId('section-menu-menu').getByRole('menuitem', { name: 'Wirklich löschen?' }).isVisible(),
    'first click arms the confirm',
);
check((await page.locator('[data-testid^="tree-section-"]').count()) === 7, 'nothing deleted yet');
await page.getByTestId('section-menu-menu').getByRole('menuitem', { name: 'Wirklich löschen?' }).click();
await page.waitForTimeout(400);
check((await page.locator('[data-testid^="tree-section-"]').count()) === 6, 'second click deletes the section');
check(await page.getByTestId('layout-detail').isVisible(), 'selection falls back to the layout');
check((await hashOf()).includes('ctx=layout-garage'), 'URL points at the layout', await hashOf());

// ── 8. Delete is blocked for the only layout / only section ──────────────────
console.log('\n8. guarded delete');
await open('admin/layouts?ctx=h-home');
await page.getByTestId('section-menu').click();
check(
    await page.getByTestId('section-menu-menu').getByRole('menuitem', { name: 'Bereich löschen' }).isDisabled(),
    'only section cannot be deleted',
);
await page.keyboard.press('Escape');
await page.mouse.click(5, 5);

// ── 9. Legacy deep link and stale ctx ────────────────────────────────────────
console.log('\n9. URL normalisation');
await open('admin/layouts?expand=layout-garage');
await page.waitForTimeout(300);
check(
    (await hashOf()).includes('ctx=layout-garage') && !(await hashOf()).includes('expand='),
    'expand= is rewritten to ctx=',
    await hashOf(),
);
check((await page.getByTestId('layout-name').innerText()).includes('Garage Display'), 'the linked layout is selected');
await open('admin/layouts?ctx=does-not-exist');
await page.waitForTimeout(300);
check((await hashOf()).includes('ctx=layout-tablet'), 'unknown ctx falls back to the first layout', await hashOf());

// ── 10. New layout from the header ───────────────────────────────────────────
console.log('\n10. new layout');
await open('admin/layouts');
await page.getByTestId('layout-new').click();
await page.getByTestId('layout-new-name').fill('Küche');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
check((await page.locator('[data-testid^="tree-layout-"]').count()) === 4, 'tree lists 4 layouts');
check((await page.getByTestId('layout-name').innerText()).includes('Küche'), 'new layout is selected');
check(
    (await page.getByTestId('layout-slug').innerText()).includes('kueche') ||
        (await page.getByTestId('layout-slug').innerText()).includes('k-che'),
    'slug derived from the name',
);

await browser.close();
console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed ? 1 : 0);
