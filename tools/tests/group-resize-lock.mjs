// UI test for #680: a group whose height follows its children cannot be dragged
// taller (or shorter) in the editor. The height is derived and never persisted,
// but react-grid-layout kept a hand-resized row count in its own state until some
// other layout change re-synced it from props — so the editor showed a group two
// rows taller than the frontend, "Speichern" was never offered for it, and the box
// snapped back on the next unrelated resize. Width must stay resizable via the
// same corner handle, and resizing a neighbour must leave the group alone.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5199    (or set AURA_BASE)
//   AURA_BASE=http://localhost:5199 node tools/tests/group-resize-lock.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5199';
const GID = 'grp';
const IMG = 'img';
const DEF = 'def-grp';
const GRID = { gridRowHeight: 20, gridSnapX: 20, gridGap: 10 };
const PITCH = GRID.gridRowHeight + GRID.gridGap;

// The constellation from the report: five stacked children (3+5+3+5+3 rows) in an
// 8-column group with a 20-row image next to it. The stored group height (17) is
// deliberately one row short of the hug (18) — the hug must win, not the store.
const children = [3, 5, 3, 5, 3].reduce((acc, h, i) => {
    const y = acc.reduce((m, c) => Math.max(m, c.gridPos.y + c.gridPos.h), 0);
    acc.push({
        id: `${DEF}-c${i}`,
        type: 'value',
        title: `Kind ${i + 1}`,
        datapoint: 'demo.temp',
        layout: 'default',
        options: { unit: '°C', decimals: 0 },
        gridPos: { x: 0, y, w: 9, h },
    });
    return acc;
}, []);
const widgets = [
    {
        id: GID,
        type: 'group',
        title: 'Fussbodenkreise',
        datapoint: '',
        layout: 'default',
        options: { icon: 'Layers2', defId: DEF },
        gridPos: { x: 14, y: 0, w: 8, h: 17 },
    },
    {
        id: IMG,
        type: 'image',
        title: 'Bild',
        datapoint: '',
        layout: 'default',
        options: {},
        gridPos: { x: 0, y: 0, w: 14, h: 20 },
    },
];

let passed = 0;
let failed = 0;
const check = (ok, label, detail = '') => {
    if (ok) passed++;
    else failed++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const MEASURE = ([gid, img]) => {
    const box = (id) => {
        const root = document.querySelector(`.aura-widget-${id}`);
        const item = root?.closest('.react-grid-item');
        if (!item) return null;
        const r = item.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
    };
    return { group: box(gid), image: box(img) };
};
const rows = (px) => Math.round(((px + GRID.gridGap) / PITCH) * 100) / 100;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate(
    ({ widgets, children, def, grid }) => {
        localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 }));
        window.__auraShot.mock({ 'demo.temp': 21 });
        window.__auraShot.groupDefs({ [def]: children });
        window.__auraShot.showWidgets(widgets, { editMode: true, ...grid });
    },
    { widgets, children, def: DEF, grid: GRID },
);

const settle = async () => {
    let prev = '';
    let m = null;
    for (let i = 0; i < 20; i++) {
        await page.waitForTimeout(150);
        m = await page.evaluate(MEASURE, [GID, IMG]);
        const k = JSON.stringify(m);
        if (k === prev) break;
        prev = k;
    }
    return m;
};
const dragHandle = async (id, dx, dy) => {
    const h = await page
        .locator(`.react-grid-item:has(.aura-widget-${id}) > .react-resizable-handle`)
        .first()
        .boundingBox();
    if (!h) throw new Error(`no resize handle for ${id}`);
    const sx = h.x + h.width / 2;
    const sy = h.y + h.height / 2;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
        await page.mouse.move(sx + (i * dx) / 12, sy + (i * dy) / 12);
        await page.waitForTimeout(16);
    }
    await page.mouse.up();
};

console.log('group resize lock (#680)');
const m0 = await settle();
const HUG = m0.group.h;
check(rows(HUG) === 18, 'editor hugs the group to 18 rows', `${HUG}px = ${rows(HUG)} rows`);

// 1. Drag the group's own corner handle straight down: the height must not move.
await dragHandle(GID, 0, 2 * PITCH + 5);
const m1 = await settle();
check(m1.group.h === HUG, 'dragging the group handle down keeps the hug', `${m1.group.h}px vs ${HUG}px`);
check(m1.group.w === m0.group.w, 'a vertical drag leaves the width alone', `${m1.group.w}px vs ${m0.group.w}px`);

// 2. Drag it up: the hug is the floor as well.
await dragHandle(GID, 0, -(2 * PITCH + 5));
const m2 = await settle();
check(m2.group.h === HUG, 'dragging the group handle up keeps the hug', `${m2.group.h}px vs ${HUG}px`);

// 3. Diagonal drag: width follows, height stays.
await dragHandle(GID, 2 * PITCH + 5, 2 * PITCH + 5);
const m3 = await settle();
check(m3.group.w > m0.group.w + PITCH, 'the same handle still resizes the width', `${m0.group.w}px → ${m3.group.w}px`);
check(m3.group.h === HUG, 'the diagonal drag does not change the height', `${m3.group.h}px vs ${HUG}px`);

// 4. Resize the neighbour: its height changes, the group's does not.
await dragHandle(IMG, 0, -(3 * PITCH));
const m4 = await settle();
check(m4.image.h < m0.image.h, 'the neighbour itself still resizes vertically', `${m0.image.h}px → ${m4.image.h}px`);
check(m4.group.h === HUG, 'resizing the neighbour leaves the group at the hug', `${m4.group.h}px vs ${HUG}px`);

// 5. The frontend renders the same hug.
await page.evaluate(() => window.__auraShot.setEditMode(false));
const m5 = await settle();
check(m5.group.h === HUG, 'frontend shows the same height as the editor', `${m5.group.h}px vs ${HUG}px`);

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
