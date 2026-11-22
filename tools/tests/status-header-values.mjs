// Statusübersicht and the header items (#1011):
//   1. a header item on row 1 sits beside the widget's own count chip instead of the
//      frame's fallback strip lying on top of it,
//   2. the widget hands its counts to the header ('widget' source status:*, text vars
//      {hints} {devices} {battery_devices} …),
//   3. categoryCount puts "hints / devices" beside a category heading.
//
//   AURA_BASE=http://127.0.0.1:5231 node tools/tests/status-header-values.mjs
//
// Needs a dev server with a connected instance — the widget discovers real datapoints.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

const widget = (id, layout, options) => ({
    id,
    type: 'statusoverview',
    title: 'Statusübersicht mit langem Titel',
    datapoint: '',
    layout,
    gridPos: { x: id === 'w-so-a' ? 0 : 14, y: 0, w: 14, h: 20 },
    options,
});

await page.evaluate(
    (ws) => window.__auraShot.showWidgets(ws),
    [
        widget('w-so-a', 'table', {
            catWindow: false,
            catLight: false,
            catAlarm: false,
            catUnreach: false,
            valueFilter: 'all',
            headerItems: [
                {
                    id: 'hi-text',
                    source: 'text',
                    slot: 'r1-right',
                    text: '{hints} Hinweise von {devices} Geräten',
                    chip: true,
                },
                {
                    id: 'hi-val',
                    source: 'widget',
                    widgetValue: 'status:battery:devices',
                    unit: 'Batterien',
                    slot: 'r2-left',
                },
            ],
        }),
        widget('w-so-b', 'default', {
            categoryCount: 'both',
            showOkCategories: true,
            headerItems: [{ id: 'hi-dev', source: 'text', slot: 'r1-right', text: '{devices} Geräte' }],
        }),
    ],
);

const a = page.locator('[data-widget-id="w-so-a"], [data-id="w-so-a"]').first();
const textItem = page.locator('[data-header-item="hi-text"]');
await textItem.waitFor({ timeout: 30000 });
// Wait for discovery: the text resolves to numbers.
await page
    .waitForFunction(
        () =>
            /\d+ Hinweise von [1-9]\d* Geräten/.test(
                document.querySelector('[data-header-item="hi-text"]')?.textContent ?? '',
            ),
        null,
        { timeout: 60000 },
    )
    .catch(() => {});

const text = (await textItem.textContent())?.trim() ?? '';
check('text item resolves {hints} and {devices}', /^\d+ Hinweise von [1-9]\d* Geräten$/.test(text), text);

const val =
    (
        await page
            .locator('[data-header-item="hi-val"]')
            .textContent()
            .catch(() => '')
    )?.trim() ?? '';
check('widget value status:battery:devices', /^[1-9]\d* Batterien$/.test(val), val);
const m = text.match(/von (\d+)/);
check('battery devices = all devices (only batteries on)', !!m && val.startsWith(`${m[1]} `), `${text} / ${val}`);

/** Title row holding a header item: its title, the item, and whatever follows it. */
const rowGeo = (id) =>
    page.evaluate((id) => {
        const item = document.querySelector(`[data-header-item="${id}"]`);
        const row = [...document.querySelectorAll('.aura-widget-title')]
            .map((t) => t.parentElement)
            .find((p) => p?.contains(item));
        if (!item || !row) return { inRow: false };
        const title = row.querySelector('.aura-widget-title');
        const slot = item.closest('[data-header-slot]');
        const chip = slot?.nextElementSibling ?? null;
        const r = (el) => el.getBoundingClientRect();
        const overlap = (p, q) =>
            p.left < q.right - 0.5 && q.left < p.right - 0.5 && p.top < q.bottom && q.top < p.bottom;
        return {
            inRow: true,
            chipText: chip?.textContent ?? null,
            itemChip: !!chip && overlap(r(item), r(chip)),
            itemTitle: overlap(r(item), r(title)),
            order: r(title).right <= r(item).left + 0.5 && (!chip || r(item).right <= r(chip).left + 0.5),
        };
    }, id);

// A: the header shows {hints} — the widget's own chip steps back.
const geoA = await rowGeo('hi-text');
check('{hints} in the header: item placed in the title row', geoA.inRow, JSON.stringify(geoA));
check('{hints} in the header: no count chip after it', geoA.inRow && geoA.chipText === null, JSON.stringify(geoA));

// A's hint count as chip: tinted background, colour by severity (no own colour set).
const chip = await page.evaluate(() => {
    const el = document.querySelector('[data-header-item="hi-text"]');
    const cs = el && getComputedStyle(el);
    return cs
        ? {
              cls: el.classList.contains('aura-header-item-chip'),
              bg: cs.backgroundColor,
              color: el.style.getPropertyValue('--aura-header-item-color'),
          }
        : null;
});
check(
    'chip: pill with a background',
    !!chip?.cls && chip.bg !== 'rgba(0, 0, 0, 0)' && chip.bg !== 'transparent',
    JSON.stringify(chip),
);
check('chip: colour follows the severity', /--badge-(ok|warn|crit)/.test(chip?.color ?? ''), JSON.stringify(chip));

// B: only {devices} — the chip stays, beside the item, not under it.
await page.locator('[data-header-item="hi-dev"]').waitFor({ timeout: 30000 });
await page
    .waitForFunction(
        () => /^[1-9]d* Geräte$/.test(document.querySelector('[data-header-item="hi-dev"]')?.textContent?.trim() ?? ''),
        null,
        {
            timeout: 60000,
        },
    )
    .catch(() => {});
const geo = await rowGeo('hi-dev');
check('row-1 item is placed in the widget title row', geo.inRow, JSON.stringify(geo));
check(
    'chip stays when the header shows no hint count',
    geo.inRow && /Hinweis|OK|…/.test(geo.chipText ?? ''),
    JSON.stringify(geo),
);
check('row-1 item does not overlap the count chip', geo.inRow && !geo.itemChip, JSON.stringify(geo));
check('row-1 item does not overlap the title', geo.inRow && !geo.itemTitle, JSON.stringify(geo));
check('order: title, item, chip', geo.inRow && geo.order, JSON.stringify(geo));
void a;

// categoryCount 'both' — once that widget has finished loading
await page
    .waitForFunction(() => document.querySelectorAll('.aura-status-cat-count').length > 0, null, { timeout: 60000 })
    .catch(() => {});
const counts = await page
    .locator('[data-widget-id="w-so-b"] .aura-status-cat-count, .aura-status-cat-count')
    .allTextContents();
check(
    'category heading shows "hints / devices"',
    counts.length > 0 && counts.every((c) => /^\d+ \/ \d+$/.test(c.trim())),
    JSON.stringify(counts),
);

await page.screenshot({ path: 'tools/tests/out/status-header-values.png' });
check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
