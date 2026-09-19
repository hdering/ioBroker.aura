// Checkbox instead of the slide toggle (#683) — the one CheckboxControl behind the
// Schalter widget, the Dimmer, list rows, custom-layout cells and the group master.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5211    (or set AURA_BASE)
//   AURA_BASE=http://localhost:5211 node tools/tests/switch-checkbox.mjs
//
// Worth pinning: the option is opt-in (a plain switch still draws the toggle), the
// box writes the same values the toggle writes, aria-checked follows the datapoint,
// the group master shows "mixed" while its targets disagree, and the box is exactly
// as tall as the toggle it replaces (so no widget metric changes with the style).
//
// captureWrites() keeps the clicks off the socket (the datapoints below live under a
// root that exists nowhere, but the dev server still proxies a real ioBroker).
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5211';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const LAMP = 'aura-selftest.0.checkbox.lamp';
const PLUG = 'aura-selftest.0.checkbox.plug';
const LEVEL = 'aura-selftest.0.checkbox.level';
const VALUES = { [LAMP]: false, [PLUG]: true, [LEVEL]: 40 };

await page.evaluate((values) => {
    window.__auraShot.captureWrites(true);
    window.__auraShot.mock(values);
    window.__auraShot.mockServerState(values);
}, VALUES);

const writes = (reset = false) => page.evaluate((r) => window.__auraShot.writes(r), reset);

// mock() alone is overwritten by the mocked server state on the next pull, so every
// value change goes to both (see memory: shot harness + mockServerState).
let current = { ...VALUES };
const mock = async (patch) => {
    current = { ...current, ...patch };
    await page.evaluate((v) => {
        window.__auraShot.mock(v);
        window.__auraShot.mockServerState(v);
    }, current);
};

/** Mounts the given widgets alone on the page and waits for `selector`. */
async function show(widgets, selector = '.aura-checkbox', values = VALUES) {
    current = { ...values };
    await mock({});
    await page.evaluate((ws) => window.__auraShot.showWidgets(ws), widgets);
    await page.waitForSelector(selector, { timeout: 10000 });
    await mock({});
    await page.waitForTimeout(400);
    await writes(true);
}

const box = () => page.locator('.aura-checkbox').first();
const ariaChecked = () => box().getAttribute('aria-checked');
const count = () => page.locator('.aura-checkbox').count();

// Fresh ids per mount: the harness keeps a widget with a known id mounted, and
// useDatapoint only subscribes while the socket is connected — which it never is
// against the dead proxy target — so a value is read on mount, not live.
let seq = 0;
const switchWidget = (layout, options = {}) => ({
    id: `switch-${layout}-${++seq}`,
    type: 'switch',
    title: 'Lampe',
    datapoint: LAMP,
    layout,
    gridPos: { x: 0, y: 0, w: 8, h: 6 },
    options,
});

// ── 1. Opt-in: a plain Schalter still draws the toggle ───────────────────────
await show([switchWidget('default')], '.aura-widget-action');
eq('without the option no checkbox is drawn', await count(), 0);
const toggleH = (await page.locator('button.aura-widget-action').first().boundingBox())?.height;

// ── 2. Schalter widget, default layout ──────────────────────────────────────
await show([switchWidget('default', { controlMode: 'checkbox' })]);
eq('default layout draws exactly one checkbox', await count(), 1);
eq('the box reads the datapoint (off)', await ariaChecked(), 'false');
const boxH = (await box().boundingBox())?.height;
eq('the box is as tall as the toggle it replaces', boxH, toggleH);

await box().click();
await page.waitForTimeout(250);
let log = await writes();
eq('a click writes the widget datapoint', log.at(-1)?.id, LAMP);
eq('and switches it on', log.at(-1)?.val, true);
await show([switchWidget('default', { controlMode: 'checkbox' })], '.aura-checkbox', { ...VALUES, [LAMP]: true });
eq('aria-checked follows the datapoint (on)', await ariaChecked(), 'true');
await box().click();
await page.waitForTimeout(250);
log = await writes();
eq('from on, the click switches it off', log.at(-1)?.val, false);

// ── 3. Schalter widget, compact and custom layouts ─────────────────────────
await show([switchWidget('compact', { controlMode: 'checkbox' })]);
eq('compact layout draws the checkbox', await count(), 1);
await box().click();
await page.waitForTimeout(250);
log = await writes();
eq('compact: the click writes true', log.at(-1)?.val, true);

await show([
    switchWidget('custom', {
        controlMode: 'checkbox',
        customGrid: { cols: 1, rows: 1, cells: [{ type: 'component', componentKey: 'toggle' }] },
    }),
]);
eq('custom layout: the toggle slot draws the checkbox', await count(), 1);

// ── 4. Configured colour paints the checked box ──────────────────────────────
await show([switchWidget('default', { controlMode: 'checkbox', onColor: '#ff0080' })], '.aura-checkbox', {
    ...VALUES,
    [LAMP]: true,
});
const bg = await box().evaluate((el) => getComputedStyle(el).backgroundColor);
eq('onColor fills the checked box', bg, 'rgb(255, 0, 128)');

// ── 5. Dimmer: the on/off control beside the slider ─────────────────────────
await show([
    {
        id: 'dimmer-1',
        type: 'dimmer',
        title: 'Decke',
        datapoint: LEVEL,
        layout: 'default',
        gridPos: { x: 0, y: 0, w: 8, h: 6 },
        options: { controlMode: 'checkbox' },
    },
]);
eq('dimmer draws the checkbox', await count(), 1);
eq('a level above 0 counts as on', await ariaChecked(), 'true');

// ── 6. List row, displayType switch ─────────────────────────────────────────
const listWidget = (entries, extra = {}) => ({
    id: `list-${++seq}`,
    type: 'list',
    title: 'Steckdosen',
    datapoint: '',
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 12, h: 8 },
    options: { entries, ...extra },
});
await show([listWidget([{ id: LAMP, label: 'Lampe', displayType: 'switch', switchStyle: 'checkbox' }])]);
eq('list switch row draws the checkbox', await count(), 1);
await box().click();
await page.waitForTimeout(250);
log = await writes();
eq('the row writes its own datapoint', log.at(-1)?.id, LAMP);
eq('and switches it on', log.at(-1)?.val, true);

await show([
    listWidget([
        { id: LAMP, label: 'Lampe', displayType: 'switch', switchStyle: 'checkbox', trueLabel: 'EIN', falseLabel: 'AUS' },
    ]),
]);
const rowText = await page.locator('.aura-checkbox').locator('xpath=..').textContent();
check('labels stay beside the box instead of replacing it', rowText.includes('AUS') && (await count()) === 1, rowText);

// ── 7. List row, automatic boolean path ─────────────────────────────────────
await show([listWidget([{ id: PLUG, label: 'Stecker', switchStyle: 'checkbox' }])]);
eq('auto boolean row draws the checkbox', await count(), 1);
eq('and reads the datapoint (on)', await ariaChecked(), 'true');
await box().click();
await page.waitForTimeout(250);
log = await writes();
eq('the auto row switches it off', log.at(-1)?.val, false);

// ── 8. Custom-layout cell (universal widget) ────────────────────────────────
await show([
    {
        id: 'universal-1',
        type: 'universal',
        title: 'Zelle',
        datapoint: '',
        layout: 'default',
        gridPos: { x: 0, y: 0, w: 8, h: 6 },
        options: {
            customGrid: { cols: 1, rows: 1, cells: [{ type: 'switch', dpId: LAMP, controlMode: 'checkbox' }] },
        },
    },
]);
eq('the switch cell draws the checkbox', await count(), 1);
await box().click();
await page.waitForTimeout(250);
log = await writes();
eq('the cell writes its datapoint', log.at(-1)?.id, LAMP);
eq('and switches it on', log.at(-1)?.val, true);

// ── 9. Group master switch as tri-state checkbox ────────────────────────────
await show([
    listWidget(
        [
            { id: LAMP, label: 'Lampe', displayType: 'switch' },
            { id: PLUG, label: 'Stecker', displayType: 'switch' },
        ],
        { groupSwitch: true, groupSwitchStyle: 'checkbox' },
    ),
]);
eq('the header draws the group checkbox', await count(), 1);
eq('one on, one off reads as mixed', await ariaChecked(), 'mixed');
await box().click();
await page.waitForTimeout(300);
log = await writes();
const ids = log.map((w) => w.id).sort();
eq('the click writes every target', ids, [LAMP, PLUG].sort());
check('a mixed group switches everything on', log.every((w) => w.val === true), JSON.stringify(log));
await mock({ [LAMP]: true, [PLUG]: true });
await page.waitForTimeout(200);
eq('all on reads as checked', await ariaChecked(), 'true');

// ── wrap up ─────────────────────────────────────────────────────────────────
eq('no page errors', pageErrors, []);
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
