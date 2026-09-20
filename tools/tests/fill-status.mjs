// Verifies the status datapoints of the fill widget (issues #671, #691).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/fill-status.mjs
//
// "Charging", "discharging" and "connected" are three optional datapoints next to the
// level. Checked here: the bolt appears only while the condition holds (flag, inverted
// flag, charge power), one signed power drives both directions with its own icon and
// its own sweep colour (#691), the lost connection greys out the picture but never its
// own icon, both effects run on the fill (blink) or over the lit part (Knight Rider
// sweep), a widget without these datapoints gets no overlay at all — and the editor
// panel writes the options it shows.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const SOC = 'demo.status.soc';
const CHARGE = 'demo.status.charge';
const POWER = 'demo.status.power';
const CONN = 'demo.status.conn';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
await page.evaluate(() => window.__auraShot.writes(true));

/** A battery fill widget; `opts` is merged over the defaults, `extra` over the widget. */
const widget = (opts, extra = {}) => ({
    id: 'w-status',
    type: 'fill',
    title: 'Akku',
    datapoint: SOC,
    layout: 'battery',
    gridPos: { x: 0, y: 0, w: 6, h: 18 },
    options: { unit: '%', decimals: 0, minValue: 0, maxValue: 100, ...opts },
    ...extra,
});

async function show(cfg, mocks, waitFor = '[data-aura-fill]') {
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

/** Everything the status overlay says about the widget on screen. */
const state = () =>
    page.evaluate(() => {
        const layer = document.querySelector('[data-aura-fill-status]');
        const host = layer?.parentElement ?? null;
        // The dimming sits on every direct child of the host except the status layer;
        // without a layer there is no host to walk, so fall back to the renderer itself.
        const viz = host
            ? [...host.children].find((el) => !el.hasAttribute('data-aura-fill-status'))
            : document.querySelector('[data-aura-fill]');
        const band = document.querySelector('[data-aura-fill-scan] > *');
        const fill = document.querySelector('[data-aura-fill-level]');
        const badgeBox = (kind) => {
            const el = document.querySelector(`[data-aura-fill-badge="${kind}"]`);
            if (!el) return null;
            const b = el.getBoundingClientRect();
            return { left: b.left, top: b.top, width: b.width, height: b.height };
        };
        return {
            layer: !!layer,
            charging: layer?.getAttribute('data-aura-fill-charging') ?? null,
            discharging: layer?.getAttribute('data-aura-fill-discharging') ?? null,
            connected: layer?.getAttribute('data-aura-fill-connected') ?? null,
            bolt: badgeBox('charge'),
            boltSvg: !!document.querySelector('[data-aura-fill-badge="charge"] svg'),
            down: badgeBox('discharge'),
            downColor: document.querySelector('[data-aura-fill-badge="discharge"]')
                ? getComputedStyle(document.querySelector('[data-aura-fill-badge="discharge"]')).color
                : null,
            bandBg: band ? getComputedStyle(band).backgroundImage : null,
            offlineIcon: badgeBox('offline'),
            hostClass: host?.className ?? '',
            vizOpacity: viz ? Number(getComputedStyle(viz).opacity) : null,
            layerOpacity: layer ? Number(getComputedStyle(layer).opacity) : null,
            fillAnim: fill ? getComputedStyle(fill).animationName : null,
            bandAnim: band ? getComputedStyle(band).animationName : null,
            scan: document.querySelector('[data-aura-fill-scan]')?.getBoundingClientRect().height ?? null,
            trackH: document.querySelector('[data-aura-fill]')?.getBoundingClientRect().height ?? null,
        };
    });

// ── 1. Nothing configured — nothing added ───────────────────────────────────
{
    await show(widget({}), { [SOC]: 60 });
    const r = await state();
    check('without status datapoints there is no overlay', r.layer === false, JSON.stringify(r.layer));
    check('and no animation on the fill', r.fillAnim === 'none', String(r.fillAnim));
}

// ── 2. The charging flag ────────────────────────────────────────────────────
{
    await show(widget({ chargeDatapoint: CHARGE }), { [SOC]: 60, [CHARGE]: true });
    let r = await state();
    check('a true charging flag shows the bolt', !!r.bolt, JSON.stringify(r.charging));
    check('and flags the widget as charging', r.charging === '1', String(r.charging));

    await show(widget({ chargeDatapoint: CHARGE }), { [SOC]: 60, [CHARGE]: false });
    r = await state();
    check('a cleared flag takes the bolt away', r.bolt === null, String(r.charging));

    // A datapoint that never reports must not light the bolt either.
    await show(widget({ chargeDatapoint: 'demo.status.missing' }), { [SOC]: 60 });
    r = await state();
    check('a silent datapoint shows nothing', r.bolt === null && r.layer === false);

    // PV storage: the same datapoint is a power, positive while charging.
    await show(widget({ chargeDatapoint: CHARGE, chargeCondition: 'gt0' }), { [SOC]: 60, [CHARGE]: 2400 });
    r = await state();
    check('a positive charge power counts as charging', !!r.bolt, String(r.charging));

    await show(widget({ chargeDatapoint: CHARGE, chargeCondition: 'gt0' }), { [SOC]: 60, [CHARGE]: -2400 });
    r = await state();
    check('feeding back does not', r.bolt === null, String(r.charging));

    // Any icon of the picker, not a fixed bolt.
    await show(widget({ chargeDatapoint: CHARGE, chargeIcon: 'mdi:battery-charging' }), {
        [SOC]: 60,
        [CHARGE]: true,
    });
    r = await state();
    check('a freely chosen icon is drawn', !!r.bolt && r.boltSvg, String(r.boltSvg));

    // The icon can be turned off while the effect stays.
    await show(widget({ chargeDatapoint: CHARGE, showChargeIcon: false, chargeEffect: 'blink' }), {
        [SOC]: 60,
        [CHARGE]: true,
    });
    r = await state();
    check('the bolt can be switched off', r.bolt === null, String(r.charging));
    check('while the blink keeps running', r.fillAnim === 'aura-fill-blink', String(r.fillAnim));
}

// ── 3. The two effects ──────────────────────────────────────────────────────
{
    await show(widget({ chargeDatapoint: CHARGE, chargeEffect: 'blink' }), { [SOC]: 60, [CHARGE]: true });
    let r = await state();
    check('blink: the host carries the class', r.hostClass.includes('aura-fill-blink'), r.hostClass);
    check('blink: the fill animates', r.fillAnim === 'aura-fill-blink', String(r.fillAnim));

    await show(widget({ chargeDatapoint: CHARGE, chargeEffect: 'blink' }), { [SOC]: 60, [CHARGE]: false });
    r = await state();
    check('blink: it stops when the charging stops', r.fillAnim === 'none', String(r.fillAnim));

    await show(widget({ chargeDatapoint: CHARGE, chargeEffect: 'scan' }), { [SOC]: 60, [CHARGE]: true });
    r = await state();
    check('scan: the sweep band is mounted', r.bandAnim === 'aura-fill-scan-y', String(r.bandAnim));
    check('scan: the fill itself does not blink', r.fillAnim === 'none', String(r.fillAnim));
    // 60 % of the bar, not the whole widget — the sweep runs over the lit part.
    check(
        'scan: the sweep covers the lit part only',
        r.scan !== null && r.trackH !== null && r.scan < r.trackH * 0.75,
        `${Math.round(r.scan)} of ${Math.round(r.trackH)}`,
    );

    // The horizontal battery is a second renderer and needs the other axis.
    await show(widget({ chargeDatapoint: CHARGE, chargeEffect: 'scan', orientation: 'horizontal' }), {
        [SOC]: 60,
        [CHARGE]: true,
    });
    r = await state();
    check('scan: horizontal sweeps along x', r.bandAnim === 'aura-fill-scan-x', String(r.bandAnim));
}

// ── 4. Discharging (#691) ───────────────────────────────────────────────────
{
    // The reporter's case: one signed packPower, gt0 above and lt0 below.
    const both = {
        chargeDatapoint: POWER,
        chargeCondition: 'gt0',
        chargeEffect: 'scan',
        dischargeDatapoint: POWER,
        dischargeEffect: 'scan',
    };
    await show(widget(both), { [SOC]: 60, [POWER]: -900 }, '[data-aura-fill-badge="discharge"]');
    let r = await state();
    check('a negative power shows the discharge icon', !!r.down, String(r.discharging));
    check(
        'and flags the widget as discharging, not charging',
        r.discharging === '1' && r.charging === '0',
        `${r.charging}/${r.discharging}`,
    );
    check('the bolt stays away', r.bolt === null, String(r.charging));
    // Orange by default, so the user tells the two directions apart at a glance.
    check('the icon is the discharge colour', r.downColor === 'rgb(249, 115, 22)', String(r.downColor));
    check('the sweep runs in the discharge colour', (r.bandBg ?? '').includes('rgb(249, 115, 22)'), String(r.bandBg));

    await show(widget(both), { [SOC]: 60, [POWER]: 2400 }, '[data-aura-fill-badge="charge"]');
    r = await state();
    check(
        'the same datapoint shows the bolt while charging',
        !!r.bolt && r.down === null,
        `${r.charging}/${r.discharging}`,
    );
    check(
        'and the sweep goes back to the charge colour',
        (r.bandBg ?? '').includes('rgb(34, 197, 94)'),
        String(r.bandBg),
    );

    // Standing still is neither — the state an inverted charge flag could not express.
    await show(widget(both), { [SOC]: 60, [POWER]: 0 });
    r = await state();
    check('a resting battery shows neither icon', r.bolt === null && r.down === null, `${r.charging}/${r.discharging}`);
    check('and nothing sweeps', r.bandAnim === null, String(r.bandAnim));

    // The discharge side has its own effect, icon and colour.
    await show(
        widget({ dischargeDatapoint: POWER, dischargeEffect: 'blink', dischargeColor: '#ff0000' }),
        { [SOC]: 60, [POWER]: -900 },
        '[data-aura-fill-badge="discharge"]',
    );
    r = await state();
    check('discharging can blink the fill', r.fillAnim === 'aura-fill-blink', String(r.fillAnim));
    check('and its colour is configurable', r.downColor === 'rgb(255, 0, 0)', String(r.downColor));

    await show(widget({ dischargeDatapoint: POWER, showDischargeIcon: false, dischargeEffect: 'blink' }), {
        [SOC]: 60,
        [POWER]: -900,
    });
    r = await state();
    check('the discharge icon can be switched off', r.down === null, String(r.discharging));
    check('while its blink keeps running', r.fillAnim === 'aura-fill-blink', String(r.fillAnim));

    // A positive power is not a discharge, and a silent datapoint claims nothing.
    await show(widget({ dischargeDatapoint: POWER }), { [SOC]: 60, [POWER]: 900 });
    r = await state();
    check('a positive power is no discharge', r.down === null, String(r.discharging));
    await show(widget({ dischargeDatapoint: 'demo.status.missing2' }), { [SOC]: 60 });
    r = await state();
    check('a silent discharge datapoint adds no overlay', r.layer === false, String(r.layer));
}

// ── 5. The connection ───────────────────────────────────────────────────────
{
    // An UNREACH datapoint: true means gone, so "connected" is the false case.
    await show(widget({ connectedDatapoint: CONN, connectedCondition: 'false' }), { [SOC]: 60, [CONN]: false });
    let r = await state();
    check('a reachable device shows no icon', r.offlineIcon === null, String(r.connected));
    check('and is not greyed out', r.vizOpacity === 1, String(r.vizOpacity));

    await show(widget({ connectedDatapoint: CONN, connectedCondition: 'false' }), { [SOC]: 60, [CONN]: true });
    r = await state();
    check('a lost connection shows its icon', !!r.offlineIcon, String(r.connected));
    check('and greys out the picture', r.vizOpacity !== null && r.vizOpacity < 0.6, String(r.vizOpacity));
    check('but not the icon itself', r.layerOpacity === 1, String(r.layerOpacity));

    await show(widget({ connectedDatapoint: CONN, connectedCondition: 'false', offlineDim: false }), {
        [SOC]: 60,
        [CONN]: true,
    });
    r = await state();
    check('the greying can be switched off', r.vizOpacity === 1, String(r.vizOpacity));
    check('while the icon stays', !!r.offlineIcon, String(r.connected));

    // Both at once: charging and unreachable — two badges, side by side, inside the bar.
    await show(
        widget({ chargeDatapoint: CHARGE, connectedDatapoint: CONN, connectedCondition: 'false' }),
        { [SOC]: 60, [CHARGE]: true, [CONN]: true },
        '[data-aura-fill-badge="offline"]',
    );
    r = await state();
    check('both badges can show at once', !!r.bolt && !!r.offlineIcon);
    check(
        'and they do not overlap',
        r.bolt.left + r.bolt.width <= r.offlineIcon.left + 1,
        `${Math.round(r.bolt.left)} + ${Math.round(r.bolt.width)} vs ${Math.round(r.offlineIcon.left)}`,
    );
}

// ── 6. Other layouts carry the badges too ───────────────────────────────────
for (const layout of ['default', 'bar', 'segments', 'wave']) {
    await show(
        widget({ chargeDatapoint: CHARGE }, { layout }),
        { [SOC]: 60, [CHARGE]: true },
        '[data-aura-fill-badge="charge"]',
    );
    const r = await state();
    check(`layout ${layout} shows the bolt`, !!r.bolt, String(r.charging));
}

// ── 7. The editor panel writes the options ──────────────────────────────────
async function openPanel() {
    await page.evaluate(() => window.__auraShot.setEditMode(true));
    await page.locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    await page.waitForTimeout(400);
}
{
    await page.evaluate(
        ([w]) => window.__auraShot.showWidgets([w], { editMode: true }),
        [widget({}, { id: 'w-status-cfg' })],
    );
    await openPanel();
    // The fill options render inline in the edit panel, not in a modal of their own.
    const dp = page.locator('label:text-is("Laden aus Datenpunkt")').locator('xpath=following-sibling::div//input');
    check('the panel offers the charge datapoint', (await dp.count()) === 1, `${await dp.count()}`);
    await dp.fill(CHARGE);
    await page.waitForTimeout(400);
    let o = await page.evaluate(() => window.__auraShot.widgetOptions('w-status-cfg'));
    check('the field writes chargeDatapoint', o?.chargeDatapoint === CHARGE, String(o?.chargeDatapoint));

    const effect = page
        .locator('label:text-is("Effekt während des Ladens")')
        .locator('xpath=following-sibling::select');
    check('the effect only appears with a datapoint', (await effect.count()) === 1, `${await effect.count()}`);
    await effect.selectOption('scan');
    await page.waitForTimeout(400);
    o = await page.evaluate(() => window.__auraShot.widgetOptions('w-status-cfg'));
    check('the select writes chargeEffect', o?.chargeEffect === 'scan', String(o?.chargeEffect));

    // #691: the discharge row, and the shortcut that copies the charge datapoint over.
    const copy = page.locator('button:text-is("Denselben Datenpunkt wie beim Laden übernehmen")');
    check('the panel offers to reuse the charge datapoint', (await copy.count()) === 1, `${await copy.count()}`);
    await copy.click();
    await page.waitForTimeout(400);
    o = await page.evaluate(() => window.__auraShot.widgetOptions('w-status-cfg'));
    check('the shortcut writes dischargeDatapoint', o?.dischargeDatapoint === CHARGE, String(o?.dischargeDatapoint));

    const dCond = page.locator('label:text-is("Entlädt, wenn der Wert …")').locator('xpath=following-sibling::select');
    check('the discharge condition appears with it', (await dCond.count()) === 1, `${await dCond.count()}`);
    check('and defaults to "kleiner 0"', (await dCond.inputValue()) === 'lt0', await dCond.inputValue());

    const dEffect = page
        .locator('label:text-is("Effekt während des Entladens")')
        .locator('xpath=following-sibling::select');
    await dEffect.selectOption('blink');
    await page.waitForTimeout(400);
    o = await page.evaluate(() => window.__auraShot.widgetOptions('w-status-cfg'));
    check('the select writes dischargeEffect', o?.dischargeEffect === 'blink', String(o?.dischargeEffect));

    const dIcon = page.locator('label:text-is("Icon beim Entladen")').locator('xpath=following-sibling::button');
    check(
        'the discharge row names its default icon',
        (await dIcon.first().textContent())?.includes('mdi:battery-arrow-down'),
        (await dIcon.first().textContent()) ?? '',
    );

    const conn = page
        .locator('label:text-is("Verbunden aus Datenpunkt")')
        .locator('xpath=following-sibling::div//input');
    await conn.fill(CONN);
    await page.waitForTimeout(400);
    const cond = page.locator('label:text-is("Verbunden, wenn der Wert …")').locator('xpath=following-sibling::select');
    check('the connection condition appears with it', (await cond.count()) === 1, `${await cond.count()}`);
    await cond.selectOption('false');
    await page.waitForTimeout(400);
    o = await page.evaluate(() => window.__auraShot.widgetOptions('w-status-cfg'));
    check(
        'the fields write connectedDatapoint/-Condition',
        o?.connectedDatapoint === CONN && o?.connectedCondition === 'false',
        `${o?.connectedDatapoint} / ${o?.connectedCondition}`,
    );
    const iconBtn = page.locator('label:text-is("Icon beim Laden")').locator('xpath=following-sibling::button');
    check('the panel offers the icon picker', (await iconBtn.count()) === 1, `${await iconBtn.count()}`);
    check(
        'and names the default icon',
        (await iconBtn.first().textContent())?.includes('mdi:flash'),
        (await iconBtn.first().textContent()) ?? '',
    );

    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__auraShot.setEditMode(false));
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
