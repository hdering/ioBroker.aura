// Wischgesten-Navigation (#908): ein Finger-Wisch über das Dashboard wechselt
// Tab (links/rechts) bzw. Bereich (hoch/runter). Ausgeblendete Tabs werden
// übersprungen, ein Bereich kann das Wischen für sich abschalten, Widgets mit
// eigener Geste (Schieberegler) behalten sie.
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/swipe-nav.mjs
//
// Touch kommt über CDP (Input.dispatchTouchEvent) — Playwright selbst kennt nur
// Taps. Das Dashboard kommt aus dem Screenshot-Harness, kein Datenpunkt wird angefasst.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};

const info = (id, title) => ({
    id,
    type: 'info',
    title,
    datapoint: '',
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 12, h: 4 },
    options: { showTitle: true },
});
const slider = (id) => ({
    id,
    type: 'slider',
    title: 'Regler',
    datapoint: '0_userdata.0.aura_swipe_test_does_not_exist',
    layout: 'default',
    gridPos: { x: 0, y: 4, w: 12, h: 3 },
    options: { showTitle: true },
});
const tab = (id, name, extra = {}, widgets) => ({
    id,
    name,
    slug: id,
    widgets: widgets ?? [info(`w-${id}`, name)],
    ...extra,
});

const LAYOUT = {
    id: 'l-swipe',
    name: 'Wischen',
    slug: 'wischen',
    activeSectionId: 'eins',
    sections: [
        {
            id: 'eins',
            name: 'Eins',
            slug: 'eins',
            activeTabId: 'a',
            tabs: [
                tab('a', 'Alpha', {}, [info('w-a', 'Alpha'), slider('w-slider')]),
                tab('b', 'Bravo', { hidden: true }),
                tab('c', 'Charlie'),
                // Lang genug zum Scrollen.
                tab(
                    'd',
                    'Delta',
                    {},
                    [0, 1, 2, 3, 4, 5].map((i) => ({
                        ...info(`w-d${i}`, `Delta ${i}`),
                        gridPos: { x: 0, y: i * 8, w: 12, h: 8 },
                    })),
                ),
            ],
        },
        // Bereich mit eigenem Wischverhalten: hier ist die Geste aus.
        {
            id: 'zwei',
            name: 'Zwei',
            slug: 'zwei',
            activeTabId: 'z1',
            settings: { swipeNavEnabled: false },
            tabs: [tab('z1', 'Zulu'), tab('z2', 'Yankee')],
        },
        { id: 'drei', name: 'Drei', slug: 'drei', activeTabId: 'x1', tabs: [tab('x1', 'Xray')] },
    ],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({
    viewport: { width: 420, height: 760 },
    hasTouch: true,
    isMobile: true,
    ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
const cdp = await ctx.newCDPSession(page);

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate((layout) => window.__auraShot.seed({ layouts: [layout] }), LAYOUT);

const setFrontend = (patch) => page.evaluate((p) => window.__auraShot.setFrontend(p), patch);
const goto = async (path) => {
    await page.evaluate((p) => {
        window.location.hash = `#${p}`;
    }, path);
    await page.waitForTimeout(300);
};
const hash = () => page.evaluate(() => decodeURIComponent(window.location.hash));

/** One finger from (x1,y1) to (x2,y2) in ~120 ms. */
async function swipe(x1, y1, x2, y2) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1, id: 1 }] });
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
        await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [
                { x: Math.round(x1 + ((x2 - x1) * i) / steps), y: Math.round(y1 + ((y2 - y1) * i) / steps), id: 1 },
            ],
        });
        await page.waitForTimeout(15);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(350);
}
const MID_X = 210;
const ROW_Y = 160; // on the first info widget
const left = () => swipe(MID_X + 120, ROW_Y, MID_X - 120, ROW_Y);
const right = () => swipe(MID_X - 120, ROW_Y, MID_X + 120, ROW_Y);
const up = () => swipe(MID_X, 500, MID_X, 300);
const down = () => swipe(MID_X, 300, MID_X, 500);

// ── aus (Standard) ───────────────────────────────────────────────────────────
console.log('\n── Standard: aus ──');
await goto('/view/wischen/s/eins/tab/a');
await left();
check('ohne Einstellung wechselt nichts', (await hash()).endsWith('/tab/a'), await hash());

// ── Tabs links/rechts ────────────────────────────────────────────────────────
console.log('\n── Tabs ──');
await setFrontend({ swipeNavEnabled: true, swipeNavHorizontal: 'tabs', swipeNavVertical: 'sections' });
await goto('/view/wischen/s/eins/tab/a');
await left();
check('nach links = nächster Tab, ausgeblendeter wird übersprungen', (await hash()).endsWith('/tab/c'), await hash());
check('der Tab rendert', await page.locator('.aura-widget-w-c').first().isVisible());
await right();
check('nach rechts = zurück', (await hash()).endsWith('/tab/a'), await hash());
await right();
check('am Anfang ohne Umlauf bleibt es stehen', (await hash()).endsWith('/tab/a'), await hash());

// Geste auf dem Schieberegler gehört dem Regler.
const sl = await page
    .locator('.aura-widget-w-slider input[type="range"], .aura-widget-w-slider [role="slider"]')
    .first();
const box = await sl.boundingBox().catch(() => null);
if (box) {
    await swipe(box.x + box.width - 20, box.y + box.height / 2, box.x + 20, box.y + box.height / 2);
    check('Wisch auf dem Schieberegler wechselt keinen Tab', (await hash()).endsWith('/tab/a'), await hash());
} else {
    check('Schieberegler gefunden', false, 'kein Regler-Element im Widget');
}

// Kurzer, langsamer Zug ist kein Wisch.
await swipe(MID_X + 20, ROW_Y, MID_X - 20, ROW_Y);
check('kurzer Zug ist kein Wisch', (await hash()).endsWith('/tab/a'), await hash());

// Vom Bildschirmrand gehört die Geste dem System (Zurück).
await swipe(8, ROW_Y, 200, ROW_Y);
check('Wisch vom Rand wird ignoriert', (await hash()).endsWith('/tab/a'), await hash());

console.log('\n── Umlauf ──');
await setFrontend({ swipeNavWrap: true });
await right();
check('mit Umlauf: vom ersten zurück auf den letzten', (await hash()).endsWith('/tab/d'), await hash());
await left();
check('mit Umlauf: vom letzten weiter auf den ersten', (await hash()).endsWith('/tab/a'), await hash());
await setFrontend({ swipeNavWrap: false });

// ── Bereiche hoch/runter ─────────────────────────────────────────────────────
console.log('\n── Bereiche ──');
await goto('/view/wischen/s/eins/tab/a');
await up();
check('nach oben = nächster Bereich', (await hash()).includes('/s/zwei'), await hash());
await up();
check('Bereich mit abgeschaltetem Wischen bleibt stehen', (await hash()).includes('/s/zwei'), await hash());
await left();
check('dort auch kein Tab-Wechsel', !(await hash()).endsWith('/tab/z2'), await hash());
// Mitten in einer langen Seite gehört hoch/runter dem Scrollen.
await goto('/view/wischen/s/eins/tab/d');
const scrolled = await page.evaluate(() => {
    const els = [...document.querySelectorAll('*')].filter((el) => {
        const cs = getComputedStyle(el);
        return /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 50;
    });
    const el = els[0];
    if (!el) return false;
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
    return true;
});
check('lange Seite scrollt', scrolled);
await swipe(MID_X, 500, MID_X, 300);
check('mitten im Scrollen kein Bereichswechsel', (await hash()).includes('/s/eins'), await hash());
await goto('/view/wischen/s/drei');
await down();
check('nach unten = vorheriger Bereich', (await hash()).includes('/s/zwei'), await hash());

// ── horizontal auf Bereiche umgelegt ─────────────────────────────────────────
console.log('\n── Belegung ──');
await setFrontend({ swipeNavHorizontal: 'sections', swipeNavVertical: 'off' });
await goto('/view/wischen/s/eins/tab/a');
await left();
check('links/rechts auf Bereiche umgelegt', (await hash()).includes('/s/zwei'), await hash());
await goto('/view/wischen/s/eins/tab/a');
await up();
check('hoch/runter aus', (await hash()).includes('/s/eins'), await hash());

check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    failed.forEach((f) => console.log(`  FAIL ${f.name} — ${f.detail}`));
    process.exit(1);
}
