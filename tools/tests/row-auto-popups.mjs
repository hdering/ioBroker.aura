// Verifies the built-in row popups (#925): a list row set to "automatic" opens the
// popup of the type it is recognised as - a lamp the light popup, a window contact
// its own one - and those popups reach a fresh installation.
// Checks:
//   * every row popup is seeded into a fresh install (Admin › Popups lists them),
//   * each role opens its popup, a lamp (switch.light) the light one, not the switch,
//   * a type default the admin set still wins,
//   * a deleted row popup falls back to the datapoint popup,
//   * dashboard widgets get no type default from them.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/row-auto-popups.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

const ROWS = [
    ['light', 'demo925.lamp.ON', 'switch.light', 'boolean'],
    ['switch', 'demo925.plug.STATE', 'switch', 'boolean'],
    ['dimmer', 'demo925.spots.LEVEL', 'level.dimmer', 'number'],
    ['shutter', 'demo925.blind.LEVEL', 'level.blind', 'number'],
    ['thermostat', 'demo925.heat.SET_TEMPERATURE', 'level.temperature', 'number'],
    ['windowcontact', 'demo925.window.STATE', 'sensor.window', 'boolean'],
    ['binarysensor', 'demo925.motion.MOTION', 'sensor.motion', 'boolean'],
    ['value', 'demo925.temp.TEMPERATURE', 'value.temperature', 'number'],
];
const ROW_IDS = ROWS.map(([type]) => `pv-builtin-row-${type}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 60000 });

const state = await page.evaluate(() => window.__auraShot.popupState());
const seeded = ROW_IDS.filter((id) => state.views.some((v) => v.id === id));
eq('a fresh install gets every row popup', seeded, ROW_IDS);
eq('and no widget type default comes with them', state.typeDefaults, {});

const values = Object.fromEntries(ROWS.map(([, id, , type]) => [id, type === 'boolean' ? true : 40]));
await page.evaluate((v) => {
    window.__auraShot.mockServerState(v);
    window.__auraShot.mock(v);
    window.__auraShot.captureWrites(true);
}, values);

/** Opens the row's popup and returns the ids of the popup's widgets. */
async function openRow(id, role) {
    await page.evaluate(
        ([id, role]) =>
            window.__auraShot.showWidgets([
                {
                    id: 'w-list',
                    type: 'list',
                    title: 'Liste',
                    datapoint: '',
                    layout: 'default',
                    gridPos: { x: 0, y: 0, w: 12, h: 6 },
                    options: { rowClickAction: 'auto', entries: [{ id, label: 'ZEILE-925', role }] },
                },
            ]),
        [id, role],
    );
    await page.waitForTimeout(300);
    await page.locator('text=ZEILE-925 >> visible=true').first().click();
    await page.waitForTimeout(500);
    const ids = await page.evaluate(() =>
        [...document.querySelectorAll('[data-aura-popup-widget]')].map((e) => e.getAttribute('data-aura-popup-widget')),
    );
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    return ids;
}

for (const [type, id, role] of ROWS) {
    eq(`${role} opens the ${type} popup`, await openRow(id, role), [`pw-row-${type}-1`]);
}

// The admin's own view for a type wins over the built-in row popup.
await page.evaluate(() => {
    const s = window.__auraShot;
    // popupState() lists id/name only; the widgets come from popupViewWidgets().
    const views = s.popupState().views.map((v) => ({ ...v, widgets: s.popupViewWidgets(v.id) }));
    const own = {
        id: 'w-own',
        type: 'value',
        title: '',
        datapoint: '{{dp}}',
        gridPos: { x: 0, y: 0, w: 12, h: 2 },
        options: {},
    };
    s.popupViews([...views, { id: 'v-own', name: 'Eigenes Licht', widgets: [own] }]);
    s.popupTypeDefaults({ light: 'v-own' });
});
eq('an admin type default wins', await openRow('demo925.lamp.ON', 'switch.light'), ['w-own']);

// A deleted row popup falls back to the datapoint popup.
await page.evaluate(() => {
    window.__auraShot.popupTypeDefaults({});
    window.__auraShot.popupRemoveView('pv-builtin-row-switch');
});
const fallback = await openRow('demo925.plug.STATE', 'switch');
check('a deleted row popup falls back to the datapoint popup', fallback.includes('pw-bi-dp-1'), fallback.join(','));

// ── Admin › Popups › Listenzeilen ────────────────────────────────────────────
// Admin sits behind the session flag - the same bypass the documentation shots use.
await page.evaluate(() => {
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 }));
    window.location.hash = '/admin/popups';
});
await page.waitForSelector('#listenzeilen', { timeout: 20000 });
const typeRows = page.locator('#listenzeilen [data-aura-row-type]');
eq('the section lists every row type', await typeRows.count(), ROWS.length);
const lightSelect = page.locator('#listenzeilen [data-aura-row-type="light"] select');
const standardText = await lightSelect.locator('option').first().innerText();
eq('"Standard" names what a lamp opens without a pick', standardText.trim(), 'Standard (Liste: Licht)');
await lightSelect.selectOption('v-own');
await page.locator('#listenzeilen [data-aura-row-type="switch"] select').selectOption('');
eq('the picks are stored', await page.evaluate(() => window.__auraShot.popupRowTypeViews()), {
    light: 'v-own',
    switch: '',
});

await page.evaluate(() => {
    window.location.hash = '/';
});
await page.waitForTimeout(800);
// A widget type default for the same type loses against the pick for list rows.
await page.evaluate(() => window.__auraShot.popupTypeDefaults({ light: 'pv-builtin-row-value' }));
eq('a lamp opens the view picked for list rows', await openRow('demo925.lamp.ON', 'switch.light'), ['w-own']);
eq('"kein Popup" leaves the row without one', await openRow('demo925.plug.STATE', 'switch'), []);

eq('no page errors', pageErrors, []);
await browser.close();

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed ? `${failed} failed` : 'all passed'} (${results.length - failed}/${results.length})`);
process.exit(failed ? 1 : 0);
