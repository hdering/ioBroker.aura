// Verifies the name pattern of the list widgets: the `{{parent}}` variables and the
// live `[[dp]]` token, i.e. labelling rows with a name the adapter keeps in its own
// datapoint (issue #524).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/name-pattern.mjs
//
// Uses the screenshot harness (__auraShot) so datapoint values live in the in-memory
// cache only - no socket write, no real datapoint is touched. The same values go to
// mockServerState, otherwise the initial getState round-trip answers null for the
// fictional IDs.
// Checked for both lists: a pattern of `[[{{parent}}.<dp>]]` resolves per row, the
// capitalised spelling works too, {{dp}}/{{name}} resolve, an absolute `[[id]]` reads
// the same value on every row, tokens compose with the <Token> placeholders, a value
// change updates the label live, the 'Ergebnis' name-filter rules run on the RESOLVED
// value (not on the datapoint id), and an unresolvable token falls back to the plain
// name instead of blanking the row.
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

// Two rows in different strangs, each with a sibling datapoint carrying the display
// name - the constellation from the issue (a SonOff plug names itself).
const VALUES = {
    'sonoff.0.PlugA.POWER': true,
    'sonoff.0.PlugA.DeviceName': 'Kaffeemaschine',
    'sonoff.0.PlugB.POWER': false,
    'sonoff.0.PlugB.DeviceName': 'Waschmaschine',
    'shared.0.Ort': 'Küche',
};

const ENTRIES = [
    { id: 'sonoff.0.PlugA.POWER', label: 'Plug A' },
    { id: 'sonoff.0.PlugB.POWER', label: 'Plug B' },
];

async function show(type, options, values = VALUES) {
    const widget = {
        id: `w-${type}`,
        type,
        title: 'Namensmuster',
        datapoint: '',
        layout: 'default',
        gridPos: { x: 0, y: 0, w: 12, h: 8 },
        options: { entries: ENTRIES, ...options },
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

// 'list' = static list, 'autolist' = dynamic list. No filter is configured on the
// dynamic one, so its periodic discovery sync stays a no-op.
for (const type of ['list', 'autolist']) {
    // ── 1. The name lives in a sibling datapoint ─────────────────────────────
    await show(type, { namePattern: '[[{{parent}}.DeviceName]]' });
    {
        const text = await widgetText();
        check(
            `${type}: {{parent}} + [[dp]] labels each row from its own datapoint`,
            text.includes('Kaffeemaschine') && text.includes('Waschmaschine'),
            text,
        );
        check(`${type}: the configured label is replaced`, !text.includes('Plug A'), text);
    }

    // ── 2. Capitalised spelling works (the field is typed by hand) ───────────
    await show(type, { namePattern: '[[{{Parent}}.DeviceName]]' });
    check(`${type}: {{Parent}} resolves case-insensitively`, (await widgetText()).includes('Kaffeemaschine'));

    // ── 3. {{dp}} and {{name}} resolve too ───────────────────────────────────
    await show(type, { namePattern: '[[{{dp}}]]' });
    {
        const text = await widgetText();
        check(`${type}: {{dp}} reads the row's own value`, /AN/.test(text) && /AUS/.test(text), text);
    }
    await show(type, { namePattern: '{{name}}' });
    check(`${type}: {{name}} is the last id segment`, (await widgetText()).includes('POWER'));

    // ── 4. Composition with the <Token> placeholders and static text ─────────
    await show(type, { namePattern: 'Steckdose [[{{parent}}.DeviceName]] (<DPName>)' });
    {
        const text = await widgetText();
        check(
            `${type}: live token composes with <Token> and static text`,
            text.includes('Steckdose Kaffeemaschine (POWER)'),
            text,
        );
    }

    // ── 5. An absolute token reads the same value on every row ───────────────
    await show(type, { namePattern: '[[shared.0.Ort]] <DPName>' });
    {
        const text = await widgetText();
        const hits = (text.match(/Küche/g) ?? []).length;
        check(`${type}: absolute [[id]] reaches every row`, hits === 2, `${hits}x in: ${text}`);
    }

    // ── 6. The label follows the value ───────────────────────────────────────
    await show(type, { namePattern: '[[{{parent}}.DeviceName]]' });
    await page.evaluate(() => window.__auraShot.mock({ 'sonoff.0.PlugA.DeviceName': 'Espressomaschine' }));
    await page.waitForTimeout(400);
    {
        const text = await widgetText();
        check(
            `${type}: the label follows the datapoint value`,
            text.includes('Espressomaschine') && !text.includes('Kaffeemaschine'),
            text,
        );
    }

    // ── 7. 'Ergebnis' rules run on the resolved label, not on the token ──────
    await show(type, {
        namePattern: '[[{{parent}}.DeviceName]]',
        nameFilters: [{ id: 'r1', field: 'Ergebnis', op: 'case', value: 'upper' }],
    });
    {
        const text = await widgetText();
        check(`${type}: an 'Ergebnis' rule applies to the resolved value`, text.includes('KAFFEEMASCHINE'), text);
    }
    await show(type, {
        namePattern: '[[{{parent}}.DeviceName]]',
        nameFilters: [{ id: 'r1', field: 'Ergebnis', op: 'stripSuffix', value: 'maschine' }],
    });
    {
        const text = await widgetText();
        check(
            `${type}: a text rule reshapes the resolved value`,
            text.includes('Kaffee') && !text.includes('Kaffeemaschine'),
            text,
        );
    }

    // ── 8. Unresolvable token degrades to the plain name, never to a blank ───
    await show(type, { namePattern: '[[{{parent}}.DoesNotExist]]' });
    {
        const text = await widgetText();
        check(`${type}: a missing datapoint falls back to the plain name`, text.includes('Plug A'), text);
        check(`${type}: the raw token is not shown`, !text.includes('[['), text);
    }
}

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
