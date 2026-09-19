// Issue #290: a layout for devices without internet preloads its whole icon
// inventory and stops talking to the public Iconify hosts.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/icon-offline.mjs
//
// Three claims, one browser context so localStorage carries over like on a
// real tablet:
//   1. with `iconsOffline` on, icons nothing has rendered (a state-icon's
//      off-state, a hidden tab's icon) are in memory shortly after boot, saved
//      on the device, and the per-device flag is set;
//   2. on the NEXT boot the device asks only Aura — with /icons/ cut off, an
//      unknown icon falls back to the bundled Lucide drawing and no request
//      ever leaves for api.iconify.design & co.;
//   3. a layout WITHOUT the switch clears the flag and behaves as before: the
//      public hosts are still tried when Aura does not answer.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const PUBLIC_HOSTS = /api\.iconify\.design|api\.simplesvg\.com|api\.unisvg\.com/;

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/** A layout with icons in places only a preload reaches while the DP is true. */
const layoutFor = (iconsOffline, extraWidgets = []) => ({
    id: 'layout-offline',
    name: 'Offline tablet',
    slug: 'offline',
    activeSectionId: 'sec',
    settings: iconsOffline ? { iconsOffline: true } : {},
    sections: [
        {
            id: 'sec',
            name: 'Section',
            slug: 'sec',
            activeTabId: 'tab',
            tabs: [
                {
                    id: 'tab',
                    name: 'Tab',
                    slug: 'tab',
                    widgets: [
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
                                    cols: 1,
                                    rows: 1,
                                    cells: [
                                        {
                                            type: 'state-icon',
                                            dpId: 'demo.plug.STATE',
                                            trueIcon: 'lucide:lightbulb',
                                            falseIcon: 'lucide:lamp-ceiling',
                                        },
                                    ],
                                },
                            },
                        },
                        ...extraWidgets,
                    ],
                },
                // Hidden from the bar, so its icon is never rendered — only preloaded.
                {
                    id: 'tab-hidden',
                    name: 'Hidden',
                    slug: 'hidden',
                    hidden: true,
                    icon: 'mdi:weather-sunset',
                    widgets: [],
                },
            ],
        },
    ],
});

/** A widget whose icon no cache can have — the probe for "where does a miss go". */
const unknownIconWidget = (id, icon) => ({
    id,
    type: 'universal',
    title: 'Unknown',
    datapoint: '',
    gridPos: { x: 0, y: 6, w: 12, h: 4 },
    options: { showTitle: true, showIcon: true, icon },
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
const requests = [];
page.on('request', (r) => requests.push(r.url()));
page.on('requestfailed', (r) => requests.push(r.url()));

async function boot(layout) {
    await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
    await page.evaluate((l) => {
        window.__auraShot.mock({ 'demo.plug.STATE': true });
        window.__auraShot.mockServerState({ 'demo.plug.STATE': true });
        window.__auraShot.seed({ layouts: [l] });
    }, layout);
}

try {
    // ── 1. first boot with the switch on: the inventory arrives unasked ───────
    await boot(layoutFor(true));
    const preloaded = await page
        .waitForFunction(
            () =>
                window.__auraShot.iconLoaded('lucide:lamp-ceiling') &&
                window.__auraShot.iconLoaded('mdi:weather-sunset'),
            { timeout: 20000 },
        )
        .then(() => true)
        .catch(() => false);
    check('icons nothing rendered are loaded after boot (state off-icon, hidden tab)', preloaded);
    // The preload writes the device cache itself; give the save a tick.
    await page.waitForTimeout(500);
    const cached = await page.evaluate(() => localStorage.getItem('aura-icons-v1') || '');
    check('preloaded icons are saved on the device', cached.includes('lamp-ceiling'), `${cached.length} chars`);
    check(
        'the device is flagged offline for its next boot',
        await page.evaluate(() => window.__auraShot.iconsOfflineFlag()),
    );
    check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

    // ── 2. second boot: Aura only ────────────────────────────────────────────
    requests.length = 0;
    await page.route('**/icons/**', (route) => route.abort());
    await boot(layoutFor(true, [unknownIconWidget('w-unknown', 'mdi:aura-test-no-such-icon-290')]));
    // Offline timeout is 4 s; the default rotate to the public host would be at 6 s.
    await page.waitForTimeout(8000);
    const publicRequests = requests.filter((u) => PUBLIC_HOSTS.test(u));
    check(
        'an offline device never asks the public Iconify hosts',
        publicRequests.length === 0,
        publicRequests.slice(0, 2).join(' '),
    );
    const svgs = await page.evaluate(() => ({
        known: [...document.querySelectorAll('.aura-widget-w-icon svg')].map((s) => s.innerHTML.length),
        fallback: document.querySelectorAll('.aura-widget-w-unknown svg').length,
    }));
    check(
        'icons kept on the device still draw without any network',
        svgs.known.length > 0 && svgs.known.every((n) => n > 0),
        JSON.stringify(svgs.known),
    );
    check('an unknown icon falls back to the bundled drawing', svgs.fallback > 0, `${svgs.fallback} svg`);
    await page.unroute('**/icons/**');

    // ── 3. the switch off again: flag cleared, public fallback back ──────────
    await boot(layoutFor(false));
    await page.waitForTimeout(1500);
    check(
        'a layout without the switch clears the device flag',
        !(await page.evaluate(() => window.__auraShot.iconsOfflineFlag())),
    );

    requests.length = 0;
    await page.route('**/icons/**', (route) => route.abort());
    await boot(layoutFor(false, [unknownIconWidget('w-unknown2', 'mdi:aura-test-no-such-icon-290b')]));
    await page.waitForTimeout(9000);
    const publicAgain = requests.filter((u) => PUBLIC_HOSTS.test(u));
    check(
        'without the switch the public hosts are still the fallback',
        publicAgain.length > 0,
        `${publicAgain.length} request(s)`,
    );
    await page.unroute('**/icons/**');
} finally {
    await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} check(s) FAILED` : '\nall checks passed');
process.exit(failed.length ? 1 : 0);
