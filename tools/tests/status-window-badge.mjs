// Window badge among the status badges (battery / reach) - issue #767.
//
//   AURA_BASE=http://localhost:5174 node tools/tests/status-window-badge.mjs
//
// Uses the screenshot harness, values live in the in-memory cache only. Checks:
//   - windowDp false → closed badge, true → open badge
//   - HmIP WINDOW_STATE: 0 closed, 1 open; own windowOpenValues override the default
//   - statusBadgesAlertOnly hides everything while closed and shows only the window
//     badge once it is open
//   - custom layout: the window-icon component and the window text field render
//   - alarm colour: open window defaults to --badge-warn, windowColor / batteryColor override it;
//     custom layout honours statusBadgesAlertOnly
//   - batteryLowValues (incl. the legacy batteryInvert) and empty value lists = default
//   - knob / light / enum / shutter draw the badges; editor status section + window field per type
/* global window, document */
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const SHOTS = process.env.AURA_SHOTS ?? '';

// Every show() mounts a fresh widget on fresh datapoints: offline, useDatapoint only
// picks a value up on mount, so a value change is tested as a new mount.
let run = 0;
let SET, ACT, WIN, BAT, UNR;

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 600 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 90000 });

async function show(options, values, extra = {}) {
    run++;
    const base = `demo.thermo${run}`;
    [SET, ACT, WIN, BAT, UNR] = [
        `${base}.set`,
        `${base}.act`,
        `${base}.WINDOW_OPEN_REPORTING`,
        `${base}.LOWBAT`,
        `${base}.UNREACH`,
    ];
    values = Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k.replace('WIN', WIN).replace('BAT', BAT).replace('UNR', UNR), v]),
    );
    const widget = {
        id: `w-thermo-window-${run}`,
        type: 'thermostat',
        title: 'Bad',
        datapoint: SET,
        gridPos: { x: 0, y: 0, w: 4, h: 4 },
        options: {
            actualDatapoint: ACT,
            windowDp: WIN,
            ...options,
            ...(options.batteryDp ? { batteryDp: BAT } : {}),
            ...(options.unreachDp ? { unreachDp: UNR } : {}),
        },
        ...extra,
    };
    const vals = { [SET]: 21, [ACT]: 20.5, ...values };
    await page.evaluate(
        ([w, v]) => {
            window.__auraShot.mock(v);
            window.__auraShot.mockServerState(v);
            window.__auraShot.showWidgets([w]);
        },
        [widget, vals],
    );
    await page.waitForTimeout(500);
}

/** Titles of all status badges in the widget, in order. */
const badgeTitles = () =>
    page.evaluate(() =>
        [...document.querySelectorAll('[title]')]
            .map((e) => e.getAttribute('title'))
            .filter((t) => /^(Fenster|Batterie|Gerät)/.test(t)),
    );

await show({}, { WIN: false });
check('closed badge for false', JSON.stringify(await badgeTitles()) === '["Fenster geschlossen"]', await badgeTitles());

await show({}, { WIN: true });
check('open badge for true', JSON.stringify(await badgeTitles()) === '["Fenster offen"]', await badgeTitles());
if (SHOTS) {
    await page.screenshot({ path: `${SHOTS}/window-badge-open.png`, clip: { x: 0, y: 0, width: 420, height: 260 } });
}

await show({}, { WIN: 1 });
check('HmIP WINDOW_STATE 1 counts as open', (await badgeTitles()).includes('Fenster offen'));
await show({}, { WIN: 0 });
check('HmIP WINDOW_STATE 0 counts as closed', (await badgeTitles()).includes('Fenster geschlossen'));

await show({ windowOpenValues: 'false' }, { WIN: false });
check('own windowOpenValues override the default', (await badgeTitles()).includes('Fenster offen'));

await show({ batteryDp: 'BAT', statusBadgesAlertOnly: true }, { WIN: false, BAT: false });
check('alert-only: nothing while closed and battery ok', (await badgeTitles()).length === 0, await badgeTitles());
await show({ batteryDp: 'BAT', statusBadgesAlertOnly: true }, { WIN: true, BAT: false });
check('alert-only: window open shows up', (await badgeTitles()).includes('Fenster offen'), await badgeTitles());
// Per badge: a low battery must not pull the closed window (or a reachable device) along.
await show({ batteryDp: 'BAT', unreachDp: 'UNR', statusBadgesAlertOnly: true }, { WIN: false, BAT: true, UNR: false });
check(
    'alert-only: only the alarming badge shows',
    JSON.stringify(await badgeTitles()) === '["Batterie schwach"]',
    await badgeTitles(),
);

await show(
    {
        customGrid: {
            cols: 2,
            rows: 1,
            cells: [
                { type: 'component', componentKey: 'window-icon' },
                { type: 'field', fieldKey: 'window' },
            ],
        },
    },
    { WIN: true },
    { layout: 'custom' },
);
const gridText = await page.evaluate(
    () => document.querySelector('.react-grid-item, [data-aura-widget]')?.textContent ?? document.body.textContent,
);
check('custom layout: window field text', gridText.includes('Fenster offen'), gridText.slice(0, 120));
const svgCount = await page.evaluate(
    () => [...document.querySelectorAll('svg path')].filter((p) => p.getAttribute('d') === 'M12 3l8 3v15l-8-3z').length,
);
check('custom layout: window-icon renders the open glyph', svgCount >= 1, String(svgCount));

/** Border style of the badge with the given title. */
const badgeBorder = (title) =>
    page.evaluate((t) => document.querySelector(`[title="${t}"]`)?.getAttribute('style') ?? '', title);

await show({}, { WIN: true });
check('open window defaults to --badge-warn', (await badgeBorder('Fenster offen')).includes('--badge-warn'));
await show({ windowColor: '#123456' }, { WIN: true });
check('windowColor overrides the alarm colour', (await badgeBorder('Fenster offen')).includes('#123456'));
await show({ windowColor: '#123456' }, { WIN: false });
check('windowColor leaves the closed badge green', (await badgeBorder('Fenster geschlossen')).includes('--badge-ok'));
await show({ batteryDp: 'BAT', batteryColor: '#abcdef' }, { WIN: false, BAT: true });
check('batteryColor overrides the low-battery colour', (await badgeBorder('Batterie schwach')).includes('#abcdef'));

// "low" values for the battery, the retired invert switch and empty = default.
const battTitle = async () => (await badgeTitles()).find((t) => t.startsWith('Batterie'));
await show({ batteryDp: 'BAT', batteryLowValues: 'LOW' }, { WIN: false, BAT: 'low' });
check('batteryLowValues: own value means low', (await battTitle()) === 'Batterie schwach', await battTitle());
await show({ batteryDp: 'BAT', batteryLowValues: 'LOW' }, { WIN: false, BAT: true });
check('batteryLowValues: true is ok once replaced', (await battTitle()) === 'Batterie OK', await battTitle());
await show({ batteryDp: 'BAT', batteryInvert: true }, { WIN: false, BAT: false });
check('legacy batteryInvert: false still means low', (await battTitle()) === 'Batterie schwach', await battTitle());
await show({ batteryDp: 'BAT', batteryInvert: true }, { WIN: false, BAT: true });
check('legacy batteryInvert: true still means ok', (await battTitle()) === 'Batterie OK', await battTitle());
await show({ batteryDp: 'BAT', batteryLowValues: '' }, { WIN: false, BAT: true });
check('empty batteryLowValues falls back to true,1', (await battTitle()) === 'Batterie schwach', await battTitle());
await show({ unreachDp: 'UNR', reachTrueValues: '' }, { WIN: false, UNR: true });
check(
    'empty reachTrueValues falls back to true,1',
    (await badgeTitles()).includes('Gerät nicht erreichbar'),
    await badgeTitles(),
);
await show({ windowOpenValues: '' }, { WIN: true });
check('empty windowOpenValues falls back to the default', (await badgeTitles()).includes('Fenster offen'));

await show(
    {
        statusBadgesAlertOnly: true,
        customGrid: { cols: 1, rows: 1, cells: [{ type: 'component', componentKey: 'window-icon' }] },
    },
    { WIN: false },
    { layout: 'custom' },
);
const closedGlyphs = await page.evaluate(
    () =>
        [...document.querySelectorAll('svg rect')].filter(
            (r) => r.getAttribute('x') === '4' && r.getAttribute('y') === '3',
        ).length,
);
check('custom layout alert-only: no window icon while closed', closedGlyphs === 0, String(closedGlyphs));

// ── Coverage: widgets that only lately draw / offer the badges ──────────────────
/** Mount one widget of any type with a low battery and an open window. */
async function showType(type, extra = {}, options = {}) {
    run++;
    const base = `demo.cov${run}`;
    const vals = { [`${base}.main`]: 1, [`${base}.LOWBAT`]: true, [`${base}.WIN`]: true };
    const widget = {
        id: `w-cov-${run}`,
        type,
        title: 'Cov',
        datapoint: `${base}.main`,
        gridPos: { x: 0, y: 0, w: 4, h: 4 },
        options: { batteryDp: `${base}.LOWBAT`, windowDp: `${base}.WIN`, ...options },
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
}
const statusGrid = (keys) => ({
    customGrid: { cols: keys.length, rows: 1, cells: keys.map((k) => ({ type: 'component', componentKey: k })) },
});

await showType('knob');
check('knob: fixed layout draws the badges', (await badgeTitles()).includes('Batterie schwach'), await badgeTitles());
await showType('knob', { layout: 'custom' }, statusGrid(['battery-icon']));
check(
    'knob: custom grid battery-icon renders',
    (await badgeTitles()).includes('Batterie schwach') ||
        (await page.evaluate(() => !!document.querySelector('.lucide-battery-low'))),
);
for (const type of ['light', 'enum']) {
    await showType(type, { layout: 'custom' }, statusGrid(['status-badges']));
    const glyph = await page.evaluate(() =>
        [...document.querySelectorAll('svg path')].some((p) => p.getAttribute('d') === 'M12 3l8 3v15l-8-3z'),
    );
    check(`${type}: custom grid status-badges include the open window`, glyph);
}
await showType('shutter', { layout: 'custom' }, statusGrid(['window-icon']));
check(
    'shutter: custom grid window-icon renders',
    await page.evaluate(() =>
        [...document.querySelectorAll('svg path')].some((p) => p.getAttribute('d') === 'M12 3l8 3v15l-8-3z'),
    ),
);

// Editor: status section on the new types, window field only where it matters.
async function editorHas(type, options = {}) {
    run++;
    const w = {
        id: `w-ed-${run}`,
        type,
        title: 'Ed',
        datapoint: `demo.ed${run}.main`,
        gridPos: { x: 0, y: 0, w: 4, h: 4 },
        options,
    };
    await page.evaluate((w) => {
        window.__auraShot.showWidgets([w]);
        window.__auraShot.setEditMode(true);
    }, w);
    await page.waitForTimeout(600);
    const card = page.locator('.react-grid-item').first();
    await card.hover();
    await card.locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    await page.waitForTimeout(900);
    const dlg = page.locator('.aura-widget-edit-modal');
    const res = {
        status: (await dlg.getByText('Status-Datenpunkte').count()) > 0,
        window: (await dlg.getByText('Fenster-DP (z.B. WINDOW_OPEN_REPORTING)').count()) > 0,
    };
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__auraShot.setEditMode(false));
    return res;
}
for (const type of ['slider', 'knob', 'light', 'enum', 'datepicker', 'mediaplayer']) {
    const r = await editorHas(type);
    check(`editor: ${type} has the status section without window field`, r.status && !r.window, JSON.stringify(r));
}
for (const type of ['thermostat', 'climate', 'shutter']) {
    const r = await editorHas(type);
    check(`editor: ${type} offers the window field`, r.status && r.window, JSON.stringify(r));
}
const kept = await editorHas('switch', { windowDp: 'demo.kept.WIN' });
check('editor: a set window DP stays visible on a switch', kept.window, JSON.stringify(kept));

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\nstatus-window-badge: ${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
