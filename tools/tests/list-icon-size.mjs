// Verifies that the row icon of a list entry keeps its own size next to an icon
// switch — issue #616: the size field vanished from the editor as soon as the entry
// was rendered as "Schalter", and the one under "Darstellung" resized both icons.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/list-icon-size.mjs
//
// `iconSize` is the row icon (left of the name), `switchIconSize` the icon/image
// switch. The switch still falls back to `iconSize`, so configs written before the
// split render unchanged — the first block pins exactly that.
//
// Datapoint values are injected via the screenshot harness (__auraShot.mock) and
// writes are logged instead of sent — no real datapoint is touched.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

const DP = 'demo.plug.STATE';
const ROOT = '.aura-widget-w-ic';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

/** One static list with a single row: name icon + icon switch. */
async function show(entryPatch) {
    await page.evaluate(
        ([dp, patch]) => {
            window.__auraShot.mock({ [dp]: true });
            window.__auraShot.mockServerState({ [dp]: true });
            window.__auraShot.showWidgets([
                {
                    id: 'w-ic',
                    type: 'list',
                    title: 'Liste',
                    datapoint: '',
                    gridPos: { x: 0, y: 0, w: 12, h: 6 },
                    options: {
                        showTitle: false,
                        entries: [
                            {
                                id: dp,
                                label: 'Steckdose',
                                icon: 'Droplet',
                                displayType: 'switch',
                                switchStyle: 'icon',
                                ...patch,
                            },
                        ],
                    },
                },
            ]);
        },
        [DP, entryPatch],
    );
    await page.waitForTimeout(500);
}

/**
 * The two rendered icon sizes. The switch is the only thing inside the pressed
 * button; the name icon is the remaining one — the widget's own header icon and the
 * filter chip sit in the header and are excluded by class / by being in a button.
 */
const sizes = (root) =>
    page.evaluate((sel) => {
        const box = (el) => (el ? Math.round(el.getBoundingClientRect().width) : null);
        const all = [...document.querySelectorAll(`${sel} svg, ${sel} img`)];
        return {
            row: box(all.find((s) => !s.closest('button') && !s.classList.contains('aura-widget-icon'))),
            sw: box(all.find((s) => s.closest('[aria-pressed]'))),
        };
    }, root);

// ── a config written before the split renders unchanged ──────────────────────
await show({ iconSize: 30 });
eq('the old shared size still drives both icons', await sizes(ROOT), { row: 30, sw: 30 });

// ── the two sizes are independent ────────────────────────────────────────────
await show({ iconSize: 12, switchIconSize: 34 });
eq('a switch size of its own leaves the row icon alone', await sizes(ROOT), { row: 12, sw: 34 });

await show({ iconSize: 28, switchIconSize: 14 });
eq('and the row icon may be the bigger one', await sizes(ROOT), { row: 28, sw: 14 });

// ── the editor ───────────────────────────────────────────────────────────────
await page.evaluate((dp) => {
    window.__auraShot.showWidgets(
        [
            {
                id: 'w-ic',
                type: 'list',
                title: 'Liste',
                datapoint: '',
                gridPos: { x: 0, y: 0, w: 12, h: 6 },
                options: {
                    entries: [
                        {
                            id: dp,
                            label: 'Steckdose',
                            icon: 'Droplet',
                            displayType: 'switch',
                            switchStyle: 'icon',
                            iconSize: 30,
                        },
                    ],
                },
            },
        ],
        { editMode: true },
    );
    window.__auraShot.setEditMode(true);
}, [DP][0]);
const opts = () => page.evaluate(() => window.__auraShot.widgetOptions('w-ic'));

await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const trigger = page.locator('button:has-text("Datenpunkte verwalten")').first();
await trigger.waitFor({ timeout: 10000 });
await trigger.click();

const dlg = page.locator('.aura-config-modal');
await dlg.waitFor({ timeout: 10000 });
await dlg.locator('text=Steckdose').first().click();
await page.waitForTimeout(400);

// The complaint of #616: on a switch row the field simply was not there.
const rowField = dlg.locator('input[title="Icon-Größe in px"]:visible').first();
check('the row icon keeps its size field on a switch row', (await rowField.count()) > 0);
eq('and it shows the size the entry carries', await rowField.inputValue(), '30');

const swField = dlg.locator('label:text-is("Größe (px)") + input').first();
eq('the switch field reads the same shared size', await swField.inputValue(), '30');

await rowField.fill('12');
await page.waitForTimeout(400);
const after = (await opts()).entries[0];
eq('typing a row-icon size writes iconSize', after.iconSize, 12);
eq('and pins the switch to what it rendered at', after.switchIconSize, 30);

await swField.fill('40');
await page.waitForTimeout(400);
const after2 = (await opts()).entries[0];
eq('the switch field writes switchIconSize', after2.switchIconSize, 40);
eq('and leaves the row icon untouched', after2.iconSize, 12);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
}
