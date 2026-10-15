// Timer: holiday / vacation lists edited from the frontend with a date picker (#785).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/timer-special-days.mjs
//
// Opens the calendar button of a timer, adds a range to the vacation list, removes
// an entry and the past ones, and checks the JSON written to the datapoint each
// time. The holidays DP holds a flag (true) and must be shown, never overwritten.
// Writes go through the screenshot harness' captureWrites(): nothing reaches ioBroker.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};

const VAC = 'demo.aura-test.urlaub';
const HOL = 'demo.aura-test.feiertage';
const timer = (extra = {}) => ({
    id: 'w-timer',
    type: 'timer',
    title: 'Heizung',
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 8, h: 8 },
    options: {
        stateBaseId: 'aura.0.timers.t-785',
        targetDp: 'demo.aura-test.soll',
        value: '21',
        vacationDp: VAC,
        holidaysDp: HOL,
        ...extra,
    },
});
const VAC_START = JSON.stringify(['2020-01-01', { from: '2099-07-01', to: '2099-07-10' }]);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const show = async (extra, editMode = false) => {
    await page.evaluate(
        ({ w, vac, hol, start, editMode }) => {
            const s = window.__auraShot;
            s.captureWrites(true);
            s.mock({ [vac]: start, [hol]: true });
            s.mockServerState({ [vac]: start, [hol]: true });
            s.showWidgets([w], { editMode });
            s.setEditMode(editMode);
        },
        { w: timer(extra), vac: VAC, hol: HOL, start: VAC_START, editMode },
    );
    await page.waitForTimeout(400);
};
const lastWrite = () => page.evaluate(() => window.__auraShot.lastWrite);
const writes = () => page.evaluate(() => window.__auraShot.writes());

const modal = page.locator('div.fixed.inset-0', { hasText: 'Ausnahmetage' });
const btn = page
    .locator('[data-widget-id="w-timer"] button[aria-label="Ausnahmetage"], button[aria-label="Ausnahmetage"]')
    .first();

// ── Frontend: open, add, remove ──────────────────────────────────────────────
await show({});
check('calendar button is shown', (await btn.count()) === 1);
await btn.click();
await modal.waitFor({ timeout: 5000 });
check(
    'tabs for vacation and holidays',
    (await modal.locator('button:text-is("Urlaub")').count()) === 1 &&
        (await modal.locator('button:text-is("Feiertage")').count()) === 1,
);
check('upcoming range listed', (await modal.getByText('10 Tage').count()) === 1);
check('past entry under "Vergangen (1)"', (await modal.getByText('Vergangen (1)').count()) === 1);

const dates = modal.locator('input[type="date"]');
await dates.nth(0).fill('2099-03-05');
await dates.nth(1).fill('2099-03-01');
await modal.locator('button:has-text("Zeitraum hinzufügen")').click();
await page.waitForTimeout(300);
let w = await lastWrite();
check('write goes to the vacation DP', w?.id === VAC, JSON.stringify(w));
check(
    'range added (swapped, sorted), others kept unchanged',
    w?.val === JSON.stringify(['2020-01-01', '2099-03-01/2099-03-05', { from: '2099-07-01', to: '2099-07-10' }]),
    String(w?.val),
);
check('list shows the new range (local echo)', (await modal.getByText('5 Tage').count()) === 1);

// Duplicate is refused without a write.
const before = (await writes()).length;
await dates.nth(0).fill('2099-03-01');
await dates.nth(1).fill('2099-03-05');
await modal.locator('button:has-text("Zeitraum hinzufügen")').click();
await page.waitForTimeout(200);
check(
    'duplicate refused',
    (await writes()).length === before && (await modal.getByText('schon in der Liste').count()) === 1,
);

// Single day.
await dates.nth(1).fill('');
await dates.nth(0).fill('2099-12-24');
await modal.locator('button:has-text("Tag hinzufügen")').click();
await page.waitForTimeout(300);
w = await lastWrite();
check('single day added', JSON.parse(String(w?.val)).includes('2099-12-24'), String(w?.val));

// Remove the 10-day range.
const row = modal
    .locator('div', { hasText: '10 Tage' })
    .filter({ has: page.locator('button[title="Eintrag entfernen"]') })
    .last();
await row.locator('button[title="Eintrag entfernen"]').click();
await page.waitForTimeout(300);
w = await lastWrite();
check(
    'entry removed',
    w?.val === JSON.stringify(['2020-01-01', '2099-03-01/2099-03-05', '2099-12-24']),
    String(w?.val),
);

// Drop the past ones.
await modal.locator('button:text-is("Alle entfernen")').click();
await page.waitForTimeout(300);
w = await lastWrite();
check('past entries dropped', w?.val === JSON.stringify(['2099-03-01/2099-03-05', '2099-12-24']), String(w?.val));

await page.screenshot({ path: process.env.SHOT ?? 'node_modules/.cache/timer-special-days.png' });

// Holidays tab: a flag, never overwritten.
const n = (await writes()).length;
await modal.locator('button:text-is("Feiertage")').click();
await page.waitForTimeout(200);
check('flag DP shows a notice', (await modal.getByText('meldet nur, ob').count()) === 1);
check('flag DP has no date field', (await dates.count()) === 0);
check('no write to the holidays DP', !(await writes()).slice(n).some((x) => x.id === HOL));

await page.keyboard.press('Escape');
await page.waitForTimeout(200);
check('Escape closes the popup', (await modal.count()) === 0);

// ── Read-only list ───────────────────────────────────────────────────────────
await show({ vacationEditable: false });
await btn.click();
await modal.waitFor({ timeout: 5000 });
check('read-only: no date field', (await dates.count()) === 0);
check('read-only: no delete button', (await modal.locator('button[title="Eintrag entfernen"]').count()) === 0);
check('read-only: entries still listed', (await modal.getByText('10 Tage').count()) === 1);
await page.keyboard.press('Escape');

// ── Option off / no DP ───────────────────────────────────────────────────────
await show({ showSpecialDaysButton: false });
check('option off hides the button', (await btn.count()) === 0);
await show({ vacationDp: undefined, holidaysDp: undefined });
check('no special DP, no button', (await btn.count()) === 0);

// ── Editor: button inert ─────────────────────────────────────────────────────
await show({}, true);
check('editor: button disabled', (await btn.count()) === 1 && (await btn.isDisabled()));

// ── Compact and custom grid layout carry the button too ─────────────────────
for (const layout of ['compact']) {
    await page.evaluate(({ w }) => window.__auraShot.showWidgets([w], { editMode: false }), {
        w: { ...timer(), layout },
    });
    await page.evaluate(() => window.__auraShot.setEditMode(false));
    await page.waitForTimeout(300);
    check(`${layout}: button shown`, (await btn.count()) === 1);
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
