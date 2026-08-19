// Verifies the "Spiegel" widget can mirror EVERY widget type against the dev server.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/mirror-all-types.mjs
//
// Regression: WidgetFrame.tsx kept a private type → component map, so types added only
// there (`menu`) rendered on the dashboard but produced "Unbekannter Widget-Typ: menu"
// inside a mirror. The type list is read from src-vis/types/index.ts, so a new widget
// type is covered here the moment it is declared.
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const SRC_ID = 'mirror-src';
const MIR_ID = 'mirror-dst';

const TYPES = readFileSync(new URL('../../src-vis/types/index.ts', import.meta.url), 'utf8')
    .split('export type WidgetType =')[1]
    .split(';')[0]
    .split('|')
    .map((s) => s.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);

if (TYPES.length < 40) {
    console.error(`could not read the WidgetType union (got ${TYPES.length} entries)`);
    process.exit(1);
}

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    if (!ok) console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
};

const source = (type, options = {}) => ({
    id: SRC_ID,
    type,
    title: 'Quelle',
    datapoint: 'demo.0.value',
    gridPos: { x: 0, y: 0, w: 12, h: 8 },
    options,
});

const mirror = () => ({
    id: MIR_ID,
    type: 'mirror',
    title: 'Spiegel',
    datapoint: '',
    gridPos: { x: 12, y: 0, w: 12, h: 8 },
    options: { targetWidgetId: SRC_ID },
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

// A cold dev server has to compile the whole widget graph first — 30s is not always enough.
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
await page.evaluate(() =>
    window.__auraShot.mock({
        'demo.0.value': { val: 21.5, unit: '°C' },
        'demo.0.switch': true,
        'demo.0.level': { val: 60, unit: '%' },
    }),
);

const body = (id) => page.locator(`.aura-widget-${id}`);

for (const type of TYPES) {
    const before = pageErrors.length;
    await page.evaluate(([s, m]) => window.__auraShot.showWidgets([s, m]), [source(type), mirror()]);
    // Chart/map/echart widgets are lazy chunks — give the import time to resolve.
    await page.waitForTimeout(700);

    const text =
        (await body(MIR_ID)
            .first()
            .innerText()
            .catch(() => '')) ?? '';
    const nodes = await body(MIR_ID)
        .locator('*')
        .count()
        .catch(() => 0);

    if (type === 'mirror') {
        // Mirroring a mirror stays blocked on purpose (it would allow cycles).
        check('mirror of mirror keeps its guard', text.includes('Spiegel kann keinen Spiegel spiegeln'), text.trim());
        continue;
    }

    check(`${type}: renders a known type`, !text.includes('Unbekannter Widget-Typ'), text.trim().split('\n')[0]);
    check(`${type}: resolves its source`, !text.includes('existiert nicht mehr'));
    check(`${type}: renders content`, nodes > 0, `${nodes} nodes`);
    check(`${type}: no page error`, pageErrors.length === before, pageErrors.slice(before).join(' | '));
}

// The regression case in full: a mirrored menu must show the same entries as the source.
await page.evaluate(([s, m]) => window.__auraShot.showWidgets([s, m]), [source('menu'), mirror()]);
await page.waitForTimeout(500);
const srcText = await body(SRC_ID).first().innerText();
const mirText = await body(MIR_ID).first().innerText();
check(
    'mirrored menu shows the source entries',
    srcText.includes('Screenshot') && mirText.includes('Screenshot'),
    `source="${srcText.trim()}" mirror="${mirText.trim()}"`,
);

// ── Frontend context: the menu follows the section in the URL, mirror included ──
// The menu resolves layout + section from the surrounding Dashboard now; this pins the
// frontend half of that — a tab menu in the second section lists that section's tabs.
const tab = (id, name, widgets) => ({ id, name, slug: id, widgets });
const FRONT_LAYOUT = {
    id: 'lay-front',
    name: 'Frontend',
    slug: 'front',
    activeSectionId: 'sec-one',
    sections: [
        { id: 'sec-one', name: 'FRONT-EINS', slug: 'eins', activeTabId: 't1', tabs: [tab('t1', 'TAB-EINS', [])] },
        {
            id: 'sec-two',
            name: 'FRONT-ZWEI',
            slug: 'zwei',
            activeTabId: 't2',
            tabs: [tab('t2', 'TAB-ZWEI', [source('menu', { menuMode: 'tab' }), mirror()])],
        },
    ],
};

await page.goto(`${BASE}/?shot=1#/view/front/s/zwei`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
await page.evaluate(([layout]) => window.__auraShot.seed({ layouts: [layout] }), [FRONT_LAYOUT]);
await page.waitForTimeout(800);

const frontSrc = await body(SRC_ID).first().innerText();
const frontMir = await body(MIR_ID).first().innerText();
check('frontend: tab menu lists the viewed section', frontSrc.includes('TAB-ZWEI'), frontSrc.trim());
check(
    'frontend: mirrored tab menu lists the viewed section',
    frontMir.includes('TAB-ZWEI') && !frontMir.includes('TAB-EINS'),
    frontMir.trim(),
);

// ── Editor context: a mirrored menu follows the layout being edited ──────────
// MirrorWidget renders its source with editMode=false, and the /admin route carries no
// view params — resolving the menu from the URL alone landed on the FIRST layout instead
// of the one open in the editor. The surrounding Dashboard publishes layout + section,
// so both the menu and its mirror show the edited layout's sections.
const editorTab = (widgets) => ({ id: 'tab-a', name: 'Tab', slug: 'tab-a', widgets });
const LAYOUTS = [
    {
        id: 'lay-first',
        name: 'Erstes Layout',
        slug: 'erstes',
        activeSectionId: 'sec-first',
        sections: [
            { id: 'sec-first', name: 'BEREICH-ERSTES', slug: 'erster', activeTabId: 'tab-a', tabs: [editorTab([])] },
        ],
    },
    {
        id: 'lay-edited',
        name: 'Bearbeitetes Layout',
        slug: 'bearbeitet',
        activeSectionId: 'sec-edited',
        sections: [
            {
                id: 'sec-edited',
                name: 'BEREICH-BEARBEITET',
                slug: 'bearbeitet',
                activeTabId: 'tab-a',
                tabs: [editorTab([source('menu'), mirror()])],
            },
        ],
    },
];

// The admin area asks for the PIN — same session bypass the screenshot scripts use.
await page.evaluate(() =>
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })),
);
await page.goto(`${BASE}/?shot=1#/admin/editor`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
await page.evaluate(
    ([layouts]) => window.__auraShot.seed({ layouts, activeLayoutId: 'lay-edited', editMode: true }),
    [LAYOUTS],
);
await page.waitForTimeout(1500);

const editorSrc = await body(SRC_ID).first().innerText();
const editorMir = await body(MIR_ID).first().innerText();
check('editor: menu shows the edited layout', editorSrc.includes('BEREICH-BEARBEITET'), editorSrc.trim());
check(
    'editor: mirrored menu shows the edited layout, not the first one',
    editorMir.includes('BEREICH-BEARBEITET') && !editorMir.includes('BEREICH-ERSTES'),
    editorMir.trim(),
);

// …and clicking it stays put instead of navigating out of the editor.
const urlBefore = page.url();
await body(MIR_ID).first().locator('button').first().click({ force: true });
await page.waitForTimeout(500);
check('editor: mirrored menu click stays in the editor', page.url() === urlBefore, page.url());

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed (${TYPES.length} widget types)`);
if (failed.length) {
    console.log(failed.map((f) => `  FAIL ${f.name}${f.detail ? ` — ${f.detail}` : ''}`).join('\n'));
    process.exit(1);
}
console.log('✓ every widget type can be mirrored');
