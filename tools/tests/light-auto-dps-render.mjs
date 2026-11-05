// Verifies that ONE light widget with "Datenpunkte beim Anzeigen erkennen" (autoDetectDps,
// #925) shows each lamp's own controls - the shared-popup case: a switch-only lamp, a
// colour-temperature lamp and an RGB lamp behind the same widget config.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/light-auto-dps-render.mjs
//
// Objects come from __auraShot.mockObjectView, the ids are invented and writes are
// captured, so nothing reaches a real ioBroker.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

const L = 'alias.0.aura_test925';
const row = (id, role, type, extra = {}) => ({
    id,
    value: { _id: id, type: 'state', common: { role, type, read: true, write: true, ...extra } },
});
const STATES = [
    row(`${L}.flur.ON`, 'switch.light', 'boolean'),
    row(`${L}.kueche.ON`, 'switch.light', 'boolean'),
    row(`${L}.kueche.DIMMER`, 'level.dimmer', 'number', { min: 0, max: 100 }),
    row(`${L}.kueche.TEMPERATURE`, 'level.color.temperature', 'number', { min: 2200, max: 4000 }),
    row(`${L}.wohnen.ON`, 'switch.light', 'boolean'),
    row(`${L}.wohnen.DIMMER`, 'level.dimmer', 'number'),
    row(`${L}.wohnen.RGB`, 'level.color.rgb', 'string'),
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate((rows) => {
    window.__auraShot.mockObjectView({ state: rows });
    // The detection asks whether the grandparent is a device; offline nothing would answer.
    // The ranges come from getObject (useDpRange), which the view mock does not serve.
    window.__auraShot.mockObject({
        'alias.0.aura_test925': { _id: 'alias.0.aura_test925', type: 'folder', common: {} },
        ...Object.fromEntries(rows.map((r) => [r.id, r.value])),
    });
    window.__auraShot.captureWrites(true);
}, STATES);

/** The same widget config for every lamp - only the datapoint differs, as {{dp}} would make it. */
const light = (datapoint) => ({
    id: 'w-light',
    type: 'light',
    title: 'Licht',
    layout: 'light-all',
    datapoint,
    gridPos: { x: 0, y: 0, w: 6, h: 14 },
    options: { autoDetectDps: true },
});

/** lucide icon names in the tab pill, e.g. ["power", "sun-medium", "thermometer"]. */
async function tabsFor(datapoint) {
    await page.evaluate((w) => window.__auraShot.showWidgets([w]), light(datapoint));
    await page.waitForTimeout(600);
    return page.evaluate(() =>
        [...document.querySelectorAll('.rounded-full.p-1 button.nodrag svg')].map((s) =>
            [...s.classList].find((c) => c.startsWith('lucide-') && c !== 'lucide-icon')?.slice(7),
        ),
    );
}

eq('switch-only lamp: no tab pill, nothing but on/off', await tabsFor(`${L}.flur.ON`), []);
eq('ct lamp: power, brightness, colour temperature', await tabsFor(`${L}.kueche.ON`), [
    'power',
    'sun-medium',
    'thermometer',
]);
await page.locator('.rounded-full.p-1 button.nodrag:has(svg.lucide-thermometer)').click();
await page.waitForTimeout(300);
const ctLabel = await page
    .locator('div.nodrag', { hasText: / K$/ })
    .last()
    .innerText()
    .catch(() => '');
eq('the 2200–4000 K range of the detected datapoint applies', ctLabel.trim(), '3100 K');
eq('rgb lamp: power, brightness, colour', await tabsFor(`${L}.wohnen.ON`), ['power', 'sun-medium', 'palette']);

// The power toggle writes the main datapoint of the lamp shown.
await page.evaluate(() => window.__auraShot.writes(true));
await page.locator('.rounded-full.p-1 button.nodrag').first().click();
await page.waitForTimeout(200);
const writes = await page.evaluate(() => window.__auraShot.writes());
eq('power writes the lamp shown', writes.at(-1)?.id, `${L}.wohnen.ON`);

eq('no page errors', pageErrors, []);
await browser.close();

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed ? `${failed} failed` : 'all passed'} (${results.length - failed}/${results.length})`);
process.exit(failed ? 1 : 0);
