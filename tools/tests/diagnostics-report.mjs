// Verifies the on-device diagnostics report (#636).
//
//   node tools/tests/diagnostics-report.mjs      (npm run test:diagnostics)
//
// The overlay exists because #636 can only be answered by the device that has
// the problem: a dashboard that redraws itself forever on one phone and is fine
// everywhere else. Three fixes landed blind before it, so the report itself has
// to be trustworthy — a wrong number here sends the next fix into the same wall.
//
// Two properties are guarded:
//
//   * The report NAMES the source of the DOM churn. The first device report came
//     back with 469 DOM changes a second (2/s is healthy) and nothing to look at,
//     which is a measurement that proves a bug without locating it. A synthetic
//     widget card is mutated during the measuring window and has to show up by
//     type and id in "changed most".
//
//   * The socket lines cannot lie by omission. The WebSocket counters only work
//     when `?diag=1` was in the URL before the socket opened; append the flag to
//     a page that is already running — which is the useful thing to do with a
//     dashboard that has been degrading for hours — and every counter reads 0,
//     exactly like a device that never connected. The report must say which of
//     the two it is, and read the live socket state either way.
//
// Runs against a vite server pointed at a dead address, so the socket library
// genuinely never arrives: that is also the state the report has to describe
// correctly ("library MISSING", "inert stub"), and it needs no ioBroker.
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const VITE_PORT = 5398;
const BASE = `http://localhost:${VITE_PORT}`;
// Nothing listens there: vite's proxy fails fast, the app boots offline and
// /socket.io/socket.io.js never loads.
const OFFLINE_TARGET = 'http://127.0.0.1:9';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

function startVite(target) {
    // Spawn vite's bin with this node rather than through npx: Node on Windows
    // refuses to spawn a .cmd shim without a shell (EINVAL).
    const bin = path.resolve('node_modules/vite/bin/vite.js');
    const child = spawn(process.execPath, [bin, '--port', String(VITE_PORT), '--strictPort'], {
        env: { ...process.env, AURA_IOBROKER_URL: target },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    child.stdout.on('data', (d) => (log += d));
    child.stderr.on('data', (d) => (log += d));
    return new Promise((resolve, reject) => {
        const deadline = Date.now() + 60000;
        const poll = setInterval(() => {
            if (/ready in/.test(log)) {
                clearInterval(poll);
                resolve({
                    stop: () =>
                        new Promise((done) => {
                            child.once('exit', done);
                            child.kill();
                            setTimeout(done, 3000);
                        }),
                });
            } else if (child.exitCode !== null || Date.now() > deadline) {
                clearInterval(poll);
                reject(new Error(`vite did not start:\n${log}`));
            }
        }, 250);
    });
}

const PHONE = { viewport: { width: 360, height: 641 }, deviceScaleFactor: 3, hasTouch: true };

/** The overlay builds its first report 3 s after mount and then measures for 2 s. */
async function waitForReport(page) {
    await page.waitForSelector('pre', { timeout: 20000 });
    await page.waitForFunction(() => (document.querySelector('pre')?.textContent || '').includes('— tabs —'), null, {
        timeout: 30000,
    });
    return page.evaluate(() => document.querySelector('pre').textContent);
}

let vite;
const browser = await chromium.launch();

try {
    vite = await startVite(OFFLINE_TARGET);

    // ── 1. flag in the URL from the first byte ───────────────────────────────
    const ctx = await browser.newContext(PHONE);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/?diag=1#/`, { waitUntil: 'load' });
    const first = await waitForReport(page);

    check('overlay reports when ?diag=1 is in the URL', first.includes('— activity —'));
    check('report names the churn source', /changed most: /.test(first));
    check('report splits the changes by kind', /kinds: attr \d+, nodes \d+, text \d+/.test(first));
    check('armed counters are not flagged as blind', !first.includes('NOT MEASURED'));

    // A dead proxy target means the socket library never arrives — the report has
    // to name that instead of showing a quiet, healthy-looking zero.
    check(
        'missing socket library is named',
        /socket now: library MISSING/.test(first) && /OFFLINE/.test(first),
        first.split('\n').find((l) => l.startsWith('socket now:')),
    );
    check('inert stub is called what it is', /inert stub/.test(first), '');

    // ── 2. the churn is attributed to the widget it happens in ───────────────
    // Offline there is no dashboard to mutate, so plant a card that looks like
    // one: blameFor() walks up to the nearest [data-aura-widget], which is
    // exactly the hop under test.
    await page.evaluate(() => {
        const el = document.createElement('div');
        el.setAttribute('data-aura-widget', 'w-test');
        el.setAttribute('data-aura-widget-type', 'mediaplayer');
        el.appendChild(document.createElement('span'));
        document.body.appendChild(el);
    });
    await page.getByRole('button', { name: 'Refresh' }).click();
    await page.waitForFunction(() => (document.querySelector('pre')?.textContent || '').startsWith('measuring'), null, {
        timeout: 10000,
    });
    // Churn inside the card for the whole measuring window: an attribute, a text
    // node, and a subtree that is mounted and thrown away again — the shape a
    // remount loop has.
    await page.evaluate(async () => {
        const el = document.querySelector('[data-aura-widget="w-test"]');
        for (let i = 0; i < 40; i++) {
            el.setAttribute('data-tick', String(i));
            el.firstChild.textContent = String(i);
            const churn = document.createElement('div');
            churn.className = 'aura-churn-probe';
            el.appendChild(churn);
            await new Promise((r) => setTimeout(r, 40));
            churn.remove();
        }
    });
    const blamed = await waitForReport(page);

    check(
        'churn is blamed on the widget it happens in',
        /changed most: mediaplayer #w-test \d+/.test(blamed),
        blamed.split('\n').find((l) => l.includes('changed most')),
    );
    check(
        'the changed attribute is named',
        /kinds: attr \d+ \(data-tick/.test(blamed),
        blamed.split('\n').find((l) => l.includes('kinds:')),
    );
    // An `aura-` class beats the Tailwind utilities beside it, so a subtree that
    // is mounted and discarded can be recognised by name.
    check(
        'the mounted and discarded subtree is named',
        /nodes in: .*div\.aura-churn-probe \d+/.test(blamed) && /nodes out: .*div\.aura-churn-probe \d+/.test(blamed),
        blamed.split('\n').find((l) => l.includes('nodes in:')),
    );
    await ctx.close();

    // ── 3. flag appended to a page that is already running ───────────────────
    const ctx2 = await browser.newContext(PHONE);
    const page2 = await ctx2.newPage();
    await page2.goto(`${BASE}/#/`, { waitUntil: 'load' });
    await page2.waitForTimeout(3000);
    await page2.evaluate(() => {
        location.hash = `${location.hash || '#/'}${location.hash.includes('?') ? '&' : '?'}diag=1`;
    });
    const late = await waitForReport(page2);

    check('overlay opens on a running page without a reload', late.includes('— activity —'));
    check('late start admits the counters are blind', late.includes('NOT MEASURED'));
    check('late start still reads the live socket', /socket now: library/.test(late));
    // The counters that do NOT depend on when the flag was set: a state-change
    // storm and a reconnect loop are the two things a redraw loop is usually
    // blamed on, and a late report could rule out neither.
    check(
        'late start still counts state changes and drops',
        /events since load: \d+ state changes, \d+ connects, \d+ drops/.test(late),
        late.split('\n').find((l) => l.includes('events since load:')),
    );
    await ctx2.close();
} finally {
    await browser.close();
    if (vite) await vite.stop();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
