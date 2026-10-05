// Ein iFrame mit „Aufrechterhalten“ überlebt Tab- und Bereichswechsel (issue #65).
//
// Tab: Das „Tab ausfüllen“-Widget liegt als Overlay über dem Tab — früher nur für den
// AKTIVEN Tab: beim Wegwechseln verschwand das Overlay samt iframe, das
// Widget rutschte ins versteckte Raster seines Tabs (zweiter iframe, lädt im
// Hintergrund), beim Zurückwechseln wieder heraus — die Seite lud bei jedem
// Wechsel neu.
//
// Bereich: Das Frontend rendert nur den Dashboard des aktiven Bereichs; ein
// Bereichswechsel baute ihn samt aller iFrames ab. Besuchte Bereiche bleiben
// jetzt wie besuchte Tabs versteckt gemountet.
//
// Ohne „Aufrechterhalten“ gilt das Gegenteil: Das iFrame wird verworfen, solange
// sein Tab oder Bereich verborgen ist, und lädt beim Zurückkehren frisch.
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/iframe-keepalive.mjs
//
// Die eingebettete Seite kommt von einem lokalen Server, der seine Abrufe zählt.
import { chromium } from 'playwright';
import http from 'node:http';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const hits = {};
const server = http.createServer((req, res) => {
    hits[req.url] = (hits[req.url] ?? 0) + 1;
    res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><body style="background:#123">x</body>');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};

const iframe = (id, path, extra = {}) => ({
    id,
    type: 'iframe',
    title: id,
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 10, h: 8 },
    options: { iframeUrl: `${ORIGIN}${path}`, keepAlive: true, ...extra },
});

const LAYOUT = {
    id: 'l-ka',
    name: 'KeepAlive',
    slug: 'ka',
    activeSectionId: 'sec-ka',
    sections: [
        {
            id: 'sec-ka',
            name: 'KA',
            slug: 'ka',
            activeTabId: 't-fill',
            tabs: [
                {
                    id: 't-fill',
                    name: 'Fill',
                    slug: 'fill',
                    widgets: [iframe('w-fill', '/fill.html', { fillTab: true })],
                },
                {
                    id: 't-other',
                    name: 'Other',
                    slug: 'other',
                    widgets: [
                        {
                            id: 'w-info',
                            type: 'info',
                            title: 'Info',
                            datapoint: '',
                            gridPos: { x: 0, y: 0, w: 10, h: 4 },
                            options: {},
                        },
                    ],
                },
                { id: 't-grid', name: 'Grid', slug: 'grid', widgets: [iframe('w-grid', '/grid.html')] },
                {
                    id: 't-plain',
                    name: 'Plain',
                    slug: 'plain',
                    widgets: [iframe('w-plain', '/plain.html', { keepAlive: false })],
                },
            ],
        },
        {
            id: 'sec-two',
            name: 'Two',
            slug: 'two',
            activeTabId: 't-two',
            tabs: [{ id: 't-two', name: 'Two', slug: 'two', widgets: [iframe('w-two', '/two.html')] }],
        },
    ],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate((layout) => window.__auraShot.seed({ layouts: [layout] }), LAYOUT);

const goto = async (slug, sec = 'ka') => {
    await page.evaluate(
        ([s, b]) => {
            window.location.hash = `#/view/ka/s/${b}/tab/${s}`;
        },
        [slug, sec],
    );
    await page.waitForTimeout(400);
};
const frames = (path) => page.evaluate((p) => document.querySelectorAll(`iframe[src$="${p}"]`).length, path);
const tag = (path) =>
    page.evaluate((p) => {
        const f = document.querySelector(`iframe[src$="${p}"]`);
        if (f) f.__auraTag = 'kept';
        return !!f;
    }, path);
const tagged = (path) =>
    page.evaluate((p) => document.querySelector(`iframe[src$="${p}"]`)?.__auraTag === 'kept', path);
const shown = (path) =>
    page.evaluate((p) => {
        const f = document.querySelector(`iframe[src$="${p}"]`);
        return !!f && f.getClientRects().length > 0;
    }, path);

// ── Ausgangslage: beide iFrame-Tabs einmal besuchen ──────────────────────────
await goto('fill');
await goto('grid');
await goto('fill');
check('der Fill-iframe ist da und sichtbar', (await tag('/fill.html')) && (await shown('/fill.html')));
check('der Raster-iframe ist da', await tag('/grid.html'));
const fillHits = hits['/fill.html'] ?? 0;
const gridHits = hits['/grid.html'] ?? 0;
check('der Fill-iframe lud genau einmal', fillHits === 1, `${fillHits} Abrufe`);

// ── Hin und her ──────────────────────────────────────────────────────────────
for (let i = 0; i < 5; i++) {
    await goto('other');
    await goto('grid');
    await goto('fill');
}
check('derselbe Fill-iframe nach 15 Wechseln', await tagged('/fill.html'));
check('derselbe Raster-iframe nach 15 Wechseln', await tagged('/grid.html'));
check('kein weiterer Abruf der Fill-Seite', (hits['/fill.html'] ?? 0) === fillHits, `${hits['/fill.html']} Abrufe`);
check('kein weiterer Abruf der Raster-Seite', (hits['/grid.html'] ?? 0) === gridHits, `${hits['/grid.html']} Abrufe`);

// ── Bereichswechsel ──────────────────────────────────────────────────────────
await goto('two', 'two');
check('im anderen Bereich ist dessen iframe sichtbar', await shown('/two.html'));
check('der Fill-iframe ist dort verborgen', !(await shown('/fill.html')));
check('der Raster-iframe ist dort verborgen', !(await shown('/grid.html')));
await tag('/two.html');
for (let i = 0; i < 5; i++) {
    await goto('fill');
    await goto('grid');
    await goto('two', 'two');
}
await goto('fill');
check('derselbe Fill-iframe nach Bereichswechseln', await tagged('/fill.html'));
check('derselbe Raster-iframe nach Bereichswechseln', await tagged('/grid.html'));
check('derselbe iframe im zweiten Bereich', await tagged('/two.html'));
check('Fill-Seite nicht neu geladen', (hits['/fill.html'] ?? 0) === fillHits, `${hits['/fill.html']} Abrufe`);
check('Raster-Seite nicht neu geladen', (hits['/grid.html'] ?? 0) === gridHits, `${hits['/grid.html']} Abrufe`);
check('Seite des zweiten Bereichs lud einmal', (hits['/two.html'] ?? 0) === 1, `${hits['/two.html']} Abrufe`);
check('zurück im Bereich ist der Fill-iframe sichtbar', await shown('/fill.html'));
check(
    'genau ein sichtbarer Tab im DOM',
    (await page.evaluate(
        () => [...document.querySelectorAll('.aura-tab')].filter((e) => e.getClientRects().length > 0).length,
    )) === 1,
);
check('der zweite Bereich ist versteckt, nicht abgebaut', (await frames('/two.html')) === 1);

// ── Inaktiv: verborgen, kein Duplikat im Raster ──────────────────────────────
await goto('other');
check('genau ein Fill-iframe im DOM', (await frames('/fill.html')) === 1, `${await frames('/fill.html')}`);
check('auf einem anderen Tab ist der Fill-iframe verborgen', !(await shown('/fill.html')));
check(
    'das Widget des anderen Tabs ist sichtbar',
    await page
        .locator('.aura-widget-w-info')
        .first()
        .isVisible()
        .catch(() => false),
);

// ── Ohne „Aufrechterhalten“: verwerfen und frisch laden ──────────────────────
await goto('plain');
check('das iframe ohne Aufrechterhalten lädt', (await shown('/plain.html')) && hits['/plain.html'] === 1);
await goto('other');
check('auf einem anderen Tab ist es aus dem DOM', (await frames('/plain.html')) === 0);
await goto('plain');
check(
    'zurück auf dem Tab lädt es frisch',
    (await shown('/plain.html')) && hits['/plain.html'] === 2,
    `${hits['/plain.html']} Abrufe`,
);
await goto('two', 'two');
check('in einem anderen Bereich ist es aus dem DOM', (await frames('/plain.html')) === 0);
await goto('plain');
check(
    'zurück im Bereich lädt es frisch',
    (await shown('/plain.html')) && hits['/plain.html'] === 3,
    `${hits['/plain.html']} Abrufe`,
);

check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
