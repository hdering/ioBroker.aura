// Ad-hoc check: clock widget formatting a time value from a source datapoint.
// Renders a few configurations against the dev server and writes PNGs to
// tools/screenshots/out/clock-source/.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const OUT = 'tools/screenshots/out/clock-source';
const ID = 'w-doc';
const SEL = `.aura-widget-${ID}`;
const DP = 'demo.evcc.full';

const CASES = [
    { file: 'iso-custom', val: '2026-07-31T20:15:30+02:00', options: { customFormat: 'dd.MM.yyyy HH:mm' } },
    { file: 'iso-datetime', val: '2026-07-31T20:15:30+02:00', options: { display: 'datetime', dateLength: 'long' } },
    { file: 'unix-ms', val: 1785528196311, options: { customFormat: 'EEEE, dd.MM. HH:mm:ss' } },
    { file: 'hhmm', val: '06:45', options: { customFormat: 'HH:mm' } },
    { file: 'relative', val: '2026-07-31T20:15:30+02:00', options: { customFormat: 'dd.MM. HH:mm (REL)' } },
    { file: 'invalid', val: 'kaputt', options: { customFormat: 'dd.MM.yyyy HH:mm' } },
    { file: 'no-dp-live', val: null, options: { display: 'datetime' } },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({
    viewport: { width: 900, height: 600 },
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

for (const c of CASES) {
    const cfg = {
        id: ID,
        type: 'clock',
        title: 'Batterie voll',
        datapoint: c.val === null ? '' : DP,
        layout: 'default',
        options: c.options,
        gridPos: { x: 0, y: 0, w: 12, h: 5 },
    };
    await page.evaluate(
        ({ cfg, dp, val }) => {
            if (val !== null) window.__auraShot.mock({ [dp]: val });
            window.__auraShot.showWidgets([cfg]);
            if (val !== null) window.__auraShot.mock({ [dp]: val });
        },
        { cfg, dp: DP, val: c.val },
    );
    await page.waitForTimeout(800);
    const el = page.locator(SEL).first();
    await el.screenshot({ path: `${OUT}/${c.file}.png` });
    const text = (await el.innerText()).replace(/\n/g, ' | ');
    console.log(`${c.file.padEnd(14)} ${JSON.stringify(c.val).padEnd(30)} -> ${text}`);
}

await browser.close();
