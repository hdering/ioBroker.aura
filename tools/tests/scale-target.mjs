// Verifies the "100 % from a datapoint" support of issue #596 across the three widgets
// that got it: Diagramm (Verteilung), Füllstandsanzeige and Gauge.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/scale-target.mjs
//
// The reported case is "147,12 € of a 160 € prepayment": the reference must come out of a
// datapoint, not out of the widget config, and the unused part must be visible. Checked
// here: the distribution group scales its entries against the reference and books the
// difference as a "Rest" segment, an overrun stays at 100 % without a remainder, the fill
// widget maps its value into a DP-supplied max, and the gauge labels the DP max on its arc.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

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

// ── 1. Verteilung: 147,12 € of a 160 € prepayment ────────────────────────────
{
    const used = 'demo.tgt.a.used';
    const budget = 'demo.tgt.a.budget';
    const widget = {
        id: 'w-target-a',
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
                        { id: 'a-used', datapointId: used, label: 'Verbraucht', color: '#22c55e', aggregate: 'last' },
                    ],
                },
            ],
        },
    };
    await show(widget, { [used]: 147.12, [budget]: 160 }, '[data-aura-energy-segment="a-used"]');

    const r = await page.evaluate(() => {
        const segs = [...document.querySelectorAll('[data-aura-energy-segment]')].map((el) => ({
            id: el.getAttribute('data-aura-energy-segment'),
            height: el.getBoundingClientRect().height,
            text: el.textContent.trim(),
        }));
        const totalEl = document.querySelector('[data-aura-energy-total]');
        return { segs, total: totalEl ? totalEl.textContent.trim() : null };
    });
    const filled = r.segs.reduce((a, s) => a + s.height, 0);
    const share = (id) => ((r.segs.find((s) => s.id === id)?.height ?? 0) / (filled || 1)) * 100;

    check('group renders the entry plus a Rest segment', r.segs.length === 2, r.segs.map((s) => s.id).join(' '));
    check(
        'entry takes ~92 % of the bar (147,12 of 160)',
        Math.abs(share('a-used') - 92) < 1.5,
        `${share('a-used').toFixed(1)} %`,
    );
    check(
        'Rest takes the remaining ~8 %',
        Math.abs(share('__rest-bar-a') - 8) < 1.5,
        `${share('__rest-bar-a').toFixed(1)} %`,
    );
    check(
        'total line reads value / reference',
        // The decimal separator follows the instance's global number format.
        !!r.total && /147[.,]12/.test(r.total) && /160[.,]00/.test(r.total) && r.total.includes('€'),
        r.total ?? 'missing',
    );
    check('total line carries the share', !!r.total && /92\s*%/.test(r.total), r.total ?? 'missing');

    // Legend rows carry their label as the row title, which pins the check to the widget.
    const restRow = await page.evaluate(() => document.querySelector('[title="Rest"]')?.textContent.trim() ?? null);
    check('legend lists the remainder with its value', !!restRow && /12[.,]88/.test(restRow), restRow ?? 'missing');
}

// ── 2. Verteilung: over the reference — full bar, no remainder ───────────────
{
    const used = 'demo.tgt.b.used';
    const budget = 'demo.tgt.b.budget';
    const widget = {
        id: 'w-target-b',
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
            bars: [
                {
                    id: 'bar-b',
                    title: 'Abschlag',
                    totalDatapoint: budget,
                    entries: [
                        { id: 'b-used', datapointId: used, label: 'Verbraucht', color: '#ef4444', aggregate: 'last' },
                    ],
                },
            ],
        },
    };
    await show(widget, { [used]: 184, [budget]: 160 }, '[data-aura-energy-segment="b-used"]');
    const r = await page.evaluate(() => ({
        ids: [...document.querySelectorAll('[data-aura-energy-segment]')].map((el) =>
            el.getAttribute('data-aura-energy-segment'),
        ),
        text: [...document.querySelectorAll('[data-aura-energy-segment]')].map((el) => el.textContent.trim()),
        total: document.querySelector('[data-aura-energy-total]')?.textContent.trim() ?? null,
    }));
    check('overrun drops the Rest segment', r.ids.length === 1 && r.ids[0] === 'b-used', r.ids.join(' '));
    check('overrun segment prints 100 %', r.text.join(' ').includes('100'), r.text.join(' '));
    check('overrun still reports the real share', !!r.total && /115\s*%/.test(r.total), r.total ?? 'missing');
}

// ── 3. Füllstandsanzeige: max out of a datapoint ─────────────────────────────
{
    const val = 'demo.tgt.c.val';
    const max = 'demo.tgt.c.max';
    const widget = {
        id: 'w-target-c',
        type: 'fill',
        title: 'Abschlag',
        datapoint: val,
        layout: 'default',
        gridPos: { x: 0, y: 0, w: 4, h: 14 },
        options: { unit: '€', decimals: 2, minValue: 0, maxValue: 100, maxDatapoint: max },
    };
    await show(widget, { [val]: 147.12, [max]: 160 }, '[data-aura-fill]');
    const r = await page.evaluate(() => {
        const svg = document.querySelector('[data-aura-fill]');
        return svg
            ? {
                  pct: Number(svg.getAttribute('data-aura-fill-pct')),
                  max: Number(svg.getAttribute('data-aura-fill-max')),
              }
            : null;
    });
    check('fill widget renders', !!r, r ? 'ok' : 'no [data-aura-fill]');
    check('max comes from the datapoint, not from maxValue', r?.max === 160, String(r?.max));
    check('fill level is ~92 % (147,12 of 160)', Math.abs((r?.pct ?? 0) - 92) < 1.5, `${r?.pct} %`);
}

// ── 4. Gauge: max out of a datapoint ────────────────────────────────────────
{
    const val = 'demo.tgt.d.val';
    const max = 'demo.tgt.d.max';
    const widget = {
        id: 'w-target-d',
        type: 'gauge',
        title: 'Abschlag',
        datapoint: val,
        layout: 'default',
        gridPos: { x: 0, y: 0, w: 5, h: 12 },
        options: { unit: '€', decimals: 0, minValue: 0, maxValue: 100, maxDatapoint: max, showMinMax: true },
    };
    await show(widget, { [val]: 147.12, [max]: 160 }, 'svg');
    const texts = await page.evaluate(() =>
        [...document.querySelectorAll('svg text')].map((t) => t.textContent.trim()).filter(Boolean),
    );
    check('gauge labels the datapoint max on the arc', texts.includes('160'), texts.join(' | '));
    check('gauge no longer labels the static 100', !texts.includes('100'), texts.join(' | '));
}

// ── 5. The editor offers all three as fields ────────────────────────────────
// The runtime already read minDatapoint/maxDatapoint before this issue — the gauge just
// never offered them in the panel, which made them dead config. So the panels are part of
// the fix and are checked here: field present, and what it writes lands in the options.
/** Opens the options panel of the single rendered widget. */
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

for (const [type, widgetId] of [
    ['fill', 'w-scale-fill'],
    ['gauge', 'w-scale-gauge'],
]) {
    await page.evaluate(
        ([t, id]) =>
            window.__auraShot.showWidgets(
                [
                    {
                        id,
                        type: t,
                        title: 'Skala',
                        datapoint: 'demo.tgt.e.val',
                        layout: 'default',
                        gridPos: { x: 0, y: 0, w: 5, h: 12 },
                        options: { minValue: 0, maxValue: 100 },
                    },
                ],
                { editMode: true },
            ),
        [type, widgetId],
    );
    await openPanel();
    const field = page.locator('input[placeholder="Datenpunkt-ID (leer = fester Wert)"]');
    check(
        `${type}: the panel offers both scale datapoints`,
        (await field.count()) === 2,
        `${await field.count()} fields`,
    );
    await field.nth(1).fill('demo.tgt.e.max');
    await page.waitForTimeout(400);
    const o = await page.evaluate((id) => window.__auraShot.widgetOptions(id), widgetId);
    check(`${type}: the field writes maxDatapoint`, o?.maxDatapoint === 'demo.tgt.e.max', String(o?.maxDatapoint));
    check(`${type}: the static max stays untouched`, o?.maxValue === 100, String(o?.maxValue));
    await closePanel();
}

{
    await page.evaluate(() =>
        window.__auraShot.showWidgets(
            [
                {
                    id: 'w-scale-eb',
                    type: 'energiebilanz',
                    title: 'Strom',
                    datapoint: '',
                    layout: 'default',
                    gridPos: { x: 0, y: 0, w: 6, h: 16 },
                    options: {
                        lockRange: true,
                        bars: [
                            { id: 'bar-e', title: 'Abschlag', entries: [{ id: 'e1', datapointId: 'demo.tgt.e.used' }] },
                        ],
                    },
                },
            ],
            { editMode: true },
        ),
    );
    await openPanel();
    const field = page.locator('input[placeholder="Datenpunkt, z.B. 0_userdata.0.strom.abschlag"]');
    check('verteilung: the group offers a reference datapoint', (await field.count()) === 1, `${await field.count()}`);
    await field.first().fill('demo.tgt.e.budget');
    await page.waitForTimeout(400);
    const o = await page.evaluate(() => window.__auraShot.widgetOptions('w-scale-eb'));
    check(
        'verteilung: the field writes bars[].totalDatapoint',
        o?.bars?.[0]?.totalDatapoint === 'demo.tgt.e.budget',
        String(o?.bars?.[0]?.totalDatapoint),
    );
    await closePanel();
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
