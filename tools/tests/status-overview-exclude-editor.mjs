// Statusübersicht editor: "Erkannte Datenpunkte" popup (#1002).
//
//   AURA_BASE=http://localhost:5174 node tools/tests/status-overview-exclude-editor.mjs
//
// Covers:
//   - the popup lists every detected datapoint, grouped by device
//   - an alias and the datapoint it reads from are marked as a pair
//   - unticking a datapoint writes excludeIds, the widget drops the row
//   - a hidden datapoint stays listed (unticked) and can be ticked back on
//   - "Originale ausblenden" hides the originals of all pairs, keeps the aliases
//   - an excluded id the widget no longer finds is listed under "Nicht mehr gefunden"
//   - an empty list clears the option (undefined, not [])
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const ORIG = 'zigbee.0.00158d0001.battery';
const ALIAS = 'alias.0.Bad.Fenster.battery';
const OTHER = 'zigbee.0.00158d0002.battery';
const GONE = 'zigbee.0.weg.battery';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` - ${detail}` : ''}`);
};

const state = (id, name, extra = {}) => ({
    id,
    value: {
        _id: id,
        type: 'state',
        common: { name, role: 'value.battery', type: 'number', unit: '%', read: true, write: false, ...extra },
        native: {},
    },
});
const device = (id, name) => ({ id, value: { _id: id, type: 'device', common: { name }, native: {} } });
const OBJECTS = {
    state: [state(ORIG, 'Batterie'), state(ALIAS, 'Batterie', { alias: { id: ORIG } }), state(OTHER, 'Batterie')],
    device: [
        device('zigbee.0.00158d0001', 'Fenster Bad'),
        device('zigbee.0.00158d0002', 'Bewegung Flur'),
        device('alias.0.Bad.Fenster', 'Fenster Bad (Alias)'),
    ],
    enum: [],
};

const browser = await chromium.launch();
const pageErrors = [];

const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 90000 });
await page.evaluate(
    ([objects, values]) => {
        const s = window.__auraShot;
        s.captureWrites(true);
        s.mockObjectView(objects);
        s.mockServerState(values);
        s.mock(values);
    },
    [OBJECTS, { [ORIG]: 80, [ALIAS]: 80, [OTHER]: 70 }],
);
await page.evaluate(() =>
    window.__auraShot.showWidgets([
        {
            id: 'w-ex',
            type: 'statusoverview',
            title: 'Batterien',
            datapoint: '',
            layout: 'compact',
            gridPos: { x: 0, y: 0, w: 6, h: 10 },
            options: {
                catWindow: false,
                catLight: false,
                catUnreach: false,
                catAlarm: false,
                batteryTypeEnabled: false,
                valueFilter: 'all',
            },
        },
    ]),
);
await page.waitForTimeout(1500);
await page.evaluate(() => window.__auraShot.setEditMode(true));
const opts = () => page.evaluate(() => window.__auraShot.widgetOptions('w-ex'));

await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
await page.locator('.aura-widget-edit-modal').waitFor({ timeout: 10000 });
await page.evaluate(() => window.__auraShot.unfoldSections?.());
// The detected datapoints live in the config dialog, tab "Datenpunkte".
const openBtn = page.locator('[data-status-config-open]');
await openBtn.waitFor({ timeout: 10000 });
await openBtn.click();
await page.locator('[data-config-tab="datapoints"]').click();
const pop = page.locator('[data-aura-status-datapoints]');
await pop.waitFor({ timeout: 10000 });
await page.waitForTimeout(500);

const listed = () => pop.evaluate((d) => [...d.querySelectorAll('[data-status-dp]')].map((l) => l.dataset.statusDp));
const ticked = (id) => pop.locator(`[data-status-dp="${id}"] input`).isChecked();

const ids = await listed();
check(
    'all three datapoints listed',
    [ORIG, ALIAS, OTHER].every((id) => ids.includes(id)),
    JSON.stringify(ids),
);
check(
    'alias marked as duplicate of its original',
    (await pop.locator(`[data-status-dp="${ALIAS}"] [data-status-dp-dupe="alias"]`).getAttribute('title')) ===
        `Alias von ${ORIG}`,
);
check(
    'alias grouped by its own folder, not the room folder',
    (await pop.locator(`[data-status-dp-device="alias.0.Bad.Fenster"] [data-status-dp="${ALIAS}"]`).count()) === 1,
);
check(
    'original marked as aliased',
    (await pop.locator(`[data-status-dp="${ORIG}"] [data-status-dp-dupe="original"]`).getAttribute('title')) ===
        `auch als Alias ${ALIAS}`,
);
check(
    'summary counts the pair',
    (await pop.locator('[data-status-dp-summary]').textContent()).includes('1 Alias-Doppelte'),
    await pop.locator('[data-status-dp-summary]').textContent(),
);

// Untick one datapoint.
await pop.locator(`[data-status-dp="${OTHER}"] input`).click();
check('untick writes excludeIds', JSON.stringify((await opts())?.excludeIds) === JSON.stringify([OTHER]));
await page.waitForTimeout(400);
check('hidden datapoint stays listed', (await listed()).includes(OTHER));
check('hidden datapoint is unticked', !(await ticked(OTHER)));

// "Nur ausgeblendete" filter.
await pop.locator('select').selectOption('hidden');
check(
    'filter: only hidden',
    JSON.stringify(await listed()) === JSON.stringify([OTHER]),
    JSON.stringify(await listed()),
);
await pop.locator('select').selectOption('all');

// Tick back on → option cleared, not [].
await pop.locator(`[data-status-dp="${OTHER}"] input`).click();
check('tick back clears the option', (await opts())?.excludeIds === undefined, JSON.stringify(await opts()));

// Originals of alias pairs.
await pop.locator('[data-status-dp-hide="originals"]').click();
check('hide originals', JSON.stringify((await opts())?.excludeIds) === JSON.stringify([ORIG]));
await page.locator('[data-status-dp-hide="aliases"]').click();
check('hide aliases instead', JSON.stringify((await opts())?.excludeIds) === JSON.stringify([ALIAS]));

// Widget drops the hidden row.
await page
    .locator('.aura-config-modal-close, [aria-label="Schließen"]')
    .last()
    .click()
    .catch(() => {});
await page.waitForTimeout(800);
const widgetText = await page.locator('.react-grid-item').first().textContent();
check('widget no longer lists the alias row', !widgetText.includes('Alias'), widgetText);

await ctx.close();

// Orphans: an excluded id that is no longer found.
{
    const c = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const p = await c.newPage();
    p.on('pageerror', (e) => pageErrors.push(e.message));
    await p.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 90000 });
    await p.evaluate(
        ([objects, values]) => {
            const s = window.__auraShot;
            s.captureWrites(true);
            s.mockObjectView(objects);
            s.mockServerState(values);
            s.mock(values);
        },
        [OBJECTS, { [ORIG]: 80, [ALIAS]: 80, [OTHER]: 70 }],
    );
    await p.evaluate(
        (gone) =>
            window.__auraShot.showWidgets([
                {
                    id: 'w-ex',
                    type: 'statusoverview',
                    title: 'Batterien',
                    datapoint: '',
                    layout: 'compact',
                    gridPos: { x: 0, y: 0, w: 6, h: 10 },
                    options: {
                        catWindow: false,
                        catLight: false,
                        catUnreach: false,
                        catAlarm: false,
                        excludeIds: [gone],
                    },
                },
            ]),
        GONE,
    );
    await p.waitForTimeout(1500);
    await p.evaluate(() => window.__auraShot.setEditMode(true));
    await p.locator('.aura-edit-chrome button').first().click();
    await p.locator('button:text-is("Bearbeiten")').click();
    await p.evaluate(() => window.__auraShot.unfoldSections?.());
    const btn = p.locator('[data-status-config-open]');
    await btn.waitFor({ timeout: 10000 });
    const sum = p.locator('[data-status-config-summary]');
    check(
        'summary counts hidden datapoints',
        (await sum.textContent()).includes('1 ausgeblendet'),
        await sum.textContent(),
    );
    await btn.click();
    await p.locator('[data-config-tab="datapoints"]').click();
    const pp = p.locator('[data-aura-status-datapoints]');
    await pp.waitFor({ timeout: 10000 });
    await p.waitForTimeout(500);
    const orphan = pp.locator(`[data-status-dp="${GONE}"]`);
    check('orphan listed', (await orphan.count()) === 1);
    check('orphan under "Nicht mehr gefunden"', (await pp.textContent()).includes('Nicht mehr gefunden'));
    await orphan.locator('input').click();
    check(
        'ticking the orphan removes it',
        (await p.evaluate(() => window.__auraShot.widgetOptions('w-ex')))?.excludeIds === undefined,
    );
    await c.close();
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
