// Documentation screenshots for the alarm widget with own datapoints (#1037).
// Output: docs/widgets/assets/alarmanlage/manual.png   (Widget, eigene Datenpunkte, Modi aus der Liste)
//         docs/widgets/assets/alarmanlage/source.png   (Bearbeiten-Dialog: Abschnitt Datenquelle)
//         docs/widgets/assets/alarmanlage/modes.png    (Popup „Modi bearbeiten…")
//
//   npm run dev            (or set AURA_BASE)
//   node tools/screenshots/alarmanlage.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const OUT = 'docs/widgets/assets/alarmanlage';
mkdirSync(OUT, { recursive: true });
const D = 'demo.doc.alarm';

const browser = await chromium.launch();
const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1200 },
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 60000 });

const VALUES = {
    [`${D}.state`]: 1,
    [`${D}.fenster_bad`]: true,
    [`${D}.haustuer`]: false,
    [`${D}.eg`]: true,
    [`${D}.og`]: false,
    [`${D}.garten`]: true,
    [`${D}.log`]: '07:12 - Unscharf (Küche)\n06:58 - Scharf Nacht\n22:41 - Scharf Nacht',
};
const WIDGET = {
    id: 'w-alarm-doc',
    type: 'alarm',
    title: 'Alarmanlage',
    gridPos: { x: 0, y: 0, w: 9, h: 11 },
    options: {
        sourceMode: 'manual',
        stateDp: `${D}.state`,
        stateMap: [
            { value: '0', phase: 'off' },
            { value: '1', phase: 'armed', label: 'Abwesend' },
            { value: '2', phase: 'night' },
            { value: '3', phase: 'triggered' },
        ],
        modes: [
            { key: 'off', label: 'Aus', icon: 'ShieldOff', disarm: true, writeValue: '0' },
            { key: 'away', label: 'Abwesend', icon: 'ShieldCheck', writeValue: '1' },
            { key: 'night', label: 'Nacht', icon: 'Moon', color: '#6366f1', writeValue: '2' },
        ],
        zones: [
            { key: 'eg', label: 'Erdgeschoss', onOffDp: `${D}.eg` },
            { key: 'og', label: 'Obergeschoss', onOffDp: `${D}.og` },
            { key: 'garten', label: 'Garten', onOffDp: `${D}.garten` },
        ],
        contacts: [
            { dp: `${D}.fenster_bad`, name: 'Fenster Bad' },
            { dp: `${D}.haustuer`, name: 'Haustür' },
        ],
        logDp: `${D}.log`,
        logSeparator: 'newline',
        showDelay: false,
    },
};

await page.evaluate(
    ([widget, vals]) => {
        const a = window.__auraShot;
        a.captureWrites(true);
        a.mock(vals);
        a.mockServerState(vals);
        a.showWidgets([widget]);
        a.mock(vals);
    },
    [WIDGET, VALUES],
);
await page.waitForSelector('.aura-widget-w-alarm-doc .aura-alarm-mode');
await page.waitForTimeout(600);
await page
    .locator('.aura-widget-w-alarm-doc')
    .first()
    .screenshot({ path: `${OUT}/manual.png` });
console.log('✓ manual.png');

// ── Bearbeiten-Dialog ─────────────────────────────────────────────────────────
await page.evaluate((widget) => {
    const a = window.__auraShot;
    a.unfoldSections();
    a.showWidgets([widget], { editMode: true });
    a.setEditMode(true);
}, WIDGET);
await page.locator('.aura-widget-w-alarm-doc .aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const source = page.locator('details[data-aura-config-section="datapoints"]').first();
await source.locator('[data-aura-dp="stateDp"]').waitFor({ timeout: 10000 });
await page.waitForTimeout(300);
// The whole section is taller than the dialog — the part worth showing is the
// source switch, the state datapoint and the value mapping.
// The dialog caps its height and scrolls; lift the cap for the shot.
await source.evaluate((el) => {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
        n.style.maxHeight = 'none';
        n.style.height = 'auto';
        n.style.overflow = 'visible';
    }
});
await page.setViewportSize({ width: 1600, height: 3000 });
await page.waitForTimeout(300);
await source.scrollIntoViewIfNeeded();
const top = await source.boundingBox();
const map = await source.locator('[data-aura-alarm-statemap]').boundingBox();
await page.screenshot({
    path: `${OUT}/source.png`,
    clip: { x: top.x, y: top.y, width: top.width, height: map.y + map.height - top.y + 8 },
});
console.log('✓ source.png');

await page.locator('[data-aura-open-editor="alarm-modes"]').click();
const editor = page.locator('[data-aura-alarm-modes-editor]');
await editor.waitFor({ timeout: 10000 });
await page.waitForTimeout(300);
await editor.screenshot({ path: `${OUT}/modes.png` });
console.log('✓ modes.png');

await browser.close();
