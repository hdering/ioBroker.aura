// A group nested in a group must show its children in full on the phone (#897).
// The phone stacks a group's children in one column, so a nested group drawn with two
// children side by side needs about twice its desktop rows. The tab's stack already
// sizes a top-level group to its content; the group's own stack gave every child its
// stored gridPos.h, so the nested group got its desktop height and scrolled inside.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --host 127.0.0.1 --port 5197
//   AURA_BASE=http://127.0.0.1:5197 node tools/tests/mobile-nested-group.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
// Below the default mobile breakpoint (600), so the stack renders.
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const value = (id, dp, x) => ({
    id,
    type: 'value',
    title: id,
    datapoint: dp,
    layout: 'compact',
    gridPos: { x, y: 0, w: 7, h: 2 },
    options: { unit: '°C' },
});
const defs = {
    'def-outer': [
        value('v-top', 'demo.t1', 0),
        // The reporter's "Erdgeschoss": two values side by side, h 4.
        {
            id: 'g-inner',
            type: 'group',
            title: 'Erdgeschoss',
            datapoint: '',
            gridPos: { x: 0, y: 2, w: 15, h: 4 },
            options: { defId: 'def-inner' },
        },
    ],
    'def-inner': [value('v-vl', 'demo.t1', 0), value('v-rl', 'demo.t2', 7)],
};

await page.evaluate((d) => {
    const vals = { 'demo.t1': 34.5, 'demo.t2': 28.9 };
    window.__auraShot.mock(vals);
    window.__auraShot.mockServerState(vals);
    window.__auraShot.groupDefs(d);
    window.__auraShot.showWidgets([
        {
            id: 'g-outer',
            type: 'group',
            title: 'Heizung',
            datapoint: '',
            gridPos: { x: 0, y: 0, w: 15, h: 8 },
            options: { defId: 'def-outer' },
        },
    ]);
}, defs);
await page.waitForTimeout(600);

const geo = await page.evaluate(() => {
    const scrollers = (sel) =>
        [...(document.querySelector(sel)?.querySelectorAll('.aura-scroll') ?? [])].map(
            (e) => e.scrollHeight - e.clientHeight,
        );
    const box = (sel) => document.querySelector(sel)?.getBoundingClientRect();
    const inner = document.querySelector('.aura-widget-g-inner');
    const rl = box('.aura-widget-v-rl');
    const ib = inner?.getBoundingClientRect();
    return {
        found: !!inner && !!rl,
        innerOverflow: Math.max(
            0,
            ...[...(inner?.querySelectorAll('.aura-scroll') ?? [])].map((e) => e.scrollHeight - e.clientHeight),
        ),
        outerOverflow: Math.max(0, ...scrollers('[data-aura-widget="g-outer"]')),
        rlInside: !!rl && !!ib && rl.bottom <= ib.bottom + 1,
    };
});

check('nested group and its second child rendered', geo.found);
check('nested group does not scroll inside', geo.innerOverflow <= 1, `overflow ${geo.innerOverflow}px`);
check('outer group does not scroll inside', geo.outerOverflow <= 1, `overflow ${geo.outerOverflow}px`);
check('second child of the nested group lies inside its box', geo.rlInside);
check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} ok`);
process.exit(failed ? 1 : 0);
