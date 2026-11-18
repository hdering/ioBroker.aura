// Tableiste hält den aktiven Tab im Blick (#979). Mobil ist die Leiste breiter
// als der Bildschirm; wechselt der Tab per Adresse (oder Wischen, Rücksprung),
// muss die Leiste ihn in die Mitte holen. Beim Laden ohne Animation, danach weich.
// Von Hand verschoben bleibt die Leiste stehen, bis sich der aktive Tab ändert.
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/tab-bar-autoscroll.mjs
//
// Das Dashboard kommt aus dem Screenshot-Harness — kein Datenpunkt wird angefasst.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};

const tabs = Array.from({ length: 16 }, (_, i) => ({
    id: `t${i}`,
    name: `Raum Nummer ${i + 1}`,
    slug: `raum-${i + 1}`,
    widgets: [],
}));

const LAYOUT = {
    id: 'l-scroll',
    name: 'Scroll',
    slug: 'scroll',
    activeSectionId: 's1',
    sections: [{ id: 's1', name: 'Haus', slug: 'haus', activeTabId: 't9', tabs }],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 760 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate((layout) => window.__auraShot.seed({ layouts: [layout] }), LAYOUT);
await page.evaluate(() => {
    window.location.hash = '#/view/scroll/s/haus/tab/raum-10';
});
await page.waitForTimeout(600);

// Wie weit liegt die Mitte des aktiven Tabs von der Mitte der Leiste weg?
const offCenter = () =>
    page.evaluate(() => {
        const a = document.querySelector('.aura-tabs .aura-tab-btn[data-aura-active]');
        if (!a) {
            return { err: 'kein aktiver Tab' };
        }
        const sc = a.closest('.aura-scroll');
        const sr = sc.getBoundingClientRect();
        const ar = a.getBoundingClientRect();
        return {
            name: a.textContent.trim(),
            aria: a.getAttribute('aria-current'),
            delta: Math.round(ar.left + ar.width / 2 - (sr.left + sr.width / 2)),
            scrollLeft: Math.round(sc.scrollLeft),
            overflow: sc.scrollWidth - sc.clientWidth,
        };
    });

let s = await offCenter();
check('Leiste läuft über', s.overflow > 200, JSON.stringify(s));
check('aktiver Tab trägt aria-current', s.aria === 'page', JSON.stringify(s));
check('beim Laden mittig (Tab 10)', s.name?.includes('10') && Math.abs(s.delta) <= 2, JSON.stringify(s));

// Tabwechsel per Adresse
await page.evaluate(() => {
    window.location.hash = '#/view/scroll/s/haus/tab/raum-14';
});
await page.waitForTimeout(900);
s = await offCenter();
check('nach Wechsel mittig (Tab 14)', s.name?.includes('14') && Math.abs(s.delta) <= 2, JSON.stringify(s));

// Ganz am Rand: so weit wie möglich, nicht darüber hinaus.
await page.evaluate(() => {
    window.location.hash = '#/view/scroll/s/haus/tab/raum-1';
});
await page.waitForTimeout(900);
s = await offCenter();
check('erster Tab: Leiste ganz links', s.scrollLeft === 0, JSON.stringify(s));

// Von Hand verschieben: bleibt stehen, solange der Tab gleich bleibt.
await page.locator('.aura-tabs .aura-scroll').first().hover();
await page.evaluate(() => {
    const sc = document.querySelector('.aura-tabs .aura-scroll');
    sc.dispatchEvent(new WheelEvent('wheel', { deltaX: 300, bubbles: true }));
    sc.scrollLeft = 500;
});
await page.waitForTimeout(400);
s = await offCenter();
check('von Hand verschoben bleibt stehen', s.scrollLeft === 500, JSON.stringify(s));

// Klick auf einen sichtbaren Tab: dieser rückt in die Mitte.
const target = page.locator('.aura-tabs .aura-tab-btn', { hasText: 'Raum Nummer 7' });
await target.click();
await page.waitForTimeout(900);
s = await offCenter();
check('Klick zentriert den Tab (7)', s.name?.includes('7') && Math.abs(s.delta) <= 2, JSON.stringify(s));

check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
