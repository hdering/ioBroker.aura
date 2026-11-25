// A tab switch must not render the widgets of the tabs it does not change.
//
//   node tools/tests/tab-switch-renders.mjs      (npm run test:tab-switch-renders)
//
// Every tab opened so far stays mounted (display: none) and its groups render with the
// dashboard. A group packed its children into fresh objects and handed them closures of
// that very render, so the memoised frame of every child rendered along — several times
// per tab switch, on every tab visited before.
//
// Counted from React's commits: frames that rendered, not the ones only passed on the
// way down. What must still work is checked as well — a child that changed, moved or
// was removed.
//
// Runs against a vite server pointed at a dead address: no ioBroker needed.
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const VITE_PORT = 5407;
const BASE = `http://localhost:${VITE_PORT}`;
const OFFLINE_TARGET = 'http://127.0.0.1:9';
const CHILDREN = 6;

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

const child = (group, i) => ({
    id: `${group}-c${i}`,
    type: 'value',
    title: `${group} ${i}`,
    datapoint: `test.${group}.${i}`,
    gridPos: { x: (i % 3) * 4, y: Math.floor(i / 3) * 3, w: 4, h: 3 },
    options: {},
});
const children = (group) => Array.from({ length: CHILDREN }, (_, i) => child(group, i));
const group = (id) => ({
    id,
    type: 'group',
    title: id,
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 16, h: 8 },
    options: { defId: `def-${id}` },
});
const single = (id, y) => ({
    id,
    type: 'value',
    title: id,
    datapoint: `test.${id}`,
    gridPos: { x: 0, y, w: 4, h: 3 },
    options: {},
});
const tab = (id, name, widgets) => ({ id, name, slug: id, widgets });

const LAYOUT = {
    id: 'l-renders',
    name: 'Renders',
    slug: 'renders',
    activeSectionId: 'sec',
    sections: [
        {
            id: 'sec',
            name: 'Section',
            slug: 'section',
            activeTabId: 'tab-a',
            tabs: [
                tab('tab-a', 'First', [group('ga'), single('sa', 9)]),
                tab('tab-b', 'Second', [group('gb'), single('sb', 9)]),
                tab('tab-c', 'Third', [group('gc'), single('sc', 9)]),
            ],
        },
    ],
};

// Counts the WidgetFrame renders per commit, by widget id.
function countRenders() {
    window.__frames = {};
    const PERFORMED_WORK = 1;
    const walk = (fiber, prev) => {
        if (!fiber || fiber === prev) return;
        const type = fiber.type && (fiber.type.type || fiber.type);
        const props = fiber.memoizedProps;
        if (
            typeof type === 'function' &&
            type.name === 'WidgetFrameInner' &&
            fiber.alternate &&
            fiber.flags & PERFORMED_WORK
        )
            window.__frames[props.config.id] = (window.__frames[props.config.id] || 0) + 1;
        const before = new Set();
        for (let c = prev && prev.child; c; c = c.sibling) before.add(c);
        for (let c = fiber.child; c; c = c.sibling)
            if (!before.has(c)) walk(c, c.alternate && before.has(c.alternate) ? c.alternate : null);
    };
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
        renderers: new Map(),
        supportsFiber: true,
        inject: () => 1,
        onCommitFiberUnmount() {},
        onPostCommitFiberRoot() {},
        onCommitFiberRoot(_id, root) {
            walk(root.current, root.current.alternate);
        },
    };
}

let vite;
const browser = await chromium.launch();
try {
    vite = await startVite(OFFLINE_TARGET);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.addInitScript(countRenders);
    await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
    const groups = ['ga', 'gb', 'gc'];
    const mock = Object.fromEntries([
        ...groups.flatMap((g) => children(g).map((c, i) => [c.datapoint, { val: i, unit: 'W' }])),
        ...['sa', 'sb', 'sc'].map((s) => [`test.${s}`, { val: 1, unit: 'W' }]),
    ]);
    await page.evaluate(
        ([layout, defs, m]) => {
            window.__auraShot.mockServerState(m);
            window.__auraShot.mock(m);
            window.__auraShot.groupDefs(defs);
            window.__auraShot.seed({ layouts: [layout] });
        },
        [LAYOUT, Object.fromEntries(groups.map((g) => [`def-${g}`, children(g)])), mock],
    );
    const goTo = async (name) => {
        await page.locator('.aura-tab-btn', { hasText: name }).first().click();
        await page.waitForTimeout(800);
    };
    const reset = () => page.evaluate(() => void (window.__frames = {}));
    const frames = () => page.evaluate(() => window.__frames);
    const sum = (f, test) => Object.entries(f).reduce((n, [id, c]) => (test(id) ? n + c : n), 0);

    await page.waitForSelector('.aura-widget-ga-c0', { timeout: 15000 });
    for (const t of ['Second', 'Third', 'First', 'Second']) await goTo(t);

    // The count itself must see something, or every zero below means nothing.
    check('the counter sees frames render', sum(await frames(), () => true) > 0);

    await reset();
    await goTo('Third');
    const f = await frames();
    check(
        'group children of a tab not involved do not render',
        sum(f, (id) => id.startsWith('ga-')) === 0,
        JSON.stringify(sum(f, (id) => id.startsWith('ga-'))),
    );
    check(
        'group children of the tab left do not render',
        sum(f, (id) => id.startsWith('gb-')) === 0,
        `${sum(f, (id) => id.startsWith('gb-'))}`,
    );
    check(
        'group children of the tab shown do not render',
        sum(f, (id) => id.startsWith('gc-')) === 0,
        `${sum(f, (id) => id.startsWith('gc-'))}`,
    );
    check(
        'a widget outside a group does not render either',
        sum(f, (id) => ['sa', 'sb', 'sc'].includes(id)) === 0,
        `${sum(f, (id) => ['sa', 'sb', 'sc'].includes(id))}`,
    );

    // A child whose configuration changes does render, and only that one.
    await reset();
    await page.evaluate((defs) => window.__auraShot.groupDefs(defs), {
        ...Object.fromEntries(groups.map((g) => [`def-${g}`, children(g)])),
        'def-gc': children('gc').map((c, i) => (i === 1 ? { ...c, title: 'changed' } : c)),
    });
    await page.waitForTimeout(400);
    check(
        'a changed child shows its change',
        (await page.locator('.aura-widget-gc-c1').innerText()).includes('changed'),
    );

    // A child that moves is laid out at its new place.
    const left = () =>
        page.evaluate(() =>
            Math.round(
                document.querySelector('.aura-widget-gc-c0').closest('.react-grid-item').getBoundingClientRect().x,
            ),
        );
    const x0 = await left();
    await page.evaluate((defs) => window.__auraShot.groupDefs(defs), {
        'def-gc': children('gc').map((c, i) => (i === 0 ? { ...c, gridPos: { ...c.gridPos, x: 4, y: 6 } } : c)),
    });
    await page.waitForTimeout(600);
    check('a moved child is laid out at its new place', (await left()) > x0, `${x0} → ${await left()}`);

    // A removed child is gone, the others stay.
    await page.evaluate((defs) => window.__auraShot.groupDefs(defs), { 'def-gc': children('gc').slice(1) });
    await page.waitForTimeout(400);
    check('a removed child is gone', (await page.locator('.aura-widget-gc-c0').count()) === 0);
    check('its siblings stay', (await page.locator('[class*="aura-widget-gc-c"]').count()) === CHILDREN - 1);

    check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
    await ctx.close();
} finally {
    await browser.close();
    if (vite) await vite.stop();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
