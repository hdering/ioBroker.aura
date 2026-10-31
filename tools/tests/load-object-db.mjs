// Measures what a widget waits for on a fresh page load (#882): when its datapoint
// values arrive, and which bulk object reads (getObjectView) go over the socket with
// them — how big they are and whether the values have to queue behind them.
//
//   npx vite --host 127.0.0.1 --port 5231 --strictPort   (proxy aimed at a real instance)
//   AURA_BASE=http://127.0.0.1:5231 node tools/tests/load-object-db.mjs [--reps 3] [--only thermostat,list]
//
// Every run is a fresh browser context, so the module-level datapoint cache and the
// state cache are empty. The network is throttled (Chrome DevTools presets) only after
// the app is up and its startup traffic (the config!) is through: the dev server ships
// hundreds of modules that a real build bundles, and neither is what this measures.
//
// Mobile: Chrome's own throttling does not delay WebSocket frames and stalls big ones,
// so for realistic numbers route the dev server through tools/tests/net-throttle-proxy.mjs
// (AURA_IOBROKER_URL=https://127.0.0.1:9443) and pass --proxy http://127.0.0.1:9444 —
// the profiles are then switched on the proxy instead of in the browser.
//
// Not part of `npm test` — it needs a live instance and reports numbers, not pass/fail.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://127.0.0.1:5231';
const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : fallback;
};
const REPS = Number(arg('reps', 3));
// Control port of net-throttle-proxy.mjs; unset = throttle in the browser (CDP).
const PROXY = arg('proxy', '');
const LABEL = arg('label', PROXY ? 'proxy' : '');
const setProxyProfile = (name) => fetch(`${PROXY}/profile?name=${name}`).then((r) => r.text());
const ONLY = arg('only', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
const ONLY_PROFILES = arg('profiles', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

// Chrome DevTools throttling presets (latency incl. the DevTools adjustment factor).
const PROFILES = {
    lan: null,
    'fast-4g': {
        offline: false,
        latency: 165,
        downloadThroughput: (9_000_000 / 8) | 0,
        uploadThroughput: (1_500_000 / 8) | 0,
    },
    'slow-4g': {
        offline: false,
        latency: 562.5,
        downloadThroughput: (1_600_000 / 8) | 0,
        uploadThroughput: (750_000 / 8) | 0,
    },
};

// Datapoints of the test instance (.140). Override with AURA_LOAD_DPS=id1,id2,…
const DPS = (
    process.env.AURA_LOAD_DPS ??
    [
        'hm-rpc.1.000A95699C7334.1.SET_POINT_TEMPERATURE',
        'hm-rpc.1.000A95699C7334.1.ACTUAL_TEMPERATURE',
        '0_userdata.0.visTest.sensor.tempLiving',
        '0_userdata.0.visTest.sensor.tempOut',
        '0_userdata.0.visTest.bool.lightLiving',
    ].join(',')
).split(',');

const base = { layout: 'default', gridPos: { x: 0, y: 0, w: 6, h: 12 } };
const SCENARIOS = {
    thermostat: [
        {
            ...base,
            id: 'w-load-th',
            type: 'thermostat',
            title: 'Thermostat',
            datapoint: DPS[0],
            options: { actualDatapoint: DPS[1] },
        },
    ],
    list: [
        {
            ...base,
            id: 'w-load-list',
            type: 'list',
            title: 'Liste',
            datapoint: '',
            options: { entries: DPS.map((id) => ({ id })) },
        },
    ],
    autolist: [
        {
            ...base,
            id: 'w-load-al',
            type: 'autolist',
            title: 'Autoliste',
            datapoint: '',
            options: { entries: DPS.map((id) => ({ id })) },
        },
    ],
    // Discovery widget: it genuinely needs the whole object list, but must not hold
    // back the values of the widgets next to it.
    statusoverview: [
        {
            ...base,
            id: 'w-load-th',
            type: 'thermostat',
            title: 'Thermostat',
            datapoint: DPS[0],
            options: { actualDatapoint: DPS[1] },
        },
        {
            ...base,
            id: 'w-load-so',
            type: 'statusoverview',
            title: 'Status',
            datapoint: '',
            gridPos: { x: 6, y: 0, w: 6, h: 20 },
            options: {},
        },
    ],
};

async function run(scenario, profileName) {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    // Socket drops while measuring (the app logs them) — a value that only arrives after
    // a reconnect is a different story than one that queued.
    const drops = [];
    page.on('console', (m) => {
        if (/ disconnected /.test(m.text())) drops.push(Date.now());
    });
    // Bulk reads fired before the harness is up (startup path) are counted from the raw frames.
    let startupViews = 0;
    let startupBytes = 0;
    let lastFrame = Date.now();
    let phase = 'startup';
    // CDP rather than page.on('websocket'): the latter misses the socket the app opens.
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    // Requests awaiting their answer (@iobroker/ws frames: [3, id, name, args]). A big
    // answer queued on a throttled link sends no frame for many seconds, so silence on
    // the socket alone does not mean the startup traffic is through.
    const awaiting = new Set();
    let answered = 0;
    const callbackId = (payload) => /^\[3,(\d+),/.exec(payload)?.[1];
    cdp.on('Network.webSocketFrameSent', (e) => {
        lastFrame = Date.now();
        const id = callbackId(e.response.payloadData);
        if (id) awaiting.add(id);
        if (phase === 'startup' && e.response.payloadData.includes('"getObjectView"')) startupViews++;
    });
    cdp.on('Network.webSocketFrameReceived', (e) => {
        lastFrame = Date.now();
        const id = callbackId(e.response.payloadData);
        if (id) {
            awaiting.delete(id);
            answered++;
        }
        if (phase === 'startup') startupBytes += e.response.payloadData.length;
    });
    await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 60000 });
    // Let the startup traffic (config, theme, prefetch) finish first: on a throttled link
    // it would otherwise sit in front of the measured requests.
    const settleStart = Date.now();
    // The harness is ready before the socket connects — wait for traffic to start, too.
    while ((answered === 0 || awaiting.size > 0 || Date.now() - lastFrame < 2000) && Date.now() - settleStart < 180000)
        await page.waitForTimeout(200);
    const startupMs = Date.now() - settleStart;
    phase = 'measure';

    // Wrap emit on the live socket: every request gets its send and answer time, the
    // bulk reads also their answer size.
    await page.evaluate(async () => {
        // Import exactly the URL the app loaded: after an HMR update it carries ?t=…,
        // and the bare path would be a second module instance with its own socket.
        const url =
            performance
                .getEntriesByType('resource')
                .map((e) => e.name)
                .find((n) => n.includes('/src-vis/hooks/useIoBroker.ts')) ?? '/src-vis/hooks/useIoBroker.ts';
        const io = await import(url);
        const s = io.getSocket();
        const log = (window.__loadLog = []);
        const orig = s.emit.bind(s);
        s.emit = (name, ...args) => {
            const cb = typeof args[args.length - 1] === 'function' ? args.pop() : null;
            if (!cb) return orig(name, ...args);
            const rec = {
                name,
                arg: name === 'getObjectView' ? `${args[1]} ${args[2]?.startkey ?? ''}` : String(args[0]),
                sent: performance.now(),
            };
            log.push(rec);
            return orig(name, ...args, (...res) => {
                rec.ack = performance.now();
                if (name === 'getObjectView') {
                    try {
                        rec.bytes = JSON.stringify(res[1] ?? null).length;
                    } catch {
                        rec.bytes = -1;
                    }
                }
                cb(...res);
            });
        };
    });

    if (PROXY) await setProxyProfile(profileName);
    else if (PROFILES[profileName]) await cdp.send('Network.emulateNetworkConditions', PROFILES[profileName]);

    const t0 = await page.evaluate((widgets) => {
        const t = performance.now();
        window.__auraShot.showWidgets(widgets);
        return t;
    }, SCENARIOS[scenario]);

    // Wait until every request is answered and the socket has been quiet for 2 s.
    const deadline = Date.now() + 120000;
    let quietSince = Date.now();
    let lastCount = -1;
    while (Date.now() < deadline) {
        const { count, pending } = await page.evaluate(() => ({
            count: window.__loadLog.length,
            pending: window.__loadLog.filter((r) => r.ack === undefined).length,
        }));
        if (count !== lastCount || pending > 0) {
            lastCount = count;
            quietSince = Date.now();
        } else if (Date.now() - quietSince > 2000) break;
        await page.waitForTimeout(100);
    }
    const log = await page.evaluate(() => window.__loadLog);
    await browser.close();
    if (PROXY) await setProxyProfile('lan');

    const rel = (t) => (t === undefined ? null : Math.round(t - t0));
    const dpSet = new Set(
        SCENARIOS[scenario]
            .flatMap((w) => [w.datapoint, w.options?.actualDatapoint, ...(w.options?.entries ?? []).map((e) => e.id)])
            .filter(Boolean),
    );
    const values = log.filter((r) => r.name === 'getState' && dpSet.has(r.arg));
    const views = log.filter((r) => r.name === 'getObjectView');
    return {
        startupViews,
        startupKB: Math.round(startupBytes / 1024),
        startupMs,
        valuesLast: values.length ? Math.max(...values.map((r) => rel(r.ack))) : null,
        valuesCount: values.length,
        views: views.length,
        viewBytes: views.reduce((n, r) => n + (r.bytes ?? 0), 0),
        viewsDone: views.length ? Math.max(...views.map((r) => rel(r.ack))) : null,
        objects: log.filter((r) => r.name === 'getObject').length,
        drops: drops.length,
        viewList: views.map(
            (r) => `${r.arg.trim()}:${Math.round((r.bytes ?? 0) / 1024)}kB@${rel(r.sent)}→${rel(r.ack)}`,
        ),
    };
}

const median = (xs) => {
    const v = xs.filter((x) => x !== null).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : null;
};

const rows = [];
for (const profile of Object.keys(PROFILES).filter((p) => !ONLY_PROFILES.length || ONLY_PROFILES.includes(p))) {
    for (const scenario of Object.keys(SCENARIOS).filter((s) => !ONLY.length || ONLY.includes(s))) {
        const runs = [];
        for (let i = 0; i < REPS; i++) runs.push(await run(scenario, profile));
        const r = {
            profile: LABEL ? `${LABEL}:${profile}` : profile,
            scenario,
            valuesMs: median(runs.map((x) => x.valuesLast)),
            values: runs[0].valuesCount,
            views: runs[0].views,
            viewKB: Math.round(median(runs.map((x) => x.viewBytes)) / 1024),
            viewsDoneMs: median(runs.map((x) => x.viewsDone)),
            getObject: runs[0].objects,
            drops: runs.reduce((n, x) => n + x.drops, 0),
            startupViews: runs[0].startupViews,
            startupKB: runs[0].startupKB,
        };
        rows.push(r);
        console.log(JSON.stringify(r), '\n   ', runs[0].viewList.join('  '));
    }
}
console.table(rows);
