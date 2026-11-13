// UI test for #981: a group / device card with "Ohne Rahmen" (options.frameless).
//
// The box draws no card (no border, transparent) and its children sit on the tab's
// own grid: same top edge and same height as the same widgets placed next to the
// group, and the box is exactly as many rows tall as its children. Checked in the
// editor and in the frontend, for a plain group and for a device card.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5199 --host 127.0.0.1   (or set AURA_BASE)
//   AURA_BASE=http://127.0.0.1:5199 node tools/tests/group-frameless.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://127.0.0.1:5199';
const GRID = { gridRowHeight: 20, gridSnapX: 20, gridGap: 10 };
const rowsPx = (rows) => rows * GRID.gridRowHeight + (rows - 1) * GRID.gridGap;

const value = (id, gridPos, extra = {}) => ({
    id,
    type: 'value',
    title: id,
    datapoint: 'demo.temp',
    layout: 'default',
    options: { unit: '°C', decimals: 0 },
    gridPos,
    ...extra,
});

// Inside: 3 rows + 2 rows stacked. Outside, in the next columns: the same two.
const kids = (def) => [value(`${def}-a`, { x: 0, y: 0, w: 4, h: 3 }), value(`${def}-b`, { x: 0, y: 3, w: 4, h: 2 })];
const CASES = [
    { type: 'group', def: 'def-fl-grp', extra: {} },
    { type: 'devicecard', def: 'def-fl-card', extra: { datapoint: 'demo.temp' } },
];

let passed = 0;
let failed = 0;
const check = (ok, label, detail = '') => {
    if (ok) passed++;
    else failed++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const MEASURE = (ids) => {
    const out = {};
    for (const id of ids) {
        const el = document.querySelector(`.aura-widget-${id}`);
        if (!el) {
            out[id] = null;
            continue;
        }
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        out[id] = {
            top: Math.round(r.top * 10) / 10,
            h: Math.round(r.height * 10) / 10,
            border: cs.borderTopWidth,
            bg: cs.backgroundColor,
        };
    }
    return out;
};

const browser = await chromium.launch();
for (const editMode of [true, false]) {
    for (const c of CASES) {
        console.log(`\n${c.type} · ${editMode ? 'Editor' : 'Frontend'}`);
        const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
        const page = await context.newPage();
        page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
        await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
        const children = kids(c.def);
        const widgets = [
            {
                id: 'fl',
                type: c.type,
                title: 'Karte',
                datapoint: '',
                layout: 'default',
                options: { defId: c.def, frameless: true, showTitle: false, showIcon: false },
                gridPos: { x: 0, y: 0, w: 8, h: 5 },
                ...c.extra,
            },
            value('out-a', { x: 8, y: 0, w: 8, h: 3 }),
            value('out-b', { x: 8, y: 3, w: 8, h: 2 }),
        ];
        await page.evaluate(
            ({ widgets, children, def, grid, editMode }) => {
                localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 }));
                window.__auraShot.mock({ 'demo.temp': 21 });
                window.__auraShot.groupDefs({ [def]: children });
                window.__auraShot.showWidgets(widgets, { editMode, ...grid });
            },
            { widgets, children, def: c.def, grid: GRID, editMode },
        );
        const ids = ['fl', 'out-a', 'out-b', children[0].id, children[1].id];
        let m = null;
        let prev = '';
        for (let i = 0; i < 20; i++) {
            await page.waitForTimeout(150);
            m = await page.evaluate(MEASURE, ids);
            const k = JSON.stringify(m);
            if (k === prev && m[children[1].id]) break;
            prev = k;
        }
        const [ka, kb] = [m[children[0].id], m[children[1].id]];
        if (!m.fl || !ka || !kb) {
            check(false, 'alle Widgets gerendert', JSON.stringify(m));
            await context.close();
            continue;
        }
        check(m.fl.border === '0px', 'Karte ohne Rand', m.fl.border);
        check(m.fl.bg === 'rgba(0, 0, 0, 0)', 'Karte transparent', m.fl.bg);
        check(Math.abs(m.fl.h - rowsPx(5)) <= 1, 'Karte genau 5 Zeilen hoch', `${m.fl.h} vs ${rowsPx(5)}`);
        check(Math.abs(ka.top - m['out-a'].top) <= 1, 'Kind 1 bündig mit Nachbar', `${ka.top} vs ${m['out-a'].top}`);
        check(Math.abs(ka.h - m['out-a'].h) <= 1, 'Kind 1 gleich hoch', `${ka.h} vs ${m['out-a'].h}`);
        check(Math.abs(kb.top - m['out-b'].top) <= 1, 'Kind 2 bündig mit Nachbar', `${kb.top} vs ${m['out-b'].top}`);
        check(Math.abs(kb.h - m['out-b'].h) <= 1, 'Kind 2 gleich hoch', `${kb.h} vs ${m['out-b'].h}`);

        // Editor: live size readout while resizing — on the tab and inside the card.
        if (editMode && c.type === 'group') {
            for (const id of ['out-a', children[0].id]) {
                // The innermost grid item — `:has()` would also match the card's own item.
                await page.evaluate((id) => {
                    document.querySelector('[data-test-item]')?.removeAttribute('data-test-item');
                    document
                        .querySelector(`.aura-widget-${id}`)
                        ?.closest('.react-grid-item')
                        ?.setAttribute('data-test-item', '');
                }, id);
                const item = page.locator('[data-test-item]');
                const handle = item.locator('> .react-resizable-handle').first();
                const hb = await handle.boundingBox();
                if (!hb) {
                    check(false, `Größen-Schild ${id}: Griff gefunden`);
                    continue;
                }
                await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
                await page.mouse.down();
                await page.mouse.move(hb.x + hb.width / 2 + 5, hb.y + hb.height / 2 + 35, { steps: 6 });
                await page.waitForTimeout(100);
                const during = await item.getAttribute('data-aura-size');
                await page.mouse.up();
                await page.waitForTimeout(100);
                const after = await item.getAttribute('data-aura-size');
                check(
                    !!during && /^\d+ × \d+ · \d+ × \d+ px$/.test(during),
                    `Größen-Schild ${id} beim Ziehen`,
                    String(during),
                );
                check(after === null, `Größen-Schild ${id} danach weg`, String(after));
            }
        }
        await context.close();
    }
}
await browser.close();
console.log(`\n${passed} ok, ${failed} fehlgeschlagen`);
process.exit(failed ? 1 : 0);
