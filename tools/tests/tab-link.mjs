// Verknüpfte Tabs (#896): ein Tab in einem zweiten Layout zeigt die Widgets eines
// Tabs aus dem ersten — unter eigenem Namen, mit eigener Reihenfolge. Die PIN kommt
// vom Original, der eigene Bereich bleibt dabei offen.
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/tab-link.mjs
//
// Das Dashboard kommt aus dem Screenshot-Harness — keine echte Konfiguration,
// kein Datenpunkt wird angefasst. Die Logik ohne Browser: tab-link-logic.mjs.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};

const widget = (id, title) => ({
    id,
    type: 'info',
    title,
    datapoint: '',
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 10, h: 6 },
    options: { showTitle: true },
});

const ME = {
    id: 'l-me',
    name: 'Ich',
    slug: 'ich',
    activeSectionId: 's-haus',
    sections: [
        {
            id: 's-haus',
            name: 'Haus',
            slug: 'haus',
            activeTabId: 't-licht',
            tabs: [
                { id: 't-licht', name: 'Licht', slug: 'licht', widgets: [widget('w-licht', 'Deckenlampe')] },
                // Klartext-PIN: der Pfad ohne Adapter (Dev-Server), wie in pin-lock-ui.mjs.
                {
                    id: 't-garage',
                    name: 'Garage',
                    slug: 'garage',
                    pin: '1234',
                    pinLength: 4,
                    widgets: [widget('w-garage', 'Tor')],
                },
            ],
        },
    ],
};

const WIFE = {
    id: 'l-wife',
    name: 'Frau',
    slug: 'frau',
    activeSectionId: 's-start',
    sections: [
        {
            id: 's-start',
            name: 'Start',
            slug: 'start',
            activeTabId: 'tab-tor',
            tabs: [
                // Eigene Reihenfolge: die Garage zuerst.
                { id: 'tab-tor', name: 'Tor', slug: 'tor', widgets: [], link: { sectionId: 's-haus', tabId: 't-garage' } },
                {
                    id: 'tab-lampen',
                    name: 'Lampen',
                    slug: 'lampen',
                    widgets: [],
                    link: { sectionId: 's-haus', tabId: 't-licht' },
                },
                { id: 'tab-weg', name: 'Weg', slug: 'weg', widgets: [], link: { sectionId: 's-haus', tabId: 'gone' } },
            ],
        },
    ],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1000, height: 760 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate((layouts) => window.__auraShot.seed({ layouts }), [ME, WIFE]);

const PROMPT = '.aura-pin-prompt';
const goto = async (path) => {
    await page.evaluate((p) => {
        window.location.hash = `#${p}`;
    }, path);
    await page.waitForTimeout(300);
};
const typeCode = async (code) => {
    for (const d of code)
        await page
            .locator(`${PROMPT} button`, { hasText: new RegExp(`^${d}$`) })
            .first()
            .click();
    await page.waitForTimeout(250);
};
const visible = async (sel) =>
    page
        .locator(sel)
        .first()
        .isVisible()
        .catch(() => false);

// ── Inhalt kommt vom Original ────────────────────────────────────────────────
console.log('\n── verknüpfter Tab ──');
await goto('/view/frau/tab/lampen');
check('die Widgets des Originals rendern', await visible('.aura-widget-w-licht'));
const bar = page.locator('.aura-tabs');
check('eigener Name in der Leiste', (await bar.getByText('Lampen').count()) === 1);
check('der Name des Originals steht nicht in der Leiste', (await bar.getByText('Licht').count()) === 0);
const barText = await bar.first().innerText();
check(
    'eigene Reihenfolge',
    barText.indexOf('Tor') >= 0 && barText.indexOf('Tor') < barText.indexOf('Lampen'),
    barText,
);

// ── PIN vom Original ─────────────────────────────────────────────────────────
console.log('\n── PIN vom Original ──');
await goto('/view/frau/tab/tor');
check('der Link fragt die PIN des Originals ab', await visible(PROMPT));
check('nichts vom Inhalt vor der Eingabe', !(await visible('.aura-widget-w-garage')));
check(
    'als Tab abgefragt, nicht als Bereich',
    (await page.locator(PROMPT).first().getAttribute('data-pin-scope')) === 'tab',
);
check('die Tab-Leiste des eigenen Bereichs bleibt', (await bar.getByText('Lampen').count()) === 1);
await typeCode('1234');
check('nach dem Code rendert der Inhalt', await visible('.aura-widget-w-garage'));
check('kein Prompt mehr', !(await visible(PROMPT)));

// Weg und zurück: 'leave' sperrt wieder.
await goto('/view/frau/tab/lampen');
await goto('/view/frau/tab/tor');
check('nach dem Verlassen wieder gesperrt', await visible(PROMPT));

// ── Original fehlt ───────────────────────────────────────────────────────────
console.log('\n── Original fehlt ──');
await goto('/view/frau/tab/weg');
check('ein verwaister Link rendert leer statt abzustürzen', !(await visible(PROMPT)));

// ── Original unverändert ─────────────────────────────────────────────────────
console.log('\n── Original ──');
await goto('/view/ich/tab/licht');
check('das Original rendert weiter', await visible('.aura-widget-w-licht'));

check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    failed.forEach((f) => console.log(`  FAIL ${f.name} — ${f.detail}`));
    process.exit(1);
}
