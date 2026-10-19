// Countdown trigger datapoint (#796) in the edit dialog: the "Auslöser" block,
// "use the target datapoint", value and both switches land in the widget
// options, and the widget publishes them in its config for the adapter.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/countdown-trigger-ui.mjs
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

const KEY = 'aura.0.countdowns.trg';
const PLUG = 'demo.plug.on';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1200 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
const mocks = { [`${KEY}.state`]: 'idle', [`${KEY}.durationMs`]: 1_800_000, [`${KEY}.remainingMs`]: 1_800_000 };
await page.evaluate((m) => {
    window.__auraShot.mock(m);
    window.__auraShot.mockServerState(m);
    window.__auraShot.captureWrites(true);
}, mocks);

const widget = {
    id: 'cd-trg',
    type: 'countdown',
    title: 'Steckdose',
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 8, h: 6 },
    options: { stateBaseId: KEY, durationSec: 1800, targetDp: PLUG, valueOnStart: '', valueOnEnd: 'false' },
};
await page.evaluate((w) => {
    window.__auraShot.showWidgets([w], { editMode: true });
    window.__auraShot.setEditMode(true);
}, widget);
await page.waitForTimeout(600);

const opts = () => page.evaluate(() => window.__auraShot.widgetOptions('cd-trg'));
const lastConfig = async () => {
    const all = await page.evaluate(() => window.__auraShot.writes());
    const w = all.filter((x) => x.id === `${KEY}.config`).pop();
    return w ? JSON.parse(String(w.val)) : null;
};

{
    const cfg = await lastConfig();
    check('without a trigger the published config carries none', !!cfg && !cfg.triggerDp, JSON.stringify(cfg));
}

await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const dlg = page.locator('.aura-widget-edit-modal');
await dlg.waitFor({ timeout: 10000 });
await page.evaluate(() => window.__auraShot.unfoldSections());
// The widget's own sections stay folded; the trigger lives under "Datenpunkte".
await dlg.locator('details[data-aura-config-section="datapoints"] > summary').first().click();
await page.waitForTimeout(300);

check('the dialog has a trigger block', (await dlg.locator('text=Auslöser').count()) > 0);
check(
    'trigger value is hidden without a trigger datapoint',
    (await dlg.locator('[data-field="triggerValue"]').count()) === 0,
);

const useTarget = dlg.locator('[data-action="trigger-from-target"]');
check('offers to take over the target datapoint', (await useTarget.count()) === 1);
await useTarget.click();
await page.waitForTimeout(300);
eq('triggerDp = targetDp', (await opts()).triggerDp, PLUG);
check('the take-over link is gone once they match', (await useTarget.count()) === 0);

await dlg.locator('[data-field="triggerValue"]').fill('1');
const toggleFor = (label) => dlg.locator(`div.flex:has(> div > p:text-is("${label}")) > button[aria-pressed]`).first();
await toggleFor('Bei Rückfall stoppen').click();
await toggleFor('Bei erneutem Auslösen neu starten').click();
await page.waitForTimeout(400);
const o = await opts();
eq('triggerValue stored', o.triggerValue, '1');
eq('triggerStopOnRevert stored', o.triggerStopOnRevert, true);
eq('triggerRestart stored', o.triggerRestart, true);

if (process.env.SHOT) await dlg.screenshot({ path: process.env.SHOT });
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
{
    const cfg = await lastConfig();
    eq(
        'the widget publishes the trigger for the adapter',
        cfg && {
            triggerDp: cfg.triggerDp,
            triggerValue: cfg.triggerValue,
            triggerStopOnRevert: cfg.triggerStopOnRevert,
            triggerRestart: cfg.triggerRestart,
        },
        { triggerDp: PLUG, triggerValue: '1', triggerStopOnRevert: true, triggerRestart: true },
    );
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
