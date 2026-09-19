// UI test: pulling a child out of a group must work wherever the user lets go —
// and on a plain click on the grip.
//
//   • Drop into the free area below the widgets: the drop zone is the whole tab
//     scroller, not just the grid's own height (with few widgets most of the screen
//     is that free area, and a drop there used to do nothing).
//   • Drop back onto the own group: nothing changes — it used to add a copy and then
//     remove through a stale child list, which lost the widget.
//   • Click on the grip: the child moves onto the tab, no drag needed.
//
// Drags are dispatched as synthetic DragEvents (Playwright's mouse never produces a
// real HTML5 drop); the click is a real click.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5199    (or set AURA_BASE)
//   AURA_BASE=http://localhost:5199 node tools/tests/group-pullout.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5199';
const GID = 'grp';
const DEF = 'def-grp';
const GRID = { gridRowHeight: 20, gridSnapX: 20, gridGap: 10 };
const children = [0, 1].map((i) => ({
    id: `${DEF}-c${i}`,
    type: 'value',
    title: `Kind ${i + 1}`,
    datapoint: 'demo.temp',
    layout: 'default',
    options: { unit: '°C', decimals: 0 },
    gridPos: { x: 0, y: i * 3, w: 9, h: 3 },
}));
const widgets = [
    {
        id: GID,
        type: 'group',
        title: 'Gruppe',
        datapoint: '',
        layout: 'default',
        options: { icon: 'Layers2', defId: DEF },
        gridPos: { x: 0, y: 0, w: 9, h: 5 },
    },
];

let passed = 0;
let failed = 0;
const check = (ok, label, detail = '') => {
    if (ok) passed++;
    else failed++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const COUNT = (gid) => ({
    tab: document.querySelectorAll('.aura-tab > .react-grid-layout > .react-grid-item').length,
    kids:
        document.querySelector(`.aura-widget-${gid}`)?.querySelectorAll('.react-grid-layout > .react-grid-item')
            .length ?? -1,
});
const grip = (childId) => `.aura-widget-${childId} .aura-edit-chrome [draggable="true"]`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const reset = async () => {
    await page.evaluate(
        ({ widgets, children, def, grid }) => {
            localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 }));
            window.__auraShot.mock({ 'demo.temp': 21 });
            window.__auraShot.groupDefs({ [def]: children });
            window.__auraShot.showWidgets(widgets, { editMode: true, ...grid });
        },
        { widgets, children, def: DEF, grid: GRID },
    );
    await page.waitForTimeout(700);
    return page.evaluate(COUNT, GID);
};
const dragStart = async (childId) => {
    await page.evaluate((sel) => {
        window.__dt = new DataTransfer();
        document
            .querySelector(sel)
            .dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: window.__dt }));
    }, grip(childId));
    await page.waitForTimeout(120);
};
// dragenter/dragover/drop on whatever element sits at the given point.
const dropAt = async (x, y) => {
    for (const type of ['dragenter', 'dragover', 'drop']) {
        await page.evaluate(
            ([t, x, y]) => {
                const el = document.elementFromPoint(x, y);
                el.dispatchEvent(
                    new DragEvent(t, {
                        bubbles: true,
                        cancelable: true,
                        dataTransfer: window.__dt,
                        clientX: x,
                        clientY: y,
                    }),
                );
            },
            [type, x, y],
        );
        await page.waitForTimeout(100);
    }
    await page.evaluate(() => document.dispatchEvent(new DragEvent('dragend', { bubbles: true })));
    await page.waitForTimeout(500);
};

console.log('group pull-out');

// 1. Drop into the free area far below the widgets.
let before = await reset();
const below = await page.evaluate(() => {
    const tab = document.querySelector('.aura-tab');
    const r = tab.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + 500, r.bottom + 300);
    return { x: r.left + 500, y: r.bottom + 300, hit: el?.className?.toString().split(' ')[0] };
});
check(below.hit !== 'aura-tab', 'the point below the widgets lies outside the tab box', `hits .${below.hit}`);
await dragStart(children[1].id);
await dropAt(below.x, below.y);
let after = await page.evaluate(COUNT, GID);
check(
    after.tab === before.tab + 1 && after.kids === before.kids - 1,
    'a drop into the free area below the widgets pulls the child onto the tab',
    `tab ${before.tab}→${after.tab}, group ${before.kids}→${after.kids}`,
);

// 2. Drop back onto the own group: nothing changes, nothing gets lost.
before = await reset();
await dragStart(children[1].id);
const onGroup = await page.evaluate((gid) => {
    const r = document.querySelector(`.aura-widget-${gid} .react-grid-layout`).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + 10 };
}, GID);
await dropAt(onGroup.x, onGroup.y);
after = await page.evaluate(COUNT, GID);
check(
    after.tab === before.tab && after.kids === before.kids,
    'a drop back onto the own group changes nothing',
    `tab ${before.tab}→${after.tab}, group ${before.kids}→${after.kids}`,
);

// 3. A plain click on the grip.
before = await reset();
await page.locator(`.aura-widget-${children[0].id}`).hover();
await page.locator(grip(children[0].id)).first().click();
await page.waitForTimeout(600);
after = await page.evaluate(COUNT, GID);
check(
    after.tab === before.tab + 1 && after.kids === before.kids - 1,
    'a click on the grip pulls the child onto the tab',
    `tab ${before.tab}→${after.tab}, group ${before.kids}→${after.kids}`,
);
const pulled = await page.evaluate((gid) => {
    // RGL clones the child element into the grid item, so the data attributes sit
    // on .react-grid-item itself.
    const ids = [...document.querySelectorAll('.aura-tab > .react-grid-layout > .react-grid-item')].map((e) =>
        e.getAttribute('data-aura-widget-type'),
    );
    return ids.filter((t) => t === 'value').length;
}, GID);
check(pulled === 1, 'and it is the value widget that now sits on the tab', `${pulled} value widget(s) on the tab`);

// 4. Outside the editor the grip is not rendered at all.
await page.evaluate(() => window.__auraShot.setEditMode(false));
await page.waitForTimeout(400);
const grips = await page.evaluate(() => document.querySelectorAll('.aura-edit-chrome [draggable="true"]').length);
check(grips === 0, 'the frontend shows no grip', `${grips} grip(s)`);

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
