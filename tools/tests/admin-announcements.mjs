// Admin → Ansagen (#834 phase 4): add a rule, edit it in the dialog, the save bar
// the list shows the summary, "Jetzt testen" sends the rule to the adapter.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5287   (own dev server)
//   AURA_BASE=http://localhost:5287 node tools/tests/admin-announcements.mjs
//
// Runs with ?shot=1, so nothing reaches an instance: writes are blocked and
// sendTo is stubbed through __auraShot.mockSendTo.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5287';
const SHOT = process.env.AURA_SHOT_OUT;

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1300, height: 1000 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('dialog', (d) => d.accept().catch(() => {}));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() =>
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })),
);
await page.goto(`${BASE}/?shot=1#/admin/announcements`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-aura-admin-announcements]', { timeout: 90000 });
await page.waitForFunction(() => !!window.__auraShot, null, { timeout: 30000 });
await page.evaluate(() => window.__auraShot.mockSendTo({ announcementTest: { ok: true, text: 'Es hat geklingelt' } }));

try {
    check('the page lists the nav entry', await page.getByRole('link', { name: 'Ansagen' }).isVisible());
    check('empty state shown', (await page.locator('[data-aura-announcement]').count()) === 0);

    await page.getByRole('button', { name: /Ansage hinzufügen/ }).click();
    await page.getByPlaceholder('Name, z. B. Klingel').fill('Klingel');
    await page.keyboard.press('Enter');
    const editor = page.locator('[data-aura-announcement-editor]');
    await editor.waitFor({ state: 'visible', timeout: 10000 });
    check('adding opens the editor', true);

    await editor.locator('textarea').fill('Es hat an der Haustür geklingelt');
    await editor.locator('input[type="time"]').first().fill('06:00');
    await editor.locator('input[type="time"]').nth(1).fill('22:00');
    await editor.getByRole('button', { name: 'Sa', exact: true }).click();
    await editor.getByText('Höchstens einmal am Tag').click();
    if (SHOT) await page.screenshot({ path: `${SHOT}/announcement-editor.png` });

    await editor.getByRole('button', { name: /Jetzt testen/ }).click();
    await editor.getByText('Gesprochen: „Es hat geklingelt“').waitFor({ timeout: 5000 });
    check('Jetzt testen shows what was spoken', true);

    await page.keyboard.press('Escape');
    await editor.waitFor({ state: 'hidden', timeout: 5000 });

    const row = page.locator('[data-aura-announcement]');
    check('one rule in the list', (await row.count()) === 1);
    const rowText = await row.first().innerText();
    check(
        'row shows text and summary',
        /Haustür/.test(rowText) && /06:00–22:00/.test(rowText) && /1× am Tag/.test(rowText),
        rowText.replace(/\n/g, ' | '),
    );
    // The save bar stays off under ?shot=1 (markExternalDirty is a no-op there); the
    // write path is the one of admin-message-defaults.mjs.
    if (SHOT) await page.screenshot({ path: `${SHOT}/announcement-list.png` });

    // Copy, then delete the copy.
    await row.first().getByTitle('Kopieren').click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check('copy adds a second rule', (await row.count()) === 2);
    await row.nth(1).getByTitle('Löschen').click();
    await page.waitForTimeout(300);
    check('delete removes it again', (await row.count()) === 1);
} catch (e) {
    check('no exception', false, e.message);
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' / '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `${failed} check(s) failed` : 'admin-announcements: all checks passed');
process.exit(failed ? 1 : 0);
