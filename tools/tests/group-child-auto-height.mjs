// "Höhe automatisch an Inhalt anpassen" for a widget inside a group (#741).
// The child measures its content like on the tab; the group derives the child's
// rows from it (utils/groupLayout withContentHeights) and hugs the result — so a
// list with few entries shrinks the group, one with many grows it, and the child
// card is never cut off. The toggle is offered in the child's editor too.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5197
//   AURA_BASE=http://localhost:5197 node tools/tests/group-child-auto-height.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const GID = 'w-grp-ah';
const DEF = 'def-grp-ah';
const LIST = 'child-list-ah';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
const mock = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`test.list.${i}`, { val: i, unit: 'W' }]));
await page.evaluate((m) => {
    window.__auraShot.mockServerState(m);
    window.__auraShot.mock(m);
}, mock);

const group = (h) => ({
    id: GID,
    type: 'group',
    title: 'Gruppe',
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 12, h },
    options: { defId: DEF },
});
const children = (entries, autoHeight, listH) => [
    {
        id: 'child-top-ah',
        type: 'value',
        title: 'Oben',
        datapoint: 'test.list.0',
        gridPos: { x: 0, y: 0, w: 12, h: 3 },
        options: {},
    },
    {
        id: LIST,
        type: 'list',
        title: 'Liste',
        datapoint: '',
        gridPos: { x: 0, y: 3, w: 12, h: listH },
        options: {
            autoHeight,
            entries: Array.from({ length: entries }, (_, i) => ({ id: `test.list.${i}` })),
        },
    },
];

const MEASURE = ([gid, listId]) => {
    const g = document.querySelector(`[data-aura-widget="${gid}"]`)?.closest('.react-grid-item');
    const listCard = document.querySelector(`.aura-widget-${listId}`);
    const listItem = listCard?.closest('.react-grid-item');
    const inner = g?.querySelector('.flex-1.min-h-0');
    return {
        group: g ? Math.round(g.getBoundingClientRect().height) : -1,
        item: listItem ? Math.round(listItem.getBoundingClientRect().height) : -1,
        // Content taller than the cell: the card spills, or the list scrolls inside.
        overflow: listCard
            ? Math.max(
                  listCard.scrollHeight - listCard.clientHeight,
                  ...[...listCard.querySelectorAll('.aura-scroll')].map((e) => e.scrollHeight - e.clientHeight),
              )
            : -1,
        innerBar: inner ? inner.scrollHeight - inner.clientHeight : -1,
    };
};
async function show(entries, autoHeight, { listH = 4, groupH = 10, editMode = false } = {}) {
    await page.evaluate(
        ([g, kids, def, edit]) => {
            window.__auraShot.groupDefs({ [def]: kids });
            window.__auraShot.showWidgets([g], { editMode: edit });
        },
        [group(groupH), children(entries, autoHeight, listH), DEF, editMode],
    );
    let prev = '';
    let m = null;
    for (let i = 0; i < 20; i++) {
        await page.waitForTimeout(200);
        m = await page.evaluate(MEASURE, [GID, LIST]);
        const k = JSON.stringify(m);
        if (k === prev && i > 2) break;
        prev = k;
    }
    return m;
}

for (const editMode of [false, true]) {
    const v = editMode ? 'editor' : 'frontend';
    const off = await show(10, false, { editMode });
    check(`${v}: off — 10 entries need a scrollbar in 4 rows`, off.overflow > 4, JSON.stringify(off));
    const many = await show(10, true, { editMode });
    check(`${v}: on — 10 entries fit`, many.overflow <= 1, JSON.stringify(many));
    check(`${v}: on — list cell grew`, many.item > off.item, `${off.item} → ${many.item}`);
    check(`${v}: on — group grew along`, many.group > off.group, `${off.group} → ${many.group}`);
    check(`${v}: no inner group scrollbar`, many.innerBar <= 1, JSON.stringify(many));
    // A stored group h above the hug is a deliberate stretch (#680) — keep it low here.
    const few = await show(2, true, { listH: 20, groupH: 4, editMode });
    check(`${v}: on — 2 entries shrink a tall cell`, few.item < many.item, `${few.item} vs ${many.item}`);
    check(`${v}: on — group hugs the short list`, few.group < many.group, `${few.group} vs ${many.group}`);
    const same = await show(10, true, { listH: 1, groupH: 4, editMode });
    check(`${v}: stored h does not matter`, Math.abs(same.item - many.item) <= 1, `${same.item} vs ${many.item}`);
}

// ── toggle offered for a group child ───────────────────────────────────────
await show(4, false, { editMode: true });
const card = page.locator(`.aura-widget-${LIST}`);
await card.hover();
await card.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
await page.waitForTimeout(600);
const dlg = page.locator('.aura-widget-edit-modal');
check('group child: auto-height toggle offered', (await dlg.locator('[data-auto-height-option]').count()) === 1);
await page.screenshot({ path: 'node_modules/.cache/group-child-auto-height.png' });

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
