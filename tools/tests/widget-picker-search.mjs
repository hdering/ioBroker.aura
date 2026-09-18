// Verifies the search inside the "Neues Widget" dialog (#652): the caret starts
// in the search box, typing anywhere in the dialog lands there, entries that do
// not match disappear, categories without a hit step back instead of lying, and
// a single click only picks — the dialog stays open so the hint under the grid
// can be read and another entry chosen, while a double click adds the entry and
// closes the dialog.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/widget-picker-search.mjs
//
// Nothing is saved: the double-click at the end lands in the admin's unsaved
// layout inside this throwaway browser context, never on the instance.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

// The admin sits behind a PIN — same bypass the documentation screenshots use.
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() =>
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })),
);
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 40000 });

/** The one shading template — roller shutter, venetian blind and awning share it. */
const SHUTTER = 'Rollladen / Jalousie / Markise';

const dialog = page.locator('text=Widget manuell hinzufügen');
const search = page.getByPlaceholder('Widget suchen …');
const addBtn = page.getByRole('button', { name: 'Hinzufügen' });
const chip = (name) => page.getByRole('button', { name, exact: true });
/** Opacity of a category chip — dimmed ones are the "no hit here" signal. */
const chipOpacity = (name) => chip(name).evaluate((el) => Number(el.style.opacity || '1'));

async function openDialog() {
    await page.evaluate(() => {
        window.location.hash = '#/admin/editor';
    });
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Neues Widget' }).click();
    await dialog.first().waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(200);
}

try {
    await openDialog();

    // ── 1. The caret is already in the search box ────────────────────────────
    check(
        'the dialog opens with the caret in the search box',
        (await page.evaluate(() => document.activeElement?.getAttribute('placeholder'))) === 'Widget suchen …',
    );
    check('and says that you can just start typing', (await page.locator('text=einfach lostippen').count()) > 0);

    // ── 2. Typing anywhere in the dialog lands in the search box ─────────────
    // The whole point of the hint: no click on the field first.
    await page.getByRole('button', { name: 'Beschattung', exact: true }).click(); // focus goes to a chip
    await page.keyboard.type('rolll');
    eq('typing with a chip focused still fills the search box', await search.inputValue(), 'rolll');

    // ── 3. What does not match is gone, not just dimmed ──────────────────────
    // Labels of the entries currently drawn - the emoji sits on its own line.
    const visible = async () =>
        (await page.locator('.grid button').allInnerTexts()).map((s) => s.split(/\r?\n/).pop().trim()).filter(Boolean);
    const rolllHits = await visible();
    check('the matching entry is shown', rolllHits.includes(SHUTTER), rolllHits.join(' | '));
    check(
        'a template of another category is gone',
        !rolllHits.includes('Thermostat') && !rolllHits.includes('Messwert'),
        rolllHits.join(' | '),
    );

    // Categories are the exception - they stay put and grey out, so the row does
    // not jump around under the cursor while typing.
    check('a category with a hit stays solid', (await chipOpacity('Beschattung')) === 1);
    check('a category without one steps back', (await chipOpacity('Klima')) < 1);

    // ── 4. A search looks in every category, not only the selected one ───────
    // "Wert" has to reach the Messwerte column and every Wert-Anzeige, which is
    // what the search is for (#652).
    await search.fill('');
    await chip('Klima').click();
    eq('picking a category ends the search', await search.inputValue(), '');
    await search.type('wert');
    const wertHits = await visible();
    check('a search leaves the picked category behind', wertHits.includes('Messwert'), wertHits.join(' | '));
    check('and finds the widget types behind it', wertHits.includes('Gauge'), wertHits.join(' | '));

    // ── 5. A single click is only picking ───────────────────────────────────
    await search.fill('rolll');
    await page.waitForTimeout(150);
    await page.getByRole('button', { name: SHUTTER }).first().click();
    check('a click leaves the dialog open', await dialog.first().isVisible());
    check('and arms the add button', await addBtn.isEnabled());
    check('and shows the hint for the picked entry', (await page.locator('text=positionsgesteuerten').count()) > 0);

    // Re-choosing has to work - that is what the open dialog is for.
    await search.fill('');
    await page.waitForTimeout(150);
    await page.getByRole('button', { name: 'Thermostat' }).first().click();
    check('another entry can be picked afterwards', await dialog.first().isVisible());
    check('and its own hint is shown', (await page.locator('text=Heizkörper-Thermostate').count()) > 0);

    // ── 6. Nothing matches ──────────────────────────────────────────────────
    await search.fill('zzzz');
    await page.waitForTimeout(150);
    check('an empty result says so', (await page.locator('text=Kein Widget passt').count()) > 0);
    eq('and shows no entry at all', await visible(), []);

    // ── 7. Escape clears first, closes second ───────────────────────────────
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    check('the first Escape only clears the search', await dialog.first().isVisible());
    eq('the box is empty afterwards', await search.inputValue(), '');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    check('the second Escape closes the dialog', (await dialog.count()) === 0);

    // ── 8. A double click picks and adds in one go ──────────────────────────
    // Comes last because it closes the dialog for good.
    const cards = () => page.locator('.react-grid-item').count();
    const before = await cards();
    await openDialog();
    await search.fill('rolll');
    await page.waitForTimeout(150);
    await page.getByRole('button', { name: SHUTTER }).first().dblclick();
    await page.waitForTimeout(800);
    check('a double click closes the dialog', (await dialog.count()) === 0);
    check(
        'and the widget really landed on the canvas',
        (await cards()) === before + 1,
        `${before} -> ${await cards()}`,
    );

    eq('no page errors', pageErrors, []);
} finally {
    await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\nwidget-picker-search: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
