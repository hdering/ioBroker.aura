// Verifies the cleanup for the retired built-in popup views in Admin -> Popups.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/popup-builtin-prune.mjs
//
// The promise being tested: the shipped views are no longer set up in new
// installations, but nobody who still uses one loses it. So the dialog must
// remove only what nothing references, and keep - with a reason - anything that
// is referenced, assigned to a widget type in use, or customised.
//
// Runs on ?shot=1, which blocks every write to the instance: the harness seeds a
// pre-existing installation via __auraShot.popupBuiltins() and the dialog then
// works on that local state only.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const widget = (id, type, options = {}) => ({
    id,
    type,
    title: id,
    datapoint: 'demo.dp',
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 3, h: 3 },
    options,
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

// Hash routing, and the admin sits behind the session flag in localStorage — the
// same bypass the documentation screenshots use, so no password is needed.
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
await page.evaluate(() =>
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })),
);
await page.evaluate(() => {
    window.location.hash = '/admin/popups';
});
await page.waitForSelector('text=Popup-Views', { timeout: 20000 });

const settle = () => page.waitForTimeout(300);
const dialog = page.locator('text=Nicht genutzte Standard-Views entfernen').first();
const pruneButton = page.locator('button', { hasText: 'Ungenutzte entfernen' }).first();
const viewNames = () => page.evaluate(() => window.__auraShot.popupState().views.map((v) => v.name));
const viewIds = () => page.evaluate(() => window.__auraShot.popupState().views.map((v) => v.id));
const typeDefaults = () => page.evaluate(() => window.__auraShot.popupState().typeDefaults);

/** Seeds a pre-existing installation plus the given dashboard widgets. */
async function seed(widgets) {
    await page.evaluate((ws) => {
        window.__auraShot.popupBuiltins();
        window.__auraShot.showWidgets(ws);
    }, widgets);
    await settle();
}

async function openDialog() {
    await pruneButton.click();
    await settle();
}

/** The names listed under one heading of the dialog. */
async function section(heading) {
    return page.evaluate((h) => {
        const label = [...document.querySelectorAll('p')].find((p) => p.textContent?.startsWith(h));
        const list = label?.nextElementSibling;
        if (!list) return [];
        return [...list.children].map((row) => row.querySelector('span')?.textContent?.trim() ?? '');
    }, heading);
}

// ── 1. A fresh install shows nothing about built-ins at all ──────────────────
// The harness boots into one, so the offer must not be there yet.
{
    check('fresh install has no cleanup offer', (await pruneButton.count()) === 0);
    const ids = await viewIds();
    check(
        'fresh install only has the always-seeded view',
        ids.length === 1 && ids[0] === 'pv-builtin-datapoint',
        `got ${JSON.stringify(ids)}`,
    );
}

// ── 2. An unused set is fully removable ──────────────────────────────────────
// One widget that has nothing to do with the built-ins: no type default applies,
// so every retired view is fair game. The row fallback must survive.
{
    await seed([widget('w-1', 'value')]);
    check('a pre-existing installation gets the cleanup offer', (await pruneButton.count()) === 1);
    await openDialog();
    check('the dialog opens', (await dialog.count()) === 1);

    const removable = await section('Wird entfernt');
    const kept = await section('Bleibt erhalten');
    check('all five retired views are offered', removable.length === 5, `got ${JSON.stringify(removable)}`);
    check(
        'the row fallback is kept, not offered',
        kept.some((n) => n.includes('Datenpunkt')) && !removable.some((n) => n.includes('Datenpunkt')),
        `kept=${JSON.stringify(kept)}`,
    );

    await page.locator('button', { hasText: 'entfernen' }).last().click();
    await settle();
    const ids = await viewIds();
    check(
        'the built-ins are gone after confirming',
        ids.length === 1 && ids[0] === 'pv-builtin-datapoint',
        `got ${JSON.stringify(ids)}`,
    );
    check('their type defaults went with them', Object.keys(await typeDefaults()).length === 0);
    check('the offer disappears once they are gone', (await pruneButton.count()) === 0);
}

// ── 3. A widget of an assigned type keeps its view ───────────────────────────
// This is the invisible use case: a dimmer widget with no stored clickAction
// opens the built-in dimmer popup purely through the type default.
{
    await seed([widget('w-dim', 'dimmer')]);
    await openDialog();
    const removable = await section('Wird entfernt');
    const kept = await section('Bleibt erhalten');
    check(
        'the dimmer view is not offered for removal',
        !removable.some((n) => n.includes('Dimmer')),
        `got ${JSON.stringify(removable)}`,
    );
    check(
        'it is listed as kept instead',
        kept.some((n) => n.includes('Dimmer')),
        `kept=${JSON.stringify(kept)}`,
    );
    check('the other four are still offered', removable.length === 4, `got ${JSON.stringify(removable)}`);

    await page.locator('button', { hasText: 'entfernen' }).last().click();
    await settle();
    const names = await viewNames();
    check(
        'the dimmer view survived the cleanup',
        names.some((n) => n.includes('Dimmer')),
        `got ${JSON.stringify(names)}`,
    );
    check('its type default survived too', (await typeDefaults()).dimmer === 'pv-builtin-dimmer');
}

// ── 4. An explicit link keeps its view, even for a foreign widget type ───────
{
    await seed([widget('w-val', 'value', { clickAction: { kind: 'popup-view', viewId: 'pv-builtin-shutter' } })]);
    await openDialog();
    const removable = await section('Wird entfernt');
    check(
        'a linked view is not offered',
        !removable.some((n) => n.includes('Rolladen')),
        `got ${JSON.stringify(removable)}`,
    );
    await page.keyboard.press('Escape');
    await settle();
}

// ── 5. A customised built-in is kept ────────────────────────────────────────
{
    await seed([widget('w-1', 'value')]);
    await page.evaluate(() => window.__auraShot.popupRename('pv-builtin-switch', 'Mein Schalter'));
    await settle();
    await openDialog();
    const removable = await section('Wird entfernt');
    const kept = await section('Bleibt erhalten');
    check(
        'an edited built-in is not offered',
        !removable.some((n) => n.includes('Mein Schalter')),
        `got ${JSON.stringify(removable)}`,
    );
    check(
        'it is listed as kept',
        kept.some((n) => n.includes('Mein Schalter')),
        `kept=${JSON.stringify(kept)}`,
    );
    await page.keyboard.press('Escape');
    await settle();
}

// ── 6. A list row on 'auto' keeps every assigned view ───────────────────────
// 'auto' resolves through the type defaults at click time, keyed on whatever
// role the clicked row carries - which rows those are cannot be known here, so
// the scan has to keep all of them.
{
    await seed([widget('w-list', 'list', { rowClickAction: 'auto', entries: [{ id: 'demo.dp', label: 'Zeile' }] })]);
    await openDialog();
    const removable = await section('Wird entfernt');
    check('nothing is offered while a row is on auto', removable.length === 0, `got ${JSON.stringify(removable)}`);
    await page.keyboard.press('Escape');
    await settle();
}

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
