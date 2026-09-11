// Issue #636: on a phone the Universal widget showed no icon at all — neither the
// one next to the title nor the per-state icons of its buttons — while desktop
// Chrome was fine. Cause: @iconify/react pulls icon data from api.iconify.design
// (plus api.simplesvg.com / api.unisvg.com), and those hosts are blocked by the
// tracker blockers in Samsung Internet and Opera and unreachable from a kiosk
// tablet without internet. Aura now answers the same API from its own origin.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/icon-source.mjs
//
// The checks are about WHERE the data comes from and whether a real <svg> body
// lands in the DOM — not about how the icon looks.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/** The three hosts @iconify/react rotates through out of the box. */
const PUBLIC_HOSTS = /api\.iconify\.design|api\.simplesvg\.com|api\.unisvg\.com/;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

const requests = [];
page.on('request', (r) => requests.push(r.url()));
// A blocked request never reaches the network, so a failed one counts too.
page.on('requestfailed', (r) => requests.push(r.url()));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

/** Universal widget with a title icon and a cell whose icon changes with the DP. */
await page.evaluate(() => {
    window.__auraShot.mock({ 'demo.plug.STATE': true });
    window.__auraShot.mockServerState({ 'demo.plug.STATE': true });
    window.__auraShot.showWidgets([
        {
            id: 'w-icon',
            type: 'universal',
            title: 'Universal',
            datapoint: '',
            gridPos: { x: 0, y: 0, w: 12, h: 6 },
            options: {
                showTitle: true,
                showIcon: true,
                icon: 'mdi:garage',
                customGrid: {
                    cols: 2,
                    rows: 1,
                    cells: [
                        // state-icon: the very cell type the reporter used for an
                        // on/off button with two different icons.
                        {
                            type: 'state-icon',
                            dpId: 'demo.plug.STATE',
                            trueIcon: 'lucide:lightbulb',
                            falseIcon: 'lucide:lightbulb-off',
                        },
                        { type: 'icon', iconName: 'mdi:car-electric' },
                    ],
                },
            },
        },
    ]);
});

// Icon data arrives over the network, so give the batch a moment to land.
await page.waitForFunction(
    () => document.querySelectorAll('.aura-widget-w-icon svg, .aura-widget-w-icon span[class*=iconify]').length > 0,
    { timeout: 15000 },
);
await page.waitForTimeout(1500);

const iconRequests = requests.filter((u) => /\/icons\/[a-z0-9-]+\.json/.test(u));
const publicRequests = requests.filter((u) => PUBLIC_HOSTS.test(u));

check('icons are requested from Aura itself', iconRequests.length > 0, `${iconRequests.length} request(s)`);
check('no request reaches the public Iconify hosts', publicRequests.length === 0, publicRequests.slice(0, 3).join(' '));
check(
    'the icon request is same-origin',
    iconRequests.every((u) => u.startsWith(BASE)),
    iconRequests.slice(0, 3).join(' '),
);

// Every requested prefix must have come back with real drawing instructions,
// otherwise the widget silently falls back to its generic Lucide placeholder —
// which is exactly what the phone showed (nothing recognisable).
const bodies = await page.evaluate(() =>
    [...document.querySelectorAll('.aura-widget-w-icon svg')].map((svg) => svg.innerHTML.length),
);
check('title and cell icons rendered as svg', bodies.length >= 3, `${bodies.length} svg element(s)`);
check('every rendered icon carries a body', bodies.length > 0 && bodies.every((n) => n > 0), JSON.stringify(bodies));

const mdi = await page.evaluate(async () => {
    const res = await fetch('/icons/mdi.json?icons=garage');
    return { status: res.status, body: (await res.json()).icons?.garage?.body?.length ?? 0 };
});
check('mdi is served locally too', mdi.status === 200 && mdi.body > 0, JSON.stringify(mdi));

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

// ── the adapter itself has no internet and an empty cache ────────────────────
// It answers 503. The public API is still configured behind it for the mirror
// case (offline server, online browser), so it is tried once — and when that is
// blocked too, the widget must draw its bundled Lucide fallback. "Some icon" is
// the promise; the blank header is the bug this issue is about.
{
    const offline = await browser.newContext({ viewport: { width: 800, height: 600 }, ignoreHTTPSErrors: true });
    const p2 = await offline.newPage();
    const attempted = [];
    await p2.route('**/icons/*.json*', (route) =>
        route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' }),
    );
    // Stand in for a tracker blocker: the public hosts simply do not answer.
    for (const host of ['api.iconify.design', 'api.simplesvg.com', 'api.unisvg.com']) {
        await p2.route(`**://${host}/**`, (route) => {
            attempted.push(route.request().url());
            return route.abort();
        });
    }
    await p2.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
    await p2.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
    await p2.evaluate(() => {
        window.__auraShot.showWidgets([
            {
                id: 'w-off',
                type: 'universal',
                title: 'Offline',
                datapoint: '',
                gridPos: { x: 0, y: 0, w: 12, h: 4 },
                options: { showTitle: true, showIcon: true, icon: 'mdi:garage' },
            },
        ]);
    });
    let fallback = 0;
    try {
        await p2.waitForFunction(
            () => {
                const svg = document.querySelector('.aura-widget-w-off .aura-widget-icon');
                return !!svg && svg.innerHTML.length > 0;
            },
            { timeout: 20000 },
        );
        fallback = await p2.evaluate(
            () => document.querySelector('.aura-widget-w-off .aura-widget-icon')?.innerHTML.length ?? 0,
        );
    } catch {
        /* stays 0 → the header would be blank, which is the reported bug */
    }
    check('offline adapter still draws the bundled fallback icon', fallback > 0, `body length ${fallback}`);
    check(
        'the public API is only tried once the local one fails',
        attempted.length > 0,
        `${attempted.length} attempt(s)`,
    );
    await offline.close();
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\nicon-source: ${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
