// Editor control lock (issue #655): while a dashboard is being designed, a click
// on a widget must move the widget — never switch the device behind it.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/editor-widget-lock.mjs
//
// Clicks are real mouse clicks at the control's centre, because that is the
// whole question: does the press land on the control or on the card? Writes are
// captured by the harness (captureWrites) and never reach the socket.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const DP = 'demo.lock.switch';
const SW = {
    id: 'w-lock-sw',
    type: 'switch',
    title: 'Lampe',
    datapoint: DP,
    gridPos: { x: 0, y: 0, w: 6, h: 6 },
    options: {},
};
const GROUP_CHILD = {
    id: 'w-lock-child',
    type: 'switch',
    title: 'Im Gruppen-Widget',
    datapoint: DP,
    gridPos: { x: 0, y: 0, w: 6, h: 5 },
    options: {},
};
const GROUP = {
    id: 'w-lock-group',
    type: 'group',
    title: 'Gruppe',
    gridPos: { x: 0, y: 7, w: 8, h: 8 },
    options: { defId: 'lock-def' },
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 800 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

async function boot() {
    await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
    await page.evaluate(() => window.__auraShot.captureWrites(true));
}

async function show(widgets, editMode) {
    await page.evaluate(
        ([cfgs, edit, dp]) => {
            window.__auraShot.mockServerState({ [dp]: false });
            window.__auraShot.mock({ [dp]: false });
            window.__auraShot.showWidgets(cfgs, { editMode: edit });
            window.__auraShot.setEditMode(edit);
            window.__auraShot.mock({ [dp]: false });
        },
        [widgets, editMode, DP],
    );
    await page.waitForTimeout(500);
}

/** Press the middle of the widget's control the way a hand would. */
async function clickControl(widgetId) {
    const el = page.locator(`.aura-widget-${widgetId} .aura-widget-action`).first();
    await el.waitFor({ state: 'attached', timeout: 5000 });
    const box = await el.boundingBox();
    if (!box) throw new Error(`no box for ${widgetId}`);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(250);
}

const writes = () => page.evaluate(() => window.__auraShot.writes().length);
const resetWrites = () =>
    page.evaluate(() => {
        window.__auraShot.captureWrites(false);
        window.__auraShot.captureWrites(true);
    });

await boot();

// ── 1. frontend: the click has to work, or the rest proves nothing ──────────
await show([SW], false);
await clickControl(SW.id);
check('frontend click writes the datapoint', (await writes()) === 1, `writes=${await writes()}`);

// ── 2. editor: same click, nothing written ─────────────────────────────────
await resetWrites();
await show([SW], true);
const inert = await page.evaluate(
    (id) => !!document.querySelector(`.aura-widget-${id} .aura-widget-inert`),
    SW.id,
);
check('editor marks the widget body inert', inert);

const pe = await page.evaluate((id) => {
    const el = document.querySelector(`.aura-widget-${id} .aura-widget-action`);
    return el ? getComputedStyle(el).pointerEvents : 'missing';
}, SW.id);
check('control ignores the pointer in the editor', pe === 'none', `pointer-events=${pe}`);

await clickControl(SW.id);
check('editor click writes nothing', (await writes()) === 0, `writes=${await writes()}`);

// ── 3. the editor's own chrome must stay usable ────────────────────────────
const chrome = await page.evaluate((id) => {
    const el = document.querySelector(`.aura-widget-${id} .aura-edit-chrome button`);
    if (!el) return 'missing';
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return getComputedStyle(el).pointerEvents === 'none' ? 'deaf' : hit?.closest('.aura-edit-chrome') ? 'ok' : 'covered';
}, SW.id);
check('edit chrome keeps its clicks', chrome === 'ok', chrome);

// ── 4. the press still reaches the card, so the grid can move it ───────────
const hit = await page.evaluate((id) => {
    const el = document.querySelector(`.aura-widget-${id} .aura-widget-action`);
    const r = el.getBoundingClientRect();
    const target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return target?.closest(`.aura-widget-${id}`) ? 'frame' : 'elsewhere';
}, SW.id);
check('the press lands on the widget card instead', hit === 'frame', hit);

// ── 5. a group keeps its children reachable, they lock themselves ──────────
await resetWrites();
await page.evaluate(
    ([group, child, dp]) => {
        window.__auraShot.groupDefs({ [group.options.defId]: [child] });
        window.__auraShot.showWidgets([group], { editMode: true });
        window.__auraShot.setEditMode(true);
        window.__auraShot.mock({ [dp]: false });
    },
    [GROUP, GROUP_CHILD, DP],
);
await page.waitForTimeout(600);
const groupLocked = await page.evaluate(
    (id) => !!document.querySelector(`.aura-widget-${id} > .aura-widget-inert`),
    GROUP.id,
);
check('group body stays interactive so children can be picked up', !groupLocked);

const childInert = await page.evaluate(
    (id) => !!document.querySelector(`.aura-widget-${id} .aura-widget-inert`),
    GROUP_CHILD.id,
);
check('child inside the group locks itself', childInert);

await clickControl(GROUP_CHILD.id);
check('click on a group child writes nothing', (await writes()) === 0, `writes=${await writes()}`);

// ── 6. unlocking from the toolbar gives the controls back ─────────────────
await page.evaluate(() =>
    localStorage.setItem('aura-admin-prefs', JSON.stringify({ state: { lockWidgets: false }, version: 0 })),
);
await boot();
await show([SW], true);
await clickControl(SW.id);
check('unlocked editor writes again', (await writes()) === 1, `writes=${await writes()}`);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
