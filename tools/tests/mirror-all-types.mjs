// Verifies the "Spiegel" widget can mirror EVERY widget type against the dev server.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/mirror-all-types.mjs
//
// Regression: WidgetFrame.tsx kept a private type → component map, so types added only
// there (`menu`) rendered on the dashboard but produced "Unbekannter Widget-Typ: menu"
// inside a mirror. The type list is read from src-vis/types/index.ts, so a new widget
// type is covered here the moment it is declared.
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const SRC_ID = 'mirror-src';
const MIR_ID = 'mirror-dst';

const TYPES = readFileSync(new URL('../../src-vis/types/index.ts', import.meta.url), 'utf8')
    .split('export type WidgetType =')[1]
    .split(';')[0]
    .split('|')
    .map((s) => s.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);

if (TYPES.length < 40) {
    console.error(`could not read the WidgetType union (got ${TYPES.length} entries)`);
    process.exit(1);
}

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    if (!ok) console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
};

const source = (type) => ({
    id: SRC_ID,
    type,
    title: 'Quelle',
    datapoint: 'demo.0.value',
    gridPos: { x: 0, y: 0, w: 12, h: 8 },
    options: {},
});

const mirror = () => ({
    id: MIR_ID,
    type: 'mirror',
    title: 'Spiegel',
    datapoint: '',
    gridPos: { x: 12, y: 0, w: 12, h: 8 },
    options: { targetWidgetId: SRC_ID },
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

// A cold dev server has to compile the whole widget graph first — 30s is not always enough.
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
await page.evaluate(() =>
    window.__auraShot.mock({
        'demo.0.value': { val: 21.5, unit: '°C' },
        'demo.0.switch': true,
        'demo.0.level': { val: 60, unit: '%' },
    }),
);

const body = (id) => page.locator(`.aura-widget-${id}`);

for (const type of TYPES) {
    const before = pageErrors.length;
    await page.evaluate(([s, m]) => window.__auraShot.showWidgets([s, m]), [source(type), mirror()]);
    // Chart/map/echart widgets are lazy chunks — give the import time to resolve.
    await page.waitForTimeout(700);

    const text =
        (await body(MIR_ID)
            .first()
            .innerText()
            .catch(() => '')) ?? '';
    const nodes = await body(MIR_ID)
        .locator('*')
        .count()
        .catch(() => 0);

    if (type === 'mirror') {
        // Mirroring a mirror stays blocked on purpose (it would allow cycles).
        check('mirror of mirror keeps its guard', text.includes('Spiegel kann keinen Spiegel spiegeln'), text.trim());
        continue;
    }

    check(`${type}: renders a known type`, !text.includes('Unbekannter Widget-Typ'), text.trim().split('\n')[0]);
    check(`${type}: resolves its source`, !text.includes('existiert nicht mehr'));
    check(`${type}: renders content`, nodes > 0, `${nodes} nodes`);
    check(`${type}: no page error`, pageErrors.length === before, pageErrors.slice(before).join(' | '));
}

// The regression case in full: a mirrored menu must show the same entries as the source.
await page.evaluate(([s, m]) => window.__auraShot.showWidgets([s, m]), [source('menu'), mirror()]);
await page.waitForTimeout(500);
const srcText = await body(SRC_ID).first().innerText();
const mirText = await body(MIR_ID).first().innerText();
check(
    'mirrored menu shows the source entries',
    srcText.includes('Screenshot') && mirText.includes('Screenshot'),
    `source="${srcText.trim()}" mirror="${mirText.trim()}"`,
);

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed (${TYPES.length} widget types)`);
if (failed.length) {
    console.log(failed.map((f) => `  FAIL ${f.name}${f.detail ? ` — ${f.detail}` : ''}`).join('\n'));
    process.exit(1);
}
console.log('✓ every widget type can be mirrored');
