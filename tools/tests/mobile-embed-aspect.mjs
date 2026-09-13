// Eingebettete Seiten (iFrame/HTML) behalten in der Mobile-Spalte ihr Seitenverhältnis.
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/mobile-embed-aspect.mjs
//
// Issue #645: die Mobile-Ansicht rechnete die gespeicherten Rasterzeilen unverändert in
// Pixel um. Auf dem Desktop passt das, weil dort auch die Breite aus demselben Raster
// kommt — in der Einspaltenansicht fällt die Breite auf die Bildschirmbreite, die Höhe
// aber nicht mit. Die eingebettete Seite skaliert mit der Breite und stand danach klein
// und mittig in einer sehr hohen Box (gemessen: 1426x860 auf dem Desktop, 354x860 mobil,
// ~650 px ungenutzt).
//
// Geprüft wird die Box-Geometrie, nicht der Inhalt: gleiches Seitenverhältnis wie im
// Raster, dazu die beiden Ränder — nie höher als die gespeicherte Rasterhöhe, und eine
// sehr breite flache Kachel fällt nicht auf wenige Pixel zusammen.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';
const MOBILE = { width: 390, height: 800 }; // unter dem Default-Breakpoint (600)
const DESKTOP = { width: 1600, height: 900 };

// Raster-Standardwerte (gridRowHeight / gridGap / gridSnapX)
const CELL = 20;
const GAP = 10;
const SNAP = 20;
const EMBED_MOBILE_MIN_H = 120;

const rows = (h) => h * CELL + (h - 1) * GAP;
const cols = (w) => w * SNAP + (w - 1) * GAP;

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const PAGE =
    'data:text/html,' +
    encodeURIComponent(
        '<html><body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh">' +
            '<div style="width:90%;aspect-ratio:16/9;background:#3b82f6"></div></body></html>',
    );

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: MOBILE, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

/** Ein Widget allein auf dem Dashboard zeigen und seine Box vermessen. */
async function show(widget) {
    await page.evaluate((w) => window.__auraShot.showWidgets([w]), widget);
    await page.waitForTimeout(400);
    return page.evaluate((id) => {
        const box = document.querySelector(`[data-aura-widget="${id}"]`);
        if (!box) return null;
        const r = box.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
    }, widget.id);
}

const widget = (id, type, w, h) => ({
    id,
    type,
    title: 'Energiefluss',
    layout: 'default',
    gridPos: { x: 0, y: 0, w, h },
    options: type === 'html' ? { htmlContent: '<div style="height:2000px"></div>' } : { iframeUrl: PAGE },
});

// ── 1. Der Fall aus dem Issue: breite Kachel, schmale Spalte ──────────────────────────
const wide = widget('embed-wide', 'iframe', 47, 29);
const mobileWide = await show(wide);
const expected = Math.round((mobileWide.w * rows(29)) / cols(47));
check(
    'iFrame übernimmt das Raster-Seitenverhältnis',
    Math.abs(mobileWide.h - expected) <= 2,
    `${mobileWide.w}x${mobileWide.h}, erwartet ${expected}px hoch`,
);
check(
    'iFrame ist nicht mehr so hoch wie im Raster',
    mobileWide.h < rows(29) / 2,
    `${mobileWide.h}px statt ${rows(29)}px`,
);

// ── 2. Ränder: nie höher als gespeichert, nie auf wenige Pixel zusammengefallen ───────
// Schmal und hoch: das Seitenverhältnis würde die Box wachsen lassen — maxHeight hält sie.
const tall = await show(widget('embed-tall', 'iframe', 8, 29));
check('schmale hohe Kachel wächst nicht', tall.h === rows(29), `${tall.h}px statt ${rows(29)}px`);

// Sehr breit und flach: das Seitenverhältnis ergäbe ~29 px — minHeight fängt das ab.
const flat = await show(widget('embed-flat', 'iframe', 94, 8));
check('breite flache Kachel behält eine Mindesthöhe', flat.h === EMBED_MOBILE_MIN_H, `${flat.h}px`);

// Und die Mindesthöhe darf eine bewusst dünne Kachel nicht aufblasen.
const thin = await show(widget('embed-thin', 'iframe', 94, 2));
check('dünne Kachel bleibt dünn', thin.h === rows(2), `${thin.h}px statt ${rows(2)}px`);

// ── 3. Das HTML-Widget ist genauso eine eingebettete Seite ────────────────────────────
const html = await show(widget('embed-html', 'html', 47, 29));
check(
    'HTML-Widget übernimmt das Seitenverhältnis ebenfalls',
    Math.abs(html.h - expected) <= 2,
    `${html.h}px, erwartet ${expected}px`,
);

// ── 4. Alle anderen Widgets bleiben bei ihrer Rasterhöhe ──────────────────────────────
const value = await show({
    id: 'plain',
    type: 'value',
    title: 'Temperatur',
    layout: 'default',
    datapoint: 'demo.t1',
    gridPos: { x: 0, y: 0, w: 47, h: 29 },
    options: {},
});
check('Wert-Widget behält seine Rasterhöhe', value.h === rows(29), `${value.h}px statt ${rows(29)}px`);

// ── 5. Im Desktop-Raster ändert sich nichts ───────────────────────────────────────────
await page.setViewportSize(DESKTOP);
await page.waitForTimeout(300);
const desktop = await show(wide);
check('Desktop: iFrame behält seine Rasterhöhe', desktop.h === rows(29), `${desktop.h}px statt ${rows(29)}px`);

check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
if (failed.length) {
    console.log('\nFehlgeschlagen:');
    for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
    process.exit(1);
}
