// Lost ioBroker connection: the dashboard must stop pretending its values are live.
//
//   AURA_BASE=http://localhost:5174 node tools/tests/connection-lost.mjs
//
// The harness ignores the real (always dead) socket, so `__auraShot.connectionLost`
// fakes the outage. Checks:
//   - connected: no banner, no data-aura-offline, Statusübersicht says "Alles in Ordnung"
//   - lost: banner, page marked offline, widgets faded, Statusübersicht "Status unbekannt"
//     with a "?" chip instead of "OK" — also with showAllClear off
//   - back: everything returns to the connected look
/* global window, document, getComputedStyle */
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const SHOTS = process.env.AURA_SHOTS ?? '';
const NS = 'aura.0';
const BAT = 'hm-rpc.1.0020DA499B8F41.0.LOW_BAT';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` - ${detail}` : ''}`);
};

const OBJECTS = {
    state: [
        {
            id: BAT,
            value: {
                _id: BAT,
                type: 'state',
                common: { name: 'Golf LOW_BAT', role: 'indicator.lowbat', type: 'boolean', read: true, write: false },
                native: {},
            },
        },
    ],
    device: [
        { id: 'hm-rpc.1.0020DA499B8F41', value: { _id: 'x', type: 'device', common: { name: 'Golf' }, native: {} } },
    ],
};

const browser = await chromium.launch();
const pageErrors = [];

async function open(options = {}) {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 600 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 90000 });
    await page.evaluate(
        ([objects, serverState]) => {
            const s = window.__auraShot;
            s.captureWrites(true);
            s.mockObjectView(objects);
            s.mockServerState(serverState);
            s.mock(serverState);
        },
        [OBJECTS, { [BAT]: false, [`${NS}.status.battery.list`]: '[]', [`${NS}.status.battery.sources`]: '{}' }],
    );
    await page.evaluate(
        (opts) =>
            window.__auraShot.showWidgets([
                {
                    id: 'w-status',
                    type: 'statusoverview',
                    title: 'Batterien',
                    datapoint: '',
                    layout: 'default',
                    gridPos: { x: 0, y: 0, w: 4, h: 6 },
                    options: {
                        catWindow: false,
                        catLight: false,
                        catUnreach: false,
                        catAlarm: false,
                        batteryTypeEnabled: false,
                        ...opts,
                    },
                },
            ]),
        options,
    );
    await page.waitForTimeout(1500);
    return { ctx, page };
}

const look = (page) =>
    page.evaluate(() => {
        const w = document.querySelector('.aura-widget');
        const cs = w ? getComputedStyle(w) : null;
        return {
            offline: document.querySelector('[data-aura-app="frontend"]')?.hasAttribute('data-aura-offline') ?? null,
            banner: document.querySelector('.aura-offline-banner')?.textContent ?? null,
            opacity: cs ? Number(cs.opacity) : null,
            filter: cs?.filter ?? null,
            text: w?.textContent ?? '',
            chip: w?.querySelector('span.rounded-full')?.textContent ?? '',
        };
    });

{
    const { ctx, page } = await open();
    const a = await look(page);
    check('connected: no banner', a.banner === null, JSON.stringify(a));
    check('connected: page not marked offline', a.offline === false, String(a.offline));
    check('connected: widget not faded', a.opacity === 1 && a.filter === 'none', `${a.opacity} ${a.filter}`);
    check('connected: all clear', a.text.includes('Alles in Ordnung') && a.chip.includes('OK'), a.text);

    await page.evaluate(() => window.__auraShot.connectionLost(true));
    await page.waitForTimeout(600);
    const b = await look(page);
    if (SHOTS) {
        await page.screenshot({ path: `${SHOTS}/connection-lost.png` });
    }
    check('lost: banner shown', !!b.banner && b.banner.includes('Keine Verbindung'), String(b.banner));
    check('lost: page marked offline', b.offline === true);
    check('lost: widget faded', b.opacity < 1 && b.filter.includes('grayscale'), `${b.opacity} ${b.filter}`);
    check(
        'lost: status unknown instead of all clear',
        b.text.includes('Status unbekannt') && !b.text.includes('Alles in Ordnung'),
        b.text,
    );
    check('lost: chip says ? not OK', b.chip.includes('?') && !b.chip.includes('OK'), b.chip);

    await page.evaluate(() => window.__auraShot.connectionLost(false));
    await page.waitForTimeout(600);
    const c = await look(page);
    check('back: banner gone', c.banner === null);
    check('back: all clear again', c.text.includes('Alles in Ordnung') && c.opacity === 1, c.text);
    await ctx.close();
}

{
    const { ctx, page } = await open({ showAllClear: false });
    await page.evaluate(() => window.__auraShot.connectionLost(true));
    await page.waitForTimeout(600);
    const d = await look(page);
    check('showAllClear off: unknown still shown', d.text.includes('Status unbekannt'), d.text);
    await ctx.close();
}

await browser.close();
check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
