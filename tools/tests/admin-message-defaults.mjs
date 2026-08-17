// Verifies that Admin → Meldungen → Standardwerte takes part in the admin's save
// flow instead of writing the datapoint on every keystroke.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/admin-message-defaults.mjs
//
// Deliberately NOT run with ?shot=1: the point is the real write path, so this
// talks to the instance the dev server proxies to (the test instance). It touches
// exactly one datapoint, `aura.<n>.config.messageDefaults`, and restores the value
// it found before exiting — including when a check fails.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
// A reload with unsaved edits must not stall on a confirmation dialog.
page.on('dialog', (d) => d.dismiss().catch(() => {}));

// The admin is behind a session flag in localStorage — same bypass the
// documentation screenshots use, so no password is needed here.
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() =>
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })),
);

const timeSelect = page.locator('[data-aura-msg-defaults] [data-aura-msg-default="time"]');
// The save bar shows either "Alle Änderungen gespeichert" or the two buttons.
const saveButton = page.getByRole('button', { name: /^(Speichern|Save)$/ });
const undoButton = page.getByRole('button', { name: /(Rückgängig|Undo)/ });

/**
 * Load the page from scratch. A `goto` to the same hash would be a same-document
 * navigation — the edit buffer would survive it and the checks below would read
 * their own leftovers instead of the datapoint.
 */
async function openMessages() {
    if (page.url().includes('#/admin/messages')) await page.reload({ waitUntil: 'domcontentloaded' });
    else await page.goto(`${BASE}/#/admin/messages`, { waitUntil: 'domcontentloaded' });
    await timeSelect.waitFor({ state: 'visible', timeout: 20000 });
    // Let the defaults arrive from the datapoint before reading the select.
    await page.waitForTimeout(800);
}

/** Route change inside the running admin — no reload, so nothing is re-read. */
async function gotoAdminPage(path) {
    await page.evaluate((p) => {
        window.location.hash = p;
    }, path);
    await page.waitForTimeout(600);
}

const isDirty = () => saveButton.isVisible().catch(() => false);

await openMessages();
const original = await timeSelect.inputValue();
console.log(`  ..   current default: "${original || '(off)'}"`);
const other = original === 'datetime' ? 'time' : 'datetime';

async function restore() {
    // Best effort — a failed check must not leave the instance on a test value.
    try {
        await openMessages();
        if ((await timeSelect.inputValue()) === original) return;
        await timeSelect.selectOption(original);
        await saveButton.click();
        await saveButton.waitFor({ state: 'hidden', timeout: 15000 });
        console.log(`  ..   restored "${original || '(off)'}"`);
    } catch (e) {
        console.log(`  ..   could not restore the original value: ${e.message}`);
    }
}

try {
    // ── 1. A freshly opened page is clean ────────────────────────────────────
    check('the save bar is clean when the page opens', !(await isDirty()));

    // ── 2. An edit arms the save bar (the bug: it stayed clean) ──────────────
    await timeSelect.selectOption(other);
    check('changing a default makes the save button appear', await isDirty());
    check('and offers Rückgängig next to it', await undoButton.isVisible());

    // ── 3. The pending edit survives leaving the page ────────────────────────
    // Same as a sync store: the save bar stays armed while you visit another admin
    // page, and Speichern there still flushes it.
    await gotoAdminPage('/admin/settings');
    check('the save bar stays armed on another admin page', await isDirty());
    await gotoAdminPage('/admin/messages');
    await timeSelect.waitFor({ state: 'visible', timeout: 10000 });
    check('coming back shows the edit, not the stored value', (await timeSelect.inputValue()) === other);

    // ── 4. Rückgängig drops the edit ─────────────────────────────────────────
    await undoButton.click();
    await page.waitForTimeout(400);
    check('Rückgängig puts the field back', (await timeSelect.inputValue()) === original);
    check('and clears the save bar', !(await isDirty()));

    // ── 5. Nothing is written until the admin saves ──────────────────────────
    await timeSelect.selectOption(other);
    await page.waitForTimeout(400);
    await openMessages();
    check('an unsaved edit never reached the datapoint', (await timeSelect.inputValue()) === original);
    check('and is gone after a reload, like every other admin edit', !(await isDirty()));

    // ── 6. Speichern writes it, and it survives a reload ─────────────────────
    await timeSelect.selectOption(other);
    await saveButton.click();
    await saveButton.waitFor({ state: 'hidden', timeout: 15000 });
    check('the save bar goes clean once the write is confirmed', !(await isDirty()));

    await openMessages();
    check(`the saved value came back from the datapoint (${other})`, (await timeSelect.inputValue()) === other);

    check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));
} finally {
    await restore();
    await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
