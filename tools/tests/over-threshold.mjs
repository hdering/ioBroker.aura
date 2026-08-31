// Verifies the warning colour of issue #607 in the two widgets that can be "full":
// Diagramm (Verteilung) with a 100 % reference, and Füllstandsanzeige.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/over-threshold.mjs
//
// Both widgets cap at their reference: past it the distribution bar simply stays full and
// the fill level clamps to max, so a blown budget looks exactly like a met one. The fix is
// a colour swap from a configurable share. Checked here: below the threshold nothing moves,
// at/past it the entries resp. the fill turn into the warning colour, the remainder keeps
// its own colour, the zones lose against it, the feature stays off unless enabled, and both
// editor panels write the three options.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

/** '#ef4444' as the browser reports a computed background. */
const rgb = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

const GREEN = '#22c55e';
const WARN = '#ef4444';
const REST = '#94a3b8';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

/** Renders one widget with its mocked datapoints and waits for a selector to appear. */
async function show(widget, mocks, waitFor) {
    await page.evaluate(
        ([cfg, vals]) => {
            window.__auraShot.mock(vals);
            // mock() alone is overwritten by the getState round-trip on remount.
            window.__auraShot.mockServerState(vals);
            window.__auraShot.showWidgets([cfg]);
        },
        [widget, mocks],
    );
    try {
        await page.waitForSelector(waitFor, { timeout: 15000 });
    } catch {
        /* fall through — the assertions below report what did render */
    }
    await page.waitForTimeout(350);
}

// ── 1. Verteilung: below / at / past the reference ───────────────────────────
{
    const used = 'demo.over.a.used';
    const budget = 'demo.over.a.budget';
    /** One group of one entry against a 160 € reference. */
    const widget = (bar) => ({
        id: 'w-over-a',
        type: 'energiebilanz',
        title: 'Strom',
        datapoint: '',
        layout: 'default',
        gridPos: { x: 0, y: 0, w: 6, h: 16 },
        options: {
            unit: '€',
            decimals: 2,
            lockRange: true,
            range: '24h',
            legendFormat: 'label-value',
            bars: [
                {
                    id: 'bar-a',
                    title: 'Abschlag',
                    legendSide: 'below',
                    totalDatapoint: budget,
                    entries: [
                        { id: 'a-used', datapointId: used, label: 'Verbraucht', color: GREEN, aggregate: 'last' },
                    ],
                    ...bar,
                },
            ],
        },
    });

    /** Segment colours plus the group's warning flag. */
    const state = () =>
        page.evaluate(() => {
            const segs = {};
            for (const el of document.querySelectorAll('[data-aura-energy-segment]')) {
                segs[el.getAttribute('data-aura-energy-segment')] = getComputedStyle(el).backgroundColor;
            }
            return {
                segs,
                over: document.querySelector('[data-aura-energy-over]')?.getAttribute('data-aura-energy-over'),
                total: document.querySelector('[data-aura-energy-total]')?.textContent.trim() ?? null,
            };
        });

    // 147,12 of 160 = 92 % — under the default threshold, so nothing changes.
    await show(widget({ overActive: true }), { [used]: 147.12, [budget]: 160 }, '[data-aura-energy-segment="a-used"]');
    let r = await state();
    check('under the threshold the entry keeps its colour', r.segs['a-used'] === rgb(GREEN), r.segs['a-used']);
    check('and the group is not flagged', r.over === '0', String(r.over));

    // 184 of 160 = 115 % — the bar is full, only the colour can still say so.
    await show(widget({ overActive: true }), { [used]: 184, [budget]: 160 }, '[data-aura-energy-segment="a-used"]');
    r = await state();
    check(
        'past the reference the entry turns into the warning colour',
        r.segs['a-used'] === rgb(WARN),
        r.segs['a-used'],
    );
    check('the group is flagged', r.over === '1', String(r.over));
    check('and the share is still reported honestly', !!r.total && /115\s*%/.test(r.total), r.total ?? 'missing');

    // Exactly 160 of 160 = 100 % — "Erreichen ODER Überschreiten", so this counts too.
    await show(widget({ overActive: true }), { [used]: 160, [budget]: 160 }, '[data-aura-energy-segment="a-used"]');
    r = await state();
    check('reaching the reference exactly already switches', r.segs['a-used'] === rgb(WARN), r.segs['a-used']);

    // Without the switch the overrun looks like it always did.
    await show(widget({}), { [used]: 184, [budget]: 160 }, '[data-aura-energy-segment="a-used"]');
    r = await state();
    check('the feature stays off unless enabled', r.segs['a-used'] === rgb(GREEN), r.segs['a-used']);
    check('and the group reports no warning', r.over === '0', String(r.over));

    // An earlier threshold still leaves a remainder — which is what is LEFT, not what is
    // over, so it keeps its own colour.
    await show(
        widget({ overActive: true, overThreshold: 90 }),
        { [used]: 147.12, [budget]: 160 },
        '[data-aura-energy-segment="a-used"]',
    );
    r = await state();
    check(
        'a threshold below 100 fires while a remainder is still there',
        r.segs['a-used'] === rgb(WARN),
        r.segs['a-used'],
    );
    check('the remainder keeps its own colour', r.segs['__rest-bar-a'] === rgb(REST), r.segs['__rest-bar-a']);

    // A configured warning colour wins over the default red.
    await show(
        widget({ overActive: true, overColor: '#a855f7' }),
        { [used]: 184, [budget]: 160 },
        '[data-aura-energy-segment="a-used"]',
    );
    r = await state();
    check('a configured warning colour is used', r.segs['a-used'] === rgb('#a855f7'), r.segs['a-used']);

    // Without a reference there is no "over" to speak of.
    await show(
        {
            id: 'w-over-a2',
            type: 'energiebilanz',
            title: 'Strom',
            datapoint: '',
            layout: 'default',
            gridPos: { x: 0, y: 0, w: 6, h: 16 },
            options: {
                lockRange: true,
                bars: [
                    {
                        id: 'bar-a2',
                        overActive: true,
                        entries: [{ id: 'a2-used', datapointId: used, label: 'Verbraucht', color: GREEN }],
                    },
                ],
            },
        },
        { [used]: 184 },
        '[data-aura-energy-segment="a2-used"]',
    );
    const noRef = await page.evaluate(() => ({
        color: getComputedStyle(document.querySelector('[data-aura-energy-segment="a2-used"]')).backgroundColor,
        over: document.querySelector('[data-aura-energy-over]')?.getAttribute('data-aura-energy-over'),
    }));
    check(
        'without a reference the colour never switches',
        noRef.color === rgb(GREEN) && noRef.over === '0',
        `${noRef.color} / ${noRef.over}`,
    );
}

// ── 2. Verteilung: the pie slices follow the same swap ───────────────────────
{
    const used = 'demo.over.b.used';
    const budget = 'demo.over.b.budget';
    await show(
        {
            id: 'w-over-b',
            type: 'energiebilanz',
            title: 'Strom',
            datapoint: '',
            layout: 'default',
            gridPos: { x: 0, y: 0, w: 6, h: 16 },
            options: {
                lockRange: true,
                chartStyle: 'pie',
                bars: [
                    {
                        id: 'bar-b',
                        totalDatapoint: budget,
                        overActive: true,
                        entries: [{ id: 'b-used', datapointId: used, label: 'Verbraucht', color: GREEN }],
                    },
                ],
            },
        },
        { [used]: 184, [budget]: 160 },
        'svg path',
    );
    // A lone 100 %-slice is drawn as a circle, not as a degenerate arc.
    const fills = await page.evaluate(() =>
        [...document.querySelectorAll('svg path, svg circle')].map((p) => p.getAttribute('fill')).filter(Boolean),
    );
    check('the pie slice turns warning-coloured too', fills.includes(WARN) && !fills.includes(GREEN), fills.join(' '));
}

// ── 3. Füllstandsanzeige: the fill turns, zones and all ──────────────────────
{
    const val = 'demo.over.c.val';
    const widget = (opts) => ({
        id: 'w-over-c',
        type: 'fill',
        title: 'Tank',
        datapoint: val,
        layout: 'default',
        gridPos: { x: 0, y: 0, w: 4, h: 14 },
        options: { unit: 'L', decimals: 0, minValue: 0, maxValue: 100, ...opts },
    });
    /** Fill flag plus every colour drawn inside the tank. */
    const state = () =>
        page.evaluate(() => {
            const svg = document.querySelector('[data-aura-fill]');
            if (!svg) return null;
            return {
                pct: Number(svg.getAttribute('data-aura-fill-pct')),
                over: svg.getAttribute('data-aura-fill-over'),
                // Only the fill itself - the zone bands behind it carry the same colours.
                fills: [...svg.querySelectorAll('rect[data-aura-fill-level]')]
                    .map((r) => r.getAttribute('fill'))
                    .filter(Boolean),
            };
        });

    await show(widget({ overActive: true, overColor: WARN }), { [val]: 80 }, '[data-aura-fill]');
    let r = await state();
    check('below the threshold the fill widget is not flagged', r?.over === '0', String(r?.over));
    check('and paints no warning colour', !r?.fills.includes(WARN), (r?.fills ?? []).join(' '));

    // 120 of 100 — the level clamps to 100 %, so only the colour can report the overrun.
    await show(widget({ overActive: true, overColor: WARN }), { [val]: 120 }, '[data-aura-fill]');
    r = await state();
    check('the overrun clamps the level to 100 %', r?.pct === 100, `${r?.pct} %`);
    check('but the fill widget is flagged', r?.over === '1', String(r?.over));
    check('and the fill is painted in the warning colour', r?.fills.includes(WARN), (r?.fills ?? []).join(' '));

    // Exactly full counts as reached.
    await show(widget({ overActive: true, overColor: WARN }), { [val]: 100 }, '[data-aura-fill]');
    r = await state();
    check('a full tank already counts as reached', r?.over === '1', String(r?.over));

    // Off by default: the same overrun keeps the accent fill.
    await show(widget({}), { [val]: 120 }, '[data-aura-fill]');
    r = await state();
    check('the fill widget keeps the feature off unless enabled', r?.over === '0', String(r?.over));

    // The zones would otherwise keep painting their own colours over the fill.
    const zones = [
        { max: 33, color: '#3b82f6' },
        { max: 66, color: '#f59e0b' },
        { max: 100, color: GREEN },
    ];
    await show(
        widget({ colorZones: true, zones, overActive: true, overThreshold: 90, overColor: WARN }),
        { [val]: 95 },
        '[data-aura-fill]',
    );
    r = await state();
    check('past the threshold the warning colour beats the zones', r?.fills.includes(WARN), (r?.fills ?? []).join(' '));
    check(
        'and no zone colour is left in the fill',
        !r?.fills.includes('#3b82f6') && !r?.fills.includes('#f59e0b'),
        (r?.fills ?? []).join(' '),
    );

    // Under the threshold the zones still rule.
    await show(
        widget({ colorZones: true, zones, overActive: true, overThreshold: 90, overColor: WARN }),
        { [val]: 50 },
        '[data-aura-fill]',
    );
    r = await state();
    check(
        'under the threshold the zones still paint the fill',
        r?.fills.includes('#f59e0b'),
        (r?.fills ?? []).join(' '),
    );

    // The horizontal tank is a second renderer and has to agree.
    await show(
        widget({ orientation: 'horizontal', overActive: true, overColor: WARN }),
        { [val]: 120 },
        '[data-aura-fill="horizontal"]',
    );
    r = await state();
    check(
        'the horizontal tank switches as well',
        r?.over === '1' && r.fills.includes(WARN),
        `${r?.over} ${(r?.fills ?? []).join(' ')}`,
    );
}

// ── 4. Both editor panels write the options ─────────────────────────────────
async function openPanel() {
    await page.evaluate(() => window.__auraShot.setEditMode(true));
    await page.locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    await page.waitForTimeout(400);
}
async function closePanel() {
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__auraShot.setEditMode(false));
    await page.waitForTimeout(300);
}

{
    await page.evaluate(() =>
        window.__auraShot.showWidgets(
            [
                {
                    id: 'w-over-cfg-eb',
                    type: 'energiebilanz',
                    title: 'Strom',
                    datapoint: '',
                    layout: 'default',
                    gridPos: { x: 0, y: 0, w: 6, h: 16 },
                    options: {
                        lockRange: true,
                        bars: [
                            {
                                id: 'bar-cfg',
                                title: 'Abschlag',
                                totalDatapoint: 'demo.over.d.budget',
                                entries: [{ id: 'd1', datapointId: 'demo.over.d.used' }],
                            },
                        ],
                    },
                },
            ],
            { editMode: true },
        ),
    );
    await openPanel();
    const box = page.locator('label:has-text("Farbe ab Schwelle wechseln")').locator('input[type="checkbox"]').first();
    check('verteilung: the group offers the colour switch', (await box.count()) === 1, `${await box.count()}`);
    await box.check();
    await page.waitForTimeout(400);
    let o = await page.evaluate(() => window.__auraShot.widgetOptions('w-over-cfg-eb'));
    check(
        'verteilung: the box writes bars[].overActive',
        o?.bars?.[0]?.overActive === true,
        String(o?.bars?.[0]?.overActive),
    );

    const thr = page.locator('input[data-aura-energy-over-threshold="bar-cfg"]');
    check('verteilung: the threshold field appears with it', (await thr.count()) === 1, `${await thr.count()}`);
    await thr.fill('90');
    await page.waitForTimeout(400);
    o = await page.evaluate(() => window.__auraShot.widgetOptions('w-over-cfg-eb'));
    check(
        'verteilung: the field writes bars[].overThreshold',
        o?.bars?.[0]?.overThreshold === 90,
        String(o?.bars?.[0]?.overThreshold),
    );
    await closePanel();
}

{
    await page.evaluate(() =>
        window.__auraShot.showWidgets(
            [
                {
                    id: 'w-over-cfg-fill',
                    type: 'fill',
                    title: 'Tank',
                    datapoint: 'demo.over.e.val',
                    layout: 'default',
                    gridPos: { x: 0, y: 0, w: 4, h: 14 },
                    options: { minValue: 0, maxValue: 100 },
                },
            ],
            { editMode: true },
        ),
    );
    await openPanel();
    const label = page.locator('label:text-is("Farbe ab Schwelle wechseln")');
    check('fill: the panel offers the colour switch', (await label.count()) === 1, `${await label.count()}`);
    await label.locator('xpath=following-sibling::button').first().click();
    await page.waitForTimeout(400);
    let o = await page.evaluate(() => window.__auraShot.widgetOptions('w-over-cfg-fill'));
    check('fill: the toggle writes overActive', o?.overActive === true, String(o?.overActive));

    const thr = page.locator('label:text-is("Ab % der Skala")').locator('xpath=following-sibling::input').first();
    check('fill: the threshold field appears with it', (await thr.count()) === 1, `${await thr.count()}`);
    await thr.fill('85');
    await page.waitForTimeout(400);
    o = await page.evaluate(() => window.__auraShot.widgetOptions('w-over-cfg-fill'));
    check('fill: the field writes overThreshold', o?.overThreshold === 85, String(o?.overThreshold));
    check('fill: the zones stay untouched', o?.colorZones === undefined, String(o?.colorZones));
    await closePanel();
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
