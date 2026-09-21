// Eine Farbe je Helligkeit, im echten Frontend (#689).
//
//   npm run dev            (oder AURA_BASE setzen)
//   npm run test:dual-color-ui
//
// Die reine Logik steckt in tools/tests/dual-color.mjs. Hier geht es um das, was
// eine Unit nicht sieht:
//   * dass die Halfte, die gerendert wird, wirklich an der Helligkeit des
//     AKTIVEN Themes haengt - auch wenn ein Layout ein eigenes Design setzt,
//   * dass der Wechsel ohne Reload durchschlaegt (themeEpoch),
//   * dass der Farbwaehler ein Paar schreibt und es beim naechsten Oeffnen
//     wiederfindet,
//   * dass ein Umschalten auf "Einheitlich" das Paar nur aus dem WERT nimmt,
//     nicht aus dem Gedaechtnis: zurueck auf "Hell / Dunkel" kommen beide
//     Haelften wieder,
//   * und die eine Regression, die stumm Daten kostet: eine andere Option
//     aendern darf das Paar nicht auf die sichtbare Halfte eindampfen.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';
const DESKTOP = { width: 1280, height: 800 };

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const LIGHT = '#1e3a8a'; // rgb(30, 58, 138)
const DARK = '#93c5fd'; // rgb(147, 197, 253)
const PAIR = `light-dark(${LIGHT}, ${DARK})`;

const header = (options) => ({
    id: 'dc',
    type: 'header',
    title: 'Farbprobe',
    datapoint: '',
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 8, h: 3 },
    options,
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: DESKTOP });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

/** Die gerenderte Farbe der Ueberschrift, als rgb()-Tripel. */
async function titleColor() {
    return page.evaluate(() => {
        const card = document.querySelector('.aura-widget-dc');
        if (!card) return 'kein Widget';
        // Das INNERSTE Element mit dem Text - das aeussere ist ein Wrapper, der die
        // Farbe gar nicht traegt.
        const title = [...card.querySelectorAll('*')]
            .filter((n) => n.textContent?.trim() === 'Farbprobe' && n.children.length === 0)
            .pop();
        return title ? getComputedStyle(title).color : 'kein Titel';
    });
}

async function show(theme, options) {
    await page.evaluate((id) => window.__auraShot.setTheme(id), theme);
    await page.evaluate(([w]) => window.__auraShot.showWidgets(w), [[header(options)]]);
    await page.waitForTimeout(400);
}

// ── 1. Die Haelfte folgt dem Theme ────────────────────────────────────────
await show('light', { titleColor: PAIR });
const onLight = await titleColor();
check('helles Theme nimmt die erste Haelfte', onLight === 'rgb(30, 58, 138)', onLight);

// Kein Reload dazwischen: der Wechsel muss allein ueber die Theme-Epoche
// durchschlagen. Ohne die Abo-Zeile bliebe die Karte auf ihrer Mount-Helligkeit.
await page.evaluate(() => window.__auraShot.setTheme('dark'));
await page.waitForTimeout(400);
const onDark = await titleColor();
check('Wechsel auf dunkel nimmt die zweite Haelfte - ohne Reload', onDark === 'rgb(147, 197, 253)', onDark);

// ── 2. Was kein Paar ist, bleibt unberuehrt ───────────────────────────────
await show('dark', { titleColor: '#ff0000' });
const fixed = await titleColor();
check('eine einzelne Farbe gilt in beiden Helligkeiten', fixed === 'rgb(255, 0, 0)', fixed);

await show('light', { titleColor: 'var(--accent-red)' });
const tokenLight = await titleColor();
await page.evaluate(() => window.__auraShot.setTheme('dark'));
await page.waitForTimeout(400);
const tokenDark = await titleColor();
check(
    'ein Theme-Token aendert sich mit dem Theme - dafuer braucht es kein Paar',
    tokenLight !== tokenDark && tokenLight !== 'rgb(0, 0, 0)',
    `${tokenLight} -> ${tokenDark}`,
);

// ── 3. Eine Haelfte darf selbst ein Token sein ────────────────────────────
await show('dark', { titleColor: `light-dark(var(--accent-red), ${DARK})` });
const mixedDark = await titleColor();
await page.evaluate(() => window.__auraShot.setTheme('light'));
await page.waitForTimeout(400);
const mixedLight = await titleColor();
check(
    'Token als helle Haelfte, Hex als dunkle',
    mixedDark === 'rgb(147, 197, 253)' && mixedLight !== 'rgb(147, 197, 253)',
    `${mixedLight} / ${mixedDark}`,
);

// ── 4. Der Farbwaehler ────────────────────────────────────────────────────
// Ab hier im Editor: das Options-Panel gibt es nur dort (?shot=1 + setEditMode).
await show('light', { titleColor: '#ff0000' });
await page.evaluate(() => window.__auraShot.setEditMode(true));
await page.waitForTimeout(300);

await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const panelOpen = await page
    .locator('.aura-widget-edit-modal')
    .first()
    .waitFor({ timeout: 10000 })
    .then(() => true)
    .catch(() => false);
check('das Options-Panel laesst sich oeffnen', panelOpen);

if (panelOpen) {
    const modal = page.locator('.aura-widget-edit-modal');
    // Das Farbfeld der Titelfarbe: der Farbwaehler ist ein Button mit einem
    // Farb-Swatch. Ueber das Label davor gefunden, damit der Test nicht an der
    // Reihenfolge der Felder haengt.
    const swatch = modal.locator('button[title*="itelfarbe"], button[title*="Titel"]').first();
    const found = (await swatch.count()) > 0;
    check('die Titelfarbe hat ein Farbfeld', found);

    if (found) {
        await swatch.click();
        await page.waitForTimeout(300);
        const popover = page.locator('.aura-color-popover');
        check('der Farbwaehler oeffnet sich', (await popover.count()) > 0);

        // Auf "Hell / Dunkel" umschalten und der dunklen Seite eine eigene Farbe geben.
        await popover.getByText('Hell / Dunkel').click();
        await page.waitForTimeout(150);
        await popover.getByText('Dunkel', { exact: true }).click();
        await page.waitForTimeout(150);
        const hexField = popover.locator('input[type="text"]').first();
        await hexField.fill(DARK);
        await hexField.press('Enter');
        await page.waitForTimeout(400);

        const stored = await page.evaluate(() => window.__auraShot.widgetOptions('dc')?.titleColor);
        check(
            'der Waehler speichert ein Paar',
            typeof stored === 'string' && stored.startsWith('light-dark(') && stored.includes(DARK),
            String(stored),
        );

        // Hin und zurueck: "Einheitlich" dampft den WERT auf eine Farbe ein,
        // darf die beiden Haelften aber nicht vergessen.
        await popover.getByText('Einheitlich').click();
        await page.waitForTimeout(300);
        const collapsed = await page.evaluate(() => window.__auraShot.widgetOptions('dc')?.titleColor);
        check(
            'Einheitlich speichert eine einzelne Farbe',
            typeof collapsed === 'string' && !collapsed.startsWith('light-dark('),
            String(collapsed),
        );

        const solo = popover.locator('input[type="text"]').first();
        await solo.fill('#00ff00');
        await solo.press('Enter');
        await page.waitForTimeout(400);
        const soloStored = await page.evaluate(() => window.__auraShot.widgetOptions('dc')?.titleColor);
        check('eine einheitliche Farbe laesst sich danach setzen', soloStored === '#00ff00', String(soloStored));

        await popover.getByText('Hell / Dunkel').click();
        await page.waitForTimeout(400);
        const backAgain = await page.evaluate(() => window.__auraShot.widgetOptions('dc')?.titleColor);
        check(
            'zurueck auf Hell / Dunkel kommt das gemerkte Paar wieder',
            typeof backAgain === 'string' && backAgain.startsWith('light-dark(') && backAgain.includes(DARK),
            String(backAgain),
        );

        // Und der Weg zurueck merkt sich auch die einheitliche Farbe.
        await popover.getByText('Einheitlich').click();
        await page.waitForTimeout(400);
        const soloBack = await page.evaluate(() => window.__auraShot.widgetOptions('dc')?.titleColor);
        check('und die einheitliche Farbe ist auch noch da', soloBack === '#00ff00', String(soloBack));

        // Das Gedaechtnis haengt am Farbfeld, nicht am offenen Waehler: zu,
        // wieder auf, und das Paar ist weiter da. (Zugleich das Paar im Wert
        // fuer die folgende Regression.)
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
        await swatch.click();
        await page.waitForTimeout(300);
        await page.locator('.aura-color-popover').getByText('Hell / Dunkel').click();
        await page.waitForTimeout(400);
        const afterReopen = await page.evaluate(() => window.__auraShot.widgetOptions('dc')?.titleColor);
        check(
            'das Paar ueberlebt auch ein Schliessen des Waehlers',
            typeof afterReopen === 'string' && afterReopen.includes(DARK),
            String(afterReopen),
        );

        // Die Regression, die stumm Daten kostet: irgendeine ANDERE Option
        // aendern. Das Widget schreibt dabei die Config zurueck, die es gerendert
        // bekommen hat - dort steht nur noch die sichtbare Haelfte.
        const before = await page.evaluate(() => window.__auraShot.widgetOptions('dc')?.titleColor);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
        const other = modal.locator('input[type="text"]:visible').first();
        if (await other.count()) {
            await other.fill('Zweite Zeile');
            await page.waitForTimeout(400);
        }
        const after = await page.evaluate(() => window.__auraShot.widgetOptions('dc')?.titleColor);
        check('eine andere Option zu aendern laesst das Paar stehen', after === before, `${before} -> ${after}`);
    }
}

check('keine JS-Fehler auf der Seite', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok).length;
console.log(failed === 0 ? '\nAlle Pruefungen bestanden.' : `\n${failed} Pruefung(en) fehlgeschlagen.`);
process.exit(failed ? 1 : 0);
