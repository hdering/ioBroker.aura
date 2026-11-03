// Bedingungen an Bereichen und Marker in der Bereichsleiste (#907).
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/section-conditions.mjs
//
// Bereiche hatten nur Marker, Tabs zusätzlich Bedingungen. Jetzt nimmt ein
// Bereichs-Eintrag dieselben Regeln: Farben (Icon/Text/Hintergrund), Effekt,
// Ausblenden, Deaktivieren. Und die Marker sitzen in der angedockten Leiste auf
// der Ecke statt in der Zeile — vorher machten sie den Eintrag breiter und
// schoben auf dem Handy die übrigen aus der Leiste.
//
// Läuft offline, fasst keine Instanz an (Werte über mockServerState).
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const rule = (dp, extra) => ({
    id: `c-${dp}`,
    logic: 'AND',
    clauses: [{ datapoint: dp, operator: '==', value: 'true' }],
    style: {},
    ...extra,
});
const tabs = (id) => [{ id: `t-${id}`, name: 'Dashboard', slug: 'dashboard', widgets: [] }];
const section = (id, name, extra = {}) => ({
    id,
    name,
    slug: id,
    icon: 'mdi:home',
    tabs: tabs(id),
    activeTabId: `t-${id}`,
    ...extra,
});

const layouts = [
    {
        id: 'l1',
        name: 'Handy',
        slug: 'handy',
        activeSectionId: 'home',
        sections: [
            section('home', 'Home'),
            section('fenster', 'Fenster', {
                conditions: [rule('demo.window', { style: { accent: 'rgb(255, 0, 0)' }, effect: 'pulse' })],
                badges: [{ id: 'b1', style: 'dot', corner: 'top-right', visibility: 'always', color: '#f00' }],
            }),
            section('weg', 'Weg', { conditions: [rule('demo.away', { hideWidget: true })] }),
            section('gesperrt', 'Gesperrt', { conditions: [rule('demo.lock', { disableWidget: true })] }),
        ],
    },
];

const browser = await chromium.launch();
const pageErrors = [];
const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, ignoreHTTPSErrors: true });
await ctx.route('**/*', (route) => {
    const url = route.request().url();
    const backend = /socket\.io|[?&]sid=|\/proxy/.test(url);
    return url.startsWith(BASE) && !backend ? route.continue() : route.abort();
});
const page = await ctx.newPage();
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 60000 });

const entry = (name) => page.locator('.aura-section-bar button', { hasText: name });

const boot = async (values) => {
    await page.evaluate(
        ([ls, vals]) => {
            window.__auraShot.mockServerState(vals);
            window.__auraShot.mock(vals);
            window.__auraShot.setFrontend({ layoutDrawerEnabled: true, layoutDrawerPlacement: 'top' });
            window.__auraShot.seed({ layouts: ls, activeLayoutId: 'l1' });
        },
        [layouts, values],
    );
    await entry('Home').waitFor({ state: 'visible', timeout: 30000 });
};

// ── Bedingungen greifen nicht ────────────────────────────────────────────────
await boot({ 'demo.window': false, 'demo.away': false, 'demo.lock': false });
await page.waitForTimeout(300);
const idle = await entry('Fenster').evaluate((el) => ({
    icon: getComputedStyle(el.querySelector('[data-aura-nav-icon="section"]')).color,
    anim: getComputedStyle(el).animationName,
}));
check(
    'ohne Treffer: Icon nicht rot, kein Pulsieren',
    idle.icon !== 'rgb(255, 0, 0)' && idle.anim === 'none',
    JSON.stringify(idle),
);
check('ohne Treffer: ausblendbarer Bereich ist da', await entry('Weg').isVisible());

// Marker in der Leiste: auf der Ecke, nicht in der Zeile.
const badge = await entry('Fenster').evaluate((el) => {
    const corner = el.querySelector('.aura-badge-corner');
    return { corner: !!corner, pos: corner ? getComputedStyle(corner).position : null };
});
check('Marker sitzt als Overlay auf der Ecke', badge.corner && badge.pos === 'absolute', JSON.stringify(badge));
const widthWith = (await entry('Fenster').boundingBox()).width;
const widthHome = (await entry('Home').boundingBox()).width;
// "Fenster" ist länger als "Home" — gleiche Polsterung, nur Textbreite. Ein Marker in
// der Zeile hätte noch Punkt + Abstand dazugelegt; also gegen die Textbreite prüfen.
const textW = await entry('Fenster').evaluate((el) => el.querySelector('span.truncate').getBoundingClientRect().width);
const textHome = await entry('Home').evaluate((el) => el.querySelector('span.truncate').getBoundingClientRect().width);
check(
    'Marker macht den Eintrag nicht breiter',
    Math.abs(widthWith - textW - (widthHome - textHome)) <= 1,
    `Fenster ${widthWith}/${textW}, Home ${widthHome}/${textHome}`,
);

// ── Bedingungen greifen ──────────────────────────────────────────────────────
await boot({ 'demo.window': true, 'demo.away': true, 'demo.lock': true });
await page.waitForTimeout(300);
const hot = await entry('Fenster').evaluate((el) => ({
    icon: getComputedStyle(el.querySelector('[data-aura-nav-icon="section"]')).color,
    anim: getComputedStyle(el).animationName,
}));
check('Treffer: Akzent färbt das Icon des inaktiven Bereichs', hot.icon === 'rgb(255, 0, 0)', hot.icon);
check('Treffer: Effekt Pulsieren läuft', hot.anim === 'tabPulse', hot.anim);
check('Treffer: Bereich mit Ausblenden-Regel ist weg', (await entry('Weg').count()) === 0);
const locked = await entry('Gesperrt').evaluate((el) => ({
    aria: el.getAttribute('aria-disabled'),
    opacity: getComputedStyle(el).opacity,
}));
check(
    'Treffer: deaktivierter Bereich ist grau und gesperrt',
    locked.aria === 'true' && Number(locked.opacity) < 0.6,
    JSON.stringify(locked),
);
await entry('Gesperrt').click({ force: true }); // aria-disabled: Playwright klickt sonst gar nicht
await page.waitForTimeout(200);
check('Klick auf gesperrten Bereich wechselt nicht', !page.url().includes('/s/gesperrt'), page.url());
await entry('Fenster').click();
await page.waitForTimeout(200);
check('Klick auf normalen Bereich wechselt', page.url().includes('/s/fenster'), page.url());

await page.screenshot({ path: process.env.SHOT ?? 'node_modules/.cache/section-conditions.png' });
check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
