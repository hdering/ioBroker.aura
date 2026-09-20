// Screenshots of the fill widget's status datapoints (#671, #691).
// Output: docs/widgets/assets/fuellstandsanzeige/status-laden.png, status-entladen.png
// and status-getrennt.png
//
//   npm run dev            (or set AURA_BASE)
//   node tools/screenshots/fill-status.mjs
//
// Its own script rather than a `shots` list in widgets-meta.mjs: that list replaces the
// page's runtime.png, and these images are additions to it, not a replacement.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const OUT = 'docs/widgets/assets/fuellstandsanzeige';
const ID = 'w-doc-status';
mkdirSync(OUT, { recursive: true });

const SOC = 'demo.fillstatus.soc';
const CHARGE = 'demo.fillstatus.charge';
const POWER = 'demo.fillstatus.power';
const CONN = 'demo.fillstatus.conn';

const browser = await chromium.launch();
const ctx = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 15000 });

async function shot(options, mocks, file) {
    await page.evaluate(
        ([id, dp, opts, vals]) => {
            window.__auraShot.mock(vals);
            window.__auraShot.mockServerState(vals);
            window.__auraShot.showWidgets([
                {
                    id,
                    type: 'fill',
                    title: 'Handy-Akku',
                    datapoint: dp,
                    layout: 'battery',
                    gridPos: { x: 0, y: 0, w: 6, h: 12 },
                    options: { unit: '%', decimals: 0, minValue: 0, maxValue: 100, ...opts },
                },
            ]);
            window.__auraShot.mock(vals);
        },
        [ID, SOC, options, mocks],
    );
    await page.waitForTimeout(900);
    await page
        .locator(`.aura-widget-${ID}`)
        .first()
        .screenshot({ path: `${OUT}/${file}` });
    console.log('✓', `${OUT}/${file}`);
}

await shot({ chargeDatapoint: CHARGE }, { [SOC]: 64, [CHARGE]: true }, 'status-laden.png');
await shot({ dischargeDatapoint: POWER }, { [SOC]: 64, [POWER]: -900 }, 'status-entladen.png');
await shot(
    { connectedDatapoint: CONN, connectedCondition: 'false' },
    { [SOC]: 64, [CONN]: true },
    'status-getrennt.png',
);

await browser.close();
