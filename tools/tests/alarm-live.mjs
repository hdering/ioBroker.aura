// Alarm widget with own datapoints against a REAL (test) instance (#1037):
// live updates of the JSON list and of the per-mode datapoints, and the type each
// write arrives with. Not part of npm test — it needs a dev server proxied to a
// test instance (.iobroker-url) and creates 0_userdata.0.auraAlarmTest.* (re-used on
// the next run; the web socket cannot delete them — iobroker object del on the host).
//
//   npx vite --port 5222      (proxied to the test instance, NOT production)
//   AURA_BASE=http://127.0.0.1:5222 node tools/tests/alarm-live.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const R = '0_userdata.0.auraAlarmTest';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const OBJECTS = {
    state: { type: 'number', role: 'level', write: true, read: true },
    stateStr: { type: 'string', role: 'text', write: true, read: true },
    modes: { type: 'string', role: 'json', write: true, read: true },
    isOff: { type: 'boolean', role: 'indicator', write: true, read: true },
    isNight: { type: 'boolean', role: 'indicator', write: true, read: true },
    cmdNight: { type: 'boolean', role: 'button', write: true, read: true },
    zone: { type: 'boolean', role: 'switch', write: true, read: true },
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 800 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 60000 });

// Own socket for setup, value changes and read-back — independent of the widget.
const ok = await page.evaluate(async () => {
    const s = window.io.connect(location.origin, { path: '/socket.io', forceNew: true });
    window.__t = s;
    return new Promise((res) => {
        s.on('connect', () => res(true));
        setTimeout(() => res(false), 10000);
    });
});
if (!ok) {
    console.log('  FAIL no connection to the instance behind the dev server');
    await browser.close();
    process.exit(1);
}
const emit = (...args) =>
    page.evaluate((a) => new Promise((res) => window.__t.emit(...a, (e, v) => res({ e, v }))), args);
const set = (id, val) => emit('setState', `${R}.${id}`, { val, ack: true });
const get = async (id) => (await emit('getState', `${R}.${id}`)).v;

try {
    for (const [id, common] of Object.entries(OBJECTS)) {
        await emit('setObject', `${R}.${id}`, {
            type: 'state',
            common: { name: `auraAlarmTest ${id}`, ...common },
            native: {},
        });
    }
    await set('state', 0);
    await set('stateStr', 'off');
    await set(
        'modes',
        JSON.stringify([
            { key: 'off', label: 'Aus', disarm: true, writeValue: '0' },
            { key: 'armed', label: 'Scharf', writeValue: '1' },
        ]),
    );
    await set('isOff', true);
    await set('isNight', false);
    await set('zone', false);
    await page.waitForTimeout(800);

    const show = async (id, options) => {
        await page.evaluate(
            ([wid, opts]) =>
                window.__auraShot.showWidgets([
                    {
                        id: wid,
                        type: 'alarm',
                        title: 'Alarm live',
                        datapoint: '',
                        gridPos: { x: 0, y: 0, w: 8, h: 9 },
                        options: opts,
                    },
                ]),
            [id, options],
        );
        await page.waitForTimeout(1500);
        return `.aura-widget-${id}`;
    };
    const texts = (sel) => page.locator(`${sel} .aura-alarm-mode`).allInnerTexts();
    const lit = (sel) => page.locator(`${sel} .aura-alarm-mode[data-active="true"]`).allInnerTexts();
    const waitFor = async (fn, ms = 6000) => {
        const end = Date.now() + ms;
        while (Date.now() < end) {
            if (await fn()) return true;
            await page.waitForTimeout(200);
        }
        return false;
    };
    const up = (a) => a.map((x) => x.trim().toUpperCase()).join(',');

    // ── live JSON list ─────────────────────────────────────────────────────────
    let sel = await show('w-live-json', {
        sourceMode: 'manual',
        stateDp: `${R}.state`,
        modesSource: 'json',
        modesDp: `${R}.modes`,
        zones: [{ key: 'z', label: 'Zone', onOffDp: `${R}.zone` }],
    });
    check('json: buttons from the instance', up(await texts(sel)) === 'AUS,SCHARF', up(await texts(sel)));
    check('json: AUS lit at 0', up(await lit(sel)) === 'AUS', up(await lit(sel)));
    await set('modes', JSON.stringify({ 0: 'Aus', 1: 'Abwesend', 2: 'Nacht' }));
    check(
        'json: changing the datapoint rebuilds the buttons live',
        await waitFor(async () => up(await texts(sel)) === 'AUS,ABWESEND,NACHT'),
        up(await texts(sel)),
    );
    await set('state', 2);
    check(
        'state change lights NACHT live',
        await waitFor(async () => up(await lit(sel)) === 'NACHT'),
        up(await lit(sel)),
    );

    // ── real writes with type fitting ──────────────────────────────────────────
    await page.evaluate(() => window.__auraShot.captureWrites(false));
    await page.locator(`${sel} .aura-alarm-mode`, { hasText: /abwesend/i }).click();
    check(
        'write "1" into a number datapoint arrives as 1',
        await waitFor(async () => (await get('state'))?.val === 1),
        JSON.stringify(await get('state')),
    );
    await page.locator(`${sel} .aura-alarm-zone`).click();
    check(
        'zone click writes boolean true',
        await waitFor(async () => (await get('zone'))?.val === true),
        JSON.stringify(await get('zone')),
    );

    sel = await show('w-live-str', {
        sourceMode: 'manual',
        stateDp: `${R}.stateStr`,
        modes: [
            { key: 'off', label: 'Aus', disarm: true, writeValue: 'off' },
            { key: 'two', label: 'Zwei', writeValue: '2' },
        ],
    });
    await page.locator(`${sel} .aura-alarm-mode`, { hasText: /zwei/i }).click();
    check(
        'write "2" into a string datapoint arrives as "2"',
        await waitFor(async () => (await get('stateStr'))?.val === '2'),
        JSON.stringify(await get('stateStr')),
    );
    check('… and lights its button', await waitFor(async () => up(await lit(sel)) === 'ZWEI'), up(await lit(sel)));

    // ── one boolean per mode ───────────────────────────────────────────────────
    sel = await show('w-live-bool', {
        sourceMode: 'manual',
        modes: [
            {
                key: 'off',
                label: 'Aus',
                disarm: true,
                activeDp: `${R}.isOff`,
                writeDp: `${R}.isOff`,
                writeValue: 'true',
            },
            {
                key: 'night',
                label: 'Nacht',
                activeDp: `${R}.isNight`,
                writeDp: `${R}.cmdNight`,
                writeValue: 'true',
                phase: 'night',
            },
        ],
    });
    check('per mode: AUS lit from its datapoint', up(await lit(sel)) === 'AUS', up(await lit(sel)));
    await page.locator(`${sel} .aura-alarm-mode`, { hasText: /nacht/i }).click();
    check(
        'per mode: command written as boolean',
        await waitFor(async () => (await get('cmdNight'))?.val === true),
        JSON.stringify(await get('cmdNight')),
    );
    await set('isOff', false);
    await set('isNight', true);
    check('per mode: NACHT lit live', await waitFor(async () => up(await lit(sel)) === 'NACHT'), up(await lit(sel)));
    check('per mode: pill follows', /nachtruhe/i.test(await page.locator(`${sel} .aura-alarm-state`).innerText()));
} finally {
    await page.evaluate(() => window.__auraShot.captureWrites(true)).catch(() => {});
    // The web socket may not delete objects (permissionError) — remove them on the host:
    console.log(`  note: test objects stay; remove on the host with  echo y | iobroker object del '${R}.*'  or one by one:`);
    for (const id of Object.keys(OBJECTS)) console.log(`    iobroker object del ${R}.${id}`);
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
