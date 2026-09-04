// Verifies the adjustable limits of the fill widget (issue #613).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/fill-limits.mjs
//
// A limit is a live line across the bar that comes out of its own datapoint and can be
// dragged back into it. Checked here: the marker sits where the value says (fixed value
// and datapoint), the sections between limits carry their own colour and icon, a reached
// limit repaints the fill but loses to the warning colour, dragging snaps to the step,
// stays inside the scale, does not overtake a neighbour, writes on release only, and
// undoes the display transform before writing — across the tank, the battery and the flat
// bar, vertical and horizontal. Plus: the editor panel writes the option.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

/** '#22c55e' as the browser reports a computed colour. */
const rgb = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

const BLUE = '#3b82f6';
const GREEN = '#22c55e';
const AMBER = '#f59e0b';
const WARN = '#ef4444';
const PURPLE = '#a855f7';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
await page.evaluate(() => window.__auraShot.writes(true));

const SOC = 'demo.limit.soc';
const MAXDP = 'demo.limit.max';
const MINDP = 'demo.limit.min';

/** A fill widget with limits; `opts` is merged over the defaults. */
const widget = (opts, extra = {}) => ({
    id: 'w-lim',
    type: 'fill',
    title: 'Speicher',
    datapoint: SOC,
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 6, h: 18 },
    options: { unit: '%', decimals: 0, minValue: 0, maxValue: 100, ...opts },
    ...extra,
});

async function show(cfg, mocks, waitFor = '[data-aura-fill-limits]') {
    await page.evaluate(
        ([w, vals]) => {
            window.__auraShot.mock(vals);
            // mock() alone is overwritten by the getState round-trip on remount.
            window.__auraShot.mockServerState(vals);
            window.__auraShot.showWidgets([w]);
        },
        [cfg, mocks],
    );
    try {
        await page.waitForSelector(waitFor, { timeout: 15000 });
    } catch {
        /* fall through — the assertions report what did render */
    }
    await page.waitForTimeout(350);
}

/** Resolved value + measured position of every limit, plus the painted fill colours. */
const state = () =>
    page.evaluate(() => {
        const overlay = document.querySelector('[data-aura-fill-limits]');
        const box = overlay?.getBoundingClientRect() ?? null;
        const vertical = !!document.querySelector('[data-aura-fill="vertical"]');
        const limits = {};
        for (const el of document.querySelectorAll('[data-aura-fill-limit]')) {
            const id = el.getAttribute('data-aura-fill-limit');
            const handle = document.querySelector(`[data-aura-fill-limit-handle="${id}"]`);
            let frac = null;
            if (handle && box) {
                const h = handle.getBoundingClientRect();
                frac = vertical
                    ? 1 - (h.top + h.height / 2 - box.top) / box.height
                    : (h.left + h.width / 2 - box.left) / box.width;
            }
            limits[id] = {
                at: Number(el.getAttribute('data-aura-fill-limit-at')),
                frac,
                handle: !!handle,
                label: document.querySelector(`[data-aura-fill-limit-label="${id}"]`)?.textContent?.trim() ?? null,
            };
        }
        return {
            count: Number(overlay?.getAttribute('data-aura-fill-limits') ?? 0),
            vertical,
            limits,
            icons: document.querySelectorAll('[data-aura-fill-band-icon]').length,
            // SVG renderers paint with `fill`, the flat bar with a background colour.
            fills: [...document.querySelectorAll('[data-aura-fill-level]')].map(
                (el) => el.getAttribute('fill') ?? getComputedStyle(el).backgroundColor,
            ),
        };
    });

/** Drags a limit's handle to `frac` of the track and reports the writes it caused. */
async function drag(id, frac, { release = true } = {}) {
    await page.evaluate(() => window.__auraShot.writes(true));
    const geo = await page.evaluate(
        ([lid]) => {
            const overlay = document.querySelector('[data-aura-fill-limits]');
            const handle = document.querySelector(`[data-aura-fill-limit-handle="${lid}"]`);
            if (!overlay || !handle) return null;
            const b = overlay.getBoundingClientRect();
            const h = handle.getBoundingClientRect();
            return {
                box: { left: b.left, top: b.top, width: b.width, height: b.height },
                from: { x: h.left + h.width / 2, y: h.top + h.height / 2 },
                vertical: !!document.querySelector('[data-aura-fill="vertical"]'),
            };
        },
        [id],
    );
    if (!geo) return { during: [], after: [] };
    const to = geo.vertical
        ? { x: geo.box.left + geo.box.width / 2, y: geo.box.top + (1 - frac) * geo.box.height }
        : { x: geo.box.left + frac * geo.box.width, y: geo.box.top + geo.box.height / 2 };

    await page.mouse.move(geo.from.x, geo.from.y);
    await page.mouse.down();
    // Two steps: a single move can be coalesced, and the mid-drag write log is the point.
    await page.mouse.move((geo.from.x + to.x) / 2, (geo.from.y + to.y) / 2, { steps: 4 });
    await page.mouse.move(to.x, to.y, { steps: 4 });
    await page.waitForTimeout(120);
    const during = await page.evaluate(() => window.__auraShot.writes());
    if (release) await page.mouse.up();
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => window.__auraShot.writes());
    return { during, after };
}

const lim = (over) => ({ id: 'a', label: 'Ladelimit', datapoint: MAXDP, editable: true, step: 1, ...over });

// ── 1. Where the marker sits ────────────────────────────────────────────────
{
    // A fixed value needs no datapoint - and must not offer a handle either.
    await show(widget({ limits: [{ id: 'a', value: 75, color: BLUE }] }), { [SOC]: 40 });
    let r = await state();
    check('a fixed limit is drawn', r.count === 1, String(r.count));
    check('and reports its value', r.limits.a?.at === 75, String(r.limits.a?.at));
    check('a fixed limit offers no handle', r.limits.a?.handle === false, String(r.limits.a?.handle));

    // The same limit out of a datapoint, this time draggable, so the handle can be measured.
    await show(widget({ limits: [lim({ color: BLUE })] }), { [SOC]: 40, [MAXDP]: 75 });
    r = await state();
    check('a datapoint limit takes its value from the state', r.limits.a?.at === 75, String(r.limits.a?.at));
    check(
        'and its marker sits at that share of the track',
        Math.abs(r.limits.a.frac - 0.75) < 0.02,
        `${r.limits.a.frac?.toFixed(3)}`,
    );
    check('the value pill shows value and unit', r.limits.a?.label === '75%', String(r.limits.a?.label));

    // A live change moves the marker without a remount.
    await page.evaluate((dp) => window.__auraShot.mock({ [dp]: 30 }), MAXDP);
    await page.waitForTimeout(300);
    r = await state();
    check(
        'a new datapoint value moves the marker',
        r.limits.a?.at === 30 && Math.abs(r.limits.a.frac - 0.3) < 0.02,
        `${r.limits.a?.at} / ${r.limits.a?.frac?.toFixed(3)}`,
    );

    // A non-numeric datapoint has nothing to draw.
    await show(widget({ limits: [lim({})] }), { [SOC]: 40, [MAXDP]: null }, '[data-aura-fill]');
    r = await state();
    check('a limit without a usable value is dropped', r.count === 0, String(r.count));
}

// ── 2. Sections: colour and icons ───────────────────────────────────────────
{
    const three = {
        limits: [
            { id: 'lo', value: 25, bandColor: AMBER, icon: 'lucide:car' },
            { id: 'hi', value: 75, bandColor: GREEN, icon: 'lucide:zap' },
        ],
        baseIcon: 'lucide:house',
        baseBandColor: BLUE,
    };
    await show(widget(three), { [SOC]: 100 });
    let r = await state();
    check('two limits make three sections', r.count === 2, String(r.count));
    check(
        'a full bar paints all three section colours',
        [BLUE, AMBER, GREEN].every((c) => r.fills.includes(c)),
        r.fills.join(' '),
    );
    check('each section shows its icon', r.icons === 3, String(r.icons));

    // Half full: the top section has nothing to paint yet.
    await show(widget(three), { [SOC]: 50 });
    r = await state();
    check(
        'a section above the fill level is not painted',
        r.fills.includes(BLUE) && r.fills.includes(AMBER) && !r.fills.includes(GREEN),
        r.fills.join(' '),
    );

    // A section without its own colour follows the normal fill colour.
    await show(widget({ limits: [{ id: 'lo', value: 25, bandColor: AMBER }] }), { [SOC]: 100 });
    r = await state();
    check(
        'a section without a colour falls back to the fill colour',
        r.fills.includes(AMBER) && r.fills.some((f) => f && f !== AMBER),
        r.fills.join(' '),
    );

    // Sections are the more specific statement, so they win over the zones.
    await show(
        widget({
            colorZones: true,
            zones: [
                { max: 50, color: WARN },
                { max: 100, color: PURPLE },
            ],
            limits: [{ id: 'lo', value: 25, bandColor: AMBER }],
        }),
        { [SOC]: 100 },
    );
    r = await state();
    check(
        'section colours beat the colour zones',
        r.fills.includes(AMBER) && !r.fills.includes(PURPLE),
        r.fills.join(' '),
    );
}

// ── 3. reachedColor ─────────────────────────────────────────────────────────
{
    const reach = (extra = {}) => widget({ limits: [{ id: 'a', value: 80, reachedColor: GREEN }], ...extra });

    await show(reach(), { [SOC]: 60 });
    let r = await state();
    check('below the limit the fill keeps its colour', !r.fills.includes(GREEN), r.fills.join(' '));

    await show(reach(), { [SOC]: 80 });
    r = await state();
    check('exactly at the limit counts as reached', r.fills.includes(GREEN), r.fills.join(' '));

    // A reached limit repaints the whole fill, zones included.
    await show(
        reach({
            colorZones: true,
            zones: [
                { max: 50, color: BLUE },
                { max: 100, color: PURPLE },
            ],
        }),
        { [SOC]: 90 },
    );
    r = await state();
    check(
        'a reached limit beats the colour zones',
        r.fills.includes(GREEN) && !r.fills.includes(PURPLE),
        r.fills.join(' '),
    );

    // ...but an overrun is a warning and has to stay louder.
    await show(reach({ overActive: true, overThreshold: 100, overColor: WARN }), { [SOC]: 120 });
    r = await state();
    check(
        'the warning colour still beats a reached limit',
        r.fills.includes(WARN) && !r.fills.includes(GREEN),
        r.fills.join(' '),
    );
}

// ── 4. Dragging ─────────────────────────────────────────────────────────────
{
    await show(widget({ limits: [lim({})] }), { [SOC]: 40, [MAXDP]: 50 });
    let d = await drag('a', 0.8);
    check('a drag writes nothing before the pointer is released', d.during.length === 0, `${d.during.length} writes`);
    check(
        'and writes the dragged value on release',
        d.after.length === 1 && d.after[0].id === MAXDP && Math.abs(d.after[0].val - 80) <= 2,
        JSON.stringify(d.after),
    );

    // The marker must follow the pointer while it is held, or the drag reads as refused.
    await show(widget({ limits: [lim({})] }), { [SOC]: 40, [MAXDP]: 50 });
    await drag('a', 0.9, { release: false });
    let r = await state();
    check('the marker follows the pointer during the drag', r.limits.a?.at >= 85, String(r.limits.a?.at));
    await page.mouse.up();
    await page.waitForTimeout(200);

    // Off, every move writes.
    await show(widget({ limits: [lim({})], limitCommitOnRelease: false }), { [SOC]: 40, [MAXDP]: 50 });
    d = await drag('a', 0.8);
    check('without commit-on-release the drag writes while moving', d.during.length > 0, `${d.during.length} writes`);

    // Snapping is relative to the scale start, so a step of 10 lands on round values.
    await show(widget({ limits: [lim({ step: 10 })] }), { [SOC]: 40, [MAXDP]: 50 });
    d = await drag('a', 0.77);
    check(
        'the written value is snapped to the step',
        d.after.length === 1 && d.after[0].val % 10 === 0,
        JSON.stringify(d.after),
    );

    // Past the end of the track the scale wins.
    await show(widget({ limits: [lim({})] }), { [SOC]: 40, [MAXDP]: 50 });
    d = await drag('a', 1.6);
    check(
        'a drag past the top clamps to the scale maximum',
        d.after.length === 1 && d.after[0].val === 100,
        JSON.stringify(d.after),
    );

    // A neighbour must not be overtaken.
    await show(widget({ limits: [lim({}), { id: 'b', datapoint: MINDP, editable: true, step: 1 }] }), {
        [SOC]: 40,
        [MAXDP]: 80,
        [MINDP]: 20,
    });
    d = await drag('b', 0.95);
    check(
        'a limit does not overtake the one above it',
        d.after.length === 1 && d.after[0].id === MINDP && d.after[0].val === 80,
        JSON.stringify(d.after),
    );

    // Off, it may pass.
    await show(
        widget({
            limits: [lim({}), { id: 'b', datapoint: MINDP, editable: true, step: 1 }],
            limitClampNeighbours: false,
        }),
        { [SOC]: 40, [MAXDP]: 80, [MINDP]: 20 },
    );
    d = await drag('b', 0.95);
    check(
        'with the clamp off it may pass its neighbour',
        d.after.length === 1 && d.after[0].val > 85,
        JSON.stringify(d.after),
    );

    // The display transform is display-only: what goes back into the datapoint is raw.
    // Scale 0…100 kWh out of a 0…1 datapoint (factor 100).
    await show(widget({ valueFactor: 100, unit: 'kWh', limits: [lim({})] }), { [SOC]: 0.4, [MAXDP]: 0.5 });
    r = await state();
    check('a limit datapoint runs through the display transform', r.limits.a?.at === 50, String(r.limits.a?.at));
    d = await drag('a', 0.8);
    check(
        'and the drag writes the raw value back',
        d.after.length === 1 && Math.abs(d.after[0].val - 0.8) < 0.03,
        JSON.stringify(d.after),
    );

    // The master switch and the per-limit switch both remove the handle.
    await show(widget({ limits: [lim({})], limitsEditable: false }), { [SOC]: 40, [MAXDP]: 50 });
    r = await state();
    check('limitsEditable=false removes the handle', r.limits.a?.handle === false, String(r.limits.a?.handle));
    await show(widget({ limits: [lim({ editable: false })] }), { [SOC]: 40, [MAXDP]: 50 });
    r = await state();
    check('editable=false removes the handle', r.limits.a?.handle === false, String(r.limits.a?.handle));
}

// ── 5. The other renderers ──────────────────────────────────────────────────
for (const [name, extra, wait] of [
    ['the horizontal tank', { orientation: 'horizontal' }, '[data-aura-fill="horizontal"]'],
    ['the battery', { layout: 'battery' }, '[data-aura-fill-limits]'],
    ['the horizontal battery', { layout: 'battery', orientation: 'horizontal' }, '[data-aura-fill-limits]'],
    ['the flat bar', { layout: 'bar' }, '[data-aura-fill-limits]'],
    ['the horizontal flat bar', { layout: 'bar', orientation: 'horizontal' }, '[data-aura-fill-limits]'],
]) {
    const { layout, ...opts } = extra;
    const cfg = widget({ limits: [lim({ bandColor: GREEN })], ...opts }, layout ? { layout } : {});
    // Filled past the limit, so the section above it has something to paint.
    await show(cfg, { [SOC]: 80, [MAXDP]: 60 }, wait);
    const r = await state();
    check(`${name} draws the limit`, r.count === 1 && r.limits.a?.at === 60, `${r.count} / ${r.limits.a?.at}`);
    check(
        `${name} puts the marker at the right share`,
        r.limits.a?.frac !== null && Math.abs(r.limits.a.frac - 0.6) < 0.03,
        `${r.limits.a?.frac?.toFixed(3)}`,
    );
    check(
        `${name} paints the section colour`,
        r.fills.includes(GREEN) || r.fills.includes(rgb(GREEN)),
        r.fills.join(' '),
    );
    const d = await drag('a', 0.3);
    check(
        `${name} writes a dragged limit`,
        d.after.length === 1 && Math.abs(d.after[0].val - 30) <= 3,
        JSON.stringify(d.after),
    );
}

// ── 6. Crowding ─────────────────────────────────────────────────────────────
{
    // Five limits within a few percent: the pills would print on top of each other.
    await show(
        widget({
            limits: [40, 41, 42, 43, 44].map((v, i) => ({ id: `c${i}`, value: v })),
        }),
        { [SOC]: 100 },
    );
    const r = await state();
    const labels = Object.values(r.limits).filter((l) => l.label).length;
    check('all five limits are drawn', r.count === 5, String(r.count));
    check('but crowded value pills are thinned out', labels < 5, `${labels} pills`);
}

// ── 7. The editor panel ─────────────────────────────────────────────────────
{
    await show(
        widget({ limits: [{ id: 'a', value: 50 }] }, { id: 'w-lim' }),
        { [SOC]: 40 },
        '[data-aura-fill-limits]',
    );
    await page.evaluate(() => window.__auraShot.setEditMode(true));
    await page.locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    await page.waitForTimeout(400);

    const btn = page.locator('button', { hasText: 'Grenze bearbeiten' });
    check('the panel offers the limits dialog', (await btn.count()) >= 1, `${await btn.count()}`);
    await btn.first().click();
    await page.waitForTimeout(400);

    const add = page.locator('.aura-config-modal button', { hasText: 'Grenze hinzufügen' });
    check('the dialog offers a new limit', (await add.count()) === 1, `${await add.count()}`);
    await add.first().click();
    await page.waitForTimeout(400);
    let o = await page.evaluate(() => window.__auraShot.widgetOptions('w-lim'));
    check('adding a limit writes the option', (o?.limits ?? []).length === 2, JSON.stringify(o?.limits));
    check(
        'a new limit is draggable and stepped by default',
        o?.limits?.[1]?.editable === true && o?.limits?.[1]?.step === 1,
        JSON.stringify(o?.limits?.[1]),
    );
    check('and it has a stable id', typeof o?.limits?.[1]?.id === 'string' && o.limits[1].id.length > 4, '');

    // An optional colour has to be visible on the swatch AND removable again — the
    // picker alone can express neither, which is what ColorField is there for.
    const hex = page.locator('.aura-config-modal input[placeholder="auto"]').first();
    check('the dialog offers the colour fields', (await hex.count()) === 1, `${await hex.count()}`);
    await hex.fill('#ff0000');
    await hex.blur();
    await page.waitForTimeout(400);
    o = await page.evaluate(() => window.__auraShot.widgetOptions('w-lim'));
    check('a colour typed into the field is stored', o?.limits?.[0]?.color === '#ff0000', String(o?.limits?.[0]?.color));
    const swatch = await hex
        .locator('xpath=preceding-sibling::button[1]/span')
        .evaluate((el) => getComputedStyle(el).backgroundColor);
    check('and the swatch shows it', swatch === 'rgb(255, 0, 0)', swatch);

    await hex.locator('xpath=following-sibling::button[1]').click();
    await page.waitForTimeout(400);
    o = await page.evaluate(() => window.__auraShot.widgetOptions('w-lim'));
    check('and it can be cleared again', o?.limits?.[0]?.color === undefined, String(o?.limits?.[0]?.color));
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
