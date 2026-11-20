// Statusübersicht: row parts (option rowParts) and layout "table" (#1003).
//
//   AURA_BASE=http://localhost:5174 node tools/tests/status-row-parts.mjs
//
//   - without rowParts the compact row reads as before: name · room … value
//   - rowParts moves the room to the right edge and hides the icon
//   - layout "table": values right-aligned in one column, rooms start in one column
//   - narrow table drops the room column (container query), the values stay
// Every write is captured (captureWrites) — nothing reaches a real instance.
/* global window, document, getComputedStyle */
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` - ${detail}` : ''}`);
};

const DEVICES = [
    ['zigbee.0.a1', 'Kühlschranktür Küche', 'Küche', 12],
    ['zigbee.0.b2', 'Bad', 'Badezimmer', 5],
    ['zigbee.0.c3', 'Gefrierschrank Büro mit langem Namen', 'Büro', 100],
];
const state = (id, name) => ({
    id,
    value: {
        _id: id,
        type: 'state',
        common: { name, role: 'value.battery', type: 'number', unit: '%', read: true, write: false },
        native: {},
    },
});
const OBJECTS = {
    state: DEVICES.map(([dev, name]) => state(`${dev}.battery`, name)),
    device: DEVICES.map(([dev, name]) => ({
        id: dev,
        value: { _id: dev, type: 'device', common: { name }, native: {} },
    })),
    enum: DEVICES.map(([dev, , room]) => ({
        id: `enum.rooms.${room}`,
        value: { _id: `enum.rooms.${room}`, type: 'enum', common: { name: room, members: [dev] } },
    })),
};
const VALUES = Object.fromEntries(DEVICES.map(([dev, , , v]) => [`${dev}.battery`, v]));

const browser = await chromium.launch();
const pageErrors = [];

async function open(options, layout, width = 900, cols = 8) {
    const ctx = await browser.newContext({ viewport: { width, height: 700 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 90000 });
    await page.evaluate(
        ([objects, values]) => {
            const s = window.__auraShot;
            s.captureWrites(true);
            s.mockObjectView(objects);
            s.mockServerState(values);
            s.mock(values);
        },
        [OBJECTS, VALUES],
    );
    await page.evaluate(
        ([opts, lay, w]) =>
            window.__auraShot.showWidgets([
                {
                    id: 'w-parts',
                    type: 'statusoverview',
                    title: 'Batterien',
                    datapoint: '',
                    layout: lay,
                    gridPos: { x: 0, y: 0, w, h: 10 },
                    options: {
                        catWindow: false,
                        catLight: false,
                        catUnreach: false,
                        catAlarm: false,
                        batteryTypeEnabled: false,
                        valueFilter: 'all',
                        sortBy: 'room',
                        ...opts,
                    },
                },
            ]),
        [options, layout, cols],
    );
    // Discovery asks the adapter first and falls back to the browser — wait for the rows.
    await page
        .waitForFunction(
            () =>
                document.querySelectorAll(
                    '.react-grid-item .aura-status-trow, .react-grid-item div.py-1, .react-grid-item .aura-status-row-2l',
                ).length >= 3,
            null,
            { timeout: 30000 },
        )
        .catch(() => {});
    await page.waitForTimeout(300);
    return { ctx, page };
}

const listRows = (page) =>
    page.evaluate(() =>
        [...document.querySelectorAll('.react-grid-item div.flex.items-center.gap-2.py-1')].map((r) => ({
            text: r.textContent,
            icons: r.querySelectorAll('svg').length,
            children: [...r.children].map((c) => c.textContent),
        })),
    );

// ── 1. compact without rowParts: the row as before ───────────────────────────
{
    const { ctx, page } = await open({}, 'compact');
    await page.screenshot({ path: 'tools/tests/out/status-compact.png' });
    const r = await listRows(page);
    const kuehl = r.find((x) => x.text.includes('Kühlschranktür'));
    check('baseline: three rows', r.length === 3, JSON.stringify(r));
    check(
        'baseline: room behind the name, value at the end',
        !!kuehl && kuehl.children[1]?.includes('· Küche') && kuehl.children[2] === '12 %' && kuehl.icons === 1,
        JSON.stringify(kuehl),
    );
    await ctx.close();
}

// ── 2. rowParts: room to the right before the value, icon hidden ──────────────
{
    const { ctx, page } = await open(
        {
            rowParts: [
                { key: 'icon', slot: 'start', hidden: true },
                { key: 'name', slot: 'start' },
                { key: 'room', slot: 'end' },
                { key: 'value', slot: 'end' },
            ],
        },
        'compact',
    );
    const r = await listRows(page);
    const kuehl = r.find((x) => x.text.includes('Kühlschranktür'));
    check(
        'rowParts: room moved to the end group, before the value',
        !!kuehl && kuehl.children[0] === 'Kühlschranktür Küche' && /^Küche\s*12 %$/.test(kuehl.children[1] ?? ''),
        JSON.stringify(kuehl),
    );
    check('rowParts: icon hidden', kuehl?.icons === 0, JSON.stringify(kuehl));
    await ctx.close();
}

// ── 2b. "links" behind the name sits next to the name, not at the right edge ──
const geom = (page, needle) =>
    page.evaluate((n) => {
        const row = [...document.querySelectorAll('.react-grid-item div.flex.items-center.gap-2.py-1')].find((r) =>
            r.textContent.includes(n),
        );
        if (!row) {
            return null;
        }
        const rr = row.getBoundingClientRect();
        const spans = [...row.querySelectorAll('span')];
        const find = (t) => spans.find((s) => s.textContent === t && !s.querySelector('span'));
        const box = (el) => {
            if (!el) {
                return null;
            }
            const r = el.getBoundingClientRect();
            return { l: Math.round(r.left - rr.left), r: Math.round(rr.right - r.right) };
        };
        const nameEl = spans.filter((s) => s.textContent.startsWith(n)).pop();
        const range = document.createRange();
        if (nameEl) {
            range.selectNodeContents(nameEl);
        }
        const nr = nameEl ? range.getBoundingClientRect() : null;
        return {
            rowW: Math.round(rr.width),
            name: nr ? { l: Math.round(nr.left - rr.left), r: Math.round(rr.right - nr.right) } : null,
            value: box(find('12 %')),
            room: box(find('Küche')),
        };
    }, needle);
for (const layout of ['default', 'compact']) {
    {
        // value "links", behind the name (the reported case)
        const { ctx, page } = await open(
            {
                rowParts: [
                    { key: 'icon', slot: 'start' },
                    { key: 'name', slot: 'start' },
                    { key: 'value', slot: 'start' },
                ],
            },
            layout,
            900,
            24,
        );
        const g = await geom(page, 'Kühlschranktür');
        // right after the name text, far from the right edge
        check(
            `${layout}: value "links" behind the name sits next to the name`,
            !!g?.value && !!g.name && g.rowW - g.name.r - g.value.l <= 12 && g.value.r > 100,
            JSON.stringify(g),
        );
        await ctx.close();
    }
    {
        // value "links", in front of the name
        const { ctx, page } = await open(
            {
                rowParts: [
                    { key: 'value', slot: 'start' },
                    { key: 'icon', slot: 'start' },
                    { key: 'name', slot: 'start' },
                ],
            },
            layout,
            900,
            24,
        );
        const g = await geom(page, 'Kühlschranktür');
        check(
            `${layout}: value "links" before the name sits at the left edge`,
            !!g?.value && !!g.name && g.value.l <= 8 && g.name.l > g.value.l,
            JSON.stringify(g),
        );
        await ctx.close();
    }
    {
        // room "links" behind the name: plain text next to the name, value stays right
        const { ctx, page } = await open(
            {
                rowParts: [
                    { key: 'icon', slot: 'start' },
                    { key: 'name', slot: 'start' },
                    { key: 'room', slot: 'start' },
                ],
            },
            layout,
            900,
            24,
        );
        const g = await geom(page, 'Kühlschranktür');
        check(
            `${layout}: room "links" next to the name, value at the right edge`,
            !!g?.room && !!g.name && g.rowW - g.name.r - g.room.l <= 12 && g.room.r > 100 && g.value?.r <= 8,
            JSON.stringify(g),
        );
        await ctx.close();
    }
}

// ── 3. table: aligned columns ─────────────────────────────────────────────────
const cells = (page) =>
    page.evaluate(() => {
        const rect = (el) => {
            if (!el || getComputedStyle(el).display === 'none') {
                return null;
            }
            const r = el.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(el);
            const t = range.getBoundingClientRect();
            return { left: Math.round(r.left), right: Math.round(r.right), textRight: Math.round(t.right) };
        };
        return [...document.querySelectorAll('.aura-status-trow')].map((row) => ({
            text: row.textContent,
            room: rect(row.querySelector('.aura-status-cell-room')),
            value: rect(row.querySelector('.aura-status-cell-value')),
        }));
    });
{
    const { ctx, page } = await open({}, 'table', 900, 24);
    const c = await cells(page);
    await page.screenshot({ path: 'tools/tests/out/status-table-wide.png' }).catch(() => {});
    check('table: three rows', c.length === 3, JSON.stringify(c));
    const vr = new Set(c.map((x) => x.value?.textRight));
    const rl = new Set(c.map((x) => x.room?.left));
    check('table: values end on one right edge', vr.size === 1 && !vr.has(undefined), JSON.stringify(c));
    check('table: rooms start on one left edge', rl.size === 1 && !rl.has(undefined), JSON.stringify(c));
    await ctx.close();
}
{
    // 8 grid columns ≈ narrow: the room column goes, the value stays.
    const { ctx, page } = await open({}, 'table', 900, 8);
    const c = await cells(page);
    check(
        'table narrow: room column dropped, values kept',
        c.length === 3 && c.every((x) => x.room === null && x.value),
        JSON.stringify(c),
    );
    await ctx.close();
}

// ── 3b. table header: column names, right-aligned "Wert", narrow drops "Raum" ──
const head = (page) =>
    page.evaluate(() => {
        const h = document.querySelector('.aura-status-thead');
        if (!h) {
            return null;
        }
        const vis = [...h.children].filter((c) => getComputedStyle(c).display !== 'none');
        const val = h.querySelector('.aura-status-cell-value');
        const rowVal = document.querySelector('.aura-status-trow .aura-status-cell-value');
        return {
            labels: vis.map((c) => c.textContent),
            valueRight: val ? Math.round(val.getBoundingClientRect().right) : null,
            rowValueRight: rowVal ? Math.round(rowVal.getBoundingClientRect().right) : null,
        };
    });
{
    const { ctx, page } = await open({}, 'table', 900, 24);
    const h = await head(page);
    check(
        'table header: column names in row order',
        !!h && h.labels.join('|') === '|Gerät|Raum|Wert',
        JSON.stringify(h),
    );
    check(
        'table header: "Wert" ends with the value column',
        !!h && h.valueRight === h.rowValueRight,
        JSON.stringify(h),
    );
    await ctx.close();
}
{
    const { ctx, page } = await open({}, 'table', 900, 8);
    const h = await head(page);
    check(
        'table header narrow: "Raum" dropped with its column',
        !!h && h.labels.join('|') === '|Gerät|Wert',
        JSON.stringify(h),
    );
    await ctx.close();
}
{
    const { ctx, page } = await open({ tableHeader: false }, 'table', 900, 24);
    check('table header: tableHeader false hides it', (await head(page)) === null);
    await ctx.close();
}

// ── 3c. twoline: built-in row unchanged, rowParts move parts between lines ────
const twoRows = (page) =>
    page.evaluate(() =>
        [...document.querySelectorAll('.aura-status-row-2l')].map((r) => ({
            text: r.textContent,
            dot: !!r.querySelector('.aura-status-dot'),
            dotFirst: r.firstElementChild?.classList.contains('aura-status-dot') ?? false,
            line1: r.querySelector('.aura-status-2l-line1')?.textContent ?? null,
            sub: r.querySelector('.aura-status-2l-sub')?.textContent ?? null,
            end: r.querySelector('.aura-status-2l-end')?.textContent ?? null,
        })),
    );
const waitTwo = (page) =>
    page
        .waitForFunction(() => document.querySelectorAll('.aura-status-row-2l').length >= 3, null, { timeout: 30000 })
        .catch(() => {});
{
    const { ctx, page } = await open({}, 'twoline');
    await waitTwo(page);
    const r = await twoRows(page);
    const k = r.find((x) => x.text.includes('Kühlschranktür'));
    check(
        'twoline default: dot first, reading and room on line 2',
        !!k && k.dotFirst && k.sub === 'Batterie bei 12 % · Küche' && k.line1 === null && k.end === null,
        JSON.stringify(k),
    );
    await ctx.close();
}
{
    const { ctx, page } = await open(
        {
            rowParts: [
                { key: 'icon', slot: 'start', hidden: true },
                { key: 'name', slot: 'start' },
                { key: 'room', slot: 'start' },
                { key: 'value', slot: 'end' },
            ],
        },
        'twoline',
    );
    await waitTwo(page);
    const r = await twoRows(page);
    const k = r.find((x) => x.text.includes('Kühlschranktür'));
    check(
        'twoline rowParts: room on line 1, value on the right, no dot, no line 2',
        !!k && !k.dot && k.line1 === 'Küche' && k.end === 'Batterie bei 12 %' && k.sub === null,
        JSON.stringify(k),
    );
    await ctx.close();
}

// ── 4. resolveRowParts: cleanup and default places ───────────────────────────
{
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
    const r = await page.evaluate(async () => {
        const m = await import('/src-vis/utils/statusOverview.ts');
        const keys = (parts) => parts.map((p) => `${p.key}:${p.slot}${p.hidden ? '!' : ''}`).join(' ');
        return {
            twoline: keys(m.resolveRowParts(undefined, m.defaultRowParts('twoline'))),
            twolineIsDefault: m.isDefaultRowParts(
                m.resolveRowParts(undefined, m.defaultRowParts('twoline')),
                m.defaultRowParts('twoline'),
            ),
            unset: keys(m.resolveRowParts(undefined)),
            unsetIsDefault: m.isDefaultRowParts(m.resolveRowParts(undefined)),
            // type before value; the rest falls into place
            swapped: keys(
                m.resolveRowParts([
                    { key: 'batteryType', slot: 'end' },
                    { key: 'value', slot: 'end' },
                ]),
            ),
            // junk, duplicates, a hidden/muted name
            junk: keys(
                m.resolveRowParts([
                    { key: 'nope' },
                    { key: 'name', slot: 'meta', hidden: true },
                    { key: 'name', slot: 'end' },
                    { key: 'icon', slot: 'bogus', hidden: true },
                ]),
            ),
        };
    });
    check(
        'resolveRowParts: unset = built-in row',
        r.unset === 'icon:start name:start room:meta since:meta facts:meta value:end batteryType:end' &&
            r.unsetIsDefault,
        JSON.stringify(r),
    );
    check(
        'resolveRowParts: twoline default = everything but the name on line 2',
        r.twoline === 'icon:start name:start value:meta batteryType:meta room:meta since:meta facts:meta' &&
            r.twolineIsDefault,
        JSON.stringify(r),
    );
    check(
        'resolveRowParts: missing parts keep their place, stored order wins',
        r.swapped === 'icon:start name:start room:meta since:meta facts:meta batteryType:end value:end',
        r.swapped,
    );
    check(
        'resolveRowParts: unknown/duplicate dropped, name never hidden or muted',
        r.junk === 'name:start icon:start! room:meta since:meta facts:meta value:end batteryType:end',
        r.junk,
    );
    await ctx.close();
}

await browser.close();
if (pageErrors.length) {
    check('no page errors', false, pageErrors.join(' | '));
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
