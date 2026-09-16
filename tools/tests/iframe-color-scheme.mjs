// Das Farbschema, das ein iFrame-Widget an die eingebettete Seite weitergibt (Issue #663).
//
//   npx playwright install webkit   (einmalig - die Harness bringt sonst nur Chromium/Firefox mit)
//   npm run dev                     (oder AURA_BASE setzen)
//   npm run test:iframe-scheme
//
// Der Test laeuft in WEBKIT, nicht in Chromium - und genau das ist der Punkt.
// Blink ignoriert die Vererbung des Farbschemas an eingebettete Dokumente; nur
// WebKit und Gecko reichen sie durch. Deshalb blieb die alte Regel
// `iframe { color-scheme: normal }` ein Jahr lang unbemerkt: sie war in Chrome
// wirkungslos und zwang in Safari jede eingebettete Seite auf hell, auch auf
// einem dunklen iPhone. Ein Chromium-Test haette das nie gesehen.
//
// Die Seite im Frame kommt von einem eigenen Mini-Server, damit sie - wie EVCC
// oder Kanban - eine andere Herkunft hat als Aura.
import { webkit } from 'playwright';
import http from 'node:http';
import zlib from 'node:zlib';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';
const DESKTOP = { width: 1200, height: 800 };

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

// -- Die eingebettete Fremdseite -------------------------------------------------------
// /adaptive faerbt sich nach prefers-color-scheme (wie EVCC), /bare setzt gar
// keinen Hintergrund - der Fall, fuer den es den neutralen Modus gibt.
const ADAPTIVE = `<!doctype html><html><head><style>
html,body{margin:0;background:#ffffff}
@media (prefers-color-scheme: dark){html,body{background:#111111}}
</style></head><body></body></html>`;
const BARE = `<!doctype html><html><head><style>html,body{margin:0;background:transparent}</style></head><body></body></html>`;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
    res.end(req.url.startsWith('/bare') ? BARE : ADAPTIVE);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const probeBase = `http://127.0.0.1:${server.address().port}`;

const widget = (id, options) => ({
    id,
    type: 'iframe',
    title: 'Probe',
    datapoint: '',
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 8, h: 8 },
    options: { interactionMode: 'contentOnly', ...options },
});

// Das Geraet steht auf HELL - jede Dunkelheit im Frame kann also nur von Aura kommen.
const browser = await webkit.launch();
const ctx = await browser.newContext({ viewport: DESKTOP, colorScheme: 'light', ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

async function show(theme, options, path = '/adaptive') {
    await page.evaluate((id) => window.__auraShot.setTheme(id), theme);
    await page.evaluate(
        ([w]) => window.__auraShot.showWidgets(w),
        [[widget('cs', { iframeUrl: probeBase + path, ...options })]],
    );
    await page.waitForTimeout(700);
}

/** Was die eingebettete Seite ueber ihre Helligkeit denkt. */
async function childScheme() {
    const frame = page.frames().find((f) => f.url().startsWith(probeBase));
    if (!frame) return 'kein Frame';
    return frame.evaluate(() => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
}

/** Die Farbe in der Mitte des Frames - der weisse Kasten ist nur so zu sehen. */
async function frameIsWhite() {
    const box = await page.locator('[data-aura-widget="cs"] iframe').boundingBox();
    const png = await page.screenshot({
        clip: { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2), width: 1, height: 1 },
    });
    const idat = [];
    let off = 8;
    while (off < png.length) {
        const len = png.readUInt32BE(off);
        if (png.toString('ascii', off + 4, off + 8) === 'IDAT') idat.push(png.subarray(off + 8, off + 8 + len));
        off += 12 + len;
    }
    const raw = zlib.inflateSync(Buffer.concat(idat)); // raw[0] ist das Filterbyte der einen Zeile
    return raw[1] > 200 && raw[2] > 200 && raw[3] > 200;
}

// -- 1. Standard: Aura reicht seine Helligkeit durch ------------------------------------
await show('dark', {});
check('dunkles Aura-Theme macht die eingebettete Seite dunkel', (await childScheme()) === 'dark');

await show('light', {});
check('helles Aura-Theme macht sie wieder hell', (await childScheme()) === 'light');

// -- 2. Der Wechsel wirkt ohne Neuladen -------------------------------------------------
// Ein Reload wuerde eine laufende Seite (Video, Formular) verlieren - das Frame
// bekommt den Wechsel ueber die Medienabfrage mit, mehr braucht es nicht.
const before = await page.evaluate(() => {
    const f = document.querySelector('[data-aura-widget="cs"] iframe');
    return f?.contentWindow ? 'da' : 'weg';
});
await page.evaluate(() => window.__auraShot.setTheme('dark'));
await page.waitForTimeout(400);
check('Theme-Wechsel wirkt ohne Neuladen', (await childScheme()) === 'dark', `Frame vorher ${before}`);

// -- 3. "Gerät entscheidet" haengt sich von Aura ab --------------------------------------
await show('dark', { iframeColorScheme: 'device' });
check('Modus "Gerät" folgt dem hellen Geraet trotz dunklem Aura', (await childScheme()) === 'light');

// -- 4. "Neutral" ist der alte Zustand - hell, dafuer transparent -------------------------
await show('dark', { iframeColorScheme: 'neutral' });
check('Modus "Neutral" zeigt die Seite hell (wie vor #663)', (await childScheme()) === 'light');

await show('dark', { iframeColorScheme: 'neutral' }, '/bare');
check('Modus "Neutral" laesst die dunkle Karte durchscheinen', !(await frameIsWhite()));

// Gegenprobe: derselbe hintergrundlose Inhalt bekommt im Theme-Modus den weissen
// Kasten - deshalb bleibt "Neutral" waehlbar und ist nicht nur Altlast.
await show('dark', { iframeColorScheme: 'theme' }, '/bare');
check('ohne "Neutral" waere derselbe Inhalt weiss', await frameIsWhite());

// -- 5. Auras eigene Frames bleiben neutral ----------------------------------------------
// eCharts-Preset, HTML-Widget und Kamerabild haben keinen eigenen Hintergrund.
await page.evaluate(
    ([w]) => window.__auraShot.showWidgets(w),
    [
        [
            { ...widget('html-x', {}), type: 'html', options: { htmlContent: '<b>hi</b>' } },
            // Nur eine .html-Quelle rendert die Kamera als Frame - ein Bild braucht keins.
            { ...widget('cam-x', {}), type: 'camera', options: { streamUrl: `${probeBase}/cam.html` } },
        ],
    ],
);
await page.waitForTimeout(600);
const neutralClasses = await page.evaluate(() =>
    [...document.querySelectorAll('[data-aura-widget] iframe')].map((f) => f.className),
);
check(
    'HTML- und Kamera-Frame tragen aura-frame-neutral',
    neutralClasses.length > 0 && neutralClasses.every((c) => c.includes('aura-frame-neutral')),
    neutralClasses.join(' | ') || 'kein Frame gefunden',
);

// -- 6. Das Optionen-Panel schreibt den Schluessel ---------------------------------------
await page.evaluate(
    ([w]) => window.__auraShot.showWidgets(w, { editMode: true }),
    [[widget('cs-cfg', { iframeUrl: `${probeBase}/adaptive` })]],
);
await page.waitForTimeout(500);
await page.click('[data-aura-widget="cs-cfg"] .aura-edit-chrome button:last-child');
await page.waitForTimeout(250);
await page
    .getByRole('button', { name: /Bearbeiten/ })
    .first()
    .click();
await page.waitForTimeout(400);
const label = page.getByText('Farbschema der Seite', { exact: true });
check('das Panel bietet das Farbschema an', (await label.count()) === 1);
if (await label.count()) {
    await label.locator('xpath=following-sibling::select[1]').selectOption('device');
    await page.waitForTimeout(300);
    const opts = await page.evaluate(() => window.__auraShot.widgetOptions('cs-cfg'));
    check('die Auswahl schreibt iframeColorScheme', opts?.iframeColorScheme === 'device', JSON.stringify(opts));
}

await ctx.close();
await browser.close();
server.close();

check('keine JS-Fehler', pageErrors.length === 0, pageErrors.join(' | '));

const failed = results.filter((r) => !r.ok);
console.log(`\niframe-color-scheme: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
