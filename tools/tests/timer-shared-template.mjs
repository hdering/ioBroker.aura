// Timer inside a shared template (#778): every device card — and every popup opened
// for another device — renders the SAME stored timer. Each resolved target must get
// its own backend schedule and its own events; before, all devices shared one
// schedule that wrote only to the device rendered last.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5197
//   AURA_BASE=http://localhost:5197 node tools/tests/timer-shared-template.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const DEF = 'def-card-778';
const BASE_KEY = 't-778';
const CARDS = ['a', 'b'];

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate(() => window.__auraShot.captureWrites(true));

const mock = {};
for (const c of CARDS) {
    mock[`test.dev.${c}.1.SET`] = { val: 20 };
}
await page.evaluate((m) => {
    window.__auraShot.mockServerState(m);
    window.__auraShot.mock(m);
}, mock);

const EVENT = {
    id: 'ev-1',
    enabled: true,
    label: '',
    weekdays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    trigger: { kind: 'time', hour: 7, minute: 0 },
    filter: 'all-days',
};
const cards = CARDS.map((c, i) => ({
    id: `w-card-${c}`,
    type: 'devicecard',
    title: 'Thermostat {{parent}}',
    datapoint: `test.dev.${c}.1.SET`,
    gridPos: { x: i * 12, y: 0, w: 12, h: 10 },
    options: { defId: DEF },
}));
const children = [
    {
        id: 'child-timer',
        type: 'timer',
        title: 'Heizplan',
        datapoint: '',
        gridPos: { x: 0, y: 0, w: 12, h: 8 },
        options: {
            stateBaseId: `aura.0.timers.${BASE_KEY}`,
            targetDp: '{{dp}}',
            value: '21',
            events: [EVENT],
        },
    },
];
await page.evaluate(
    ([c, kids, def]) => {
        window.__auraShot.groupDefs({ [def]: kids });
        window.__auraShot.showWidgets(c, { editMode: false });
    },
    [cards, children, DEF],
);
await page.waitForTimeout(1500);

const configWrites = async () =>
    (await page.evaluate(() => window.__auraShot.writes()))
        .filter((w) => /\.timers\.[^.]+\.config$/.test(w.id))
        .map((w) => ({ key: w.id.split('.')[3], payload: JSON.parse(w.val) }));

// ── 1. One schedule per device, none under the shared base key ──
{
    const writes = await configWrites();
    const byTarget = new Map(writes.map((w) => [w.payload.targetDp, w.key]));
    check(
        'each card publishes its own target',
        byTarget.has('test.dev.a.1.SET') && byTarget.has('test.dev.b.1.SET'),
        JSON.stringify(writes.map((w) => [w.key, w.payload.targetDp])),
    );
    const ka = byTarget.get('test.dev.a.1.SET');
    const kb = byTarget.get('test.dev.b.1.SET');
    check('under different backend keys', !!ka && !!kb && ka !== kb, `${ka} / ${kb}`);
    check(
        'derived from the template key',
        [ka, kb].every((k) => k?.startsWith(`${BASE_KEY}_`)),
        `${ka} / ${kb}`,
    );
    check(
        'nothing published under the shared base key',
        writes.every((w) => w.key !== BASE_KEY),
        JSON.stringify(writes.map((w) => w.key)),
    );
    check(
        'no unresolved token reaches the backend',
        writes.every((w) => !String(w.payload.targetDp).includes('{{')),
    );
    check(
        'both start with the template events',
        writes.every((w) => w.payload.events.length === 1 && w.payload.events[0].id === 'ev-1'),
    );
}

// ── 2. Switching an event off in card a touches only device a ──
await page.evaluate(() => window.__auraShot.writes(true));
await page.locator('[data-aura-widget="w-card-a"] button[title^="Aktiv"]').first().click();
await page.waitForTimeout(600);
{
    const stored = await page.evaluate((def) => window.__auraShot.groupDefChildren(def), DEF);
    const o = stored?.[0]?.options ?? {};
    const inst = o.timerInstances ?? {};
    check(
        'the edit is stored for device a only',
        JSON.stringify(Object.keys(inst)) === JSON.stringify(['test.dev.a.1.SET']),
        JSON.stringify(inst),
    );
    check('device a holds the switched-off event', inst['test.dev.a.1.SET']?.events?.[0]?.enabled === false);
    check('the template events stay untouched', o.events?.[0]?.enabled === true);
    check('the placeholder target stays in the template', o.targetDp === '{{dp}}', String(o.targetDp));
    check(
        'card b still shows the event as active',
        (await page.locator('[data-aura-widget="w-card-b"] button[title^="Aktiv"]').count()) === 1,
    );
    const writes = await configWrites();
    check(
        'only device a is re-published',
        writes.length >= 1 && writes.every((w) => w.payload.targetDp === 'test.dev.a.1.SET'),
        JSON.stringify(writes.map((w) => [w.key, w.payload.targetDp])),
    );
    check('with the event off', writes.at(-1)?.payload.events[0].enabled === false);
}

// ── 3. Popup view: one timer template, opened for two devices ──
const VIEW = 'view-778';
const POPUP_KEY = 't-778p';
const triggers = CARDS.map((c, i) => ({
    id: `w-trig-${c}`,
    type: 'value',
    title: `Raum ${c}`,
    datapoint: `test.dev.${c}.1.SET`,
    gridPos: { x: i * 6, y: 0, w: 6, h: 3 },
    options: { clickAction: { kind: 'popup-view', viewId: VIEW } },
}));
const popupTimer = {
    ...children[0],
    id: 'pv-timer',
    options: { ...children[0].options, stateBaseId: `aura.0.timers.${POPUP_KEY}` },
};
await page.evaluate(
    ([view, t]) => {
        window.__auraShot.popupViews([view]);
        window.__auraShot.showWidgets(t, { editMode: false });
        window.__auraShot.writes(true);
    },
    [{ id: VIEW, name: 'Thermostat', widgets: [popupTimer] }, triggers],
);
await page.waitForTimeout(800);
const openFor = async (c) => {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.locator(`[data-aura-widget="w-trig-${c}"]`).click();
    await page.locator('button[title^="Aktiv"], button[title^="Inaktiv"]').first().waitFor({ timeout: 10000 });
    await page.waitForTimeout(500);
};
await openFor('a');
await page.locator('button[title^="Aktiv"]').first().click();
await page.waitForTimeout(500);
await openFor('b');
{
    const stored = await page.evaluate((v) => window.__auraShot.popupViewWidgets(v), VIEW);
    const o = stored?.[0]?.options ?? {};
    check(
        'popup: the edit is stored for device a only',
        JSON.stringify(Object.keys(o.timerInstances ?? {})) === JSON.stringify(['test.dev.a.1.SET']),
        JSON.stringify(o.timerInstances),
    );
    check('popup: template keeps {{dp}} and its events', o.targetDp === '{{dp}}' && o.events?.[0]?.enabled === true);
    check('popup: opened for b, the event shows active', (await page.locator('button[title^="Aktiv"]').count()) === 1);
    const writes = await configWrites();
    const keys = new Map();
    for (const w of writes) {
        keys.set(w.payload.targetDp, w.key);
    }
    check(
        'popup: each device under its own key, none under the base key',
        keys.size === 2 &&
            keys.get('test.dev.a.1.SET') !== keys.get('test.dev.b.1.SET') &&
            !writes.some((w) => w.key === POPUP_KEY),
        JSON.stringify(writes.map((w) => [w.key, w.payload.targetDp])),
    );
    const lastA = writes.filter((w) => w.payload.targetDp === 'test.dev.a.1.SET').at(-1);
    const lastB = writes.filter((w) => w.payload.targetDp === 'test.dev.b.1.SET').at(-1);
    check('popup: device a schedule has the event off', lastA?.payload.events[0].enabled === false);
    check('popup: device b schedule keeps it on', lastB?.payload.events[0].enabled === true);
}

// ── 4. Countdown in device cards: one countdown per device ──
const CD_DEF = 'def-card-778-cd';
const CD_KEY = 'c-778';
await page.keyboard.press('Escape');
await page.evaluate(
    ([c, kids, def]) => {
        window.__auraShot.writes(true);
        window.__auraShot.groupDefs({ [def]: kids });
        window.__auraShot.showWidgets(c, { editMode: false });
    },
    [
        cards.map((c) => ({ ...c, id: `${c.id}-cd`, options: { defId: CD_DEF } })),
        [
            {
                id: 'child-cd',
                type: 'countdown',
                title: 'Laufzeit',
                datapoint: '',
                gridPos: { x: 0, y: 0, w: 12, h: 8 },
                options: { stateBaseId: `aura.0.countdowns.${CD_KEY}`, targetDp: '{{dp}}', durationSec: 600 },
            },
        ],
        CD_DEF,
    ],
);
await page.waitForTimeout(1500);
{
    const writes = (await page.evaluate(() => window.__auraShot.writes()))
        .filter((w) => /\.countdowns\.[^.]+\.config$/.test(w.id))
        .map((w) => ({ key: w.id.split('.')[3], payload: JSON.parse(w.val) }));
    const keys = new Map(writes.map((w) => [w.payload.targetDp, w.key]));
    const ka = keys.get('test.dev.a.1.SET');
    const kb = keys.get('test.dev.b.1.SET');
    check(
        'countdown: each card under its own key',
        !!ka && !!kb && ka !== kb && [ka, kb].every((k) => k.startsWith(`${CD_KEY}_`)),
        JSON.stringify(writes.map((w) => [w.key, w.payload.targetDp])),
    );
    check(
        'countdown: nothing under the shared base key',
        writes.every((w) => w.key !== CD_KEY),
    );
    // Let the adapter "report" idle so the controls arm, then start card a only.
    await page.evaluate(
        ([a, b]) => {
            const m = {
                [`aura.0.countdowns.${a}.state`]: { val: 'idle' },
                [`aura.0.countdowns.${b}.state`]: { val: 'idle' },
            };
            window.__auraShot.mockServerState(m);
            window.__auraShot.mock(m);
            window.__auraShot.writes(true);
        },
        [ka, kb],
    );
    await page.waitForTimeout(400);
    await page.locator('[data-aura-widget="w-card-a-cd"] button[aria-label="Start"]').first().click();
    await page.waitForTimeout(400);
    const cmds = (await page.evaluate(() => window.__auraShot.writes())).filter((w) => w.id.endsWith('.cmd'));
    check(
        'countdown: Start in card a commands device a only',
        cmds.length === 1 && cmds[0].id === `aura.0.countdowns.${ka}.cmd`,
        JSON.stringify(cmds),
    );
}

await page.screenshot({ path: process.env.SHOT ?? 'node_modules/.cache/timer-shared-template.png' });
check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
