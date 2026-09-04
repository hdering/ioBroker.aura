// Verifies that the boot splash explains itself when ioBroker does not answer.
//
//   node tools/tests/boot-splash-offline.mjs        (npm run test:boot-splash)
//
// The failure this guards against: index.html loads socket.io.js with a
// parser-blocking <script>. When the ioBroker host completes the TCP handshake
// but never sends a response — a hung js-controller, an overloaded box — that
// request hangs forever. main.tsx never executes, so no application code can
// report anything, and the user stares at a spinner reading "Aura wird
// geladen…" with no clue that the backend is the problem.
//
// This run is self-contained: it starts a black-hole TCP server (accepts, then
// stays silent), points a throwaway Vite dev server at it via
// AURA_IOBROKER_URL, and checks that the splash turns into a diagnosis. The
// developer's own .iobroker-url is never touched. A second pass against a
// reachable-but-refusing port proves the message does NOT appear when the app
// boots offline on its own.
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const VITE_PORT = 5399;
const HANG_PORT = 5398;
const BASE = `http://localhost:${VITE_PORT}`;
// index.html gives the watchdog 8 s; wait past it plus render slack.
const WATCHDOG_WAIT_MS = 11000;

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// Accepts connections and then says nothing at all — the exact behaviour of the
// hung host: `curl` reports "Request completely sent off", then 0 bytes.
function startBlackHole(port) {
    const sockets = new Set();
    const server = net.createServer((socket) => {
        sockets.add(socket);
        socket.on('error', () => {});
        socket.on('close', () => sockets.delete(socket));
        socket.resume(); // drain the request, never reply
    });
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () =>
            resolve(() => {
                for (const s of sockets) s.destroy();
                server.close();
            }),
        );
    });
}

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
        const poll = setInterval(async () => {
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

// Reads what the splash currently says. `visible` is what the user actually
// sees, so a splash already faded out by a booted app reports as gone.
const READ_SPLASH = () => {
    const boot = document.getElementById('aura-boot');
    if (!boot || boot.classList.contains('hidden')) return { up: false };
    const txt = (id) => document.getElementById(id)?.textContent?.trim() ?? '';
    const diag = document.getElementById('aura-boot-diag');
    return {
        up: true,
        headline: txt('aura-boot-text'),
        diagShown: !!diag && !diag.hidden && diag.offsetHeight > 0,
        detail: txt('aura-boot-diag-detail'),
        dev: txt('aura-boot-diag-dev'),
        reloadButton: !!document.getElementById('aura-boot-reload')?.offsetHeight,
    };
};

let closeHole;
let vite;
const browser = await chromium.launch();
try {
    closeHole = await startBlackHole(HANG_PORT);
    const target = `http://127.0.0.1:${HANG_PORT}`;
    vite = await startVite(target);
    console.log(`dev server ${BASE} -> black hole ${target}`);

    const ctx = await browser.newContext({ viewport: { width: 900, height: 640 } });
    const page = await ctx.newPage();
    // `load` never fires while socket.io.js hangs — commit is as far as we get.
    await page.goto(BASE, { waitUntil: 'commit' });

    // Before the watchdog fires the splash must look completely normal, so a
    // merely slow instance is not accused of being down.
    await page.waitForTimeout(2500);
    const early = await page.evaluate(READ_SPLASH);
    check('splash still plain while the request is young', early.up && !early.diagShown, `headline "${early.headline}"`);
    check('plain splash keeps the loading text', early.headline.startsWith('Aura wird geladen'), early.headline);

    await page.waitForTimeout(WATCHDOG_WAIT_MS - 2500);
    const late = await page.evaluate(READ_SPLASH);
    check('splash is still the visible layer (app never booted)', late.up === true);
    check('headline names the culprit', late.headline === 'ioBroker antwortet nicht', late.headline);
    check('diagnosis block is rendered', late.diagShown === true);
    check('detail names socket.io.js and the timeout', /socket\.io\.js/.test(late.detail) && /8 Sekunden/.test(late.detail), late.detail);
    check('detail names the origin the browser asked', late.detail.includes(BASE), late.detail);
    check('dev line names the proxy target', late.dev.includes(target), late.dev);
    check('dev line points at .iobroker-url', late.dev.includes('.iobroker-url'), late.dev);
    check('a reload button is offered', late.reloadButton === true);

    // The message must be readable, not invisible text on its own colour.
    const contrast = await page.evaluate(() => {
        const lum = (c) => {
            const m = String(c).match(/[0-9.]+/g);
            if (!m || m.length < 3) return null;
            const [r, g, b] = m.slice(0, 3).map(Number);
            return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        };
        const el = document.getElementById('aura-boot-diag-detail');
        const boot = document.getElementById('aura-boot');
        return { fg: lum(getComputedStyle(el).color), bg: lum(getComputedStyle(boot).backgroundColor) };
    });
    check(
        'diagnosis text contrasts with the splash background',
        contrast.fg != null && contrast.bg != null && Math.abs(contrast.fg - contrast.bg) > 0.2,
        `fg ${contrast.fg?.toFixed(2)} vs bg ${contrast.bg?.toFixed(2)}`,
    );

    const shot = path.join(os.tmpdir(), 'aura-boot-splash-offline.png');
    await page.screenshot({ path: shot }).then(() => console.log(`  shot  ${shot}`), () => {});
    await ctx.close();

    // Second pass: a refused port. Vite's proxy fails the script request
    // immediately, so main.tsx runs and the app boots offline — the watchdog
    // must stay quiet rather than accuse a backend that is merely absent.
    await vite.stop();
    vite = await startVite('http://127.0.0.1:9');
    const ctx2 = await browser.newContext({ viewport: { width: 900, height: 640 } });
    const page2 = await ctx2.newPage();
    await page2.goto(BASE, { waitUntil: 'load' });
    await page2.waitForTimeout(WATCHDOG_WAIT_MS);
    const refused = await page2.evaluate(READ_SPLASH);
    check('refused target: app boots, no accusation on screen', refused.up === false, JSON.stringify(refused));
    await ctx2.close();
} finally {
    await browser.close();
    if (vite) await vite.stop();
    if (closeHole) closeHole();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
