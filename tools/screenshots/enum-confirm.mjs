// Auswahlfeld (enum) widget — screenshot of the security prompt (#674).
// Writes docs/widgets/assets/auswahlfeld/sicherheitsabfrage.png.
// Side-effect-free: the pick is never confirmed, so nothing is written.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const OUT = 'docs/widgets/assets/auswahlfeld';
mkdirSync(OUT, { recursive: true });

const DP = 'demo.enum';
const WID = 'w-shot';
const SEL = `.aura-widget-${WID}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 15000 });

await page.evaluate(
    ({ DP, WID }) => {
        window.__auraShot.captureWrites(true);
        window.__auraShot.mock({ [DP]: 0 });
        window.__auraShot.showWidgets([
            {
                id: WID,
                type: 'enum',
                title: 'Betriebsart',
                datapoint: DP,
                gridPos: { x: 0, y: 0, w: 13, h: 7 },
                layout: 'default',
                options: {
                    confirmAction: true,
                    confirmText: 'Betriebsart wirklich ändern?',
                    entries: [
                        { value: '0', label: 'Aus' },
                        { value: '1', label: 'Heizen' },
                        { value: '2', label: 'Kühlen' },
                    ],
                },
            },
        ]);
        window.__auraShot.mock({ [DP]: 0 });
    },
    { DP, WID },
);
await page.waitForTimeout(700);

// Open the dropdown and pick an entry — that is what raises the prompt.
await page.locator(`${SEL} .aura-widget-action button`).first().click();
await page.waitForTimeout(250);
await page.locator('.z-\\[9999\\] button', { hasText: 'Heizen' }).first().click();
await page.waitForTimeout(400);

await page
    .locator(SEL)
    .first()
    .screenshot({ path: `${OUT}/sicherheitsabfrage.png` });
console.log('✓ sicherheitsabfrage.png');

await browser.close();
console.log('done');
