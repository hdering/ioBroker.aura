// Verifies the "Schalter" display of the static AND dynamic list widget in the
// browser: the control renders in every layout, it writes the configured AN/AUS
// values, a separate status datapoint decides the state, condition mode and the
// icon/image styles work, and the confirmation gate blocks the write (issue #591).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/list-switch-ui.mjs
//
// Uses the screenshot harness (__auraShot): datapoint values live in the in-memory
// cache and writes are logged instead of sent, so no real datapoint is touched.
// mock() alone is not enough here — switching widget type/layout remounts the list,
// whose subscribe effect re-reads via getState and would overwrite the fabricated
// value with the (non-existent) server one. mockServerState() answers that read too.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};
const eq = (name, got, want) => check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

const DP = 'demo.plug';
const STATUS_DP = 'demo.plug.status';
const ROOT = '.aura-widget-w-list';

/** Renders one list widget holding a single switch entry and arms the write log. */
async function show(type, layout, entryPatch = {}, values = { [DP]: false }) {
    const widget = {
        id: 'w-list',
        type,
        title: 'Testliste',
        datapoint: '',
        layout,
        gridPos: { x: 0, y: 0, w: 12, h: 8 },
        options: { entries: [{ id: DP, label: 'Steckdose', displayType: 'switch', ...entryPatch }] },
    };
    await page.evaluate(
        ([w, vals]) => {
            window.__auraShot.mockServerState(vals);
            window.__auraShot.mock(vals);
            window.__auraShot.showWidgets([w]);
            window.__auraShot.writes(true);
        },
        [widget, values],
    );
    await page.waitForTimeout(400);
}

/**
 * The switch control's DOM state. `labels` are the on/off texts this case expects,
 * so the pill / card / badge variants (which carry no aria-pressed) can be located
 * by their state text.
 */
function probe(labels = ['AN', 'AUS']) {
    return page.evaluate(
        ([rootSel, wanted]) => {
            const root = document.querySelector(rootSel) ?? document.body;
            const pressed = root.querySelector('[aria-pressed]');
            const set = wanted.map((l) => l.toLowerCase());
            const textEl = [...root.querySelectorAll('button, span')]
                .reverse()
                .find((el) => set.includes((el.textContent ?? '').trim().toLowerCase()));
            return {
                hasControl: !!(pressed || textEl),
                pressed: pressed ? pressed.getAttribute('aria-pressed') === 'true' : null,
                text: textEl ? (textEl.textContent ?? '').trim() : null,
                // The slide toggle is the only variant with the fixed 36×18 pill.
                slide: pressed ? pressed.className.includes('w-9') : false,
                hasSvg: !!pressed?.querySelector('svg'),
                hasImg: !!pressed?.querySelector('img'),
            };
        },
        [ROOT, labels],
    );
}

/** Clicks the switch control and returns the write log. */
async function toggle(labels = ['AN', 'AUS']) {
    await page.evaluate(
        ([rootSel, wanted]) => {
            const root = document.querySelector(rootSel) ?? document.body;
            const set = wanted.map((l) => l.toLowerCase());
            const buttons = [...root.querySelectorAll('button')];
            const labelled = buttons.find((b) => set.includes((b.textContent ?? '').trim().toLowerCase()));
            // Badge layouts make the whole row the button — take that one.
            const target =
                root.querySelector('[aria-pressed]') ??
                labelled ??
                buttons.find((b) => b.textContent?.includes('Steckdose'));
            target?.click();
        },
        [ROOT, labels],
    );
    await page.waitForTimeout(250);
    return page.evaluate(() => window.__auraShot.writes());
}

// ── 1. Static list: the configured write values reach the datapoint ──
for (const layout of ['default', 'compact', 'card', 'minimal']) {
    await show('list', layout, { onValue: 'ON', offValue: 'OFF' }, { [DP]: 'OFF' });
    const p = await probe();
    check(`list/${layout}: control rendered`, p.hasControl, JSON.stringify(p));
    const w = await toggle();
    eq(`list/${layout}: writes the AN value`, w.at(-1)?.val, 'ON');
    eq(`list/${layout}: writes to the entry datapoint`, w.at(-1)?.id, DP);
}

// ── 2. Dynamic list: same option set (it had no switch rendering at all before) ──
for (const layout of ['default', 'compact', 'card', 'minimal']) {
    await show('autolist', layout, { onValue: 'ON', offValue: 'OFF' }, { [DP]: 'OFF' });
    const p = await probe();
    check(`autolist/${layout}: control rendered`, p.hasControl, JSON.stringify(p));
    const w = await toggle();
    eq(`autolist/${layout}: writes the AN value`, w.at(-1)?.val, 'ON');
}

// ── 3. The AN value doubles as the state comparison ──
{
    await show('list', 'default', { onValue: '255', offValue: '0' }, { [DP]: 255 });
    eq('AN value 255 reads as on', (await probe()).pressed, true);
    eq('on → writes the AUS value', (await toggle()).at(-1)?.val, 0);

    await show('list', 'default', { onValue: '255', offValue: '0' }, { [DP]: 128 });
    eq('a value other than 255 reads as off', (await probe()).pressed, false);
    eq('off → writes the AN value', (await toggle()).at(-1)?.val, 255);
}

// ── 4. Untouched entries keep writing true/false resp. 1/0 ──
{
    await show('list', 'default', {}, { [DP]: false });
    eq('boolean DP still writes true', (await toggle()).at(-1)?.val, true);
    await show('list', 'default', {}, { [DP]: 0 });
    eq('number DP still writes 1', (await toggle()).at(-1)?.val, 1);
    await show('list', 'default', {}, { [DP]: 1 });
    eq('number DP on still writes 0', (await toggle()).at(-1)?.val, 0);
}

// ── 5. Status datapoint: state from there, write to the entry's own DP ──
{
    const entry = { statusDp: STATUS_DP, onValue: 'ON', offValue: 'OFF' };
    await show('list', 'default', entry, { [DP]: null, [STATUS_DP]: 'ON' });
    eq('status dp ON reads as on', (await probe()).pressed, true);
    const w = await toggle();
    eq('write still targets the entry datapoint', w.at(-1)?.id, DP);
    eq('on → writes the AUS value', w.at(-1)?.val, 'OFF');

    await show('list', 'default', entry, { [DP]: null, [STATUS_DP]: 'OFF' });
    eq('status dp OFF reads as off', (await probe()).pressed, false);

    await show('autolist', 'default', entry, { [DP]: null, [STATUS_DP]: 'ON' });
    eq('dynamic list reads the status dp too', (await probe()).pressed, true);
}

// ── 6. Condition mode for vocabularies the coercion cannot know ──
{
    const entry = { stateMode: 'condition', stateOperator: '>=', stateValue: '50' };
    await show('list', 'default', entry, { [DP]: 60 });
    eq('condition >= 50 with 60 is on', (await probe()).pressed, true);
    await show('list', 'default', entry, { [DP]: 40 });
    eq('condition >= 50 with 40 is off', (await probe()).pressed, false);
}

// ── 7. Icon and image styles ──
{
    await show('list', 'default', { switchStyle: 'icon', trueIcon: 'Lightbulb', falseIcon: 'Power' }, { [DP]: true });
    // Iconify resolves the icon set asynchronously and falls back to the Lucide
    // power icon when it cannot; either way an inline <svg> shows up.
    await page
        .waitForFunction((sel) => !!document.querySelector(`${sel} [aria-pressed] svg`), ROOT, { timeout: 8000 })
        .catch(() => {});
    const icon = await probe();
    check('icon style renders an icon', icon.hasSvg, JSON.stringify(icon));
    check('icon style is not the slide toggle', !icon.slide, JSON.stringify(icon));
    eq('icon style reflects the state', icon.pressed, true);

    const png =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
    await show('list', 'default', { switchStyle: 'image', onImage: png, offImage: png }, { [DP]: true });
    check('image style renders an image', (await probe()).hasImg);

    // No image configured for this state → the icon takes over instead of nothing.
    await show('list', 'default', { switchStyle: 'image', onImage: png }, { [DP]: false });
    check('image style falls back to the icon', (await probe()).hasSvg);
}

// ── 8. On/off texts turn the toggle into a labelled pill ──
{
    const labels = ['EIN', 'AUS'];
    const entry = { trueLabel: 'EIN', falseLabel: 'AUS' };
    await show('list', 'default', { ...entry, onValue: 'ON' }, { [DP]: 'ON' });
    eq('labelled pill shows the AN text', (await probe(labels)).text, 'EIN');
    eq('labelled pill writes the AUS value', (await toggle(labels)).at(-1)?.val, false);

    await show('autolist', 'card', entry, { [DP]: false });
    eq('dynamic card shows the AUS text', (await probe(labels)).text, 'AUS');
}

// ── 9. Confirmation gate ──
{
    const entry = { confirm: true, confirmText: 'Steckdose schalten?', onValue: 'ON', offValue: 'OFF' };
    await show('list', 'default', entry, { [DP]: 'OFF' });
    eq('confirm blocks the write', (await toggle()).length, 0);
    const asked = await page.evaluate(() => document.body.textContent?.includes('Steckdose schalten?') ?? false);
    check('confirm prompt is shown', asked);
    await page.evaluate(() => {
        const yes = [...document.querySelectorAll('button')].find((b) =>
            /^(Ja|Yes)$/i.test(b.textContent?.trim() ?? ''),
        );
        yes?.click();
    });
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => window.__auraShot.writes());
    eq('confirming performs the write', after.at(-1)?.val, 'ON');
}

// ── 10. Read-only entries show the state but never write ──
{
    await show('list', 'default', { writable: false, onValue: 'ON', offValue: 'OFF' }, { [DP]: 'ON' });
    eq('read-only reads as on', (await probe()).pressed, true);
    eq('read-only does not write', (await toggle()).length, 0);
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
}
