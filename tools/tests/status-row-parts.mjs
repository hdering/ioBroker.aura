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
                document.querySelectorAll('.react-grid-item .aura-status-trow, .react-grid-item div.py-1').length >= 3,
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

// ── 4. resolveRowParts: cleanup and default places ───────────────────────────
{
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
    const r = await page.evaluate(async () => {
        const m = await import('/src-vis/utils/statusOverview.ts');
        const keys = (parts) => parts.map((p) => `${p.key}:${p.slot}${p.hidden ? '!' : ''}`).join(' ');
        return {
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
