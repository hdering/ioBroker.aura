// Farbe aus Datenpunkt, im echten Frontend (#747).
//
//   npm run dev            (oder AURA_BASE setzen)
//   npm run test:color-binding-ui
//
// Die reine Logik steckt in tools/tests/color-binding.mjs. Hier geht es um:
//   * dass WidgetFrame die Bindung wirklich aufloest (Titelfarbe = DP-Farbe),
//   * dass eine gebundene Haelfte eines Paars nur in ihrem Theme gilt,
//   * dass der Farbwaehler die Bindung so speichert, wie sie eingetippt wurde,
//     den Hinweis zeigt und die aktuelle DP-Farbe nennt.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const DP = 'aura-test.0.led.color';
const header = (options) => ({
    id: 'cb',
    type: 'header',
    title: 'Farbprobe',
    datapoint: '',
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 8, h: 3 },
    options,
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate((id) => {
    window.__auraShot.mock({ [id]: '[255,136,0]' });
    window.__auraShot.mockServerState({ [id]: '[255,136,0]' });
}, DP);

async function titleColor() {
    return page.evaluate(() => {
        const card = document.querySelector('.aura-widget-cb');
        if (!card) return 'kein Widget';
        const title = [...card.querySelectorAll('*')]
            .filter((n) => n.textContent?.trim() === 'Farbprobe' && n.children.length === 0)
            .pop();
        return title ? getComputedStyle(title).color : 'kein Titel';
    });
}
async function show(theme, options) {
    await page.evaluate((id) => window.__auraShot.setTheme(id), theme);
    await page.evaluate(([w]) => window.__auraShot.showWidgets(w), [[header(options)]]);
    await page.waitForTimeout(500);
}

// ── 1. Aufloesung im Frontend ─────────────────────────────────────────────
await show('light', { titleColor: `{${DP}}` });
const bound = await titleColor();
check('Titelfarbe kommt aus dem Datenpunkt ([r,g,b])', bound === 'rgb(255, 136, 0)', bound);

await show('light', { titleColor: `[[${DP}]]` });
const bound2 = await titleColor();
check('auch in der [[id]]-Schreibweise', bound2 === 'rgb(255, 136, 0)', bound2);

// ── 2. Gebundene Haelfte eines Paars ──────────────────────────────────────
await show('dark', { titleColor: `light-dark(#1e3a8a, {${DP}})` });
const pairDark = await titleColor();
await page.evaluate(() => window.__auraShot.setTheme('light'));
await page.waitForTimeout(500);
const pairLight = await titleColor();
check(
    'dunkle Haelfte aus dem DP, helle fest',
    pairDark === 'rgb(255, 136, 0)' && pairLight === 'rgb(30, 58, 138)',
    `${pairLight} / ${pairDark}`,
);

// ── 3. Farbwaehler ────────────────────────────────────────────────────────
await show('light', { titleColor: '#ff0000' });
await page.evaluate(() => window.__auraShot.setEditMode(true));
await page.waitForTimeout(300);
await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const modal = page.locator('.aura-widget-edit-modal');
await modal.first().waitFor({ timeout: 10000 });
const swatch = modal.locator('button[title*="itelfarbe"], button[title*="Titel"]').first();
await swatch.click();
await page.waitForTimeout(300);
const popover = page.locator('.aura-color-popover');
const hint = await popover.innerText();
check(
    'Hinweis auf Datenpunkt sichtbar',
    hint.includes('Datenpunkt') && hint.includes('[[id]]'),
    hint.split('\n')[2] ?? '',
);

const field = popover.locator('input[type="text"]').first();
await field.fill(`{${DP}}`);
await field.press('Enter');
await page.waitForTimeout(500);
const stored = await page.evaluate(() => window.__auraShot.widgetOptions('cb')?.titleColor);
check('Bindung wird unveraendert gespeichert', stored === `{${DP}}`, String(stored));
const current = await popover.innerText();
check(
    'Popover nennt die aktuelle DP-Farbe',
    current.includes('Aktuell: #ff8800'),
    current.match(/Aktuell:[^\n]*/)?.[0] ?? '',
);
const swatchBg = await swatch.evaluate((b) => getComputedStyle(b.firstElementChild).backgroundColor);
check('Farbfeld zeigt die DP-Farbe', swatchBg === 'rgb(255, 136, 0)', swatchBg);

// Pair mode: binding in the dark half.
await popover.getByText('Hell / Dunkel').click();
await page.waitForTimeout(150);
await popover.getByText('Dunkel', { exact: true }).click();
await page.waitForTimeout(150);
await field.fill(`[[${DP}]]`);
await field.press('Enter');
await page.waitForTimeout(500);
const pairStored = await page.evaluate(() => window.__auraShot.widgetOptions('cb')?.titleColor);
check(
    'Bindung als dunkle Haelfte gespeichert',
    typeof pairStored === 'string' && pairStored.startsWith('light-dark(') && pairStored.includes(`[[${DP}]]`),
    String(pairStored),
);
await page.keyboard.press('Escape');

check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} FAILED` : `\n${results.length}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
