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
//   - types in FOLDED have every section closed when the dialog opens
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
    stateimage: ['showLabel'],
    calendar: ['showCalName', 'showCalIcon', 'showCalDot', 'showSummary', 'showDate', 'showLocation', 'showMore'],
    datepicker: ['showCurrentValue'],
    header: ['showSubtitle'],
    light: ['showState', 'showPalette'],
    knob: ['showValue', 'showMinMax'],
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
};
/** Types without any visibility toggle. */
const NONE = ['button', 'image', 'html', 'mirror'];
/** Types whose own settings are split into folded sections (SECTIONED_EDIT_TYPES). */
const FOLDED = [];

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
async function openDialog(type, options = {}) {
    run++;
    const widget = {
        id: `w-eds-${run}`,
        type,
        title: `T ${type}`,
        datapoint: `demo.eds${run}.STATE`,
        gridPos: { x: 0, y: 0, w: 4, h: 4 },
        options,
    };
    await page.evaluate((w) => {
        window.__auraShot.mock({ [w.datapoint]: 0 });
        window.__auraShot.mockServerState({ [w.datapoint]: 0 });
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
            title: vis?.querySelector('summary span, p')?.textContent?.trim() ?? null,
            folded: sections.filter((s) => s.tagName === 'DETAILS').map((s) => s.open === false),
            keys: rows.map((r) => r.getAttribute('data-aura-vis-key')),
            outside: rows.filter((r) => !vis?.contains(r)).map((r) => r.getAttribute('data-aura-vis-key')),
            nextIsSection: !!vis?.nextElementSibling?.hasAttribute('data-aura-config-section'),
        };
    });

for (const [type, keys] of Object.entries(VISIBLE)) {
    await openDialog(type);
    const r = await inspect();
    check(`${type}: heading "Sichtbare Felder"`, r.title === 'Sichtbare Felder', String(r.title));
    check(`${type}: first section of the widget settings`, r.order[0] === 'visible', JSON.stringify(r.order));
    check(`${type}: all rows inside the section`, r.outside.length === 0, JSON.stringify(r.outside));
    // Separation: another section follows right away, no loose field after the toggles.
    check(
        `${type}: next section follows the toggles`,
        !!r.order[1] && r.nextIsSection,
        JSON.stringify({ order: r.order, next: r.nextIsSection }),
    );
    if (!FOLDED.includes(type))
        check(`${type}: "Einstellungen" heading`, r.order[1] === 'settings', JSON.stringify(r.order));
    const missing = keys.filter((k) => !r.keys.includes(k));
    check(`${type}: expected toggles present`, missing.length === 0, JSON.stringify(missing));
    if (FOLDED.includes(type))
        check(`${type}: every section starts folded`, r.folded.every(Boolean), JSON.stringify(r.folded));
    await closeDialog();
}

for (const type of NONE) {
    await openDialog(type);
    const r = await inspect();
    check(`${type}: no visible-fields section`, r.title === null && r.keys.length === 0, JSON.stringify(r));
    await closeDialog();
}

// A switch writes its option: dimmer "Schieberegler" off.
{
    const id = await openDialog('dimmer');
    await page.locator('.aura-widget-edit-modal [data-aura-vis-key="showSlider"] button[role="switch"]').click();
    await page.waitForTimeout(300);
    const o = await page.evaluate((wid) => window.__auraShot.widgetOptions(wid), id);
    check('dimmer: switch writes showSlider=false', o?.showSlider === false, JSON.stringify(o));
    await closeDialog();
}

// Light: the alignment picker sits next to the status switch and goes with it.
{
    const id = await openDialog('light');
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
