// A widget a condition takes out of the grid stops drawing until it is back.
//
//   node tools/tests/reflow-hidden-parked.mjs      (npm run test:reflow-hidden-parked)
//
// "Hide" with "Reflow" moves a widget out of the grid into an off-screen box, where
// it stays mounted so its conditions can bring it back. Off-screen is still drawn:
// position:fixed at -9999px keeps layout, style and every animation running — on
// whatever tab is shown, for as long as the dashboard is open. The box is
// display:none now, so nothing of that happens, and this checks both halves of it:
//
//   * parked: still mounted, not rendered, its animation stands still;
//   * back: the condition still brings it into the grid, and it runs again.
//
// Desktop grid, mobile list, group child and a whole group, each with the condition flipped on the
// tab itself and while another tab is shown.
//
// Runs against a vite server pointed at a dead address: no ioBroker needed.
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const VITE_PORT = 5403;
const BASE = `http://localhost:${VITE_PORT}`;
const OFFLINE_TARGET = 'http://127.0.0.1:9';
const HIDE_DP = 'test.hide';

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

/** A document with a CSS animation that tells the page about every iteration of it. */
const animated = (id) =>
    '<html><head><style>@keyframes m{to{transform:translateX(90px)}}div{width:10px;height:10px;' +
    'background:red;animation:m 100ms linear infinite}</style></head><body><div></div><script>' +
    "document.querySelector('div').addEventListener('animationiteration',function(){" +
    `parent.postMessage({iterationOf:${JSON.stringify(id)}},'*')})` +
    '</script></body></html>';

const widget = (id, gridPos) => ({
    id,
    type: 'html',
    title: id,
    gridPos,
    options: {
        showTitle: false,
        showIcon: false,
        htmlContent: animated(id),
        conditions: [
            {
                id: `c-${id}`,
                logic: 'AND',
                clauses: [{ datapoint: HIDE_DP, operator: 'true', value: '' }],
                style: {},
                hideWidget: true,
                reflow: true,
            },
        ],
    },
});
/** A group the condition hides as a whole: it comes back with its child. */
const hiddenGroup = (id, gridPos) => ({
    id,
    type: 'group',
    title: id,
    datapoint: '',
    gridPos,
    options: { defId: `def-${id}`, conditions: widget(id, gridPos).options.conditions },
});
const plain = (id, gridPos) => ({ id, type: 'value', title: id, datapoint: `test.${id}`, gridPos, options: {} });

const LAYOUT = {
    id: 'l-parked',
    name: 'Parked',
    slug: 'parked',
    activeSectionId: 'sec',
    sections: [
        {
            id: 'sec',
            name: 'Section',
            slug: 'section',
            activeTabId: 'tab-a',
            tabs: [
                {
                    id: 'tab-a',
                    name: 'First',
                    slug: 'first',
                    widgets: [
                        widget('direct', { x: 0, y: 0, w: 10, h: 5 }),
                        {
                            id: 'grp',
                            type: 'group',
                            title: 'grp',
                            datapoint: '',
                            gridPos: { x: 0, y: 5, w: 16, h: 9 },
                            options: { defId: 'def-grp' },
                        },
                        hiddenGroup('whole', { x: 0, y: 14, w: 16, h: 6 }),
                    ],
                },
                { id: 'tab-b', name: 'Second', slug: 'second', widgets: [plain('other', { x: 0, y: 0, w: 6, h: 3 })] },
            ],
        },
    ],
};
const GROUP_DEFS = {
    'def-grp': [widget('child', { x: 0, y: 0, w: 10, h: 4 }), plain('stays', { x: 0, y: 4, w: 6, h: 3 })],
    'def-whole': [plain('inside', { x: 0, y: 0, w: 6, h: 3 })],
};

let vite;
const browser = await chromium.launch();

async function run(label, viewport) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.addInitScript(() => {
        window.__iterations = {};
        window.addEventListener('message', (e) => {
            const id = e.data?.iterationOf;
            if (id) {
                window.__iterations[id] = (window.__iterations[id] ?? 0) + 1;
            }
        });
    });
    await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
    const setHide = async (val) => {
        await page.evaluate(
            ([dp, v]) => {
                window.__auraShot.mockServerState({ [dp]: { val: v } });
                window.__auraShot.mock({ [dp]: { val: v } });
            },
            [HIDE_DP, val],
        );
        await page.waitForTimeout(900);
    };
    await setHide(false);
    await page.evaluate(
        ([layout, defs]) => {
            window.__auraShot.groupDefs(defs);
            window.__auraShot.seed({ layouts: [layout] });
        },
        [LAYOUT, GROUP_DEFS],
    );
    await page.waitForSelector('.aura-widget-child iframe', { timeout: 15000 });
    await page.waitForTimeout(700);

    /** Iterations each widget's animation made within one second (10 while it is drawn). */
    const iterationsPerSecond = async () => {
        const read = () => page.evaluate(() => ({ ...window.__iterations }));
        const before = await read();
        await page.waitForTimeout(1000);
        const after = await read();
        return Object.fromEntries(['direct', 'child'].map((id) => [id, (after[id] ?? 0) - (before[id] ?? 0)]));
    };
    const state = () =>
        page.evaluate(() =>
            Object.fromEntries(
                ['direct', 'child', 'whole', 'inside'].map((id) => {
                    const el = document.querySelector(`.aura-widget-${id}`);
                    const box = el?.getBoundingClientRect();
                    return [
                        id,
                        {
                            mounted: !!el,
                            rendered: !!el && el.getClientRects().length > 0,
                            onScreen: !!box && box.width > 50 && box.left >= 0 && box.right <= window.innerWidth + 1,
                        },
                    ];
                }),
            ),
        );
    const goTo = async (name) => {
        await page.locator('.aura-tab-btn', { hasText: name }).first().click();
        await page.waitForTimeout(700);
    };
    const expectShown = async (when) => {
        const s = await state();
        const n = await iterationsPerSecond();
        for (const id of ['direct', 'child']) {
            check(`${label}, ${when}: "${id}" is on screen`, s[id].onScreen, JSON.stringify(s[id]));
            check(`${label}, ${when}: "${id}" is animated`, n[id] >= 5, `${n[id]} iterations/s`);
        }
        check(
            `${label}, ${when}: a group hidden as a whole is on screen with its child`,
            s.whole.onScreen && s.inside.onScreen,
        );
    };
    const expectParked = async (when) => {
        const s = await state();
        const n = await iterationsPerSecond();
        for (const id of ['direct', 'child']) {
            check(`${label}, ${when}: "${id}" stays mounted`, s[id].mounted);
            check(`${label}, ${when}: "${id}" is not rendered`, !s[id].rendered);
            check(`${label}, ${when}: "${id}" is not animated`, n[id] === 0, `${n[id]} iterations/s`);
        }
        check(`${label}, ${when}: a group hidden as a whole stays mounted`, s.whole.mounted);
        check(`${label}, ${when}: and is not rendered`, !s.whole.rendered && !s.inside.rendered);
    };

    await expectShown('at first');
    await setHide(true);
    await expectParked('hidden');
    await goTo('Second');
    await expectParked('hidden, other tab shown');
    await goTo('First');
    await setHide(false);
    await expectShown('back');

    // The condition turns while the tab itself is not on screen.
    await setHide(true);
    await goTo('Second');
    await setHide(false);
    await goTo('First');
    await expectShown('brought back from another tab');

    check(`${label}: no page errors`, pageErrors.length === 0, pageErrors.join(' | '));
    await ctx.close();
}

try {
    vite = await startVite(OFFLINE_TARGET);
    await run('desktop', { width: 1280, height: 900 });
    await run('mobile', { width: 420, height: 900 });
} finally {
    await browser.close();
    if (vite) {
        await vite.stop();
    }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
