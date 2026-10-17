// Checks the off-screen probe render: measuring a tab NOBODY has open.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/render-probe.mjs
//
// Why: aura_rendered is the only tool that can say what a widget really
// measures, and it could not answer for a tab that had just been built — a
// hidden tab is display:none and measures zero, so the answer was "ask the user
// to open it". Reported from a session that ended up opening the dashboard's
// public URL in a browser itself to get any measurement at all.
//
// The adapter writes a tab id into aura.0.info.renderProbe; every live frontend
// sees it and ONE renders that tab off-screen at the real grid width. What is
// tested here is the part no unit test can reach:
//   1. the probe container appears, holds the requested tab's widgets, and they
//      have real heights (an off-screen box is laid out, display:none is not);
//   2. the tab the browser is SHOWING is never probed twice — mounting it again
//      would put two elements with the same data-aura-tab-id in the DOM;
//   3. a camera is replaced by an empty box. This is the one that matters beyond
//      tidiness: mounting a camera starts a stream and, with a wake-up
//      datapoint, writes SLEEP again when the probe unmounts — a measurement
//      would switch off a camera somebody else is watching;
//   4. the probe disappears again, so nothing keeps subscriptions alive;
//   5. a FILL probe (aura_rendered fill=true) draws a capped status overview with
//      maxRows + 1 entries and long names — the worst case — instead of the rows
//      there are now, and does so for the tab on screen too.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const DP = 'demo.0.wert';

let failures = 0;
const check = (label, fn) => {
    try {
        fn();
        console.log(`  ✓ ${label}`);
    } catch (e) {
        failures++;
        console.log(`  ✗ ${label}\n    ${e.message}`);
    }
};

const listWidget = (id, rows, y) => ({
    id,
    type: 'list',
    title: 'Messung',
    datapoint: '',
    gridPos: { x: 0, y, w: 20, h: 8 },
    options: { entries: Array.from({ length: rows }, () => ({ id: DP, label: 'Zeile' })) },
});

const LAYOUT = {
    id: 'l1',
    name: 'Wohnung',
    slug: 'wohnung',
    activeSectionId: 's1',
    settings: { gridRowHeight: 20, gridSnapX: 20, gridGap: 10 },
    sections: [
        {
            id: 's1',
            name: 'Start',
            slug: 'start',
            activeTabId: 't-open',
            tabs: [
                {
                    id: 't-open',
                    name: 'Offen',
                    slug: 'offen',
                    widgets: [listWidget('sichtbar', 4, 0)],
                },
                {
                    // The tab nobody is looking at — the one the probe is for.
                    id: 't-hidden',
                    name: 'Versteckt',
                    slug: 'versteckt',
                    widgets: [
                        listWidget('probe-kurz', 4, 0),
                        listWidget('probe-lang', 20, 10),
                        {
                            id: 'probe-cam',
                            type: 'camera',
                            title: 'Hof',
                            datapoint: '',
                            gridPos: { x: 0, y: 22, w: 20, h: 8 },
                            // A wake-up datapoint is exactly the dangerous case:
                            // the unmount would write to it.
                            options: { streamUrl: 'http://127.0.0.1:9/stream.mjpg', wakeUpDp: DP },
                        },
                        {
                            id: 'probe-status',
                            type: 'statusoverview',
                            title: 'Fenster',
                            datapoint: '',
                            layout: 'card',
                            gridPos: { x: 0, y: 31, w: 14, h: 6 },
                            // A name pattern that would shorten every name: the fill
                            // probe must ignore it, its long name is the point.
                            options: { maxRows: 6, namePattern: 'X' },
                        },
                    ],
                },
            ],
        },
    ],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1200 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

await page.evaluate(
    ({ layout, dp }) => {
        window.__auraShot.mock({ [dp]: 21.5 });
        window.__auraShot.mockServerState({ [dp]: 21.5 });
        window.__auraShot.seed({ layouts: [layout], activeLayoutId: layout.id, editMode: false });
    },
    { layout: LAYOUT, dp: DP },
);
await page.waitForTimeout(600);

/** The probe request the adapter would write, delivered the way a state arrives. */
async function requestProbe(tabId, extra) {
    await page.evaluate(
        ({ id, extra }) => {
            window.__auraShot.mock({
                'aura.0.info.renderProbe': JSON.stringify({ tabId: id, ts: Date.now(), ...extra }),
            });
        },
        { id: tabId, extra: extra || {} },
    );
    await page.waitForTimeout(1500);
}

const before = await page.evaluate(() => document.querySelectorAll('[data-aura-render-probe]').length);
check('no probe container without a request', () => {
    if (before !== 0) throw new Error(`${before} containers`);
});

await requestProbe('t-hidden');
const probed = await page.evaluate(() => {
    const box = document.querySelector('[data-aura-render-probe]');
    if (!box) return { error: 'no probe container' };
    const rect = box.getBoundingClientRect();
    const widgets = Array.from(box.querySelectorAll('[data-aura-widget]')).map((el) => ({
        id: el.dataset.auraWidget,
        type: el.dataset.auraWidgetType,
        px: Math.round(el.getBoundingClientRect().height),
        // What the report's contentPx is built from: does anything scroll inside.
        over: Array.from(el.querySelectorAll('*')).reduce((max, node) => {
            const hidden = node.scrollHeight - node.clientHeight;
            const style = getComputedStyle(node);
            const scrolls = style.overflowY === 'auto' || style.overflowY === 'scroll';
            return scrolls && hidden > max ? hidden : max;
        }, 0),
        // A camera in a probe must be an empty card: no <img>, no <video>, no <iframe>.
        media: el.querySelectorAll('img, video, iframe').length,
    }));
    return {
        tab: box.dataset.auraRenderProbe,
        offScreen: rect.right < 0 || rect.left > window.innerWidth,
        width: Math.round(rect.width),
        widgets,
        statusFilled: box.querySelector('[data-aura-probe-filled]')?.getAttribute('data-aura-probe-filled') ?? null,
        // The visible tab must still be mounted exactly once.
        openTabs: document.querySelectorAll('[data-aura-tab-id="t-open"]').length,
        hiddenTabs: document.querySelectorAll('[data-aura-tab-id="t-hidden"]').length,
    };
});

check('the requested tab is rendered in a container parked off-screen', () => {
    if (probed.error) throw new Error(probed.error);
    if (probed.tab !== 't-hidden') throw new Error(`container for ${probed.tab}`);
    if (!probed.offScreen) throw new Error('the container is on screen');
    if (!(probed.width > 200)) throw new Error(`container width ${probed.width}px`);
});

check('its widgets are laid out and have real heights', () => {
    const ids = (probed.widgets || []).map((w) => w.id).sort();
    if (ids.join(',') !== 'probe-cam,probe-kurz,probe-lang,probe-status') throw new Error(ids.join(','));
    for (const w of probed.widgets.filter((x) => x.id !== 'probe-status')) {
        if (!(w.px > 20)) throw new Error(`${w.id} measured ${w.px}px — an off-screen box must still lay out`);
    }
});

check('a list too short for its rows scrolls in the probe, one with room does not', () => {
    const short = probed.widgets.find((w) => w.id === 'probe-lang');
    const fits = probed.widgets.find((w) => w.id === 'probe-kurz');
    if (!(short.over > 40)) throw new Error(`twenty rows in eight rows of box scrolled only ${short.over}px`);
    if (fits.over > 2) throw new Error(`four rows in the same box scrolled ${fits.over}px`);
});

check('a camera is an empty card in a probe — no stream, no sleep write on unmount', () => {
    const cam = probed.widgets.find((w) => w.id === 'probe-cam');
    if (cam.media !== 0) throw new Error(`${cam.media} media element(s) mounted`);
});

check('the tab the browser is showing is mounted once, and never probed', () => {
    if (probed.openTabs !== 1) throw new Error(`${probed.openTabs} copies of the visible tab`);
    if (probed.hiddenTabs !== 1) throw new Error(`${probed.hiddenTabs} copies of the probed tab`);
});

// The visible tab reports itself, so a probe for it would only put a second
// element with the same data-aura-tab-id in the DOM.
await requestProbe('t-open');
const selfProbe = await page.evaluate(() => ({
    containers: document.querySelectorAll('[data-aura-render-probe]').length,
    openTabs: document.querySelectorAll('[data-aura-tab-id="t-open"]').length,
}));
check('a probe for the tab on screen is ignored', () => {
    if (selfProbe.containers !== 0) throw new Error(`${selfProbe.containers} containers`);
    if (selfProbe.openTabs !== 1) throw new Error(`${selfProbe.openTabs} copies of the visible tab`);
});

check('a plain probe draws the status overview as it is, not filled', () => {
    if (probed.statusFilled !== null) throw new Error(`filled with ${probed.statusFilled}`);
});

// The worst case: maxRows + 1 entries with long names.
await requestProbe('t-hidden', { fill: true });
const filled = await page.evaluate(() => {
    const box = document.querySelector('[data-aura-render-probe]');
    const so = box && box.querySelector('[data-aura-widget="probe-status"]');
    if (!so) return { error: 'no status overview in the probe' };
    return {
        mark: so.querySelector('[data-aura-probe-filled]')?.getAttribute('data-aura-probe-filled') ?? null,
        tiles: so.querySelectorAll('.aura-status-tile').length,
        names: Array.from(so.querySelectorAll('.aura-status-tile-name')).map((n) => n.textContent),
        more: so.querySelector('.aura-status-more')?.textContent ?? null,
    };
});
check('a fill probe draws maxRows tiles with long names and the „+N weitere“ line', () => {
    if (filled.error) throw new Error(filled.error);
    if (filled.mark !== '7') throw new Error(`marked ${filled.mark}, expected 7 (maxRows 6 + 1)`);
    if (filled.tiles !== 6) throw new Error(`${filled.tiles} tiles`);
    if (!filled.names.every((n) => n.length > 30)) throw new Error(`names ${filled.names.join(' | ')}`);
    if (!filled.more || !/1/.test(filled.more)) throw new Error(`footer ${filled.more}`);
});

// A fill probe of the tab on screen is allowed (the screen does not show the worst
// case) — and the visible copy must stay as it is.
await requestProbe('t-open', { fill: true });
const selfFill = await page.evaluate(() => ({
    containers: document.querySelectorAll('[data-aura-render-probe]').length,
    openTabs: document.querySelectorAll('[data-aura-tab-id="t-open"]').length,
    inProbe: document.querySelectorAll('[data-aura-render-probe] [data-aura-tab-id="t-open"]').length,
}));
check('a fill probe of the tab on screen renders a second, off-screen copy', () => {
    if (selfFill.containers !== 1) throw new Error(`${selfFill.containers} containers`);
    if (selfFill.openTabs !== 2 || selfFill.inProbe !== 1) {
        throw new Error(`${selfFill.openTabs} copies, ${selfFill.inProbe} in the probe`);
    }
});
await page.waitForTimeout(6500);

// A tab that does not exist any more (deleted between request and delivery).
await requestProbe('t-gibtsnicht');
check('a request for an unknown tab draws nothing', () => {
    // Nothing to assert beyond "no container, no crash" — the next check covers
    // the page errors.
});
const gone = await page.evaluate(() => document.querySelectorAll('[data-aura-render-probe]').length);
check('an unknown tab leaves no container behind', () => {
    if (gone !== 0) throw new Error(`${gone} containers`);
});

// And the probe unmounts itself: nothing may keep a whole tab subscribed for ever.
await requestProbe('t-hidden');
await page.waitForTimeout(6000);
const after = await page.evaluate(() => document.querySelectorAll('[data-aura-render-probe]').length);
check('the probe container disappears again', () => {
    if (after !== 0) throw new Error(`${after} containers still mounted`);
});

check('no page errors', () => {
    if (pageErrors.length) throw new Error(pageErrors.join(' | '));
});

await browser.close();
console.log(failures ? `\nrender-probe: ${failures} FAILED` : '\nrender-probe: all checks passed');
process.exit(failures ? 1 : 0);
