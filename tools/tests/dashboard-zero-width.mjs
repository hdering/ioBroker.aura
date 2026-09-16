// A zero-width measurement must never reach the layout decision (#636).
//
//   node tools/tests/dashboard-zero-width.mjs      (npm run test:zero-width)
//
// Dashboard measures its scroll container and picks a layout from the result:
// below `mobileBreakpoint` the single-column stack, otherwise the grid. The
// catch is that the measured element lives INSIDE the branch it selects, so the
// measurement and the decision feed each other. A zero therefore does not just
// blank the tab (which the callback ref was already written to avoid) — it
// switches the branch, mounting a different scroller, which is measured, which
// switches it back.
//
// Reported from a phone that sat in exactly that cycle: 342 DOM changes a second
// against 2/s on a healthy device, 14 fps, 22 long tasks, and icons that were
// loaded and cached but never in the DOM, because the subtree holding them was
// rebuilt 27 times a second before Iconify could finish.
//
// The test drives it at the source: every ResizeObserver the app creates is
// wrapped, so the zero can be delivered on purpose instead of waited for. That
// makes the failure deterministic rather than device-specific — with the guard
// removed this test reports churn in the hundreds, with it in single digits.
//
// Runs against a vite server pointed at a dead address: no ioBroker needed, and
// the layout question does not depend on the data.
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const VITE_PORT = 5399;
const BASE = `http://localhost:${VITE_PORT}`;
const OFFLINE_TARGET = 'http://127.0.0.1:9';
/** Idle churn is ~2/s; the reported device sat at 342/s. Anything above this is
 *  the cycle, not normal rendering. */
const CHURN_LIMIT = 40;

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

/** Hand every ResizeObserver the app creates to the test, and keep the real one
 *  underneath so the page still behaves normally. */
const WRAP_RESIZE_OBSERVER = () => {
    const Native = window.ResizeObserver;
    window.__ros = [];
    window.ResizeObserver = class {
        constructor(cb) {
            this.cb = cb;
            this.inner = new Native(cb);
            window.__ros.push(this);
        }
        observe(el) {
            this.el = el;
            this.inner.observe(el);
        }
        unobserve(el) {
            this.inner.unobserve(el);
        }
        disconnect() {
            this.inner.disconnect();
        }
    };
    // Deliver a zero-width reading to whatever is watching the scroll container.
    window.__zeroWidth = () => {
        let n = 0;
        for (const r of window.__ros) {
            if (r.el && String(r.el.className).includes('aura-scroll')) {
                r.cb([{ target: r.el, contentRect: { width: 0, height: 0 } }]);
                n++;
            }
        }
        return n;
    };
};

/** DOM changes over two seconds, while `during` runs. */
const MEASURE_CHURN = (zeros) =>
    new Promise((resolve) => {
        let n = 0;
        const mo = new MutationObserver((records) => (n += records.length));
        mo.observe(document.body, { childList: true, subtree: true, attributes: true });
        const iv = zeros ? setInterval(() => window.__zeroWidth(), 16) : null;
        setTimeout(() => {
            if (iv) clearInterval(iv);
            mo.disconnect();
            resolve(n);
        }, 2000);
    });

let vite;
const browser = await chromium.launch();

try {
    vite = await startVite(OFFLINE_TARGET);
    const ctx = await browser.newContext({
        viewport: { width: 360, height: 641 },
        deviceScaleFactor: 3,
        hasTouch: true,
    });
    const page = await ctx.newPage();
    await page.addInitScript(WRAP_RESIZE_OBSERVER);
    await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.aura-scroll', { timeout: 30000 });
    await page.waitForTimeout(3000);

    const observed = await page.evaluate(() => window.__zeroWidth.length !== undefined && window.__ros.length);
    check('the scroll container is observed at all', observed > 0, `${observed} observers`);
    const reachable = await page.evaluate(() => window.__zeroWidth());
    check('a zero reading can be delivered', reachable > 0, `${reachable} on .aura-scroll`);

    const idle = await page.evaluate(MEASURE_CHURN, false);
    check('an untouched dashboard is quiet', idle <= CHURN_LIMIT, `${idle} DOM changes / 2 s`);

    const mounted = () => page.evaluate(() => document.querySelectorAll('.aura-scroll').length);
    const before = await mounted();

    // The real test: keep delivering zeros for two seconds.
    const stormed = await page.evaluate(MEASURE_CHURN, true);
    check(
        'zero-width readings do not start a rebuild cycle',
        stormed <= CHURN_LIMIT,
        `${stormed} DOM changes / 2 s (idle ${idle}, limit ${CHURN_LIMIT})`,
    );
    check('the tab stays mounted through them', (await mounted()) === before, `${before} → ${await mounted()}`);

    await page.waitForTimeout(500);
    check('and it is still quiet afterwards', (await page.evaluate(MEASURE_CHURN, false)) <= CHURN_LIMIT);
    await ctx.close();
} finally {
    await browser.close();
    if (vite) await vite.stop();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
