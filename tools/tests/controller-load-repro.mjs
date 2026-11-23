#!/usr/bin/env node
/**
 * Reproduction bench for the js-controller stall after an Aura update (next.1 on the
 * productive host): measures how the frontend's object downloads load the controller.
 *
 * Talks to a REAL ioBroker (default: the test instance in .iobroker-url) through the
 * web adapter's socket, like the Aura frontend does, and measures how long the
 * controller needs to answer a tiny getState while load runs. The controller hosts
 * the objects/states DB (jsonl/file), so its event loop shows in that round trip.
 *
 * Phases (--phase):
 *   probe     object counts + timing of each view the frontend's loadAll() issues
 *   loadall   --clients N concurrent clients each doing loadAll() (6 full views)
 *   fallback  aura.0 stopped, then what StatusOverviewWidget does without an adapter
 *             (sendTo statusDiscover, 15 s timeout, fallback → loadAll) on N clients;
 *             aura.0 is started again afterwards
 *   inflate   --count N dummy states under 0_userdata.0.loadtest (prod-sized DB)
 *   cleanup   removes 0_userdata.0.loadtest.*
 *
 * Usage: node tools/tests/controller-load-repro.mjs --phase probe|loadall|fallback|inflate|cleanup
 *        [--clients 4] [--count 50000] [--url https://192.168.188.140:8082] [--instance aura.0]
 *
 * NEVER against a productive system: fallback stops aura.0, inflate writes objects.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (name, def) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : def;
};
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../..');
const defaultUrl = (() => {
    try {
        return fs.readFileSync(path.join(root, '.iobroker-url'), 'utf8').trim();
    } catch {
        return 'https://192.168.188.140:8082';
    }
})();
const URL_ = arg('url', defaultUrl);
const PHASE = arg('phase', 'probe');
const CLIENTS = Number(arg('clients', '4'));
const COUNT = Number(arg('count', '50000'));
const INSTANCE = arg('instance', 'aura.0');
const LOADTEST = '0_userdata.0.loadtest';
if (/192\.168\.188\.40\b|dering-online/.test(URL_)) {
    console.error('refusing to run against the productive system');
    process.exit(2);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ ignoreHTTPSErrors: true });

/** A page with a socket of its own, connected to web's socket like the frontend. */
async function openClient() {
    const page = await ctx.newPage();
    await page.goto(`${URL_}/lib/js/socket.io.js`).catch(() => {});
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ url: `${URL_}/lib/js/socket.io.js` });
    await page.evaluate(async (origin) => {
        const s = window.io.connect(origin, { path: '/socket.io', transports: ['websocket'] });
        window.__s = s;
        await new Promise((res, rej) => {
            const t = setTimeout(() => rej(new Error('connect timeout')), 15000);
            s.on('connect', () => {
                clearTimeout(t);
                res();
            });
        });
        window.__call = (...a) =>
            new Promise((res) => {
                const t0 = performance.now();
                const to = setTimeout(() => res({ err: 'no callback', ms: performance.now() - t0 }), 120000);
                window.__s.emit(...a, (err, r) => {
                    clearTimeout(to);
                    res({ err, r, ms: performance.now() - t0 });
                });
            });
        window.__view = (type, startkey = '', endkey = '香') =>
            window.__call('getObjectView', 'system', type, { startkey, endkey });
        // Exactly what hooks/useDatapointList.ts loadAll() asks for.
        window.__loadAll = async () => {
            const t0 = performance.now();
            const parts = await Promise.all([
                window.__view('state'),
                window.__view('state', 'alias.', 'alias.香'),
                window.__view('channel'),
                window.__view('device'),
                window.__view('enum', 'enum.', 'enum.香'),
                window.__view('instance', 'system.adapter.', 'system.adapter.香'),
            ]);
            return {
                ms: Math.round(performance.now() - t0),
                rows: parts.map((p) => (p.r && p.r.rows ? p.r.rows.length : -1)).join('/'),
                mb: +(parts.reduce((n, p) => n + JSON.stringify(p.r || {}).length, 0) / 1e6).toFixed(1),
            };
        };
    }, URL_);
    return page;
}

/** Round trip of a tiny getState every 250 ms on its own socket = controller responsiveness. */
async function startLatencyProbe(page, hostId) {
    await page.evaluate((id) => {
        window.__lat = [];
        window.__probe = setInterval(async () => {
            const t = Date.now();
            const r = await window.__call('getState', id);
            window.__lat.push({ t, ms: Math.round(r.ms) });
        }, 250);
    }, `${hostId}.alive`);
}
async function stopLatencyProbe(page) {
    return page.evaluate(() => {
        clearInterval(window.__probe);
        return window.__lat;
    });
}
function summarize(lat, label) {
    if (!lat.length) return console.log(`${label}: no samples`);
    const ms = lat.map((l) => l.ms).sort((a, b) => a - b);
    const q = (p) => ms[Math.min(ms.length - 1, Math.floor(p * ms.length))];
    console.log(`${label}: n=${ms.length} p50=${q(0.5)}ms p95=${q(0.95)}ms max=${ms[ms.length - 1]}ms`);
    const worst = [...lat].sort((a, b) => b.ms - a.ms).slice(0, 5);
    console.log(`  worst: ${worst.map((w) => `${new Date(w.t).toISOString().slice(11, 23)} ${w.ms}ms`).join(', ')}`);
}

const probe = await openClient();
const hosts = await probe.evaluate(() => window.__view('host', 'system.host.', 'system.host.香'));
const hostId = hosts.r?.rows?.[0]?.id || 'system.host.unknown';
console.log(`target ${URL_}, host ${hostId}`);

/** extendObject has no callback over web's socket - read, change, setObject. */
async function setEnabled(id, enabled) {
    return probe.evaluate(
        async ({ id, enabled }) => {
            const obj = (await window.__call('getObject', `system.adapter.${id}`)).r;
            obj.common.enabled = enabled;
            return window.__call('setObject', obj._id, obj);
        },
        { id, enabled },
    );
}
async function hostStats() {
    const st = await probe.evaluate(
        (h) => window.__call('getStates', [`${h}.memRss`, `${h}.cpu`, `${h}.memHeapUsed`]),
        hostId,
    );
    return Object.fromEntries(Object.entries(st.r || {}).map(([k, v]) => [k.split('.').pop(), v?.val]));
}

if (PHASE === 'probe') {
    for (const t of ['state', 'channel', 'device', 'folder', 'enum', 'instance', 'meta']) {
        const r = await probe.evaluate((type) => window.__view(type), t);
        console.log(
            `view ${t.padEnd(8)} rows=${String(r.r?.rows?.length ?? -1).padStart(7)} ${Math.round(r.ms)} ms${r.err ? ` err=${r.err}` : ''}`,
        );
    }
    const la = await probe.evaluate(() => window.__loadAll());
    console.log(`loadAll ${la.ms} ms, rows ${la.rows}, ~${la.mb} MB JSON`);
    console.log('host', JSON.stringify(await hostStats()));
}

if (PHASE === 'inflate') {
    // Realistic-ish state objects (an hm-rpc datapoint is ~600 bytes of JSON).
    const t0 = Date.now();
    const BATCH = 200;
    for (let i = 0; i < COUNT; i += BATCH) {
        await probe.evaluate(
            async ({ base, from, n }) => {
                const jobs = [];
                for (let k = from; k < from + n; k++) {
                    const dev = Math.floor(k / 20);
                    const id = `${base}.dev${dev}.ch${k % 4}.dp${k}`;
                    jobs.push(
                        window.__call('setObject', id, {
                            _id: id,
                            type: 'state',
                            common: {
                                name: `Loadtest device ${dev} channel ${k % 4} datapoint ${k}`,
                                type: 'number',
                                role: k % 7 === 0 ? 'value.battery' : 'value',
                                unit: '%',
                                min: 0,
                                max: 100,
                                read: true,
                                write: false,
                                desc: 'Synthetic object for tools/tests/controller-load-repro.mjs',
                            },
                            native: { address: `LT${dev}:${k % 4}`, param: `DP_${k}`, control: 'NONE', tab_order: k },
                        }),
                    );
                }
                await Promise.all(jobs);
            },
            { base: LOADTEST, from: i, n: Math.min(BATCH, COUNT - i) },
        );
        if ((i / BATCH) % 25 === 0) console.log(`  ${i + BATCH} / ${COUNT}`);
    }
    console.log(`inflated ${COUNT} objects in ${Math.round((Date.now() - t0) / 1000)} s`);
    console.log('host', JSON.stringify(await hostStats()));
}

if (PHASE === 'cleanup') {
    const view = await probe.evaluate((b) => window.__view('state', `${b}.`, `${b}.香`), LOADTEST);
    const ids = (view.r?.rows || []).map((r) => r.id);
    console.log(`deleting ${ids.length} objects`);
    for (let i = 0; i < ids.length; i += 200) {
        const res = await probe.evaluate(
            (chunk) => Promise.all(chunk.map((id) => window.__call('delObject', id))),
            ids.slice(i, i + 200),
        );
        if (i === 0 && res[0]?.err) {
            console.log(`delObject refused: ${res[0].err}`);
            break;
        }
    }
}

if (PHASE === 'loadall' || PHASE === 'fallback') {
    const clients = [];
    for (let i = 0; i < CLIENTS; i++) clients.push(await openClient());
    await startLatencyProbe(probe, hostId);
    await new Promise((r) => setTimeout(r, 3000));
    summarize(await stopLatencyProbe(probe), 'baseline');
    console.log('host before', JSON.stringify(await hostStats()));
    await startLatencyProbe(probe, hostId);

    if (PHASE === 'fallback') {
        console.log(`stopping ${INSTANCE}`);
        await setEnabled(INSTANCE, false);
        await new Promise((r) => setTimeout(r, 3000));
        const alive = await probe.evaluate((id) => window.__call('getState', `system.adapter.${id}.alive`), INSTANCE);
        console.log(`${INSTANCE}.alive = ${alive.r?.val}`);
    }
    const t0 = Date.now();
    const results = await Promise.all(
        clients.map((c) =>
            c.evaluate(
                async ({ fallback, ns }) => {
                    if (!fallback) return window.__loadAll();
                    const t = performance.now();
                    const sent = await Promise.race([
                        new Promise((res) =>
                            window.__s.emit('sendTo', ns, 'statusDiscover', { opts: {}, overrides: {} }, (r) => res(r)),
                        ),
                        new Promise((res) => setTimeout(() => res('__timeout'), 15000)),
                    ]);
                    const reply = `${sent === '__timeout' ? 'timeout' : JSON.stringify(sent).slice(0, 60)} after ${Math.round(performance.now() - t)} ms`;
                    // StatusOverviewWidget.discoverOnAdapter: anything without ok+candidates → own discovery.
                    if (sent && typeof sent === 'object' && sent.ok && Array.isArray(sent.candidates)) {
                        return { reply, fallback: false };
                    }
                    return { reply, fallback: true, ...(await window.__loadAll()) };
                },
                { fallback: PHASE === 'fallback', ns: INSTANCE },
            ),
        ),
    );
    console.log(`clients done after ${Date.now() - t0} ms`);
    results.forEach((r, i) => console.log(`  client ${i}: ${JSON.stringify(r)}`));
    await new Promise((r) => setTimeout(r, 2000));
    summarize(await stopLatencyProbe(probe), 'under load');
    console.log('host after', JSON.stringify(await hostStats()));

    if (PHASE === 'fallback') {
        console.log(`starting ${INSTANCE} again`);
        await setEnabled(INSTANCE, true);
    }
}

await browser.close();
