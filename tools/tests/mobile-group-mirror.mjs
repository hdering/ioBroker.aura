// A mirror of a device card inside a group must show the card in full on the phone (#988).
// The group's phone stack gave every child its stored gridPos.h unless the child itself
// sizes to its content. A mirror is type 'mirror', so it got the fixed box although it
// renders a device card — which on the phone is a stack with its own inset and scrolled.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --host 127.0.0.1 --port 5197
//   AURA_BASE=http://127.0.0.1:5197 node tools/tests/mobile-group-mirror.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
// Below the default mobile breakpoint (600), so the stack renders.
const ctx = await browser.newContext({ viewport: { width: 400, height: 900 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const defs = {
    // The reporter's group: the mirror on top, a window contact below, both h 3.
    'def-group': [
        {
            id: 'm-card',
            type: 'mirror',
            title: 'Spiegel',
            datapoint: '',
            gridPos: { x: 0, y: 0, w: 11, h: 3 },
            options: { targetWidgetId: 'dc-src', transparent: true },
        },
        {
            id: 'v-below',
            type: 'value',
            title: 'Fenster',
            datapoint: 'demo.t2',
            layout: 'compact',
            gridPos: { x: 0, y: 3, w: 11, h: 3 },
            options: {},
        },
    ],
    // The mirrored device card: one child filling its 3 rows, frameless + transparent.
    'def-card': [
        {
            id: 'v-card',
            type: 'value',
            title: 'Heizung',
            datapoint: 'demo.t1',
            gridPos: { x: 0, y: 0, w: 11, h: 3 },
            options: { unit: '°C' },
        },
    ],
};

await page.evaluate((d) => {
    const vals = { 'demo.t1': 14.89, 'demo.t2': 1 };
    window.__auraShot.mock(vals);
    window.__auraShot.mockServerState(vals);
    window.__auraShot.groupDefs(d);
    window.__auraShot.showWidgets([
        {
            id: 'g-room',
            type: 'group',
            title: 'Wohnzimmer',
            datapoint: '',
            gridPos: { x: 0, y: 0, w: 11, h: 8 },
            options: { defId: 'def-group' },
        },
        {
            id: 'dc-src',
            type: 'devicecard',
            title: 'Heizung',
            datapoint: 'demo.t1',
            gridPos: { x: 11, y: 0, w: 11, h: 3 },
            options: { defId: 'def-card', transparent: true, frameless: true, showTitle: false, showIcon: false },
        },
    ]);
}, defs);
await page.waitForTimeout(800);

const geo = await page.evaluate(() => {
    const overflow = (root) =>
        Math.max(0, ...[...(root?.querySelectorAll('.aura-scroll') ?? [])].map((e) => e.scrollHeight - e.clientHeight));
    const group = document.querySelector('.aura-widget-g-room');
    const mirror = group?.querySelector('.aura-widget-m-card');
    const card = mirror?.querySelector('.aura-widget-v-card');
    const mb = mirror?.getBoundingClientRect();
    const cb = card?.getBoundingClientRect();
    return {
        found: !!mirror && !!card,
        mirrorOverflow: overflow(mirror),
        groupOverflow: overflow(group),
        cardInside: !!mb && !!cb && cb.bottom <= mb.bottom + 1,
    };
});

check('mirror and the mirrored card child rendered', geo.found);
check('mirror does not scroll inside', geo.mirrorOverflow <= 1, `overflow ${geo.mirrorOverflow}px`);
check('group does not scroll inside', geo.groupOverflow <= 1, `overflow ${geo.groupOverflow}px`);
check('the card child lies inside the mirror box', geo.cardInside);
check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} ok`);
process.exit(failed ? 1 : 0);
