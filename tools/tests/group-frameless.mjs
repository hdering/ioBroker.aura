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

// Nested: frameless device cards in a frameless group (the report's export). Both
// are header-less, so both draw a hover toolbar top-left; the card's must not sit
// under the group's, or the card's settings cannot be reached.
{
    console.log('\nGerätekarte in Gruppe · Editor · Werkzeugleisten');
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
    await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
    const head = { frameless: true, showIcon: false, showTitle: false };
    const defs = {
        'def-outer': [
            {
                id: 'card-1',
                type: 'devicecard',
                title: 'K1',
                datapoint: 'demo.temp',
                layout: 'default',
                options: { defId: 'def-card', ...head },
                gridPos: { x: 0, y: 0, w: 7, h: 7 },
            },
            {
                id: 'card-2',
                type: 'devicecard',
                title: 'K2',
                datapoint: 'demo.temp',
                layout: 'default',
                options: { defId: 'def-card', ...head },
                gridPos: { x: 7, y: 0, w: 8, h: 7 },
            },
        ],
        'def-card': [value('in-a', { x: 0, y: 0, w: 10, h: 2 }), value('in-b', { x: 0, y: 2, w: 10, h: 5 })],
    };
    const widgets = [
        {
            id: 'outer',
            type: 'group',
            title: 'Gruppe',
            datapoint: '',
            layout: 'default',
            options: { defId: 'def-outer', ...head },
            gridPos: { x: 0, y: 0, w: 16, h: 7 },
        },
    ];
    await page.evaluate(
        ({ widgets, defs, grid }) => {
            localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 }));
            window.__auraShot.mock({ 'demo.temp': 21 });
            window.__auraShot.groupDefs(defs);
            window.__auraShot.showWidgets(widgets, { editMode: true, ...grid });
        },
        { widgets, defs, grid: GRID },
    );
    await page.waitForSelector('.aura-widget-card-1 .aura-widget-in-a', { timeout: 15000 });
    await page.waitForTimeout(500);
    // Hover the card's first child: only the innermost header-less group (the card)
    // shows its toolbar.
    const inA = await page.locator('.aura-widget-card-1 .aura-widget-in-a').first().boundingBox();
    await page.mouse.move(inA.x + inA.width / 2, inA.y + inA.height / 2);
    await page.waitForTimeout(300);
    const BARS = () => {
        const bar = (id) => {
            const el = document.querySelector(`.aura-widget-${id} > .aura-group-toolbar`);
            if (!el) return null;
            const r = el.getBoundingClientRect();
            const grip = el.firstElementChild.getBoundingClientRect();
            const hit = document.elementFromPoint(grip.x + grip.width / 2, grip.y + grip.height / 2);
            return {
                left: Math.round(r.left),
                right: Math.round(r.right),
                shown: getComputedStyle(el).opacity === '1',
                gripOwn: !!hit && el.contains(hit),
                buttons: el.children.length,
                parentBtn: !!el.querySelector('[data-aura-parent-toolbar]'),
                color: getComputedStyle(el.firstElementChild).borderTopColor,
            };
        };
        const chrome = document.querySelector('.aura-widget-in-a > .aura-edit-chrome')?.getBoundingClientRect();
        return { outer: bar('outer'), card: bar('card-1'), chromeLeft: chrome ? Math.round(chrome.left) : null };
    };
    const a = await page.evaluate(BARS);
    check(!!a.outer && !!a.card, 'beide Werkzeugleisten vorhanden', JSON.stringify(a));
    if (a.outer && a.card) {
        check(a.card.shown && a.card.gripOwn, 'Leiste der Karte sichtbar und erreichbar');
        check(!a.outer.shown, 'Leiste der Gruppe dabei verborgen');
        check(a.card.parentBtn && !a.outer.parentBtn, 'nur die Karte hat „übergeordnete Gruppe“');
        check(
            a.card.buttons === 3 && a.outer.buttons === 2,
            'Leisten nur Greifen (+ ↖) + Menü',
            `${a.card.buttons} / ${a.outer.buttons}`,
        );
        check(
            a.chromeLeft !== null && a.card.right < a.chromeLeft,
            'Kartenleiste neben der Kindleiste',
            `${a.card.right} < ${a.chromeLeft}`,
        );
        check(a.card.color !== a.outer.color, 'Farbe je Ebene', `${a.card.color} vs ${a.outer.color}`);

        // "parent group": the group's toolbar comes back, the card's steps aside.
        await page.locator('.aura-widget-card-1 > .aura-group-toolbar [data-aura-parent-toolbar]').click();
        await page.waitForTimeout(300);
        const b = await page.evaluate(BARS);
        check(b.outer.shown && b.outer.gripOwn, 'nach ↖: Leiste der Gruppe sichtbar und erreichbar');
        check(!b.card.shown, 'nach ↖: Leiste der Karte verborgen');

        // The card's menu carries what left its toolbar.
        await page.mouse.move(inA.x + inA.width / 2, inA.y + inA.height / 2 + 30);
        await page.mouse.move(inA.x + inA.width / 2, inA.y + inA.height / 2);
        await page.mouse.move(5, 880);
        await page.mouse.move(inA.x + inA.width / 2, inA.y + inA.height / 2);
        await page.waitForTimeout(300);
        await page.locator('.aura-widget-card-1 > .aura-group-toolbar > button').last().click();
        await page.waitForTimeout(300);
        check((await page.locator('[data-aura-menu-fit]').count()) === 1, 'Menü der Karte: Höhe anpassen');
        check((await page.locator('[data-aura-menu-pullout]').count()) === 1, 'Menü der Karte: aus Gruppe ziehen');

        // A click on an empty spot INSIDE the group (the gap between the cards) closes
        // the menu — the group's grid stops mousedown in the editor.
        const c1 = await page.locator('.aura-widget-card-1').first().boundingBox();
        await page.mouse.click(c1.x + c1.width + 4, c1.y + c1.height / 2);
        await page.waitForTimeout(200);
        check(
            (await page.locator('[data-aura-menu-fit]').count()) === 0,
            'Klick auf leere Fläche in der Gruppe schließt das Menü',
        );

        // "Aufbau geteilt mit …" must not be cut by the group's clipping grid.
        const badge = await page.evaluate(() => {
            const el = document.querySelector('.aura-widget-card-1 .aura-devicecard-badge');
            const clip = el?.closest('.overflow-hidden');
            if (!el || !clip) return null;
            const r = el.getBoundingClientRect();
            const c = clip.getBoundingClientRect();
            return { top: Math.round(r.top), clipTop: Math.round(c.top) };
        });
        check(!!badge && badge.top >= badge.clipTop, 'Schild „Aufbau geteilt“ ganz sichtbar', JSON.stringify(badge));
    }
    await context.close();
}
await browser.close();
console.log(`\n${passed} ok, ${failed} fehlgeschlagen`);
process.exit(failed ? 1 : 0);
