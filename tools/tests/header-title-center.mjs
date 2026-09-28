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

// ── Editor: the slot map shows the centred title in the middle ─────────────
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
    await dlg.locator('[data-header-items-open]').click();
    const editor = page.locator('[data-header-items-editor]');
    await editor.waitFor({ timeout: 5000 });
    const mid = editor.locator('[data-header-slot-add="r1-center"]');
    check('editor: map marks the title as centred', (await editor.locator('[data-title-centered]').count()) === 1);
    check(
        'editor: title and centre items share the middle cell',
        (await mid.locator('[data-header-map-title]').count()) === 1 && (await mid.innerText()).includes('Sauna'),
        await mid.innerText(),
    );
    check('editor: no title cell on the left', (await editor.locator('[data-header-map-cell="title"]').count()) === 0);
    const side = editor.locator('[data-header-item-title-side]').first();
    check('editor: centre item offers its side of the title', (await side.count()) === 1);
    await side.selectOption('before');
    await page.waitForTimeout(300);
    let o = await page.evaluate((wid) => window.__auraShot.widgetOptions(wid), id);
    check(
        'editor: left of the title writes titleSide',
        o?.headerItems?.[0]?.titleSide === 'before',
        JSON.stringify(o?.headerItems),
    );
    check(
        'editor: map shows the item before the title',
        (await editor.locator('[data-header-slot-add="r1-center"]').innerText())
            .trim()
            .split(/\n/)
            .pop()
            .startsWith('offen'),
    );
    await side.selectOption('below');
    await page.waitForTimeout(300);
    o = await page.evaluate((wid) => window.__auraShot.widgetOptions(wid), id);
    check(
        'editor: below the title moves the item to row 2 centre',
        o?.headerItems?.[0]?.slot === 'r2-center' && o.headerItems[0].titleSide === undefined,
        JSON.stringify(o?.headerItems),
    );
    await editor.locator('[data-header-item-title-side]').first().selectOption('after');
    await page.waitForTimeout(300);
    o = await page.evaluate((wid) => window.__auraShot.widgetOptions(wid), id);
    check('editor: right of the title brings it back to row 1', o?.headerItems?.[0]?.slot === 'r1-center');
    if (process.env.SHOTS) await editor.screenshot({ path: `${process.env.SHOTS}/editor.png` });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__auraShot.setEditMode(false));
}

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
