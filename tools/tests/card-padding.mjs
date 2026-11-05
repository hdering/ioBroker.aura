// Innenabstand je Widget (#928): options.paddingY / paddingX überschreiben den
// Innenabstand des Layouts nur für diese Karte.
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/card-padding.mjs
//
// Geprüft: die Karte zeichnet den eigenen Abstand (oben/unten und links/rechts
// getrennt), --aura-widget-pad folgt links/rechts (Listen-Bleed, #590), ein
// Widget ohne Option behält den Layout-Wert, eine Gruppe bleibt randlos, und das
// Feld im Abschnitt „Erweitert" schreibt die Option bzw. löscht sie bei leerer Eingabe.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';

let failed = 0;
const check = (ok, name, detail = '') => {
    if (!ok) failed++;
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
const settle = (ms = 600) => page.waitForTimeout(ms);

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 60000 });
await page.evaluate(() => window.__auraShot.unfoldSections());

const widgets = [
    {
        id: 'w-own',
        type: 'value',
        title: 'Eigen',
        datapoint: '0_userdata.0.x',
        gridPos: { x: 0, y: 0, w: 4, h: 3 },
        options: { paddingY: 4, paddingX: 8 },
    },
    {
        id: 'w-def',
        type: 'value',
        title: 'Standard',
        datapoint: '0_userdata.0.x',
        gridPos: { x: 4, y: 0, w: 4, h: 3 },
        options: {},
    },
    {
        id: 'w-map',
        type: 'iframe',
        title: 'Karte',
        gridPos: { x: 8, y: 0, w: 4, h: 3 },
        options: { paddingY: 4, url: 'about:blank' },
    },
];
await page.evaluate((w) => window.__auraShot.showWidgets(w, { widgetPadding: 16 }), widgets);
await settle(1200);

const card = (id) => page.locator(`[data-aura-widget="${id}"]`).first();
const pad = (id) =>
    card(id).evaluate((el) => {
        const box = el.closest('.aura-widget') ?? el.querySelector('.aura-widget') ?? el;
        const cs = getComputedStyle(box);
        return {
            t: cs.paddingTop,
            l: cs.paddingLeft,
            v: cs.getPropertyValue('--aura-widget-pad').trim(),
            vy: cs.getPropertyValue('--aura-widget-pad-y').trim(),
        };
    });

const own = await pad('w-own');
check(own.t === '4px' && own.l === '8px', 'own padding drawn per axis', JSON.stringify(own));
check(own.v === '8px' && own.vy === '4px', 'pad vars follow the own padding', JSON.stringify(own));
const def = await pad('w-def');
check(def.t === '16px' && def.l === '16px', 'no option keeps the layout padding', JSON.stringify(def));
const bare = await pad('w-map');
check(bare.v === '0px', 'an edge-to-edge type ignores the option', JSON.stringify(bare));

// ── Editor field ──────────────────────────────────────────────────────────────
await page.evaluate(() => window.__auraShot.setEditMode(true));
await settle();
await card('w-def').hover();
await card('w-def').locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
await settle();
const dlg = page.locator('.aura-widget-edit-modal');
const inY = dlg.locator('[data-card-padding-input="paddingY"]');
check((await inY.count()) === 1, 'Erweitert offers the padding field');
check((await inY.getAttribute('placeholder')) === '16', 'placeholder shows the layout padding');
await inY.evaluate((e) => e.closest('details')?.setAttribute('open', ''));
await inY.fill('6');
await settle();
let opts = await page.evaluate(() => window.__auraShot.widgetOptions('w-def'));
check(opts?.paddingY === 6, 'typing writes options.paddingY', JSON.stringify(opts));
await inY.fill('');
await settle();
opts = await page.evaluate(() => window.__auraShot.widgetOptions('w-def'));
check(opts?.paddingY === undefined, 'emptying removes the option', JSON.stringify(opts));

check(pageErrors.length === 0, 'no page errors', pageErrors.join(' | '));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall ok');
process.exit(failed ? 1 : 0);
