// Verifies the second line of both lists: extra datapoints per entry (static and
// dynamic), plus the dynamic list's list-wide template with {{parent}} & co.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/list-subdps.mjs
//
// Uses the screenshot harness (__auraShot) so datapoint values live in the
// in-memory cache only - no socket write, no real datapoint is touched. The same
// values go to mockServerState, otherwise the initial getState round-trip answers
// null for the fictional IDs.
// Checked: the extra values render in default/card/compact and stay out of the
// badges layout, each one lands in its configured slot (left/centre/right),
// label/icon/unit/decimals/font size are applied, the value conversion works per
// datapoint and inherits the list-wide default, and a row click still opens.
// For the dynamic list additionally: per-entry datapoints render the same way, the
// template resolves {{parent}} per row, an entry's own list replaces the template,
// rows whose resolved datapoint has no value are dropped (and shown as a dash once
// subDpTemplateHideMissing is off), and absolute template ids apply to every row.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

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
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

// 2026-08-11 14:32:07 local time - the value the time check formats.
const TS = Math.floor(new Date(2026, 7, 11, 14, 32, 7).getTime() / 1000);

async function show(layout, { entries, options = {}, values }) {
    const widget = {
        id: 'w-list',
        type: 'list',
        title: 'Testliste',
        datapoint: '',
        layout,
        gridPos: { x: 0, y: 0, w: 12, h: 8 },
        options: { entries, ...options },
    };
    await page.evaluate(
        ([w, vals]) => {
            window.__auraShot.mock(vals);
            window.__auraShot.mockServerState(vals);
            window.__auraShot.showWidgets([w]);
        },
        [widget, values],
    );
    await page.waitForTimeout(400);
}

const widgetText = () =>
    page.evaluate(() => {
        const el = document.querySelector('.react-grid-item');
        return el ? el.innerText.replace(/\s+/g, ' ').trim() : 'NO WIDGET';
    });

/** Text of the slot groups of the first second-line, in DOM order. */
const slotTexts = () =>
    page.evaluate(() => {
        const line = document.querySelector('.aura-entry-subline');
        if (!line) return null;
        const clean = (s) => s.replace(/\s+/g, ' ').trim();
        // With one slot in use the three-column grid is dropped and the items sit
        // directly in the line — that whole line is the single group.
        if (!line.classList.contains('grid')) return [clean(line.innerText)];
        return [...line.children].map((c) => clean(c.innerText));
    });

const TEMP = { 'demo.temp': 21.5, 'demo.batt': 87, 'demo.rssi': -62, 'demo.ts': TS, 'demo.energy': 1234 };

const mainEntry = (subDps) => [
    { id: 'demo.temp', label: 'Wohnzimmer', unit: '°C', displayType: 'value', decimals: 1, subDps },
];

// ── 1. Extra values render in the row layouts, not in badges ──────────────────
for (const layout of ['default', 'card', 'compact']) {
    await show(layout, {
        entries: mainEntry([
            { id: 'demo.batt', label: 'Batt', unit: '%', decimals: 0 },
            { id: 'demo.rssi', label: 'RSSI', align: 'right', decimals: 0 },
        ]),
        values: TEMP,
    });
    const text = await widgetText();
    check(`${layout} shows the main value`, text.includes('21.5') || text.includes('21,5'), text);
    check(`${layout} shows the extra values`, text.includes('Batt 87 %') && text.includes('RSSI -62'), text);
}

await show('minimal', {
    entries: mainEntry([{ id: 'demo.batt', label: 'Batt', unit: '%', decimals: 0 }]),
    values: TEMP,
});
{
    const text = await widgetText();
    check('badges layout ignores the second line', !text.includes('Batt'), text);
}

// ── 2. Each extra datapoint lands in its configured slot ─────────────────────
await show('default', {
    entries: mainEntry([
        { id: 'demo.batt', label: 'L', unit: '%', decimals: 0 },
        { id: 'demo.rssi', label: 'M', align: 'center', decimals: 0 },
        { id: 'demo.energy', label: 'R', align: 'right', unit: 'Wh', decimals: 0 },
    ]),
    values: TEMP,
});
{
    const slots = await slotTexts();
    check('second line renders three slots', slots?.length === 3, JSON.stringify(slots));
    check('left slot holds the left datapoint', slots?.[0]?.startsWith('L'), JSON.stringify(slots));
    check('centre slot holds the centred datapoint', slots?.[1]?.startsWith('M'), JSON.stringify(slots));
    check('right slot holds the right datapoint', slots?.[2]?.startsWith('R'), JSON.stringify(slots));
}

// ── 3. Two datapoints in the same slot stand side by side, spanning the row ──
await show('default', {
    entries: mainEntry([
        { id: 'demo.batt', label: 'A', decimals: 0 },
        { id: 'demo.rssi', label: 'B', decimals: 0 },
    ]),
    values: TEMP,
});
{
    const slots = await slotTexts();
    check('a single slot spans the whole row', slots?.length === 1, JSON.stringify(slots));
    check('same slot keeps both in config order', /^A 87 B -62$/.test(slots?.[0] ?? ''), JSON.stringify(slots));
}

// ── 4. Label optional, unit and decimals applied ─────────────────────────────
await show('default', {
    entries: mainEntry([{ id: 'demo.temp', unit: '°C', decimals: 2 }]),
    values: TEMP,
});
{
    const slots = await slotTexts();
    check('no label shows the bare value', /^21[.,]50 °C$/.test(slots?.[0] ?? ''), JSON.stringify(slots));
}

// ── 5. Font size and colour reach the DOM ────────────────────────────────────
await show('default', {
    entries: mainEntry([{ id: 'demo.batt', label: 'Batt', fontSize: 14, color: '#ff0000', decimals: 0 }]),
    values: TEMP,
});
{
    const style = await page.evaluate(() => {
        const item = document.querySelector('.aura-entry-subline span span');
        if (!item) return null;
        const cs = getComputedStyle(item);
        return { fontSize: cs.fontSize, color: cs.color };
    });
    check('font size is applied', style?.fontSize === '14px', JSON.stringify(style));
    check('colour is applied', style?.color === 'rgb(255, 0, 0)', JSON.stringify(style));
}

// ── 6. Value conversion: own setting, list-wide default, time output ─────────
await show('default', {
    entries: mainEntry([
        { id: 'demo.energy', label: 'E', unit: 'kWh', valueTransform: 'wh-kwh', valueFactor: 0.001, decimals: 2 },
    ]),
    values: TEMP,
});
{
    const slots = await slotTexts();
    check('own conversion is applied', /1[.,]23 kWh/.test(slots?.[0] ?? ''), JSON.stringify(slots));
}

await show('default', {
    entries: mainEntry([{ id: 'demo.energy', label: 'E', unit: 'kWh', decimals: 2 }]),
    options: { valueTransform: 'wh-kwh', valueFactor: 0.001 },
    values: TEMP,
});
{
    const slots = await slotTexts();
    check('list-wide conversion is inherited', /1[.,]23 kWh/.test(slots?.[0] ?? ''), JSON.stringify(slots));
}

await show('default', {
    entries: mainEntry([{ id: 'demo.ts', label: 'Seit', unit: 'Wh', valueTimeFormat: 'datetime' }]),
    values: TEMP,
});
{
    const slots = await slotTexts();
    check('time format is applied', /11\.08\.2026 14:32/.test(slots?.[0] ?? ''), JSON.stringify(slots));
    check('unit is dropped for a time output', !(slots?.[0] ?? '').includes('Wh'), JSON.stringify(slots));
}

// ── 7. Unknown / null datapoint shows the dash instead of breaking ───────────
await show('default', {
    entries: mainEntry([{ id: 'demo.missing', label: 'X' }]),
    values: TEMP,
});
{
    const slots = await slotTexts();
    check('missing datapoint shows a dash', (slots?.[0] ?? '').includes('–'), JSON.stringify(slots));
}

// ── 8. The row click action still fires with a second line present ───────────
await show('default', {
    entries: mainEntry([{ id: 'demo.batt', label: 'Batt', decimals: 0 }]),
    options: { rowClickAction: { kind: 'popup-dps', scope: 'parent', relevantOnly: true } },
    values: TEMP,
});
{
    await page.click('.aura-entry-subline');
    await page.waitForTimeout(600);
    // Same locator the row-popup harness uses for the popup layer.
    const count = await page.locator('div[class*="z-[300]"]').count();
    check('clicking the second line opens the row popup', count === 1, `count=${count}`);
}

// ── 9. Dynamic list: per-entry datapoints render like the static ones ─────────
// Same widget config shape, type 'autolist'. No filter is set, so the periodic
// discovery sync stays a no-op and the entries are exactly what we hand in.
async function showAuto(layout, { entries, options = {}, values }) {
    const widget = {
        id: 'w-autolist',
        type: 'autolist',
        title: 'Dynamische Testliste',
        datapoint: '',
        layout,
        gridPos: { x: 0, y: 0, w: 12, h: 8 },
        options: { entries, ...options },
    };
    await page.evaluate(
        ([w, vals]) => {
            window.__auraShot.mock(vals);
            window.__auraShot.mockServerState(vals);
            window.__auraShot.showWidgets([w]);
        },
        [widget, values],
    );
    await page.waitForTimeout(400);
}

/** Text of every second line in the widget, in DOM order. */
const allSubLines = () =>
    page.evaluate(() =>
        [...document.querySelectorAll('.aura-entry-subline')].map((el) => el.innerText.replace(/\s+/g, ' ').trim()),
    );

const AUTO_VALUES = { ...TEMP, 'other.temp': 19 };
// Two entries in different strangs: only the first one has a sibling battery value.
const autoEntries = (extra = {}) => [
    { id: 'demo.temp', label: 'Wohnzimmer', unit: '°C', displayType: 'value', decimals: 1, ...(extra.first ?? {}) },
    { id: 'other.temp', label: 'Bad', unit: '°C', displayType: 'value', decimals: 1, ...(extra.second ?? {}) },
];

for (const layout of ['default', 'card', 'compact']) {
    await showAuto(layout, {
        entries: [{ ...autoEntries()[0], subDps: [{ id: 'demo.batt', label: 'Batt', unit: '%', decimals: 0 }] }],
        values: AUTO_VALUES,
    });
    const text = await widgetText();
    check(`autolist ${layout} shows the extra value`, text.includes('Batt 87 %'), text);
}

await showAuto('minimal', {
    entries: [{ ...autoEntries()[0], subDps: [{ id: 'demo.batt', label: 'Batt', unit: '%', decimals: 0 }] }],
    values: AUTO_VALUES,
});
{
    const text = await widgetText();
    check('autolist badges layout ignores the second line', !text.includes('Batt'), text);
}

// ── 10. Template: {{parent}} resolved per row, rows without the DP dropped ────
await showAuto('default', {
    entries: autoEntries(),
    options: { subDpTemplate: [{ id: '{{parent}}.batt', label: 'Batt', unit: '%', decimals: 0 }] },
    values: AUTO_VALUES,
});
{
    const lines = await allSubLines();
    check('template resolves {{parent}} for the row', lines[0] === 'Batt 87 %', JSON.stringify(lines));
    check('row without the resolved datapoint has no second line', lines.length === 1, JSON.stringify(lines));
}

// ── 11. An entry's own datapoints replace the template ───────────────────────
await showAuto('default', {
    entries: autoEntries({
        first: { subDps: [{ id: 'demo.rssi', label: 'RSSI', decimals: 0 }] },
    }),
    options: { subDpTemplate: [{ id: '{{parent}}.batt', label: 'Batt', unit: '%', decimals: 0 }] },
    values: AUTO_VALUES,
});
{
    const lines = await allSubLines();
    check('own datapoints win over the template', lines[0] === 'RSSI -62', JSON.stringify(lines));
    check('template is not appended to them', !lines[0]?.includes('Batt'), JSON.stringify(lines));
}

// ── 12. subDpTemplateHideMissing off keeps the dash ──────────────────────────
await showAuto('default', {
    entries: autoEntries(),
    options: {
        subDpTemplate: [{ id: '{{parent}}.batt', label: 'Batt', unit: '%', decimals: 0 }],
        subDpTemplateHideMissing: false,
    },
    values: AUTO_VALUES,
});
{
    const lines = await allSubLines();
    check('hideMissing off renders both rows', lines.length === 2, JSON.stringify(lines));
    check('the missing datapoint shows a dash', lines[1]?.includes('–'), JSON.stringify(lines));
}

// ── 13. A template id without tokens applies to every row ────────────────────
await showAuto('default', {
    entries: autoEntries(),
    options: { subDpTemplate: [{ id: 'demo.rssi', label: 'RSSI', decimals: 0 }] },
    values: AUTO_VALUES,
});
{
    const lines = await allSubLines();
    check('absolute template id reaches every row', lines.length === 2, JSON.stringify(lines));
    check('both rows show the same value', lines[0] === 'RSSI -62' && lines[1] === 'RSSI -62', JSON.stringify(lines));
}

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
