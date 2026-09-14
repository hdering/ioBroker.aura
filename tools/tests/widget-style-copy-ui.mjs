// "Stil kopieren / Stil einfügen" im Editor (Issue #654).
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/widget-style-copy-ui.mjs
//
// Geprüft wird, was nur im Browser sichtbar wird: dass der Rechtsklick auf ein
// Widget im Editor dessen Menü öffnet (und beim Kind einer Gruppe nur das des
// Kindes), dass „Stil einfügen" ohne Zwischenablage und bei fremdem Typ gesperrt
// bleibt, und dass ein Einfügen wirklich nur die Darstellung des Ziels ersetzt
// und dessen Datenpunkt/Titel stehen lässt.
//
// Die reine Schlüssel-Einteilung steht in tools/tests/widget-style-copy.mjs.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';
const DESKTOP = { width: 1400, height: 900 };

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const SOURCE_STYLE = {
    showTitle: false,
    titleColor: '#ff0000',
    valueFontSize: 30,
    transparent: true,
    styleOverride: { '--accent': '#00ff00' },
};

const widget = (id, overrides = {}) => ({
    id,
    type: 'value',
    title: id,
    datapoint: `demo.0.${id}`,
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 14, h: 8 },
    options: {},
    ...overrides,
});

const browser = await chromium.launch();
const pageErrors = [];
const ctx = await browser.newContext({ viewport: DESKTOP, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

async function show(widgets) {
    await page.evaluate((w) => window.__auraShot.showWidgets(w, { editMode: true }), widgets);
    await page.waitForTimeout(450);
}

/** Rechtsklick auf die Karte, an einer Stelle abseits der Editor-Knöpfe. */
async function rightClick(id) {
    const box = await page.locator(`.aura-widget-${id}`).boundingBox();
    await page.mouse.click(box.x + 20, box.y + box.height - 12, { button: 'right' });
    await page.waitForTimeout(250);
}

const menuItem = (label) => page.locator(`button:has-text("${label}")`).last();
const options = (id) => page.evaluate((w) => window.__auraShot.widgetOptions(w), id);

// ── 1. Rechtsklick öffnet das Widget-Menü ──────────────────────────────────────
await show([
    widget('src', { title: 'Küche', options: { ...SOURCE_STYLE }, layout: 'compact' }),
    widget('dst', {
        title: 'Bad',
        gridPos: { x: 14, y: 0, w: 14, h: 8 },
        options: { unit: '%', subtitleColor: '#0000ff', decimals: 2 },
    }),
]);
await rightClick('src');
check('Rechtsklick im Editor öffnet das Menü', await menuItem('Stil kopieren').isVisible());
check(
    'Das Browser-Menü bleibt aus (die Seite lebt noch)',
    await page.evaluate(() => document.readyState === 'complete'),
);

// ── 2. Ohne Zwischenablage ist „Stil einfügen" gesperrt ────────────────────────
check('„Stil einfügen" ist ohne Kopie gesperrt', await menuItem('Stil einfügen').isDisabled());

// ── 3. Kopieren, dann einfügen ─────────────────────────────────────────────────
await menuItem('Stil kopieren').click();
await page.waitForTimeout(200);
await rightClick('dst');
const pasteBtn = menuItem('Stil einfügen');
check('Nach dem Kopieren ist „Stil einfügen" frei', await pasteBtn.isEnabled());
await pasteBtn.click();
await page.waitForTimeout(350);

const after = await options('dst');
check('Die Schriftgröße kommt an', after.valueFontSize === 30, JSON.stringify(after.valueFontSize));
check('Die Titelfarbe kommt an', after.titleColor === '#ff0000');
check('Der Rahmen kommt an', after.transparent === true);
check('Die CSS-Variable kommt an', after.styleOverride?.['--accent'] === '#00ff00');
check('Der eigene Einheiten-Text bleibt', after.unit === '%');
check('Fremder Stil des Ziels verschwindet', !('subtitleColor' in after) && !('decimals' in after));
const ids = await page.evaluate(() =>
    window.__auraShot
        .rendered()
        .map((w) => w.id)
        .join(','),
);
check('Beide Widgets stehen noch', ids.includes('src') && ids.includes('dst'));
const src = await options('src');
check(
    'Die Quelle bleibt unangetastet',
    src.valueFontSize === 30 && src.titleColor === '#ff0000' && !('unit' in src),
    JSON.stringify(src),
);

// Die Rückmeldung nennt die Zahl der übernommenen Einstellungen.
await rightClick('src');
await menuItem('Stil kopieren').click();
await rightClick('dst');
await menuItem('Stil einfügen').click();
check(
    'Ein zweites Einfügen meldet „bereits identisch"',
    await page.getByText('Stil war bereits identisch').isVisible(),
);
await page.waitForTimeout(1900);

// ── 4. Fremder Typ bekommt nur den Rahmen ─────────────────────────────────────
await show([
    widget('one', { options: { ...SOURCE_STYLE } }),
    {
        ...widget('two', { gridPos: { x: 14, y: 0, w: 14, h: 8 } }),
        type: 'switch',
        layout: 'card',
        options: { showValue: true },
    },
]);
await rightClick('one');
await menuItem('Stil kopieren').click();
await page.waitForTimeout(200);
await rightClick('two');
check('Bei fremdem Typ heißt der Eintrag „Rahmen-Stil einfügen"', await menuItem('Rahmen-Stil einfügen').isVisible());
await menuItem('Rahmen-Stil einfügen').click();
await page.waitForTimeout(350);
const frame = await options('two');
check('Der Kartenrahmen kommt an', frame.transparent === true, JSON.stringify(frame));
check('Die CSS-Variable kommt an', frame.styleOverride?.['--accent'] === '#00ff00');
check('Die Titelzeile kommt an', frame.showTitle === false);
check('Typfremde Optionen bleiben draußen', !('valueFontSize' in frame) && !('titleColor' in frame));
check('Die eigene Option des Ziels bleibt', frame.showValue === true);

// ── 5. In einer Gruppe gewinnt das Kind ────────────────────────────────────────
await page.evaluate((style) => {
    window.__auraShot.groupDefs({
        'def-style': [
            {
                id: 'kid',
                type: 'value',
                title: 'Kind',
                datapoint: 'demo.0.kid',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 10, h: 6 },
                options: { ...style },
            },
        ],
    });
}, SOURCE_STYLE);
await show([
    {
        id: 'grp',
        type: 'group',
        title: 'Gruppe',
        datapoint: '',
        layout: 'default',
        gridPos: { x: 0, y: 0, w: 20, h: 12 },
        options: { defId: 'def-style' },
    },
]);
const kid = page.locator('.aura-widget-kid');
if (await kid.count()) {
    const box = await kid.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height - 10, { button: 'right' });
    await page.waitForTimeout(250);
    const menus = await page.locator('button:has-text("Stil kopieren")').count();
    check('Ein Gruppenkind öffnet genau ein Menü', menus === 1, `${menus} Menüs offen`);
    await page.keyboard.press('Escape');
} else {
    check('Ein Gruppenkind öffnet genau ein Menü', false, 'Kind wurde nicht gerendert');
}

check('Keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));

await ctx.close();
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\nwidget-style-copy-ui: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
