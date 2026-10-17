// Own status symbols in the status row (statusItems / statusOrder) - issue #792.
//
//   AURA_BASE=http://localhost:5174 node tools/tests/status-items.mjs
//
// Uses the screenshot harness, values live in the in-memory cache only. Checks:
//   - active / inactive tooltip from activeValues (default true,1 and own values)
//   - show 'active' / 'inactive' and statusBadgesAlertOnly
//   - order: own symbols first by default, statusOrder overrides it
//   - toggle: a click writes the opposite value (typed, 1/0 on numbers, writeDp),
//     never reaches the tile, asks first with confirmAction, and stays put in the editor
//   - custom grid: the 'status-badges' cell carries the own symbol in the same order
//   - editor: the dialog adds the motion-lock template and reorders the row
/* global window, document */
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

let run = 0;
let MAIN, MOT, BAT;

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 120000 });
await page.evaluate(() => window.__auraShot.captureWrites(true));

const item = (patch = {}) => ({
    id: 'si-mot',
    dp: MOT,
    icon: 'mdi:motion-sensor-off',
    iconInactive: 'mdi:motion-sensor',
    label: 'Gesperrt',
    labelInactive: 'Frei',
    ...patch,
});

/** Mount a switch with the given options; `opts` may be a function of the fresh DP ids. */
async function show(opts, values, extra = {}) {
    run++;
    const base = `demo.si${run}`;
    [MAIN, MOT, BAT] = [`${base}.STATE`, `${base}.MOTION_LOCK`, `${base}.LOWBAT`];
    const options = typeof opts === 'function' ? opts() : opts;
    const vals = { [MAIN]: false, [MOT]: values.MOT, [BAT]: values.BAT ?? false };
    const widget = {
        id: `w-si-${run}`,
        type: 'switch',
        title: 'Flur',
        datapoint: MAIN,
        gridPos: { x: 0, y: 0, w: 4, h: 3 },
        options,
        ...extra,
    };
    await page.evaluate(
        ([w, v]) => {
            window.__auraShot.mock(v);
            window.__auraShot.mockServerState(v);
            window.__auraShot.showWidgets([w]);
        },
        [widget, vals],
    );
    await page.waitForTimeout(500);
    return widget.id;
}

/** Tooltips of the status row, in order. */
const titles = () =>
    page.evaluate(() =>
        [...document.querySelectorAll('[title]')]
            .map((e) => e.getAttribute('title'))
            .filter((t) => /^(Gesperrt|Frei|Batterie|Eigen)/.test(t)),
    );
const writes = () => page.evaluate(() => window.__auraShot.writes());
const resetWrites = () => page.evaluate(() => window.__auraShot.writes(true));

// ── Display ──────────────────────────────────────────────────────────────────
await show(() => ({ statusItems: [item()] }), { MOT: true });
check('active for true', JSON.stringify(await titles()) === '["Gesperrt"]', await titles());
await show(() => ({ statusItems: [item()] }), { MOT: 0 });
check('inactive for 0', JSON.stringify(await titles()) === '["Frei"]', await titles());
await show(() => ({ statusItems: [item({ activeValues: 'LOCKED' })] }), { MOT: 'locked' });
check('own activeValues', JSON.stringify(await titles()) === '["Gesperrt"]', await titles());
await show(() => ({ statusItems: [item({ dp: '' })] }), { MOT: true });
check('an entry without a datapoint is skipped', (await titles()).length === 0, await titles());

await show(() => ({ statusItems: [item({ show: 'active' })] }), { MOT: false });
check("show 'active' hides the inactive symbol", (await titles()).length === 0, await titles());
await show(() => ({ statusItems: [item({ show: 'inactive' })] }), { MOT: false });
check("show 'inactive' shows it while inactive", JSON.stringify(await titles()) === '["Frei"]', await titles());
await show(() => ({ statusItems: [item()], statusBadgesAlertOnly: true }), { MOT: false });
check('alert-only hides an inactive own symbol', (await titles()).length === 0, await titles());
await show(() => ({ statusItems: [item()], statusBadgesAlertOnly: true }), { MOT: true });
check('alert-only keeps an active own symbol', JSON.stringify(await titles()) === '["Gesperrt"]', await titles());
await show(() => ({ statusItems: [item()], showStatusBadges: false }), { MOT: true });
check('showStatusBadges false hides own symbols too', (await titles()).length === 0, await titles());

// ── Order ────────────────────────────────────────────────────────────────────
await show(() => ({ statusItems: [item()], batteryDp: BAT }), { MOT: true, BAT: true });
check(
    'default order: own symbols before the built-in ones',
    JSON.stringify(await titles()) === '["Gesperrt","Batterie schwach"]',
    await titles(),
);
await show(() => ({ statusItems: [item()], batteryDp: BAT, statusOrder: ['battery', 'si-mot'] }), {
    MOT: true,
    BAT: true,
});
check(
    'statusOrder puts the battery first',
    JSON.stringify(await titles()) === '["Batterie schwach","Gesperrt"]',
    await titles(),
);
await show(
    () => ({
        statusItems: [item(), item({ id: 'si-two', label: 'Eigen 2' })],
        batteryDp: BAT,
        statusOrder: ['si-two', 'gone', 'battery'],
    }),
    { MOT: true, BAT: true },
);
check(
    'unknown keys dropped, unnamed ones appended',
    JSON.stringify(await titles()) === '["Eigen 2","Batterie schwach","Gesperrt"]',
    await titles(),
);

// ── Toggle ───────────────────────────────────────────────────────────────────
const sym = () => page.locator('[data-aura-status-item="si-mot"]').first();

await show(() => ({ statusItems: [item({ action: 'toggle' })] }), { MOT: true });
await resetWrites();
await sym().click();
await page.waitForTimeout(200);
let w = await writes();
check(
    'click on an active symbol writes false',
    w.length === 1 && w[0].id === MOT && w[0].val === false,
    JSON.stringify(w),
);
check('the click does not switch the tile', !w.some((x) => x.id === MAIN), JSON.stringify(w));

await show(() => ({ statusItems: [item({ action: 'toggle' })] }), { MOT: 0 });
await resetWrites();
await sym().click();
await page.waitForTimeout(200);
w = await writes();
check('numeric datapoint: inactive 0 → writes 1', w.length === 1 && w[0].val === 1, JSON.stringify(w));

await show(
    () => ({
        statusItems: [
            item({
                action: 'toggle',
                writeDp: `${MOT}_SET`,
                onValue: 'LOCK',
                offValue: 'UNLOCK',
                activeValues: 'LOCKED',
            }),
        ],
    }),
    { MOT: 'LOCKED' },
);
await resetWrites();
await sym().click();
await page.waitForTimeout(200);
w = await writes();
check(
    'own writeDp and offValue',
    w.length === 1 && w[0].id === `${MOT}_SET` && w[0].val === 'UNLOCK',
    JSON.stringify(w),
);

await show(() => ({ statusItems: [item({ action: 'toggle', onValue: '2' })] }), { MOT: false });
await resetWrites();
await sym().click();
await page.waitForTimeout(200);
w = await writes();
check('onValue "2" is written as a number', w.length === 1 && w[0].val === 2, JSON.stringify(w));

await show(() => ({ statusItems: [item({ action: 'toggle' })], confirmAction: true }), { MOT: true });
await resetWrites();
await sym().click();
await page.waitForTimeout(300);
check(
    'confirmAction: nothing written before the answer',
    (await writes()).length === 0,
    JSON.stringify(await writes()),
);
await page.locator('button:text-is("Ja")').last().click();
await page.waitForTimeout(200);
w = await writes();
check('confirmAction: "Ja" writes', w.length === 1 && w[0].val === false, JSON.stringify(w));

await show(() => ({ statusItems: [item()] }), { MOT: true });
check('a display-only symbol is no button', (await page.locator('[data-aura-status-item]').count()) === 0);

// Editor: the design surface never writes.
await show(() => ({ statusItems: [item({ action: 'toggle' })] }), { MOT: true });
await page.evaluate(() => window.__auraShot.setEditMode(true));
await page.waitForTimeout(500);
await resetWrites();
await sym().click({ force: true });
await page.waitForTimeout(200);
check('edit mode: a click writes nothing', (await writes()).length === 0, JSON.stringify(await writes()));
await page.evaluate(() => window.__auraShot.setEditMode(false));
await page.waitForTimeout(300);

// ── Custom grid ──────────────────────────────────────────────────────────────
await show(
    () => ({
        statusItems: [item()],
        batteryDp: BAT,
        statusOrder: ['battery', 'si-mot'],
        customGrid: { cols: 1, rows: 1, cells: [{ type: 'component', componentKey: 'status-badges' }] },
    }),
    { MOT: true, BAT: true },
    { layout: 'custom' },
);
check(
    'custom grid status-badges: own symbol in the set order',
    JSON.stringify(await titles()) === '["Batterie schwach","Gesperrt"]',
    await titles(),
);

await show(
    () => ({
        statusItems: [item({ action: 'toggle' })],
        batteryDp: BAT,
        customGrid: { cols: 1, rows: 1, cells: [{ type: 'component', componentKey: 'status-item:si-mot' }] },
    }),
    { MOT: true, BAT: true },
    { layout: 'custom' },
);
check(
    'custom grid status-item cell: only that symbol',
    JSON.stringify(await titles()) === '["Gesperrt"]',
    await titles(),
);
await resetWrites();
await sym().click();
await page.waitForTimeout(200);
w = await writes();
check('custom grid status-item cell toggles too', w.length === 1 && w[0].val === false, JSON.stringify(w));

// Cell editor: the own symbol is offered under "Aktion / Icon".
const cellId = await show(
    () => ({
        statusItems: [item()],
        customGrid: { cols: 1, rows: 1, cells: [{ type: 'component', componentKey: 'status-badges' }] },
    }),
    { MOT: true },
    { layout: 'custom' },
);
await page.evaluate(() => window.__auraShot.setEditMode(true));
await page.waitForTimeout(600);
{
    const card = page.locator('.react-grid-item').first();
    await card.hover();
    await card.locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    await page.waitForTimeout(900);
    const dlg = page.locator('.aura-widget-edit-modal');
    const grid = dlg.locator('div:has(> p:has-text("Raster-Konfiguration"))').first();
    await grid.locator('button:has-text("1/1")').first().click();
    await page.waitForTimeout(400);
    const sel = dlg.locator('select:has(option[value="status-badges"])').first();
    const offered = await sel.locator('option[value="status-item:si-mot"]').count();
    check('cell editor offers the own symbol', offered === 1, String(offered));
    if (offered) {
        await sel.selectOption('status-item:si-mot');
        await page.waitForTimeout(300);
        const o = await page.evaluate((id) => window.__auraShot.widgetOptions(id), cellId);
        check(
            'cell editor stores the status-item key',
            o?.customGrid?.cells?.[0]?.componentKey === 'status-item:si-mot',
            JSON.stringify(o?.customGrid?.cells?.[0]),
        );
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__auraShot.setEditMode(false));
}

// ── Position of the row ──────────────────────────────────────────────────────
/** Position classes and box of the status row relative to its widget card. */
const rowPlace = () =>
    page.evaluate(() => {
        const row = document.querySelector('[data-aura-status-row]');
        const card = row?.closest('.react-grid-item');
        if (!row || !card) return null;
        const r = row.getBoundingClientRect();
        const c = card.getBoundingClientRect();
        return { cls: row.className, left: r.left - c.left < c.width / 2, top: r.top - c.top < c.height / 2 };
    });
await show(() => ({ statusItems: [item()] }), { MOT: true });
let place = await rowPlace();
check('default position: bottom right', place && !place.left && !place.top, JSON.stringify(place));
for (const [pos, left, top] of [
    ['bottom-left', true, false],
    ['top-right', false, true],
    ['top-left', true, true],
]) {
    await show(() => ({ statusItems: [item()], statusPosition: pos }), { MOT: true });
    place = await rowPlace();
    check(`statusPosition ${pos}`, place && place.left === left && place.top === top, JSON.stringify(place));
}

/** Distance of the row to the card's bottom/right edge, in px. */
const edgeGap = () =>
    page.evaluate(() => {
        const row = document.querySelector('[data-aura-status-row]');
        const card = row?.closest('.react-grid-item');
        if (!row || !card) return null;
        const r = row.getBoundingClientRect();
        const c = card.getBoundingClientRect();
        return { bottom: Math.round(c.bottom - r.bottom), right: Math.round(c.right - r.right) };
    });
await show(() => ({ statusItems: [item()] }), { MOT: true });
const inner = await edgeGap();
await show(() => ({ statusItems: [item()], statusOnEdge: true }), { MOT: true });
const edge = await edgeGap();
check(
    'statusOnEdge pushes the row into the card padding',
    inner && edge && edge.bottom < inner.bottom && edge.right < inner.right && edge.bottom >= 0 && edge.right >= 0,
    JSON.stringify({ inner, edge }),
);

// ── Types whose row the frame mounts on the card ─────────────────────────────
for (const type of [
    'aircontrol',
    'alarm',
    'button',
    'camera',
    'gauge',
    'evcc',
    'calendar',
    'trash',
    'trashSchedule',
    'map',
    'html',
    'universal',
]) {
    run++;
    const base = `demo.frame${run}`;
    const vals = { [`${base}.main`]: 1, [`${base}.LOCK`]: true, [`${base}.LOWBAT`]: true };
    const w = {
        id: `w-frame-${run}`,
        type,
        title: 'Frame',
        datapoint: `${base}.main`,
        gridPos: { x: 0, y: 0, w: 6, h: 6 },
        options: {
            batteryDp: `${base}.LOWBAT`,
            statusItems: [{ id: 'si-fr', dp: `${base}.LOCK`, label: 'Gesperrt', icon: 'mdi:lock', action: 'toggle' }],
        },
    };
    await page.evaluate(
        ([w, v]) => {
            window.__auraShot.mock(v);
            window.__auraShot.mockServerState(v);
            window.__auraShot.showWidgets([w]);
        },
        [w, vals],
    );
    await page.waitForTimeout(700);
    const t = await titles();
    check(
        `${type}: status row on the card`,
        JSON.stringify(t) === '["Gesperrt","Batterie schwach"]' &&
            (await page.locator('[data-aura-status-row]').count()) === 1,
        JSON.stringify(t),
    );
    if (type === 'gauge') {
        // Same spot as a widget-mounted row: one padding in, or on the edge.
        const inner = await edgeGap();
        await resetWrites();
        await page.locator('[data-aura-status-item="si-fr"]').first().click();
        await page.waitForTimeout(200);
        const wr = await writes();
        check('gauge: card row toggles', wr.length === 1 && wr[0].id === `${base}.LOCK`, JSON.stringify(wr));
        await page.evaluate(
            ([w, v]) => {
                window.__auraShot.mock(v);
                window.__auraShot.showWidgets([
                    { ...w, id: `${w.id}-edge`, options: { ...w.options, statusOnEdge: true } },
                ]);
            },
            [w, vals],
        );
        await page.waitForTimeout(600);
        const edge = await edgeGap();
        check(
            'gauge: card anchor matches the content anchor',
            inner && edge && Math.abs(inner.bottom - 16) <= 1 && Math.abs(inner.right - 16) <= 1 && edge.bottom <= 4,
            JSON.stringify({ inner, edge }),
        );
    }
}

// ── Fill widget carries the row now ──────────────────────────────────────────
for (const layout of ['battery', 'bar', 'segments', 'wave', 'default']) {
    run++;
    const base = `demo.fill${run}`;
    const vals = { [`${base}.soc`]: 60, [`${base}.LOCK`]: true };
    const w = {
        id: `w-fill-${run}`,
        type: 'fill',
        title: 'Akku',
        datapoint: `${base}.soc`,
        layout,
        gridPos: { x: 0, y: 0, w: 4, h: 6 },
        options: { statusItems: [{ id: 'si-f', dp: `${base}.LOCK`, label: 'Gesperrt', icon: 'mdi:lock' }] },
    };
    await page.evaluate(
        ([w, v]) => {
            window.__auraShot.mock(v);
            window.__auraShot.mockServerState(v);
            window.__auraShot.showWidgets([w]);
        },
        [w, vals],
    );
    await page.waitForTimeout(500);
    check(`fill ${layout}: status row shows`, JSON.stringify(await titles()) === '["Gesperrt"]', await titles());
}

// Universal widget: its grid comes first, the status section closes the dialog.
{
    const uId = await show(() => ({}), { MOT: false }, { type: 'universal' });
    await page.evaluate(() => window.__auraShot.setEditMode(true));
    await page.waitForTimeout(600);
    const card = page.locator('.react-grid-item').first();
    await card.hover();
    await card.locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    await page.waitForTimeout(900);
    const order = await page.evaluate(() => {
        const dlg = document.querySelector('.aura-widget-edit-modal');
        const all = [...(dlg?.querySelectorAll('*') ?? [])];
        const statusIdx = all.findIndex((e) => e.textContent?.trim() === 'Status-Datenpunkte');
        const gridIdx = all.findIndex(
            (e) => !e.children.length && (e.textContent ?? '').trim().startsWith('Raster-Konfiguration'),
        );
        const btn = [...(dlg?.querySelectorAll('button') ?? [])].filter((b) =>
            b.textContent?.includes('Eigene Symbole'),
        );
        const lastBtn = [...(dlg?.querySelectorAll('button, select, input') ?? [])].pop();
        return { statusIdx, gridIdx, btn: btn.length, lastIsOwn: !!lastBtn?.textContent?.includes('Eigene Symbole') };
    });
    check(
        'universal: status section after the grid, own symbols last',
        order.statusIdx > order.gridIdx && order.gridIdx >= 0 && order.btn === 1 && order.lastIsOwn,
        JSON.stringify(order),
    );
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__auraShot.setEditMode(false));
    void uId;
}

// ── Editor dialog ────────────────────────────────────────────────────────────
let opts;
const edId = await show(() => ({ batteryDp: BAT }), { MOT: false, BAT: false });
await page.evaluate(() => window.__auraShot.setEditMode(true));
await page.waitForTimeout(600);
const card = page.locator('.react-grid-item').first();
await card.hover();
await card.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
await page.waitForTimeout(900);
// The section starts folded; the fields inside are not reachable until it opens.
const section = page.locator('.aura-widget-edit-modal [data-aura-status-section]');
check('editor: status section starts folded', (await section.getAttribute('open')) === null);
check(
    'editor: status section is the last one of the dialog',
    await page.evaluate(() => {
        const dlg = document.querySelector('.aura-widget-edit-modal');
        const last = [...(dlg?.querySelectorAll('button, select, input, summary') ?? [])].pop();
        return !!last?.closest('[data-aura-status-section]');
    }),
);
check(
    'editor: folded section hides its fields',
    !(await page.locator('.aura-widget-edit-modal [data-aura-status-position]').isVisible()),
);
await section.locator('> summary').click();
await page.waitForTimeout(200);
check('editor: a click on the heading opens it', (await section.getAttribute('open')) !== null);
await page.locator('.aura-widget-edit-modal [data-aura-status-position]').selectOption('top-left');
await page.waitForTimeout(300);
opts = await page.evaluate((id) => window.__auraShot.widgetOptions(id), edId);
check(
    'editor: position select stores statusPosition',
    opts?.statusPosition === 'top-left',
    String(opts?.statusPosition),
);
await page.locator('.aura-widget-edit-modal [data-aura-status-edge]').check();
await page.waitForTimeout(300);
opts = await page.evaluate((id) => window.__auraShot.widgetOptions(id), edId);
check('editor: edge checkbox stores statusOnEdge', opts?.statusOnEdge === true, String(opts?.statusOnEdge));
await page.locator('.aura-widget-edit-modal button:has-text("Eigene Symbole & Reihenfolge")').click();
await page.waitForTimeout(400);
await page.locator('button:has-text("Vorlage: Bewegungsmelder gesperrt")').click();
await page.waitForTimeout(400);
opts = await page.evaluate((id) => window.__auraShot.widgetOptions(id), edId);
const added = opts?.statusItems?.[0];
check(
    'editor: template adds a toggling motion-lock symbol',
    opts?.statusItems?.length === 1 && added.icon === 'mdi:motion-sensor-off' && added.action === 'toggle',
    JSON.stringify(opts?.statusItems),
);
// Listed: [own, battery] — move the own one to the right.
await page.locator(`[data-status-row="${added?.id}"] button[title="Nach rechts"]`).click();
await page.waitForTimeout(300);
opts = await page.evaluate((id) => window.__auraShot.widgetOptions(id), edId);
const order = opts?.statusOrder ?? [];
check(
    'editor: moving right puts the battery first',
    order.indexOf('battery') >= 0 && order.indexOf('battery') < order.indexOf(added?.id),
    JSON.stringify(order),
);
await page.locator(`[data-status-row="${added?.id}"] button[title="Löschen"]`).click();
await page.waitForTimeout(300);
opts = await page.evaluate((id) => window.__auraShot.widgetOptions(id), edId);
check(
    'editor: delete removes the symbol and its order key',
    !opts?.statusItems && !(opts?.statusOrder ?? []).includes(added?.id),
    JSON.stringify({ items: opts?.statusItems, order: opts?.statusOrder }),
);
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
await page.evaluate(() => window.__auraShot.setEditMode(false));

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\nstatus-items: ${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
