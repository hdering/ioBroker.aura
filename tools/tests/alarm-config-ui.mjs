// Alarm widget settings (#1037): data source switch, "take over from alarm adapter",
// mode list from a JSON datapoint (preview with skipped rows, "take over as list"),
// the popup editors for modes and zones, greyed-out elements without a datapoint,
// and the edit-mode hint for an unusable JSON datapoint.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/alarm-config-ui.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const D = 'demo.alarmcfg.0';
const ID = 'w-alarm-cfg';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 60000 });
await page.evaluate(() => window.__auraShot.captureWrites(true));

const vals = {
    [`${D}.modes`]: JSON.stringify([
        { key: 'off', label: 'Aus', disarm: true, writeValue: '0' },
        { key: 'away', label: 'Weg', writeValue: '1' },
        { key: 'bad', label: 'Kaputt', writeDp: 'http://x' },
    ]),
    [`${D}.state`]: 0,
};
await page.evaluate(
    ([id, v]) => {
        window.__auraShot.mock(v);
        window.__auraShot.mockServerState?.(v);
        window.__auraShot.showWidgets(
            [
                {
                    id,
                    type: 'alarm',
                    title: 'Alarmanlage',
                    datapoint: '',
                    gridPos: { x: 0, y: 0, w: 6, h: 8 },
                    options: { alarmPrefix: 'alarm.0' },
                },
            ],
            { editMode: true },
        );
        window.__auraShot.setEditMode(true);
        window.__auraShot.mock(v);
    },
    [ID, vals],
);
await page.waitForTimeout(500);
const opts = () => page.evaluate((id) => window.__auraShot.widgetOptions(id), ID);
const settle = () => page.waitForTimeout(300);

await page.evaluate(() => window.__auraShot.unfoldSections());
await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
await page.waitForTimeout(500);

const seg = (name, key) => page.locator(`[data-aura-segment="${name}"] button[data-key="${key}"]`).first();
check('source switch is there', (await seg('source', 'manual').count()) === 1);

// Adapter mode: the mode list editor shows the fixed four with greyed command fields
await page.locator('[data-aura-open-editor="alarm-modes"]').click();
await settle();
const modal = page.locator('[data-aura-alarm-modes-editor]');
check('adapter: editor lists the four modes', (await modal.locator('[data-aura-alarm-mode-row]').count()) === 4);
check('adapter: no add button', (await page.locator('[data-aura-add="mode"]').count()) === 0);
await modal.locator('[data-aura-alarm-mode-row="sharp"] input[data-aura-field="label"]').fill('Weg');
await settle();
check(
    'adapter: label override stored',
    (await opts()).modes?.find((m) => m.key === 'sharp')?.label === 'Weg',
    JSON.stringify((await opts()).modes),
);
await page.keyboard.press('Escape');
await settle();

// Switch to own datapoints
await seg('source', 'manual').click();
await settle();
let o = await opts();
check('manual: sourceMode stored', o.sourceMode === 'manual');
check(
    'manual: AUS/SCHARF seeded',
    JSON.stringify(o.modes?.map((m) => [m.key, m.writeValue])) === '[["off","false"],["armed","true"]]',
    JSON.stringify(o.modes),
);
check(
    'manual: panic greyed out without dp',
    (await page.locator('text=Kein Datenpunkt gewählt (Datenquelle)').count()) > 0,
);

// Take over from adapter
await page.locator('[data-aura-alarm-takeover]').click();
await settle();
o = await opts();
check('takeover: state dp from prefix', o.stateDp === 'alarm.0.status.state_list', o.stateDp);
check(
    'takeover: four modes writing use.list',
    o.modes?.length === 4 && o.modes.every((m) => m.writeDp === 'alarm.0.use.list'),
);
check('takeover: three zones', o.zones?.length === 3);

// Modes from JSON datapoint
await seg('alarm-modes', 'json').click();
await settle();
await page.locator('input[data-aura-dp="modes"]').fill(`${D}.modes`);
await page.waitForTimeout(800);
const preview = await page.locator('[data-aura-alarm-preview="modes"]').innerText();
check('json preview: two usable entries', preview.includes('2 Einträge'), preview);
check(
    'json preview: bad row with reason',
    preview.includes('bad') && preview.includes('ungültiger Datenpunkt'),
    preview,
);
check(
    'json: modesSource + dp stored',
    (await opts()).modesSource === 'json' && (await opts()).modesDp === `${D}.modes`,
);
await page.locator('[data-aura-takeover="modes"]').click();
await settle();
o = await opts();
check('take over as list: source back to list', o.modesSource === 'list');
check(
    'take over as list: two modes',
    JSON.stringify(o.modes?.map((m) => m.key)) === '["off","away"]',
    JSON.stringify(o.modes),
);

// Popup editor in manual mode: add a mode, add a zone
await page.locator('[data-aura-open-editor="alarm-modes"]').click();
await settle();
await page.locator('[data-aura-add="mode"]').click();
await settle();
check('manual editor: add mode', (await opts()).modes?.length === 3);
await page.keyboard.press('Escape');
await settle();
await page.locator('[data-aura-open-editor="alarm-zones"]').click();
await settle();
await page.locator('[data-aura-add="zone"]').click();
await settle();
check('manual editor: add zone', (await opts()).zones?.length === 4);
await page.keyboard.press('Escape');
await settle();

// Widget in edit mode: unusable JSON datapoint → hint instead of an empty widget
await page.evaluate(
    ([id]) => {
        const v = { 'demo.alarmcfg.0.empty': '' };
        window.__auraShot.mock(v);
        window.__auraShot.showWidgets(
            [
                {
                    id: `${id}-hint`,
                    type: 'alarm',
                    title: 'Alarmanlage',
                    datapoint: '',
                    gridPos: { x: 0, y: 0, w: 6, h: 6 },
                    options: {
                        sourceMode: 'manual',
                        stateDp: 'demo.alarmcfg.0.state',
                        modesSource: 'json',
                        modesDp: 'demo.alarmcfg.0.empty',
                    },
                },
            ],
            { editMode: true },
        );
        window.__auraShot.setEditMode(true);
    },
    [ID],
);
await page.waitForTimeout(500);
check(
    'edit mode: hint for empty JSON datapoint',
    (await page.locator(`.aura-widget-${ID}-hint .aura-alarm-hint`).count()) === 1,
);

// ── instance detection (adapter mode) ────────────────────────────────────────
async function openFresh(id, options, views) {
    await page.evaluate(
        ([wid, opts, v]) => {
            const a = window.__auraShot;
            a.mockObjectView(v);
            a.unfoldSections();
            a.showWidgets(
                [
                    {
                        id: wid,
                        type: 'alarm',
                        title: 'Alarmanlage',
                        datapoint: '',
                        gridPos: { x: 0, y: 0, w: 6, h: 8 },
                        options: opts,
                    },
                ],
                { editMode: true },
            );
            a.setEditMode(true);
        },
        [id, options, views],
    );
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape').catch(() => {});
    await page.locator(`.aura-widget-${id} .aura-edit-chrome button`).first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    await page.waitForTimeout(600);
}
await openFresh('w-alarm-noinst', {}, { instance: [] });
check('no instance: hint shown', (await page.locator('[data-aura-alarm-no-instance]').count()) === 1);
await page.locator('[data-aura-alarm-no-instance] button').click();
await settle();
check(
    'no instance: button switches to own datapoints',
    (await page.evaluate(() => window.__auraShot.widgetOptions('w-alarm-noinst'))).sourceMode === 'manual',
);
await page.keyboard.press('Escape');
await openFresh(
    'w-alarm-inst',
    { alarmPrefix: 'alarm.0' },
    {
        instance: [
            { id: 'system.adapter.alarm.0', value: {} },
            { id: 'system.adapter.alarm.1', value: {} },
        ],
    },
);
check('instances: both offered', (await page.locator('[data-aura-alarm-instances] button').count()) === 2);
await page.locator('[data-aura-alarm-instances] button', { hasText: 'alarm.1' }).click();
await settle();
check(
    'instances: pick sets the prefix',
    (await page.evaluate(() => window.__auraShot.widgetOptions('w-alarm-inst'))).alarmPrefix === 'alarm.1',
);
await page.keyboard.press('Escape');

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
