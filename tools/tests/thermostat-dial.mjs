// Verifies the "Rundskala" layout of the thermostat widget - issue #599.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/thermostat-dial.mjs
//
// Uses the screenshot harness (__auraShot) so datapoint values live in the
// in-memory cache only - no socket write, no real datapoint is touched.
// Checked: the arc length follows the setpoint inside min/max, the +/- buttons
// inside the arc gap write the stepped setpoint, dragging the arc writes once on
// release, the visibility toggles drop their line from the centre stack, and the
// scale colour comes from the dial threshold scale (setpoint), the fixed colour
// or the heat/cool accent - in that order.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const RED = 'rgb(239, 68, 68)'; // #ef4444
const AMBER = 'rgb(245, 158, 11)'; // #f59e0b
const BLUE = 'rgb(59, 130, 246)'; // #3b82f6

const SET = 'demo.thermo.set';
const ACT = 'demo.thermo.act';
const WID = 'w-thermo-dial';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

/** Renders the dial with the given options and datapoint values. */
async function show(options = {}, values = { [SET]: 22, [ACT]: 21 }, layout = 'dial') {
    const widget = {
        id: WID,
        type: 'thermostat',
        title: 'Zieltemperatur',
        datapoint: SET,
        layout,
        gridPos: { x: 0, y: 0, w: 5, h: 14 },
        options: { actualDatapoint: ACT, showPresets: false, ...options },
    };
    await page.evaluate(
        ([w, vals]) => {
            window.__auraShot.mock(vals);
            // mock() alone is overwritten by the getState round-trip on remount.
            window.__auraShot.mockServerState(vals);
            window.__auraShot.showWidgets([w]);
        },
        [widget, values],
    );
    if (layout === 'dial') await page.waitForSelector(`[data-aura-thermo-dial="${WID}"]`, { timeout: 15000 });
    await page.waitForTimeout(300);
}

/** Rendered length of the coloured arc, in SVG user units. */
const arcLen = () =>
    page.evaluate(() => {
        const p = document.querySelector('[data-aura-thermo-arc]');
        return p ? p.getTotalLength() : null;
    });

const trackLen = () => page.evaluate(() => document.querySelector('[data-aura-thermo-track]').getTotalLength());

const lineText = (key) =>
    page.evaluate((k) => document.querySelector(`[data-aura-thermo-line="${k}"]`)?.textContent ?? null, key);

const arcColor = () =>
    page.evaluate(() => {
        const p = document.querySelector('[data-aura-thermo-arc]');
        return p ? getComputedStyle(p).stroke : null;
    });

// Screenshot mode blocks every instance write, so what a control *would* have
// written is read from the armed write log instead of the datapoint.
const armWrites = () => page.evaluate(() => window.__auraShot.writes(true));
const lastWrite = () => page.evaluate(() => window.__auraShot.lastWrite);
const writeCount = () => page.evaluate(() => window.__auraShot.writes().length);

// ── 1. Arc geometry follows the setpoint ────────────────────────────────────
{
    await show({ minTemp: 10, maxTemp: 30 });
    const full = await trackLen();
    const mid = await arcLen();
    check(
        '22 °C in a 10…30 scale fills 60 % of the track',
        mid !== null && Math.abs(mid / full - 0.6) < 0.02,
        `${(mid / full).toFixed(3)}`,
    );

    await show({ minTemp: 10, maxTemp: 30 }, { [SET]: 10, [ACT]: 21 });
    const atMin = await arcLen();
    check('the setpoint at the minimum draws no arc', atMin === null || atMin < 1, String(atMin));

    await show({ minTemp: 10, maxTemp: 30 }, { [SET]: 30, [ACT]: 21 });
    const atMax = await arcLen();
    check(
        'the setpoint at the maximum fills the track',
        Math.abs(atMax - full) < 1,
        `${atMax?.toFixed(1)} / ${full.toFixed(1)}`,
    );

    await show({ minTemp: 10, maxTemp: 30 }, { [SET]: 42, [ACT]: 21 });
    const above = await arcLen();
    check('a setpoint above the maximum does not overshoot', Math.abs(above - full) < 1, String(above?.toFixed(1)));
}

// ── 2. Centre stack honours the visibility toggles ──────────────────────────
{
    await show({ decimals: 1 });
    check('the centre shows the setpoint', /^22[.,]0 °C$/.test(await lineText('value')), await lineText('value'));
    check('…the title below it', (await lineText('title')) === 'Zieltemperatur', await lineText('title'));
    check('…and the reading', /21[.,]0 °C$/.test(await lineText('actual')), await lineText('actual'));

    await show({ showTitle: false, showActualTemp: false });
    check('showTitle=false drops the title line', (await lineText('title')) === null);
    check('showActualTemp=false drops the reading', (await lineText('actual')) === null);
    check('the setpoint stays', (await lineText('value')) !== null);

    await show({ showSetpoint: false });
    check('showSetpoint=false drops the value line', (await lineText('value')) === null);
}

// ── 3. The +/- buttons in the arc gap write the stepped setpoint ────────────
{
    await show({ minTemp: 10, maxTemp: 30, step: 0.5 });
    check('both buttons render inside the dial', (await page.locator('[data-aura-thermo-btn]').count()) === 2);

    await armWrites();
    await page.locator('[data-aura-thermo-btn="plus"]').click();
    await page.waitForTimeout(300);
    check('"+" raises the setpoint by one step', (await lastWrite())?.val === 22.5, JSON.stringify(await lastWrite()));

    await page.locator('[data-aura-thermo-btn="minus"]').click();
    await page.waitForTimeout(300);
    // The first click already moved the cached setpoint to 22.5 optimistically.
    check('"−" lowers it by one step', (await lastWrite())?.val === 22, JSON.stringify(await lastWrite()));

    await show({ minTemp: 10, maxTemp: 30, step: 0.5 }, { [SET]: 30, [ACT]: 21 });
    await armWrites();
    await page.locator('[data-aura-thermo-btn="plus"]').click();
    await page.waitForTimeout(300);
    check('"+" is clamped at maxTemp', (await lastWrite())?.val === 30, JSON.stringify(await lastWrite()));

    await show({ showControls: false });
    check('showControls=false hides both buttons', (await page.locator('[data-aura-thermo-btn]').count()) === 0);
}

// ── 4. Dragging the arc writes once, on release ─────────────────────────────
{
    await show({ minTemp: 10, maxTemp: 30, step: 0.5, showControls: false }, { [SET]: 12, [ACT]: 21 });
    const box = await page.locator(`[data-aura-thermo-dial="${WID}"]`).boundingBox();
    // The 200×200 viewBox is letterboxed inside the box; the top of the arc
    // (angle 270°, i.e. the scale midpoint) sits on the vertical centre line.
    const side = Math.min(box.width, box.height);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const topY = cy - (78 / 100) * (side / 2);
    const full = await trackLen();

    await armWrites();
    await page.mouse.move(cx, topY + 4);
    await page.mouse.down();
    await page.mouse.move(cx, topY, { steps: 8 });
    await page.waitForTimeout(150);
    check('a drag does not write per pointermove', (await writeCount()) === 0, String(await writeCount()));
    const dragArc = await arcLen();
    check(
        '…but the arc already follows the pointer',
        dragArc > full * 0.45,
        `${dragArc?.toFixed(1)} / ${full.toFixed(1)}`,
    );
    await page.mouse.up();
    await page.waitForTimeout(400);
    check(
        'the release writes the scale midpoint (20 °C)',
        (await lastWrite())?.val === 20,
        JSON.stringify(await lastWrite()),
    );
    check('…exactly once', (await writeCount()) === 1, String(await writeCount()));
}

// ── 5. Scale colour: thresholds > fixed colour > heat/cool accent ───────────
{
    // Setpoint above the reading → heating accent (red), no colour configured.
    await show({}, { [SET]: 24, [ACT]: 20 });
    const heat = await page.evaluate(() => {
        const el = document.createElement('span');
        el.style.color = 'var(--climate-heat, var(--accent-red))';
        document.body.appendChild(el);
        const c = getComputedStyle(el).color;
        el.remove();
        return c;
    });
    check(
        'without a colour the arc takes the heating accent',
        (await arcColor()) === heat,
        `${await arcColor()} vs ${heat}`,
    );

    await show({ dialColor: '#3b82f6' }, { [SET]: 24, [ACT]: 20 });
    check('dialColor overrides the accent', (await arcColor()) === BLUE, await arcColor());

    const scale = [
        [20, '#3b82f6'],
        [23, '#f59e0b'],
        [30, '#ef4444'],
    ];
    await show({ dialColor: '#3b82f6', dialColorThresholds: scale }, { [SET]: 24, [ACT]: 20 });
    check('the threshold scale beats dialColor', (await arcColor()) === RED, await arcColor());

    await show({ dialColorThresholds: scale }, { [SET]: 22, [ACT]: 20 });
    check('…and is matched against the SETPOINT, not the reading', (await arcColor()) === AMBER, await arcColor());

    await show({ dialColorThresholds: scale }, { [SET]: 18, [ACT]: 20 });
    check('a setpoint below the first band takes its colour', (await arcColor()) === BLUE, await arcColor());

    // The reading keeps the widget-wide colorThresholds — the two scales are
    // independent.
    await show({ colorThresholds: [[100, '#ef4444']], dialColorThresholds: scale }, { [SET]: 18, [ACT]: 20 });
    check('the arc ignores the reading scale', (await arcColor()) === BLUE, await arcColor());
    const actualColor = await page.evaluate(
        () => getComputedStyle(document.querySelector('[data-aura-thermo-line="actual"]')).fill,
    );
    check('…and the reading keeps its own', actualColor === RED, actualColor);
}

// ── 6. The panel offers the scale colour and its threshold scale ────────────
{
    await page.evaluate(
        ([id, dp]) =>
            window.__auraShot.showWidgets(
                [
                    {
                        id,
                        type: 'thermostat',
                        title: 'Zieltemperatur',
                        datapoint: dp,
                        layout: 'dial',
                        gridPos: { x: 0, y: 0, w: 5, h: 14 },
                        options: {},
                    },
                ],
                { editMode: true },
            ),
        [WID, SET],
    );
    await page.evaluate(() => window.__auraShot.setEditMode(true));
    await page.locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    await page.waitForTimeout(500);

    check('the layout picker offers "Rundskala"', (await page.locator('button:text-is("Rundskala")').count()) === 1);

    const thick = page.locator('input[type="number"][min="2"][max="24"]');
    check('the panel offers the scale width', (await thick.count()) === 1, `${await thick.count()}`);
    await thick.fill('16');
    await page.waitForTimeout(400);
    let o = await page.evaluate((id) => window.__auraShot.widgetOptions(id), WID);
    check('the width field writes dialThickness', o?.dialThickness === 16, String(o?.dialThickness));

    // Two threshold editors are on screen — the reading scale sits at the very
    // bottom, so the row is added through the one carrying the dial's label.
    const dialScale = page
        .locator('div')
        .filter({ has: page.locator('label:text-is("Farbschwellen Skala (Soll-Wert)")') })
        .last();
    await dialScale.locator('button:text-is("+ Hinzufügen")').click();
    await page.waitForTimeout(400);
    o = await page.evaluate((id) => window.__auraShot.widgetOptions(id), WID);
    check(
        'the scale threshold editor writes dialColorThresholds',
        Array.isArray(o?.dialColorThresholds) && o.dialColorThresholds.length === 1,
        JSON.stringify(o?.dialColorThresholds),
    );
    check('…and leaves the reading scale alone', o?.colorThresholds === undefined, JSON.stringify(o?.colorThresholds));

    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__auraShot.setEditMode(false));
    await page.waitForTimeout(300);
}

// ── 7. The other layouts are untouched ──────────────────────────────────────
{
    await show({}, { [SET]: 22, [ACT]: 21 }, 'default');
    check('the default layout renders no dial', (await page.locator('[data-aura-thermo-dial]').count()) === 0);
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
