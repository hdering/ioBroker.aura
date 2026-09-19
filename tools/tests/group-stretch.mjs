// UI test for #680 (follow-up): a group's height is a FLOOR, not a lock.
//
// The hug — children rows + header — is the minimum in both views. Dragging the
// group taller in the editor is a real stretch: it is persisted, the frontend
// renders the same height, and the fill spreads the extra room over the children.
// Dragging it shorter stops at the hug. A plain click on the group or a
// neighbour's resize must leave the stored height alone (no phantom "Speichern").
// Row parity: a child is never shorter inside the group than the same widget on
// the tab grid.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5199    (or set AURA_BASE)
//   AURA_BASE=http://localhost:5199 node tools/tests/group-stretch.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5199';
const GID = 'grp';
const IMG = 'img';
const DEF = 'def-grp';
const GRID = { gridRowHeight: 20, gridSnapX: 20, gridGap: 10 };
const PITCH = GRID.gridRowHeight + GRID.gridGap;
const GROUP_GAP = 4;
// Deliberately below the hug — the floor must win, and it must NOT be written
// back into the store just because the group rendered at it.
const STORED_H = 17;

// The constellation from the report: five stacked children (3+5+3+5+3 rows) in an
// 8-column group with a 20-row image next to it.
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
const MAX_BOTTOM = children.reduce((m, c) => Math.max(m, c.gridPos.y + c.gridPos.h), 0);
const widgets = [
    {
        id: GID,
        type: 'group',
        title: 'Fussbodenkreise',
        datapoint: '',
        layout: 'default',
        options: { icon: 'Layers2', defId: DEF },
        gridPos: { x: 14, y: 0, w: 8, h: STORED_H },
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

// groupRows, as src-vis/utils/groupLayout.ts computes it — the test states the
// expected floor independently instead of trusting the rendered number.
const hugRows = (headerPx) => {
    const rowH = GRID.gridRowHeight + Math.max(0, GRID.gridGap - GROUP_GAP);
    const gridArea = MAX_BOTTOM * rowH + (MAX_BOTTOM - 1) * GROUP_GAP + 2 * GROUP_GAP;
    const content = headerPx + gridArea + 2;
    return Math.max(1, Math.ceil((content + GRID.gridGap) / PITCH));
};
const rowsPx = (rows) => rows * GRID.gridRowHeight + (rows - 1) * GRID.gridGap;
const rows = (px) => Math.round(((px + GRID.gridGap) / PITCH) * 100) / 100;

let passed = 0;
let failed = 0;
const check = (ok, label, detail = '') => {
    if (ok) passed++;
    else failed++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const MEASURE = ([gid, img, kids]) => {
    const box = (id) => {
        const root = document.querySelector(`.aura-widget-${id}`);
        const item = root?.closest('.react-grid-item');
        if (!item) return null;
        const r = item.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
    };
    const root = document.querySelector(`.aura-widget-${gid}`);
    const header = root?.querySelector('[class*="shrink-0"][class*="items-center"]');
    return {
        group: box(gid),
        image: box(img),
        headerPx: header ? Math.ceil(header.getBoundingClientRect().height) : 0,
        kids: kids.map((k) => {
            const item = root?.querySelector(`.aura-widget-${k.id}`)?.closest('.react-grid-item');
            return item ? Math.round(item.getBoundingClientRect().height * 10) / 10 : null;
        }),
        storedH: window.__auraShot.widgetGridPos(gid)?.h ?? null,
    };
};

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

const kidIds = children.map((c) => ({ id: c.id }));
const settle = async () => {
    let prev = '';
    let m = null;
    for (let i = 0; i < 20; i++) {
        await page.waitForTimeout(150);
        m = await page.evaluate(MEASURE, [GID, IMG, kidIds]);
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

console.log('group stretch (#680)');
const m0 = await settle();
const HUG_ROWS = hugRows(m0.headerPx);
const HUG = rowsPx(HUG_ROWS);
check(
    m0.group.h === HUG,
    `editor hugs the group to the floor (${HUG_ROWS} rows for a ${m0.headerPx}px header)`,
    `${m0.group.h}px = ${rows(m0.group.h)} rows`,
);
check(m0.storedH === STORED_H, 'rendering at the floor does not write it into the store', `stored h ${m0.storedH}`);

// Row parity: every child at least as tall as on the tab grid.
const parity = children.map(
    (c, i) => m0.kids[i] - (c.gridPos.h * GRID.gridRowHeight + (c.gridPos.h - 1) * GRID.gridGap),
);
check(
    parity.every((d) => d >= -1),
    'every child is at least as tall as the same widget on the tab grid',
    parity.map((d) => `${d >= 0 ? '+' : ''}${Math.round(d)}`).join(' '),
);

// 1. Drag the group's own corner handle straight down: a real, persisted stretch.
await dragHandle(GID, 0, 2 * PITCH + 5);
const m1 = await settle();
check(
    m1.group.h === HUG + 2 * PITCH,
    'dragging the handle down stretches the group by two rows',
    `${m1.group.h}px vs ${HUG + 2 * PITCH}px`,
);
check(m1.storedH === HUG_ROWS + 2, 'the stretch is persisted as gridPos.h', `stored h ${m1.storedH}`);
check(m1.group.w === m0.group.w, 'a vertical drag leaves the width alone', `${m1.group.w}px vs ${m0.group.w}px`);
check(
    m1.kids.every((px, i) => px > m0.kids[i]),
    'the extra room goes to the children',
    `${m0.kids.join('/')} → ${m1.kids.join('/')}`,
);

// 2. The frontend renders the very same stretched height.
await page.evaluate(() => window.__auraShot.setEditMode(false));
const f1 = await settle();
check(
    f1.group.h === HUG + 2 * PITCH,
    'the frontend shows the stretched group',
    `${f1.group.h}px vs ${HUG + 2 * PITCH}px`,
);
await page.evaluate(() => window.__auraShot.setEditMode(true));
await settle();

// 3. Drag it back up past the hug: the floor holds.
await dragHandle(GID, 0, -(5 * PITCH));
const m2 = await settle();
check(m2.group.h === HUG, 'dragging up stops at the hug', `${m2.group.h}px vs ${HUG}px`);
check(m2.storedH === HUG_ROWS, 'the way back down is persisted too', `stored h ${m2.storedH}`);

// 4. Diagonal drag: width and height both follow now.
await dragHandle(GID, 2 * PITCH + 5, 2 * PITCH + 5);
const m3 = await settle();
check(m3.group.w > m0.group.w + PITCH, 'the same handle still resizes the width', `${m0.group.w}px → ${m3.group.w}px`);
check(m3.group.h === HUG + 2 * PITCH, 'and the height along with it', `${m3.group.h}px vs ${HUG + 2 * PITCH}px`);

// 5. Resize the neighbour: its height changes, the group's does not.
await dragHandle(IMG, 0, -(3 * PITCH));
const m4 = await settle();
check(m4.image.h < m0.image.h, 'the neighbour itself still resizes vertically', `${m0.image.h}px → ${m4.image.h}px`);
check(
    m4.group.h === m3.group.h && m4.storedH === m3.storedH,
    'resizing the neighbour leaves the group alone',
    `${m4.group.h}px, stored h ${m4.storedH}`,
);

// 6. A plain click on the group's header (its drag handle) changes nothing.
const hdr = await page.locator(`.aura-widget-${GID} [class*="shrink-0"][class*="items-center"]`).first().boundingBox();
await page.mouse.click(hdr.x + hdr.width / 2, hdr.y + hdr.height / 2);
const m5 = await settle();
check(
    m5.group.h === m4.group.h && m5.storedH === m4.storedH,
    'a click without a drag changes nothing',
    `${m5.group.h}px, stored h ${m5.storedH}`,
);

// 7. Frontend and editor agree at the end.
await page.evaluate(() => window.__auraShot.setEditMode(false));
const f2 = await settle();
check(f2.group.h === m5.group.h, 'frontend and editor render the same height', `${f2.group.h}px vs ${m5.group.h}px`);

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
