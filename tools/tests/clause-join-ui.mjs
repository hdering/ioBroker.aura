// Mixed AND/OR connectors and brackets in a condition, end to end (issue #635).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/clause-join-ui.mjs
//
// utils/clauseLogic is covered on its own by tools/tests/clause-logic.mjs; this one
// checks the two things a pure test cannot see:
//
//   1. the runtime actually folds a stored rule the new way — the clause row's
//      `join` reaches useConditionStyle, not just the helper;
//   2. the editor writes what its chips show. Every chip used to toggle ONE
//      rule-wide field, which is the bug the issue reports, so the interesting part
//      is that clicking row 3 leaves rows 1 and 2 meaning what they meant.
//
// Datapoint values are injected into the in-memory cache via the screenshot harness
// (__auraShot.mock + mockServerState) — no socket write, no real datapoint.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const A = 'demo.cj.a';
const B = 'demo.cj.b';
const C = 'demo.cj.c';

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

/** One clause per datapoint, each testing "is true", with the given connectors. */
const clauses = (...specs) =>
    specs.map((spec, i) => {
        const bracket = spec.startsWith('(') ? 'open' : spec.startsWith('|') ? 'in' : undefined;
        const join = spec.replace(/^[(|]/, '') || undefined;
        return {
            datapoint: [A, B, C][i],
            operator: 'true',
            value: '',
            ...(join ? { join } : null),
            ...(bracket ? { bracket } : null),
        };
    });

/** The rule writes a fixed text into the value while it matches — easy to read back. */
const rule = (logic, cls) => ({
    id: 'r-join',
    label: 'join',
    logic,
    clauses: cls,
    style: {},
    elements: { value: { show: true, text: 'HIT' } },
    effect: 'none',
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const settle = () => page.waitForTimeout(350);

const showRule = async (logic, cls, editMode = false) => {
    await page.evaluate(
        ([dps, conditions, edit]) => {
            window.__auraShot.mock(dps);
            window.__auraShot.mockServerState(dps);
            window.__auraShot.showWidgets(
                [
                    {
                        id: 'w-join',
                        type: 'value',
                        title: 'Wert',
                        datapoint: dps.__main,
                        gridPos: { x: 0, y: 0, w: 12, h: 6 },
                        options: { conditions, decimals: 0 },
                    },
                ],
                { editMode: edit },
            );
            window.__auraShot.setEditMode(edit);
        },
        [{ [A]: false, [B]: false, [C]: false, __main: A }, [rule(logic, cls)], editMode],
    );
    await settle();
};

/** Set the three datapoints and read back whether the rule matched. */
const matched = async (a, b, c) => {
    await page.evaluate(
        ([dps]) => {
            window.__auraShot.mock(dps);
            window.__auraShot.mockServerState(dps);
        },
        [{ [A]: a, [B]: b, [C]: c }],
    );
    await settle();
    const text = await page.evaluate(
        () => document.querySelector('.aura-widget-w-join .aura-widget-value')?.textContent?.trim() ?? null,
    );
    return text === 'HIT';
};

/** The rule's verdict over all eight input combinations, as a '0101…' string. */
const table = async () => {
    let out = '';
    for (let mask = 0; mask < 8; mask++) {
        out += (await matched(!!(mask & 1), !!(mask & 2), !!(mask & 4))) ? '1' : '0';
    }
    return out;
};
const formula = (fn) => {
    let out = '';
    for (let mask = 0; mask < 8; mask++) out += fn(!!(mask & 1), !!(mask & 2), !!(mask & 4)) ? '1' : '0';
    return out;
};

console.log('\n── 1. the runtime folds the stored connectors ───────────────────────────');

// The shape every config written before #635 has: no `join`, one rule-wide logic.
await showRule('AND', clauses('', '', ''));
eq(
    'a rule without joins still means "all of them"',
    await table(),
    formula((a, b, c) => a && b && c),
);
await showRule('OR', clauses('', '', ''));
eq(
    '… and with an OR logic, "any of them"',
    await table(),
    formula((a, b, c) => a || b || c),
);

// What the issue asked for: one row AND, the next OR.
await showRule('AND', clauses('', 'AND', 'OR'));
eq(
    'A AND B OR C reads as (A AND B) OR C',
    await table(),
    formula((a, b, c) => (a && b) || c),
);
await showRule('AND', clauses('', 'OR', 'AND'));
eq(
    'A OR B AND C reads as A OR (B AND C)',
    await table(),
    formula((a, b, c) => a || (b && c)),
);

// The bracket, which is the order precedence alone cannot produce.
await showRule('AND', clauses('', '(AND', '|OR'));
eq(
    'A AND (B OR C)',
    await table(),
    formula((a, b, c) => a && (b || c)),
);
await showRule('AND', clauses('(', '|OR', 'AND'));
eq(
    '(A OR B) AND C',
    await table(),
    formula((a, b, c) => (a || b) && c),
);

// A clause's own join has to beat the rule-wide fallback, or an edited rule would
// silently revert to what the old field said.
await showRule('OR', clauses('', 'AND', 'AND'));
eq(
    'an explicit join wins over the rule-wide logic',
    await table(),
    formula((a, b, c) => a && b && c),
);

console.log('\n── 2. the editor writes what its chips show ─────────────────────────────');

await showRule('AND', clauses('', '', ''), true);

await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:has-text("Bedingungen")').first().click();
const dlg = page.locator('.aura-widget-edit-modal');
await dlg.waitFor({ timeout: 10000 });
await dlg.locator('[data-aura-clause-join]').first().waitFor({ timeout: 10000 });

const stored = () => page.evaluate(() => window.__auraShot.widgetOptions('w-join').conditions[0].clauses);
const joins = async () => (await stored()).map((c) => c.join ?? '-');
const brackets = async () => (await stored()).map((c) => c.bracket ?? '-');
// One chip per connector, so the first clause (which shows "WENN") has none.
const chip = (i) => dlg.locator('[data-aura-clause-join]').nth(i - 1);
const bracketBtn = (i) => dlg.locator('.aura-clause-bracket').nth(i);
const preview = async () =>
    (await dlg.locator('.aura-clause-preview').count())
        ? (await dlg.locator('.aura-clause-preview').innerText()).replace(/\s+/g, ' ').trim()
        : null;

check('a rule with three clauses shows two connectors', (await dlg.locator('[data-aura-clause-join]').count()) === 2);
check('every row offers a bracket button', (await dlg.locator('.aura-clause-bracket').count()) === 3);
eq('the connectors start at the rule-wide logic', await dlg.locator('[data-aura-clause-join]').allInnerTexts(), [
    'UND',
    'UND',
]);
eq('a plain AND chain needs no preview line', await preview(), null);

// The bug: before #635 this flipped both chips at once.
await chip(2).click();
await settle();
eq('clicking the second connector switches only that row', await joins(), ['-', 'AND', 'OR']);
eq('… and the chips say so', await dlg.locator('[data-aura-clause-join]').allInnerTexts(), ['UND', 'ODER']);
// The row that was relying on the rule-wide logic now states it, so the rule cannot
// change meaning behind the user's back when that field is edited elsewhere.
check('… the untouched row had its fallback written out', (await joins())[1] === 'AND');
eq('a mixed rule prints what it reads as', await preview(), 'Ergibt: a ✓ UND b ✓ ODER c ✓');

await chip(1).click();
await settle();
eq('the first connector switches independently', await joins(), ['-', 'OR', 'OR']);
eq('… and back', await chip(1).click().then(settle).then(joins), ['-', 'AND', 'OR']);

console.log('\n── 3. the bracket button ────────────────────────────────────────────────');

await bracketBtn(1).click();
await settle();
eq('a row below an unbracketed one opens a bracket', await brackets(), ['-', 'open', '-']);

await bracketBtn(2).click();
await settle();
eq('the next row joins it', await brackets(), ['-', 'open', 'in']);
eq('the preview prints the bracket', await preview(), 'Ergibt: a ✓ UND (b ✓ ODER c ✓)');

await bracketBtn(2).click();
await settle();
eq('clicking an inner row splits the bracket there', await brackets(), ['-', 'open', 'open']);

await bracketBtn(2).click();
await settle();
eq('clicking an opening row clears it', await brackets(), ['-', 'open', '-']);

await bracketBtn(1).click();
await settle();
eq('and the last bracket goes too', await brackets(), ['-', '-', '-']);
eq('with only one connector left mixed, the preview stays', await preview(), 'Ergibt: a ✓ UND b ✓ ODER c ✓');

await page.keyboard.press('Escape');
await settle();

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length} checks, ${failed.length} failed`);
if (failed.length) {
    for (const f of failed) console.log(`  FAIL ${f.name} — ${f.detail}`);
    process.exit(1);
}
