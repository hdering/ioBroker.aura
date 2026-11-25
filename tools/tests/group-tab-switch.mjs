// A group keeps its children while its tab is not on screen.
//
//   node tools/tests/group-tab-switch.mjs      (npm run test:group-tab-switch)
//
// A visited tab stays mounted and is only set to display:none. Everything in it
// then measures 0 — the group believed that, dropped its inner grid and built
// every child again on the way back: on a tab that holds little but groups this
// is the whole page, on every single visit, and each child reads its datapoints
// anew. Dashboard.tsx has ignored such a zero since #636; this is the same rule
// one level down.
//
// Checked by node identity over a real tab switch: the very same DOM node has to
// come back, not one that merely looks like it. The other half of the rule is
// checked too — a folded group still mounts nothing, and a group that was resized
// while hidden takes the new width.
//
// Runs against a vite server pointed at a dead address: no ioBroker needed.
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const VITE_PORT = 5401;
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
const group = (id, y, options = {}) => ({
    id,
    type: 'group',
    title: id,
    datapoint: '',
    gridPos: { x: 0, y, w: 16, h: 8 },
    options: { defId: `def-${id}`, ...options },
});

const LAYOUT = {
    id: 'l-switch',
    name: 'Switch',
    slug: 'switch',
    activeSectionId: 'sec',
    sections: [
        {
            id: 'sec',
            name: 'Section',
            slug: 'section',
            activeTabId: 'tab-groups',
            tabs: [
                {
                    id: 'tab-groups',
                    name: 'Groups',
                    slug: 'groups',
                    widgets: [group('open', 0), group('folded', 8, { defaultCollapsed: true })],
                },
                {
                    id: 'tab-other',
                    name: 'Other',
                    slug: 'other',
                    widgets: [
                        {
                            id: 'w-other',
                            type: 'value',
                            title: 'Other',
                            datapoint: 'test.other',
                            gridPos: { x: 0, y: 0, w: 4, h: 3 },
                            options: {},
                        },
                    ],
                },
            ],
        },
    ],
};

let vite;
const browser = await chromium.launch();

try {
    vite = await startVite(OFFLINE_TARGET);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
    const mock = Object.fromEntries(
        ['open', 'folded'].flatMap((g) => children(g).map((c, i) => [c.datapoint, { val: i, unit: 'W' }])),
    );
    await page.evaluate(
        ([layout, defs, m]) => {
            window.__auraShot.mockServerState(m);
            window.__auraShot.mock(m);
            window.__auraShot.groupDefs(defs);
            window.__auraShot.seed({ layouts: [layout] });
        },
        [LAYOUT, { 'def-open': children('open'), 'def-folded': children('folded') }, mock],
    );

    const goTo = async (name) => {
        await page.locator('.aura-tab-btn', { hasText: name }).first().click();
        await page.waitForTimeout(700);
    };
    const mounted = (g) => page.evaluate((id) => document.querySelectorAll(`[class*="aura-widget-${id}-c"]`).length, g);
    const hidden = () =>
        page.evaluate(() => getComputedStyle(document.querySelector('[data-aura-tab-id="tab-groups"]')).display);
    /** Width of the first child of the open group, as laid out by the inner grid. */
    const childWidth = () =>
        page.evaluate(() =>
            Math.round(
                document.querySelector('.aura-widget-open-c0').closest('.react-grid-item').getBoundingClientRect()
                    .width,
            ),
        );

    await page.waitForSelector('.aura-widget-open-c0', { timeout: 15000 });
    check('the group shows its children', (await mounted('open')) === CHILDREN, `${await mounted('open')}`);
    check('a folded group mounts none', (await mounted('folded')) === 0, `${await mounted('folded')}`);

    // Remember every child by its node, and count what is added below the group
    // from here on.
    await page.evaluate(() => {
        window.__nodes = [...document.querySelectorAll('[class*="aura-widget-open-c"]')];
        window.__added = 0;
        const root = document.querySelector('[data-aura-widget="open"]');
        new MutationObserver((records) => {
            for (const r of records)
                for (const n of r.addedNodes)
                    if (n.nodeType === 1 && (n.matches('.react-grid-item') || n.querySelector('.react-grid-item')))
                        window.__added++;
        }).observe(root, { childList: true, subtree: true });
    });
    const kept = () => page.evaluate(() => window.__nodes.filter((n) => n.isConnected).length);

    await goTo('Other');
    check('the tab is hidden, not unmounted', (await hidden()) === 'none', await hidden());
    check('the children stay mounted while the tab is hidden', (await kept()) === CHILDREN, `${await kept()}`);

    await goTo('Groups');
    check('the tab is back on screen', (await hidden()) !== 'none', await hidden());
    check('the same child nodes are back', (await kept()) === CHILDREN, `${await kept()} of ${CHILDREN}`);
    check('nothing was built again', (await page.evaluate(() => window.__added)) === 0);

    // Second round trip, with the window made narrower while the group is hidden.
    const wide = await childWidth();
    await goTo('Other');
    await page.setViewportSize({ width: 1000, height: 900 });
    await page.waitForTimeout(500);
    await goTo('Groups');
    const narrow = await childWidth();
    check('a width that changed meanwhile is taken over', narrow !== wide, `${wide} → ${narrow} px`);
    const fits = await page.evaluate(() => {
        const g = document.querySelector('[data-aura-widget="open"]').getBoundingClientRect();
        return [...document.querySelectorAll('[class*="aura-widget-open-c"]')].every(
            (n) => n.getBoundingClientRect().right <= g.right + 1,
        );
    });
    check('and the children fit into the group', fits);

    // Folding: the zero of a folded group still takes its children down.
    await page
        .locator('[data-aura-widget="folded"]')
        .first()
        .click({ position: { x: 20, y: 12 } });
    await page.waitForTimeout(700);
    check('unfolding mounts the children', (await mounted('folded')) === CHILDREN, `${await mounted('folded')}`);
    await page
        .locator('[data-aura-widget="folded"]')
        .first()
        .click({ position: { x: 20, y: 12 } });
    await page.waitForTimeout(700);
    check('folding again takes them down', (await mounted('folded')) === 0, `${await mounted('folded')}`);

    check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
    await ctx.close();
} finally {
    await browser.close();
    if (vite) await vite.stop();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
