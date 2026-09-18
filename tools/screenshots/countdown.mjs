// Screenshots for docs/widgets/countdown.md (#675).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/screenshots/countdown.mjs
//
// The adapter is not involved: the harness injects the four status states the
// adapter would publish, so every shot is reproducible. A running countdown is
// anchored a fixed distance in the future; its digits differ by a second at most.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const OUT = 'docs/widgets/assets/countdown';
mkdirSync(OUT, { recursive: true });

const KEY = (k) => `aura.0.countdowns.${k}`;
const status = (k, s) => ({
    [`${KEY(k)}.state`]: s.state,
    [`${KEY(k)}.endTs`]: s.endTs ?? 0,
    [`${KEY(k)}.remainingMs`]: s.remainingMs ?? 0,
    [`${KEY(k)}.durationMs`]: s.durationMs ?? 0,
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const now = Date.now();
const mocks = {
    ...status('run', { state: 'running', endTs: now + 14 * 60_000 + 59_000 + 700, durationMs: 1_800_000 }),
    ...status('pau', { state: 'paused', remainingMs: 8 * 60_000 + 20_000, durationMs: 900_000 }),
    ...status('idl', { state: 'idle', remainingMs: 1_800_000, durationMs: 1_800_000 }),
    ...status('end', { state: 'ended', remainingMs: 0, durationMs: 900_000 }),
    'mytime.0.Countdowns.test.end': now + 42 * 60_000 + 17_000 + 700,
};
await page.evaluate((m) => {
    window.__auraShot.mock(m);
    window.__auraShot.mockServerState(m);
    window.__auraShot.captureWrites(true);
}, mocks);

const widget = (id, key, options = {}, extra = {}) => ({
    id,
    type: 'countdown',
    title: 'Zirkulationspumpe',
    datapoint: '',
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 8, h: 7 },
    ...extra,
    options: {
        stateBaseId: KEY(key),
        durationSec: 1800,
        stepSec: 300,
        presets: [900, 1800, 3600],
        icon: 'mdi:water-pump',
        ...options,
    },
});

async function shot(file, cfg, { wait = 900, editMode = false } = {}) {
    // Own id per shot so React remounts instead of updating in place.
    const sized = { ...cfg, id: `w-${file}` };
    await page.evaluate(({ w, edit }) => window.__auraShot.showWidgets([w], { editMode: edit }), {
        w: sized,
        edit: editMode,
    });
    await page.waitForTimeout(wait);
    const el = page.locator(`.aura-widget-w-${file}`).first();
    await el.screenshot({ path: `${OUT}/${file}.png` });
    console.log(`  ${file}.png`);
}

await shot('uebersicht', widget('u', 'run'));
await shot('layout-default', widget('d', 'idl'));
await shot('layout-compact', widget('c', 'run', {}, { layout: 'compact', gridPos: { x: 0, y: 0, w: 12, h: 2 } }));
await shot('zustand-pause', widget('p', 'pau', { durationSec: 900 }));
await shot('zustand-fertig', widget('e', 'end', { durationSec: 900, endedText: 'Fertig' }));
await shot(
    'fremder-datenpunkt',
    widget(
        'f',
        'x',
        { source: 'datapoint', dpKind: 'end-ts', format: 'hms' },
        { title: 'mytime-Countdown', datapoint: 'mytime.0.Countdowns.test.end', gridPos: { x: 0, y: 0, w: 8, h: 5 } },
    ),
);
await shot(
    'ohne-tasten',
    widget(
        'n',
        'run',
        { showControls: false, showStep: false, showPresets: false, format: 'hms' },
        { gridPos: { x: 0, y: 0, w: 8, h: 5 } },
    ),
);

// The duration dialog, opened from the digits of an idle countdown.
{
    const cfg = { ...widget('m', 'idl'), id: 'w-modal' };
    await page.evaluate((w) => window.__auraShot.showWidgets([w]), cfg);
    await page.waitForTimeout(700);
    await page.click('.aura-widget-w-modal .aura-countdown-digits button');
    await page.waitForSelector('.aura-countdown-modal', { timeout: 3000 });
    await page.waitForTimeout(300);
    const box = await page.evaluate(() => {
        const el = document.querySelector('.aura-countdown-modal > div');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    if (!box) throw new Error('modal not found');
    const pad = 8;
    await page.screenshot({
        path: `${OUT}/dialog-dauer.png`,
        clip: { x: box.x - pad, y: box.y - pad, width: box.width + 2 * pad, height: box.height + 2 * pad },
    });
    console.log('  dialog-dauer.png');
    await page.keyboard.press('Escape');
}

await browser.close();
