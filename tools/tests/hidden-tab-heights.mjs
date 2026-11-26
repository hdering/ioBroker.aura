// A tab that is not on screen does not report heights.
//
//   node tools/tests/hidden-tab-heights.mjs      (npm run test:hidden-tab-heights)
//
// Three places measure the DOM for the Dashboard (autoHeightStore): the header bar of
// a group, the header row of a folded widget, the content of an auto-height widget. A
// visited tab is only set to display:none, so on leaving it all of them measured 0 and
// reported that one by one, and their real height on the way back — and the Dashboard
// renders on every report, with every group on every tab opened before. On a tab of
// seven groups one tab switch was ten renders instead of three.
//
// Checked on the store over a real tab switch: nothing is reported on the way there and
// back. The other half is checked too — a height that really changed while the tab was
// hidden is taken over, a group without a bar still reports 0, and so does empty content
// that is on screen.
//
// Runs against a vite server pointed at a dead address: no ioBroker needed.
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const VITE_PORT = 5404;
const BASE = `http://localhost:${VITE_PORT}`;
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

const value = (id, gridPos, options = {}) => ({
    id,
    type: 'value',
    title: id,
    datapoint: `test.${id}`,
    gridPos,
    options,
});
const group = (id, y, options = {}) => ({
    id,
    type: 'group',
    title: id,
    datapoint: '',
    gridPos: { x: 0, y, w: 16, h: 8 },
    options: { defId: `def-${id}`, ...options },
});
const ROWS = 6;
const entries = Array.from({ length: ROWS }, (_, i) => ({ id: `test.list.${i}` }));

const LAYOUT = {
    id: 'l-heights',
    name: 'Heights',
    slug: 'heights',
    activeSectionId: 'sec',
    sections: [
        {
            id: 'sec',
            name: 'Section',
            slug: 'section',
            activeTabId: 'tab-heights',
            tabs: [
                {
                    id: 'tab-heights',
                    name: 'Heights',
                    slug: 'heights',
                    widgets: [
                        group('open', 0),
                        group('folded', 8, { defaultCollapsed: true }),
                        group('barless', 16, { showTitle: false, showIcon: false }),
                        value('card', { x: 17, y: 0, w: 8, h: 6 }, { defaultCollapsed: true }),
                        {
                            id: 'auto',
                            type: 'list',
                            title: 'auto',
                            datapoint: '',
                            gridPos: { x: 17, y: 8, w: 10, h: 3 },
                            options: { entries, autoHeight: true },
                        },
                    ],
                },
                {
                    id: 'tab-other',
                    name: 'Other',
                    slug: 'other',
                    widgets: [value('w-other', { x: 0, y: 0, w: 4, h: 3 })],
                },
            ],
        },
    ],
};
const DEFS = Object.fromEntries(
    ['open', 'folded', 'barless'].map((g) => [`def-${g}`, [value(`${g}-c0`, { x: 0, y: 0, w: 4, h: 3 })]]),
);

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
    const mock = Object.fromEntries(entries.map((e, i) => [e.id, { val: i, unit: 'W' }]));
    await page.evaluate(
        ([layout, defs, m]) => {
            window.__auraShot.mockServerState(m);
            window.__auraShot.mock(m);
            window.__auraShot.groupDefs(defs);
            window.__auraShot.seed({ layouts: [layout] });
        },
        [LAYOUT, DEFS, mock],
    );
    await page.waitForSelector('.aura-widget-open-c0', { timeout: 15000 });
    await page.waitForSelector('[data-aura-widget="auto"]', { timeout: 15000 });
    await page.waitForTimeout(1500);

    await page.evaluate(async () => {
        const { useAutoHeightStore } = await import('/src-vis/store/autoHeightStore.ts');
        const pick = (s) => ({
            open: s.groupHeaders.open,
            folded: s.groupHeaders.folded,
            barless: s.groupHeaders.barless,
            card: s.collapsedHeaders.card,
            auto: s.heights.auto,
        });
        window.__heights = () => pick(useAutoHeightStore.getState());
        window.__reports = [];
        useAutoHeightStore.subscribe((s) => window.__reports.push(pick(s)));
    });
    const heights = () => page.evaluate(() => window.__heights());
    const reports = () => page.evaluate(() => window.__reports.splice(0));
    const goTo = async (name) => {
        await page.locator('.aura-tab-btn', { hasText: name }).first().click();
        await page.waitForTimeout(900);
    };
    const style = (id, css) =>
        page.evaluate(
            ([i, c]) => {
                const s = document.createElement('style');
                s.id = i;
                s.textContent = c;
                document.head.appendChild(s);
            },
            [id, css],
        );
    const unstyle = async (id) => {
        await page.evaluate((i) => document.getElementById(i).remove(), id);
        await page.waitForTimeout(500);
    };
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

    const first = await heights();
    check(
        'the bar of an open and of a folded group is measured',
        first.open > 0 && first.folded > 0,
        JSON.stringify(first),
    );
    check('a group without a bar reports 0', first.barless === 0, `${first.barless}`);
    check('the header row of a folded widget is measured', first.card > 0, `${first.card} px`);
    check('the content of an auto-height widget is measured', first.auto > 0, `${first.auto} px`);

    // The element the auto-height widget measures.
    const content = await page.evaluateHandle(
        (px) => [...document.querySelectorAll('[data-aura-widget="auto"] *')].find((e) => e.offsetHeight === px),
        first.auto,
    );

    // There and back.
    await reports();
    await goTo('Other');
    const away = await heights();
    check('every height is kept while the tab is hidden', same(away, first), JSON.stringify(away));
    await goTo('Heights');
    const back = await heights();
    check('and the same when it is back', same(back, first), JSON.stringify(back));
    const seen = await reports();
    check('nothing was reported on the way there and back', seen.length === 0, `${seen.length} reports`);

    // Changed for real while the tab was hidden.
    await goTo('Other');
    await style('higher', '.aura-group-header, [data-collapsed-header] > div { min-height: 90px; }');
    await content.evaluate((e) => (e.style.paddingBottom = '50px'));
    await goTo('Heights');
    const higher = await heights();
    check(
        'a bar that got higher meanwhile is taken over',
        higher.open >= 90 && higher.folded >= 90,
        JSON.stringify(higher),
    );
    check('so is the header row of a folded widget', higher.card >= 90, `${first.card} → ${higher.card} px`);
    check('so is the content height', higher.auto > first.auto, `${first.auto} → ${higher.auto} px`);
    await unstyle('higher');
    const again = await heights();
    check(
        'and the old bars when it is undone',
        again.open === first.open && again.folded === first.folded && again.card === first.card,
        JSON.stringify(again),
    );

    // A zero on screen is a real one.
    await content.evaluate((e) => {
        e.style.cssText += ';height:0!important;padding:0!important;min-height:0!important;overflow:hidden!important';
    });
    await page.waitForTimeout(500);
    check('empty content on screen still reports its 0', (await heights()).auto === 0, `${(await heights()).auto} px`);

    check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
    await ctx.close();
} finally {
    await browser.close();
    if (vite) await vite.stop();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
