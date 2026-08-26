// Verifies row conditions in both list widgets (issue #572) against the dev server.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/row-conditions-ui.mjs
//
// Covers what the pure test in row-conditions.mjs cannot: that the merged effects
// actually reach the pixels — name colour, a replaced value text, a swapped icon, a
// hidden row — and that a rule on the entry beats the list-wide one.
//
// Datapoint values are injected into the in-memory cache via the screenshot harness
// (__auraShot.mock) — no socket write, no real datapoint is touched.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) => check(name, got === want, got === want ? '' : `got ${got}, want ${want}`);

const clause = (datapoint, operator, value = '') => ({ datapoint, operator, value });
/** A clause that is true for every value — "contains nothing". */
const always = () => clause('{dp}', 'contains', '');

const rule = (id, target, clauses, effects) => ({ id, logic: 'AND', target, clauses, ...effects });

const ROW_RULES = [
    rule('all-names', 'name', [always()], { color: '#0000ff' }),
    rule('on', 'value', [clause('{dp}', 'true')], { text: 'ONLINE' }),
    rule('off', 'value', [clause('{dp}', 'false')], { text: 'OFFLINE' }),
    rule('hide', 'row', [clause('{{parent}}.HIDE', 'true')], { hide: true }),
    rule('unreach', 'icon', [clause('{{parent}}.UNREACH', 'true')], {
        icon: 'CloudOff',
        iconColor: '#ff0000',
        iconSize: 26,
    }),
];

const staticList = {
    id: 'rc-list',
    type: 'list',
    title: 'Statisch',
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 14, h: 10 },
    options: {
        entries: [
            // An own icon size, so the rule below has something to beat.
            { id: 'demo.dev1.STATE', label: 'Eins', icon: 'Lightbulb', iconSize: 18 },
            {
                id: 'demo.dev2.STATE',
                label: 'Zwei',
                icon: 'Lightbulb',
                // Beats the list-wide colour for this row only.
                conditions: [rule('own', 'name', [always()], { color: '#00ff00' })],
            },
            { id: 'demo.dev3.STATE', label: 'Drei', icon: 'Lightbulb' },
        ],
        rowConditions: ROW_RULES,
        showDividers: false,
    },
};

const autoList = {
    id: 'rc-auto',
    type: 'autolist',
    title: 'Dynamisch',
    datapoint: '',
    gridPos: { x: 0, y: 11, w: 14, h: 8 },
    options: {
        entries: [
            { id: 'demo.dev1.STATE', label: 'Auto-Eins', icon: 'Lightbulb', iconSize: 16 },
            { id: 'demo.dev2.STATE', label: 'Auto-Zwei', icon: 'Lightbulb', iconSize: 16 },
        ],
        rowConditions: [
            rule('auto-name', 'name', [clause('{{parent}}.UNREACH', 'true')], { color: '#ff00ff' }),
            rule('auto-size', 'icon', [clause('{{parent}}.UNREACH', 'true')], { iconSize: 26 }),
        ],
        syncIntervalMin: 999,
    },
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

const settle = () => page.waitForTimeout(600);
// The lists read their entries through getState/subscribe, so the server-state mock
// has to answer as well — the cache alone only serves the widgets that read it.
const mock = (map) =>
    page.evaluate((m) => {
        window.__auraShot.mock(m);
        window.__auraShot.mockServerState(m);
    }, map);

/** Colour of the leaf element whose text is exactly `text`. */
const colorOf = (widget, text) =>
    page.evaluate(
        ([w, t]) => {
            const el = [...document.querySelectorAll(`.aura-widget-${w} *`)].find(
                (e) => e.children.length === 0 && e.textContent.trim() === t,
            );
            return el ? getComputedStyle(el).color : null;
        },
        [widget, text],
    );

const textOf = (widget) => page.evaluate((w) => document.querySelector(`.aura-widget-${w}`)?.innerText ?? '', widget);

const iconColors = (widget) =>
    page.evaluate(
        (w) => [...document.querySelectorAll(`.aura-widget-${w} svg`)].map((s) => getComputedStyle(s).color),
        widget,
    );

/** Rendered box width of every icon — a rule may resize one. */
const iconWidths = (widget) =>
    page.evaluate(
        (w) =>
            [...document.querySelectorAll(`.aura-widget-${w} svg`)].map((s) =>
                Math.round(s.getBoundingClientRect().width),
            ),
        widget,
    );

/**
 * Iconify fetches its icon sets, so a row icon appears a moment after the row. The
 * colour assertions below would otherwise race the download.
 */
const iconsReady = (widget, min) =>
    page
        .waitForFunction(([w, n]) => document.querySelectorAll(`.aura-widget-${w} svg`).length >= n, [widget, min], {
            timeout: 10000,
        })
        .catch(() => {});

await mock({
    'demo.dev1.STATE': true,
    'demo.dev2.STATE': false,
    'demo.dev3.STATE': true,
    'demo.dev1.UNREACH': true,
    'demo.dev2.UNREACH': false,
    'demo.dev1.HIDE': false,
    'demo.dev2.HIDE': false,
    'demo.dev3.HIDE': true,
});

await page.evaluate((ws) => window.__auraShot.showWidgets(ws), [staticList, autoList]);
await settle();
await settle();

// ── static list ──────────────────────────────────────────────────────────────
{
    const body = await textOf('rc-list');
    check('static: rows render', body.includes('Eins') && body.includes('Zwei'), body.replace(/\n/g, ' | '));
    check('static: a rule on {{parent}}.HIDE removes the row', !body.includes('Drei'), body.replace(/\n/g, ' | '));

    eq('static: the list-wide name colour applies', await colorOf('rc-list', 'Eins'), 'rgb(0, 0, 255)');
    eq('static: the entry rule beats the list-wide one', await colorOf('rc-list', 'Zwei'), 'rgb(0, 255, 0)');

    check('static: true became ONLINE', body.includes('ONLINE'), body.replace(/\n/g, ' | '));
    check('static: false became OFFLINE', body.includes('OFFLINE'), body.replace(/\n/g, ' | '));

    // Header icon + filter chip + one per visible row.
    await iconsReady('rc-list', 4);
    const colors = await iconColors('rc-list');
    check(
        'static: {{parent}}.UNREACH recolours exactly one row icon',
        colors.filter((c) => c === 'rgb(255, 0, 0)').length === 1,
        colors.join(' '),
    );

    const widths = await iconWidths('rc-list');
    check(
        'static: the same rule resizes exactly that icon',
        widths.filter((w) => w === 26).length === 1 && !widths.includes(18),
        widths.join(' '),
    );
}

// ── the effects follow the value ─────────────────────────────────────────────
await mock({ 'demo.dev1.STATE': false, 'demo.dev1.UNREACH': false });
await settle();
{
    const body = await textOf('rc-list');
    check('static: the value text follows the datapoint', !body.includes('ONLINE'), body.replace(/\n/g, ' | '));
    const colors = await iconColors('rc-list');
    check('static: the icon rule releases the icon again', !colors.includes('rgb(255, 0, 0)'), colors.join(' '));
    const widths = await iconWidths('rc-list');
    check(
        'static: and the row falls back to its own icon size',
        !widths.includes(26) && widths.includes(18),
        widths.join(' '),
    );
}

// ── dynamic list ─────────────────────────────────────────────────────────────
{
    const body = await textOf('rc-auto');
    check('dynamic: rows render', body.includes('Auto-Eins'), body.replace(/\n/g, ' | '));
    await iconsReady('rc-auto', 3);
    const icons = await page.evaluate(() => document.querySelectorAll('.aura-widget-rc-auto svg').length);
    // Header icon plus one per row — the row icon is a per-datapoint setting.
    check('dynamic: rows have an icon now', icons >= 3, `svg count ${icons}`);
}

await mock({ 'demo.dev1.UNREACH': true });
await settle();
eq('dynamic: a {{parent}} rule colours the right row', await colorOf('rc-auto', 'Auto-Eins'), 'rgb(255, 0, 255)');
check(
    'dynamic: and leaves the other row alone',
    (await colorOf('rc-auto', 'Auto-Zwei')) !== 'rgb(255, 0, 255)',
    String(await colorOf('rc-auto', 'Auto-Zwei')),
);
{
    const widths = await iconWidths('rc-auto');
    check(
        'dynamic: a list-wide rule resizes only the matching row icon',
        widths.filter((w) => w === 26).length === 1 && widths.includes(16),
        widths.join(' '),
    );
}

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
