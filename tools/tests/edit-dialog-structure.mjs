// Structure of the widget edit dialog (docs-internal/widget-config-template.md).
//
//   AURA_BASE=http://localhost:5174 node tools/tests/edit-dialog-structure.mjs
//
// Uses the screenshot harness. For every widget type listed below it opens the edit
// dialog and checks:
//   - a type with show/hide toggles has the "Sichtbare Felder" section, and it is the
//     first section of the widget's own settings
//   - every visibility row ([data-aura-vis-key]) sits inside that section
//   - another section follows it right away ("Einstellungen" while the type is flat)
//   - every section starts folded, no exceptions; a type without own sections
//     has one "Einstellungen" section
//   - a type without toggles has no such section
// plus: a switch writes its option, the light's status row keeps its alignment picker.
/* global window, document */
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

/** Types with "Sichtbare Felder" and the option keys expected in it. */
const VISIBLE = {
    switch: ['showLabel'],
    dimmer: ['showValue', 'showSlider', 'showToggle'],
    value: ['showValue', 'showUnit'],
    windowcontact: ['showLabel'],
    binarysensor: ['showLabel'],
    stateimage: ['showLabel', 'showIcon'],
    calendar: [
        'showCalName',
        'showCalIcon',
        'showCalDot',
        'showSummary',
        'showDate',
        'showLocation',
        'showMore',
        'showWeek',
        'showEndTime',
        'calNameAlways',
    ],
    datepicker: ['showCurrentValue', 'showTime'],
    header: ['showSubtitle', 'showAccent'],
    light: ['showState', 'showPalette'],
    knob: ['showValue', 'showMinMax', 'showRing', 'showBackground'],
    mediaplayer: [
        'showCover',
        'showSubtitle',
        'showSource',
        'showShuffle',
        'showPrev',
        'showNext',
        'showStop',
        'showRepeat',
        'showVolume',
        'showVolumePresets',
        'showMute',
        'showChips',
    ],
    slider: ['showValue', 'showUnit', 'showMinMax', 'showScale'],
    thermostat: ['showSetpoint', 'showActualTemp', 'showControls', 'showPresets'],
    shutter: ['showValue', 'showControls', 'showSlider'],
    jsontable: ['showSearch', 'showHeader'],
    list: ['showCount', 'showRoom', 'showId', 'showDividers', 'hideFilterButton'],
    autolist: ['showCount', 'showRoom', 'showId', 'showDividers', 'showEntryLastChange', 'hideFilterButton'],
    carousel: ['hideScrollbar'],
    map: ['showStyleChips', 'showDistance'],
    statusoverview: ['showCount', 'showRoom', 'showSince', 'showOkCategories', 'showAllClear'],
    echart: [
        'echartShowLegend',
        'echartShowYAxis',
        'echartShowXAxis',
        'echartShowGridLines',
        'echartNowLine',
        'echartShowCurrent',
    ],
    energiebilanz: [
        'showBarTitles',
        'showTotals',
        'showPercent',
        'showSegmentIcon',
        'showOutsidePercent',
        'showLegend',
    ],
    evcc: ['showBattery', 'showLoadpoints'],
    historytable: ['showHeader'],
    chart: ['showAverage', 'showAverageAsValue', 'showYAxis', 'showXAxis', 'showGridLines'],
    climate: [
        'showActualTemp',
        'showTargetTemp',
        'showHumidity',
        'showPressure',
        'showMetricLabels',
        'showComfort',
        'showChartLegend',
        'showAverage',
        'showAverageAsValue',
        'showYAxis',
        'showGridLines',
    ],
    clock: ['showSeconds', 'showWeek', 'showCity', 'showSunrise', 'showSunset'],
    weather: [
        'showWeather',
        'showWarnings',
        'showCondition',
        'showHumidityLabel',
        'showCloudCover',
        'showForecast',
        'showToday',
        'showRainProb',
        'showRainAmount',
    ],
    camera: ['showTimestamp'],
    input: ['showSubmit'],
    gauge: ['showValue', 'showValueBadge', 'showMinMax'],
    fill: ['showTicks', 'showValue'],
    adapterstatus: ['showFilter', 'showSearch', 'showVersion', 'compact'],
    scriptstatus: ['showFilter', 'showSearch', 'showEngine', 'compact'],
    adapterlogs: ['showFilter', 'showSearch', 'showControls'],
    messages: ['showFilter'],
    loadtimes: ['showLegend', 'showThresholds'],
    panels: ['showDots', 'showArrows'],
    httpRequest: ['showStatus'],
    enum: ['showValue', 'showSelect'],
    alarm: [
        'showHeader',
        'showModes',
        'showModeOff',
        'showModeSharp',
        'showModeInside',
        'showModeNight',
        'showDelay',
        'showCountdown',
        'showCircuits',
        'showZones',
        'showLog',
        'showPanic',
        'showPresence',
    ],
    timer: ['showMasterSwitch', 'showEvents', 'showAddButton', 'showAstroSymbol', 'showSpecialDaysButton'],
    countdown: ['showProgress', 'showControls', 'showStep', 'showPresets'],
    trashSchedule: ['showNames', 'showDays', 'showDate'],
    aircontrol: ['showVanes', 'showEco', 'showBoost', 'showConsumption', 'showHumidity', 'showOutside'],
};
/** Types that already bring sections of their own (visible fields follow later). */
const OWN_SECTIONS = ['chips'];
// (menu too, but the harness draws no edit chrome for it)
/** Types without any visibility toggle. */
const NONE = ['button', 'image', 'html', 'mirror'];
/** Types with sections of their own (SECTIONED_EDIT_TYPES); the rest get "Einstellungen". */
const SECTIONED = [
    'knob',
    'dimmer',
    'stateimage',
    'light',
    'slider',
    'thermostat',
    'shutter',
    'jsontable',
    'adapterstatus',
    'scriptstatus',
    'messages',
    'panels',
    'httpRequest',
    'enum',
    'mediaplayer',
    'value',
    'binarysensor',
    'datepicker',
    'header',
    'list',
    'autolist',
    'carousel',
    'map',
    'statusoverview',
    'chart',
    'climate',
    'echart',
    'energiebilanz',
    'evcc',
    'historytable',
    'switch',
    'windowcontact',
    'gauge',
    'fill',
    'camera',
    'iframe',
    'input',
    'clock',
    'calendar',
    'weather',
    'alarm',
    'timer',
    'countdown',
    'trashSchedule',
    'aircontrol',
];

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 120000 });
await page.evaluate(() => window.__auraShot.captureWrites(true));

let run = 0;
/** Mount one widget of `type` and open its edit dialog. */
async function openDialog(type, options = {}, datapoint) {
    run++;
    const widget = {
        id: `w-eds-${run}`,
        type,
        title: `T ${type}`,
        datapoint: datapoint ?? `demo.eds${run}.STATE`,
        gridPos: { x: 0, y: 0, w: 4, h: 4 },
        options,
    };
    await page.evaluate((w) => {
        if (w.datapoint) {
            window.__auraShot.mock({ [w.datapoint]: 0 });
            window.__auraShot.mockServerState({ [w.datapoint]: 0 });
        }
        window.__auraShot.showWidgets([w]);
    }, widget);
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__auraShot.setEditMode(true));
    await page.waitForTimeout(500);
    const card = page.locator('.react-grid-item').first();
    await card.hover();
    await card.locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    await page.locator('.aura-widget-edit-modal').waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);
    return widget.id;
}

/** The fixed frame: only these sections on the top level, in this order. */
const FRAME = ['visible', 'datapoints', 'settings', 'look', 'behavior'];

/** Same gap between all neighbouring sections, nothing loose between them. */
function checkLayout(type, r) {
    check(`${type}: shows the layout row`, r.hasLayout);
    const idx = r.order.map((k) => FRAME.indexOf(k));
    check(
        `${type}: only the six fixed sections, in order`,
        idx.every((i) => i >= 0) && idx.every((i, n) => n === 0 || i > idx[n - 1]),
        JSON.stringify(r.order),
    );
    check(
        `${type}: equal gaps between the sections`,
        r.gaps.length === 0 || Math.max(...r.gaps) - Math.min(...r.gaps) <= 1,
        JSON.stringify(r.gaps),
    );
    check(`${type}: nothing loose between the sections`, r.loose.length === 0, JSON.stringify(r.loose));
    check(`${type}: no empty section`, r.empty.length === 0, JSON.stringify(r.empty));
}

/** Unfold a section of the open dialog. */
async function openSection(key) {
    const sum = page.locator(`.aura-widget-edit-modal details[data-aura-config-section="${key}"] > summary`);
    if (await sum.count()) {
        const open = await sum.evaluate((el) => el.parentElement.open);
        if (!open) await sum.click();
    }
}

async function closeDialog() {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__auraShot.setEditMode(false));
    await page.waitForTimeout(200);
}

/** What the dialog shows: sections in order, the visible-fields section and the rows. */
const inspect = () =>
    page.evaluate(() => {
        const dlg = document.querySelector('.aura-widget-edit-modal');
        const sections = [...dlg.querySelectorAll('[data-aura-config-section]')];
        const vis = dlg.querySelector('[data-aura-config-section="visible"]');
        const rows = [...dlg.querySelectorAll('[data-aura-vis-key]')];
        return {
            order: sections.map((s) => s.getAttribute('data-aura-config-section')),
            title: vis?.querySelector('summary span.uppercase, :scope > p')?.textContent?.trim() ?? null,
            titleCls: vis?.querySelector('summary span.uppercase, :scope > p')?.className ?? null,
            statusCls: dlg.querySelector('[data-aura-status-section] summary p')?.className ?? null,
            open: sections
                .filter((s) => s.tagName === 'DETAILS' && s.open)
                .map((s) => s.getAttribute('data-aura-config-section')),
            visibleFolds: vis?.tagName === 'DETAILS',
            // The layout row at the top ("Layout: Standard …").
            hasLayout: [...dlg.querySelectorAll('span')].some((el) => el.textContent?.trim() === 'Layout'),
            // Sections without any content (a body whose only child is conditional and off).
            empty: sections
                .filter((el) => el.tagName === 'DETAILS' && !el.querySelector(':scope > div')?.childElementCount)
                .map((el) => el.getAttribute('data-aura-config-section')),
            // Gaps between neighbouring sections (status included) and anything loose between them.
            ...(() => {
                const all = [...dlg.querySelectorAll('[data-aura-config-section], [data-aura-status-section]')].filter(
                    (el) => !el.parentElement?.closest('[data-aura-config-section]'),
                );
                const gaps = [];
                for (const el of all) {
                    const next = el.nextElementSibling;
                    if (next && all.includes(next))
                        gaps.push(Math.round(next.getBoundingClientRect().top - el.getBoundingClientRect().bottom));
                }
                const loose = [];
                if (all[0]) {
                    const kids = [...all[0].parentElement.children];
                    for (const k of kids.slice(kids.indexOf(all[0])))
                        if (!all.includes(k) && k.getBoundingClientRect().height > 0)
                            loose.push((k.textContent ?? '').trim().slice(0, 40));
                }
                return { gaps, loose };
            })(),
            // A section inside another one: a type with own sections ended up in "Einstellungen".
            nested: sections
                .filter((s) => s.parentElement?.closest('[data-aura-config-section]'))
                .map((s) => s.getAttribute('data-aura-config-section')),
            keys: rows.map((r) => r.getAttribute('data-aura-vis-key')),
            outside: rows.filter((r) => !vis?.contains(r)).map((r) => r.getAttribute('data-aura-vis-key')),
            nextIsSection: !!vis?.nextElementSibling?.hasAttribute('data-aura-config-section'),
            // Inputs in the widget block above the toggles (siblings before the section).
            inputsAbove: (() => {
                const out = [];
                for (let el = vis?.previousElementSibling; el; el = el.previousElementSibling)
                    if (el.matches('input, select, textarea') || el.querySelector('input, select, textarea'))
                        out.push(el.tagName);
                return out;
            })(),
        };
    });

for (const [type, keys] of Object.entries(VISIBLE)) {
    await openDialog(type);
    const r = await inspect();
    check(`${type}: heading "Sichtbare Felder"`, r.title === 'Sichtbare Felder', String(r.title));
    check(`${type}: first section of the widget settings`, r.order[0] === 'visible', JSON.stringify(r.order));
    check(`${type}: all rows inside the section`, r.outside.length === 0, JSON.stringify(r.outside));
    check(`${type}: no section inside another`, r.nested.length === 0, JSON.stringify(r.nested));
    checkLayout(type, r);
    check(`${type}: nothing to set above the toggles`, r.inputsAbove.length === 0, JSON.stringify(r.inputsAbove));
    // Separation: another section follows right away, no loose field after the toggles.
    check(
        `${type}: next section follows the toggles`,
        !!r.order[1] && r.nextIsSection,
        JSON.stringify({ order: r.order, next: r.nextIsSection }),
    );
    check(`${type}: the visible fields fold`, r.visibleFolds);
    if (!SECTIONED.includes(type)) {
        // A type without own sections: its main datapoint (if any) and one "Einstellungen".
        const rest = r.order.filter((k) => k !== 'visible');
        check(
            `${type}: "Datenpunkte" and "Einstellungen" only`,
            rest.includes('settings') && rest.every((k) => k === 'datapoints' || k === 'settings'),
            JSON.stringify(r.order),
        );
        check(`${type}: every section starts folded`, r.open.length === 0, JSON.stringify(r.open));
    } else {
        check(
            `${type}: own sections, not one catch-all`,
            ((rest) => rest.length >= 2 || (rest.length === 1 && rest[0] !== 'settings'))(
                r.order.filter((k) => k !== 'visible'),
            ),
            JSON.stringify(r.order),
        );
        check(`${type}: every section starts folded`, r.open.length === 0, JSON.stringify(r.open));
    }
    check(
        `${type}: status heading looks like the others`,
        !r.statusCls || r.statusCls === r.titleCls,
        JSON.stringify(r),
    );
    const missing = keys.filter((k) => !r.keys.includes(k));
    check(`${type}: expected toggles present`, missing.length === 0, JSON.stringify(missing));
    await closeDialog();
}

for (const type of OWN_SECTIONS) {
    await openDialog(type);
    const r = await inspect();
    checkLayout(type, r);
    check(
        `${type}: own sections, all folded, none nested`,
        r.nested.length === 0 && r.open.length === 0,
        JSON.stringify(r),
    );
    await closeDialog();
}

for (const type of NONE) {
    await openDialog(type);
    const r = await inspect();
    checkLayout(type, r);
    check(`${type}: no visible-fields section`, r.title === null && r.keys.length === 0, JSON.stringify(r));
    check(
        `${type}: its settings in one folded section`,
        r.order.includes('settings') && r.open.length === 0,
        JSON.stringify(r),
    );
    await closeDialog();
}

// A switch writes its option: dimmer "Schieberegler" off.
{
    const id = await openDialog('dimmer');
    await openSection('visible');
    await page.locator('.aura-widget-edit-modal [data-aura-vis-key="showSlider"] button[role="switch"]').click();
    await page.waitForTimeout(300);
    const o = await page.evaluate((wid) => window.__auraShot.widgetOptions(wid), id);
    check('dimmer: switch writes showSlider=false', o?.showSlider === false, JSON.stringify(o));
    await closeDialog();
}

// No exceptions: a widget without its datapoint opens folded too.
{
    await openDialog('knob', {}, '');
    const r = await inspect();
    check('knob without datapoint: every section folded', r.open.length === 0, JSON.stringify(r.open));
    await closeDialog();
}

// Universal widget: "Einstellungen" names the grid editor, no second heading.
{
    await openDialog('universal');
    const dup = await page.evaluate(
        () =>
            [...document.querySelectorAll('.aura-widget-edit-modal p')].filter(
                (e) => e.textContent?.trim() === 'Widget-Einstellungen',
            ).length,
    );
    check('universal: no "Widget-Einstellungen" heading', dup === 0, String(dup));
    await closeDialog();
}

// An inverted option: switching "Untertitel" off stores compact=true.
{
    const id = await openDialog('adapterstatus');
    await openSection('visible');
    const sw = page.locator('.aura-widget-edit-modal [data-aura-vis-key="compact"] button[role="switch"]');
    check('adapterstatus: subtitle shown by default', (await sw.getAttribute('aria-checked')) === 'true');
    await sw.click();
    await page.waitForTimeout(300);
    const o = await page.evaluate((wid) => window.__auraShot.widgetOptions(wid), id);
    check('adapterstatus: switching the subtitle off writes compact=true', o?.compact === true, JSON.stringify(o));
    await closeDialog();
}

// Light: the alignment picker sits next to the status switch and goes with it.
{
    const id = await openDialog('light');
    await openSection('visible');
    const row = page.locator('.aura-widget-edit-modal [data-aura-vis-key="showState"]');
    check('light: alignment picker while shown', (await row.locator('button:not([role="switch"])').count()) === 3);
    await row.locator('button:not([role="switch"])').nth(2).click();
    await page.waitForTimeout(200);
    let o = await page.evaluate((wid) => window.__auraShot.widgetOptions(wid), id);
    check('light: picker writes statusAlign', o?.statusAlign === 'right', JSON.stringify(o));
    await row.locator('button[role="switch"]').click();
    await page.waitForTimeout(200);
    o = await page.evaluate((wid) => window.__auraShot.widgetOptions(wid), id);
    check('light: status off', o?.showState === false, JSON.stringify(o));
    check('light: picker hidden while off', (await row.locator('button:not([role="switch"])').count()) === 0);
    await closeDialog();
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
