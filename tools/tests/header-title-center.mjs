// Centred title beside header items (issue #676): with titleAlign 'center' the title
// sits in the middle of the card, whatever the icon on the left or the header items
// and buttons on the right take — and r1-center items join the title instead of
// lying on top of it. Expanded (the widget's TitleRow) and folded (the frame's
// HeaderRowOne).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/header-title-center.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const VALUES = {
    'demo.temp': { val: 65.3, unit: '°C' },
    'demo.sw': { val: true },
    'demo.lvl': { val: 40 },
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.waitForTimeout(700);
await page.evaluate((v) => {
    window.__auraShot.mockServerState(v);
    window.__auraShot.mock(v);
}, VALUES);

let seq = 0;
async function show(type, options, extra = {}) {
    const id = `tc-${++seq}`;
    const widget = {
        id,
        type,
        title: 'Sauna',
        datapoint: 'demo.sw',
        layout: 'default',
        gridPos: { x: 0, y: 0, w: 8, h: 6 },
        ...extra,
        options: { showIcon: true, titleAlign: 'center', ...options },
    };
    await page.evaluate(([w]) => window.__auraShot.showWidgets([w]), [widget]);
    await page.waitForTimeout(600);
    return id;
}

/** Horizontal offset of the title's text from the card's centre, and whether it overlaps a centre item. */
async function measure(id) {
    return page.evaluate((wid) => {
        const card = document.querySelector(`[data-aura-widget="${wid}"]`);
        const title = card?.querySelector('.aura-widget-title');
        if (!card || !title) return null;
        // The text's own width, not the (possibly stretched) box.
        const range = document.createRange();
        range.selectNodeContents(title);
        const t = range.getBoundingClientRect();
        const c = card.getBoundingClientRect();
        const mid = card.querySelector('[data-header-slot="r1-center"]')?.getBoundingClientRect();
        const right = card.querySelector('[data-header-slot="r1-right"]')?.getBoundingClientRect();
        return {
            offset: Math.round((t.left + t.width / 2 - (c.left + c.width / 2)) * 10) / 10,
            overlapsMid: !!mid && mid.left < t.right - 0.5 && mid.right > t.left + 0.5,
            midAfter: !!mid && mid.left >= t.right - 0.5,
            rightShown: !!right && right.width > 0,
            truncated: title.scrollWidth > title.clientWidth + 1,
        };
    }, id);
}

const RIGHT = [{ id: 'r', source: 'dp', dp: 'demo.temp', decimals: 1, unit: '°C', slot: 'r1-right' }];
const CENTER = [{ id: 'm', source: 'text', text: 'offen', slot: 'r1-center' }];

// ── Expanded: title in the middle despite icon + right item ──────────────────
const CASES = [
    ['list', { entries: [{ id: 'demo.sw', label: 'Ofen' }], hideFilterButton: true }],
    ['list', { entries: [{ id: 'demo.sw', label: 'Ofen' }] }], // with the filter chip on the right
    ['switch', {}],
    ['value', {}, { datapoint: 'demo.temp' }],
    ['slider', {}, { datapoint: 'demo.lvl' }],
    ['gauge', {}, { datapoint: 'demo.lvl' }],
    ['thermostat', {}, { datapoint: 'demo.temp' }],
    ['shutter', {}, { datapoint: 'demo.lvl' }],
    ['light', {}],
    ['autolist', {}],
    ['clock', {}],
];
for (const [type, opts, extra] of CASES) {
    const id = await show(type, { ...opts, headerItems: RIGHT }, extra);
    const m = await measure(id);
    const label = `${type}${opts.hideFilterButton === false || (type === 'list' && !opts.hideFilterButton) ? ' + filter' : ''}`;
    if (!m) {
        check(`${label}: title rendered`, false, 'no .aura-widget-title');
        continue;
    }
    check(`${label}: centred title stays in the middle`, Math.abs(m.offset) <= 1.5, `offset ${m.offset}px`);
    check(`${label}: right item shown`, m.rightShown);
    if (process.env.SHOTS)
        await page
            .locator(`[data-aura-widget="${id}"]`)
            .screenshot({ path: `${process.env.SHOTS}/${seq}-${type}.png` });
}

// Left alignment is untouched: the title does not move to the middle.
{
    const id = await show('switch', { titleAlign: 'left', headerItems: RIGHT });
    const m = await measure(id);
    check('left title stays left', m && m.offset < -20, `offset ${m?.offset}px`);
}

// ── Centre item joins the title ───────────────────────────────────────────────
for (const type of ['list', 'switch']) {
    const opts = type === 'list' ? { entries: [{ id: 'demo.sw' }], hideFilterButton: true } : {};
    const id = await show(type, { ...opts, headerItems: [...RIGHT, ...CENTER] });
    const m = await measure(id);
    check(`${type}: centre item beside the title, no overlap`, m && !m.overlapsMid && m.midAfter, JSON.stringify(m));
    check(`${type}: right item still shown`, m?.rightShown);
}

// ── titleSide: centre item left of the title, title still in the middle ─────
for (const collapsed of [false, true]) {
    const id = await show('switch', {
        defaultCollapsed: collapsed,
        collapsible: true,
        headerItems: [
            ...RIGHT,
            { id: 'l', source: 'text', text: 'links', slot: 'r1-center', titleSide: 'before' },
            { id: 'a', source: 'text', text: 'rechts', slot: 'r1-center' },
        ],
    });
    const r = await page.evaluate((wid) => {
        const card = document.querySelector(`[data-aura-widget="${wid}"]`);
        const title = card.querySelector('.aura-widget-title').getBoundingClientRect();
        const pos = (key) => card.querySelector(`[data-header-item="${key}"]`)?.getBoundingClientRect();
        const l = pos('l');
        const a = pos('a');
        return { leftOk: !!l && l.right <= title.left + 0.5, rightOk: !!a && a.left >= title.right - 0.5 };
    }, id);
    const tag = collapsed ? 'folded' : 'expanded';
    check(`${tag}: titleSide before → left of the title`, r.leftOk, JSON.stringify(r));
    check(`${tag}: default → right of the title`, r.rightOk, JSON.stringify(r));
}

// ── iconPlace: the symbol left, before/after the title or far right ─────────
async function iconSpot(id) {
    return page.evaluate((wid) => {
        const card = document.querySelector(`[data-aura-widget="${wid}"]`);
        const titleEl = card.querySelector('.aura-widget-title');
        const iconEl = card.querySelector('.aura-widget-icon');
        if (!titleEl || !iconEl) return null;
        const range = document.createRange();
        range.selectNodeContents(titleEl);
        const t = range.getBoundingClientRect();
        const i = iconEl.getBoundingClientRect();
        const c = card.getBoundingClientRect();
        const r = card.querySelector('[data-header-slot="r1-right"]')?.getBoundingClientRect();
        return {
            gapBefore: Math.round(t.left - i.right),
            gapAfter: Math.round(i.left - t.right),
            fromLeft: Math.round(i.left - c.left),
            fromRight: Math.round(c.right - i.right),
            rightOfItems: !r || i.left >= r.right - 0.5,
            offset: Math.round((t.left + t.width / 2 - (c.left + c.width / 2)) * 10) / 10,
            // Symbol + title as one unit (before/after: the unit is what is centred).
            groupOffset:
                Math.round(
                    ((Math.min(i.left, t.left) + Math.max(i.right, t.right)) / 2 - (c.left + c.width / 2)) * 10,
                ) / 10,
        };
    }, id);
}
const PLACE_OK = {
    lead: (m) => m.gapBefore >= 0 && m.fromLeft < 30,
    beforeTitle: (m) => m.gapBefore >= 0 && m.gapBefore <= 12,
    afterTitle: (m) => m.gapAfter >= 0 && m.gapAfter <= 12,
    trail: (m) => m.fromRight < 30 && m.rightOfItems,
};
for (const [type, opts] of [
    ['switch', {}],
    ['list', { entries: [{ id: 'demo.sw', label: 'Ofen' }], hideFilterButton: true }],
]) {
    for (const align of ['left', 'center', 'right']) {
        for (const place of Object.keys(PLACE_OK)) {
            const id = await show(type, { ...opts, titleAlign: align, iconPlace: place, headerItems: RIGHT });
            const m = await iconSpot(id);
            const beside = place === 'beforeTitle' || place === 'afterTitle';
            const centredOk = align !== 'center' || (m && Math.abs(beside ? m.groupOffset : m.offset) <= 1.5);
            check(
                `${type}/${align}/${place}: symbol in place`,
                !!m && PLACE_OK[place](m) && centredOk,
                JSON.stringify(m),
            );
        }
    }
}
for (const align of ['left', 'center']) {
    for (const place of Object.keys(PLACE_OK)) {
        const id = await show('switch', {
            defaultCollapsed: true,
            collapsible: true,
            titleAlign: align,
            iconPlace: place,
            headerItems: RIGHT,
        });
        const m = await iconSpot(id);
        const ok = place === 'lead' ? !!m && m.gapBefore >= 0 && m.fromLeft < 50 : !!m && PLACE_OK[place](m);
        check(`folded/${align}/${place}: symbol in place`, ok, JSON.stringify(m));
    }
}

// ── r1-left: items at the left end of the title row ─────────────────────────
for (const [align, collapsed] of [
    ['left', false],
    ['center', false],
    ['left', true],
    ['center', true],
]) {
    const id = await show('switch', {
        titleAlign: align,
        defaultCollapsed: collapsed,
        collapsible: true,
        headerItems: [{ id: 'L', source: 'text', text: 'Links', slot: 'r1-left' }, ...RIGHT],
    });
    const r = await page.evaluate((wid) => {
        const card = document.querySelector(`[data-aura-widget="${wid}"]`);
        const l = card.querySelector('[data-header-item="L"]')?.getBoundingClientRect();
        const icon = card.querySelector('.aura-widget-icon')?.getBoundingClientRect();
        const title = card.querySelector('.aura-widget-title');
        const range = document.createRange();
        range.selectNodeContents(title);
        const t = range.getBoundingClientRect();
        const c = card.getBoundingClientRect();
        return {
            shown: !!l && l.width > 0,
            beforeIcon: !!l && !!icon && l.right <= icon.left + 0.5,
            beforeTitle: !!l && l.right <= t.left + 0.5,
            offset: Math.round((t.left + t.width / 2 - (c.left + c.width / 2)) * 10) / 10,
            strip: !!card.querySelector('[data-header-strip]'),
        };
    }, id);
    const tag = `${collapsed ? 'folded' : 'expanded'}/${align}`;
    check(
        `${tag}: r1-left item at the left end`,
        r.shown && r.beforeTitle && r.beforeIcon && !r.strip,
        JSON.stringify(r),
    );
    if (align === 'center') check(`${tag}: title stays in the middle`, Math.abs(r.offset) <= 1.5, JSON.stringify(r));
}

// ── titleRow 2: the title in the second row ─────────────────────────────────
async function rowSpot(id) {
    return page.evaluate((wid) => {
        const card = document.querySelector(`[data-aura-widget="${wid}"]`);
        const titleEl = card.querySelector('.aura-widget-title');
        const iconEl = card.querySelector('.aura-widget-icon');
        const r2 = card.querySelectorAll('[data-header-row="2"]');
        if (!titleEl) return null;
        const range = document.createRange();
        range.selectNodeContents(titleEl);
        const t = range.getBoundingClientRect();
        const c = card.getBoundingClientRect();
        const i = iconEl?.getBoundingClientRect();
        const item = card.querySelector('[data-header-item="r2"]')?.getBoundingClientRect();
        return {
            rows2: r2.length,
            inRow2: !!titleEl.closest('[data-header-row="2"]'),
            belowIcon: !!i && t.top >= i.bottom - 2,
            iconBeside: !!i && Math.abs(i.top + i.height / 2 - (t.top + t.height / 2)) < 6,
            fromLeft: Math.round(t.left - c.left),
            fromRight: Math.round(c.right - t.right),
            offset: Math.round((t.left + t.width / 2 - (c.left + c.width / 2)) * 10) / 10,
            itemShown: !!item && item.width > 0,
            strip: !!card.querySelector('[data-header-strip]'),
        };
    }, id);
}
const R2ITEM = [{ id: 'r2', source: 'text', text: 'Zeile2', slot: 'r2-right' }];
for (const [type, opts] of [
    ['switch', {}],
    ['list', { entries: [{ id: 'demo.sw', label: 'Ofen' }], hideFilterButton: true }],
]) {
    for (const align of ['left', 'center', 'right']) {
        const id = await show(type, {
            ...opts,
            titleAlign: align,
            titleRow: 2,
            headerItems: [...RIGHT, ...(align === 'right' ? [] : R2ITEM)],
        });
        const m = await rowSpot(id);
        const posOk =
            align === 'left'
                ? m?.fromLeft < 30
                : align === 'right'
                  ? m?.fromRight < 30
                  : Math.abs(m?.offset ?? 99) <= 1.5;
        check(
            `${type}/${align}: title in row 2, one row 2 only`,
            m?.inRow2 && m.rows2 === 1 && m.belowIcon && !m.strip,
            JSON.stringify(m),
        );
        check(`${type}/${align}: title at its place in row 2`, posOk, JSON.stringify(m));
        if (align !== 'right') check(`${type}/${align}: row-2 item still shown`, m?.itemShown, JSON.stringify(m));
    }
}
{
    // A symbol set beside the title moves with it.
    const id = await show('switch', { titleAlign: 'left', titleRow: 2, iconPlace: 'beforeTitle' });
    const m = await rowSpot(id);
    check('titleRow 2 + beforeTitle: the symbol moves along', m?.inRow2 && m.iconBeside, JSON.stringify(m));
}
{
    // Folded: the header gets one row taller, the title sits in row 2.
    const one = await show('switch', { defaultCollapsed: true, collapsible: true });
    const h1 = (await page.locator(`[data-aura-widget="${one}"]`).boundingBox()).height;
    const two = await show('switch', { defaultCollapsed: true, collapsible: true, titleRow: 2 });
    const h2 = (await page.locator(`[data-aura-widget="${two}"]`).boundingBox()).height;
    const m = await rowSpot(two);
    check('folded titleRow 2: title in row 2', m?.inRow2 && m.belowIcon, JSON.stringify(m));
    check('folded titleRow 2: card one row taller', h2 > h1 + 10, `${h1} → ${h2}`);
    if (process.env.SHOTS)
        await page.locator(`[data-aura-widget="${two}"]`).screenshot({ path: `${process.env.SHOTS}/folded-row2.png` });
}

// ── Narrow card: the title truncates, the row does not overflow ─────────────
{
    const id = await show(
        'switch',
        { headerItems: [...RIGHT, ...CENTER] },
        { title: 'Ein ziemlich langer Titel für eine schmale Karte', gridPos: { x: 0, y: 0, w: 3, h: 4 } },
    );
    const m = await measure(id);
    const over = await page.evaluate((wid) => {
        const row = document.querySelector(`[data-aura-widget="${wid}"] [data-title-align="center"]`);
        return row ? row.scrollWidth - row.clientWidth : -1;
    }, id);
    check('narrow: long title truncates', m?.truncated, JSON.stringify(m));
    check('narrow: row does not overflow', over >= 0 && over <= 1, `overflow ${over}px`);
    if (process.env.SHOTS)
        await page.locator(`[data-aura-widget="${id}"]`).screenshot({ path: `${process.env.SHOTS}/narrow.png` });
}

// ── Folded header ─────────────────────────────────────────────────────────────
{
    const id = await show('switch', { defaultCollapsed: true, collapsible: true, headerItems: RIGHT });
    const folded = await page.locator(`[data-aura-widget="${id}"] [data-collapsed-header]`).count();
    const m = await measure(id);
    check('folded: header shown', folded === 1);
    check('folded: centred title in the middle', m && Math.abs(m.offset) <= 1.5, `offset ${m?.offset}px`);
    const id2 = await show('switch', { defaultCollapsed: true, collapsible: true, headerItems: [...RIGHT, ...CENTER] });
    const m2 = await measure(id2);
    if (process.env.SHOTS)
        await page.locator(`[data-aura-widget="${id2}"]`).screenshot({ path: `${process.env.SHOTS}/folded.png` });
    check('folded: centre item beside the title', m2 && !m2.overlapsMid && m2.midAfter, JSON.stringify(m2));
}

// ── Title and icon off, text on row 1: the list keeps its header row and divider ─
for (const [type, opts] of [
    ['list', { entries: [{ id: 'demo.sw', label: 'Ofen' }], hideFilterButton: true }],
    ['autolist', { hideFilterButton: true }],
]) {
    for (const align of ['left', 'center']) {
        const id = await show(type, {
            ...opts,
            titleAlign: align,
            showTitle: false,
            showIcon: false,
            headerItems: [{ id: 'm', source: 'text', text: 'Sauna', slot: 'r1-center' }, ...RIGHT],
        });
        const r = await page.evaluate((wid) => {
            const card = document.querySelector(`[data-aura-widget="${wid}"]`);
            const mid = card?.querySelector('[data-header-slot="r1-center"]');
            if (!card || !mid) return null;
            // The divider sits on the header box that holds the row.
            let el = mid.parentElement;
            let divider = false;
            while (el && el !== card) {
                if (parseFloat(getComputedStyle(el).borderBottomWidth) > 0) {
                    divider = true;
                    break;
                }
                el = el.parentElement;
            }
            const c = card.getBoundingClientRect();
            const m = mid.getBoundingClientRect();
            return {
                divider,
                strip: !!card.querySelector('[data-header-strip]'),
                offset: Math.round((m.left + m.width / 2 - (c.left + c.width / 2)) * 10) / 10,
            };
        }, id);
        check(`${type}/${align} without title: header row with divider`, r?.divider && !r.strip, JSON.stringify(r));
        check(
            `${type}/${align} without title: centre item in the middle`,
            r && Math.abs(r.offset) <= 1.5,
            JSON.stringify(r),
        );
        if (process.env.SHOTS)
            await page
                .locator(`[data-aura-widget="${id}"]`)
                .screenshot({ path: `${process.env.SHOTS}/notitle-${type}-${align}.png` });
    }
}

// ── Editor: title and symbol are tiles in the header map ────────────────────
{
    const id = `tc-${++seq}`;
    await page.evaluate(
        ([w]) => {
            window.__auraShot.showWidgets([w], { editMode: true });
            window.__auraShot.setEditMode(true);
        },
        [
            {
                id,
                type: 'switch',
                title: 'Sauna',
                datapoint: 'demo.sw',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 8, h: 6 },
                options: { titleAlign: 'center', headerItems: CENTER },
            },
        ],
    );
    await page.waitForTimeout(600);
    await page.locator(`[data-aura-widget="${id}"]`).hover();
    await page.locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    const dlg = page.locator('.aura-widget-edit-modal');
    await dlg.waitFor({ timeout: 10000 });
    await dlg.locator('summary:has(span:text-is("Darstellung"))').first().click();
    await page.waitForTimeout(300);
    const opts = () => page.evaluate((wid) => window.__auraShot.widgetOptions(wid), id);
    const editor = page.locator('[data-header-items-editor]');
    const cell = (slot) => editor.locator(`[data-header-slot-add="${slot}"]`);

    // Darstellung only switches title and icon on/off; the position lives in the dialog.
    check('Darstellung: no alignment buttons any more', (await dlg.locator('button:text-is("Mitte")').count()) === 0);
    // Icon | Titel side by side in one framed group, picker and size in the icon column,
    // the header dialog right below with the hint that title and icon are placed there.
    const group = dlg.locator('[data-head-group]');
    check('Darstellung: icon, title and header in one group', (await group.count()) === 1);
    check(
        'Darstellung: picker and size sit in the icon column',
        (await group.locator('[data-icon-col] [data-icon-pick]').count()) === 1 &&
            (await group.locator('[data-icon-col] [data-icon-size]').count()) === 1,
    );
    check(
        'Darstellung: the header row says where title and icon are placed',
        (await group.locator('[data-header-position-hint]').count()) === 1,
    );
    const pickBox = await group.locator('[data-icon-pick]').boundingBox();
    check('Darstellung: the icon picker is a small button', pickBox && pickBox.width <= 32, JSON.stringify(pickBox));
    if (process.env.SHOTS) await dlg.screenshot({ path: `${process.env.SHOTS}/darstellung.png` });
    const posLink = group.locator('[data-header-items-open]');
    await posLink.click();
    await editor.waitFor({ timeout: 5000 });

    check('editor: map marks the title as centred', (await editor.locator('[data-title-centered]').count()) === 1);
    check(
        'editor: title tile in the middle cell',
        (await cell('r1-center').locator('[data-header-chip="title"]').count()) === 1,
    );
    check(
        'editor: symbol tile on the left',
        (await cell('r1-left').locator('[data-header-chip="icon"]').count()) === 1,
    );

    // Move the title: tap the tile, then a place in row 1.
    await editor.locator('[data-header-chip="title"]').click();
    check(
        'editor: picking the title marks the other places',
        (await editor.locator('[data-title-target]').count()) === 5,
    );
    await cell('r1-left').click();
    await page.waitForTimeout(300);
    let o = await opts();
    check('editor: title moved to the left writes titleAlign', o?.titleAlign === 'left', String(o?.titleAlign));
    check('editor: …and adds no item', (o?.headerItems ?? []).length === 1, JSON.stringify(o?.headerItems));
    check('editor: title tile now left', (await cell('r1-left').locator('[data-header-chip="title"]').count()) === 1);

    // Move the symbol: tap the tile, then one of the marks.
    await editor.locator('[data-header-chip="icon"]').click();
    const marks = await editor.locator('[data-icon-target]').evaluateAll((els) => els.map((e) => e.dataset.iconTarget));
    check(
        'editor: picking the symbol shows the other places',
        marks.sort().join() === 'afterTitle,beforeTitle,trail',
        marks.join(),
    );
    await editor.locator('[data-icon-target="trail"]').click();
    await page.waitForTimeout(300);
    o = await opts();
    check('editor: symbol far right writes iconPlace', o?.iconPlace === 'trail', String(o?.iconPlace));
    check(
        'editor: symbol tile now in the right cell',
        (await cell('r1-right').locator('[data-header-chip="icon"]').count()) === 1,
    );
    await editor.locator('[data-header-chip="icon"]').click();
    await editor.locator('[data-icon-target="afterTitle"]').click();
    await page.waitForTimeout(300);
    o = await opts();
    check('editor: symbol after the title', o?.iconPlace === 'afterTitle', String(o?.iconPlace));
    await editor.locator('[data-header-chip="icon"]').click();
    await editor.locator('[data-icon-target="lead"]').click();
    await page.waitForTimeout(300);
    o = await opts();
    check('editor: back to the left clears iconPlace', o?.iconPlace === undefined, String(o?.iconPlace));

    // The title into row 2 and back.
    await editor.locator('[data-header-chip="title"]').click();
    await cell('r2-center').click();
    await page.waitForTimeout(300);
    o = await opts();
    check(
        'editor: title to row 2 writes titleRow 2',
        o?.titleRow === 2 && o?.titleAlign === 'center',
        JSON.stringify({ r: o?.titleRow, a: o?.titleAlign }),
    );
    check(
        'editor: title tile now in row 2',
        (await cell('r2-center').locator('[data-header-chip="title"]').count()) === 1,
    );
    await editor.locator('[data-header-chip="title"]').click();
    await cell('r1-left').click();
    await page.waitForTimeout(300);
    o = await opts();
    check(
        'editor: back to row 1 clears titleRow',
        o?.titleRow === undefined && o?.titleAlign === 'left',
        JSON.stringify({ r: o?.titleRow, a: o?.titleAlign }),
    );

    // A tap on a place without a picked tile still adds an item there.
    await cell('r1-left').click();
    await page.waitForTimeout(300);
    o = await opts();
    check(
        'editor: the left cell adds an item on r1-left',
        o?.headerItems?.some((h) => h.slot === 'r1-left'),
        JSON.stringify(o?.headerItems),
    );
    await editor.locator('[data-header-item-delete]').last().click();
    await page.waitForTimeout(300);

    // Title back to the middle: the side choice of a centre item.
    await editor.locator('[data-header-chip="title"]').click();
    await cell('r1-center').click();
    await page.waitForTimeout(300);
    const side = editor.locator('[data-header-item-title-side]').first();
    check('editor: centre item offers its side of the title', (await side.count()) === 1);
    await side.selectOption('before');
    await page.waitForTimeout(300);
    o = await opts();
    check(
        'editor: left of the title writes titleSide',
        o?.headerItems?.[0]?.titleSide === 'before',
        JSON.stringify(o?.headerItems),
    );
    await side.selectOption('below');
    await page.waitForTimeout(300);
    o = await opts();
    check(
        'editor: below the title moves the item to row 2 centre',
        o?.headerItems?.[0]?.slot === 'r2-center' && o.headerItems[0].titleSide === undefined,
        JSON.stringify(o?.headerItems),
    );
    await editor.locator('[data-header-item-title-side]').first().selectOption('after');
    await page.waitForTimeout(300);
    o = await opts();
    check('editor: right of the title brings it back to row 1', o?.headerItems?.[0]?.slot === 'r1-center');

    // Darstellung's reset: back to the defaults, the header items stay.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const reset = dlg.locator('[data-display-reset]');
    check('Darstellung: reset shown after a change', (await reset.count()) === 1);
    await reset.click();
    await page.waitForTimeout(300);
    o = await opts();
    check(
        'Darstellung: reset clears the display options',
        o?.titleAlign === undefined && o?.iconPlace === undefined && o?.titleRow === undefined,
        JSON.stringify({ a: o?.titleAlign, p: o?.iconPlace, r: o?.titleRow }),
    );
    check(
        'Darstellung: reset keeps the header items',
        (o?.headerItems ?? []).length === 1,
        JSON.stringify(o?.headerItems),
    );
    check('Darstellung: reset button gone again', (await reset.count()) === 0);
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__auraShot.setEditMode(false));
}

// ── Editor: a fixed layout keeps its symbol, the dialog says so ─────────────
{
    const id = `tc-${++seq}`;
    await page.evaluate(
        ([w]) => {
            window.__auraShot.showWidgets([w], { editMode: true });
            window.__auraShot.setEditMode(true);
        },
        [
            {
                id,
                type: 'switch',
                title: 'Sauna',
                datapoint: 'demo.sw',
                layout: 'compact',
                gridPos: { x: 0, y: 0, w: 8, h: 6 },
                options: {},
            },
        ],
    );
    await page.waitForTimeout(600);
    await page.locator(`[data-aura-widget="${id}"]`).hover();
    await page.locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    const dlg = page.locator('.aura-widget-edit-modal');
    await dlg.waitFor({ timeout: 10000 });
    await dlg.locator('summary:has(span:text-is("Darstellung"))').first().click();
    await page.waitForTimeout(300);
    await dlg.locator('[data-header-items-open]').click();
    const editor = page.locator('[data-header-items-editor]');
    await editor.waitFor({ timeout: 5000 });
    check(
        'compact: the dialog says the symbol is fixed',
        (await editor.locator('[data-icon-fixed-hint]').count()) === 1,
    );
    if (process.env.SHOTS) await editor.screenshot({ path: `${process.env.SHOTS}/editor-compact.png` });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__auraShot.setEditMode(false));
}

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
