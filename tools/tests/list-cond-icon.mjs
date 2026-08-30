// Does a row condition's ICON override reach every list layout?
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/list-cond-icon.mjs
//
// Issue #601 follow-up: the static list's "minimal" (badge) layout built its icon
// from the display-type mapping and the row's own icon only, so a rule that swaps
// or hides the icon did nothing there — while colour and size, read from the same
// merged result two lines below, worked. Every layout is walked here, with the
// rule on `icon`, on `row` (inherited) and on the entry itself, and with a row
// that has no icon of its own so a rule has to be able to add one.
//
// An icon is identified by the markup it draws: the name lives in no attribute,
// and both Lucide names and Iconify ids end up as the same <svg> shell.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const OWN = 'Lightbulb';
const RULED = 'CloudOff';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const ALWAYS = [{ datapoint: '{dp}', operator: 'contains', value: '' }];
const rule = (target, effects) => ({ id: 'ic', logic: 'AND', target, clauses: ALWAYS, ...effects });

const LAYOUTS = [
    ['list', 'default', 'static/default'],
    ['list', 'card', 'static/card'],
    ['list', 'compact', 'static/compact'],
    ['list', 'minimal', 'static/minimal'],
    ['autolist', 'default', 'dynamic/default'],
    ['autolist', 'card', 'dynamic/card'],
    ['autolist', 'compact', 'dynamic/compact'],
    ['autolist', 'minimal', 'dynamic/minimal'],
];

// r01 brings its own icon, r02 brings none — a rule has to beat the one and
// supply the other.
const entriesWith = (icon, entryRules) => [
    { id: 'demo.a.STATE', label: 'r01', icon, iconSize: 14, displayType: 'value', conditions: entryRules },
    { id: 'demo.b.STATE', label: 'r02', iconSize: 14, displayType: 'value', conditions: entryRules },
];

const widget = (type, layout, entries, rules) => ({
    id: 'ci-probe',
    type,
    title: 'ci',
    datapoint: '',
    layout,
    gridPos: { x: 0, y: 0, w: 24, h: 14 },
    options: { entries, rowConditions: rules, showDividers: false, syncIntervalMin: 999 },
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
await page.evaluate(
    (m) => {
        window.__auraShot.mock(m);
        window.__auraShot.mockServerState(m);
    },
    { 'demo.a.STATE': 21, 'demo.b.STATE': 22 },
);

/** Row icons only — the widget header icon, the filter chip and the sync spinner
 *  are chrome and would drown the assertions. */
const rowIcons = () =>
    page.evaluate(() => {
        const root = document.querySelector('.aura-widget-ci-probe');
        if (!root) return null;
        const chrome = /aura-widget-icon|lucide-funnel|lucide-refresh-cw/;
        return [...root.querySelectorAll('svg')]
            .filter((s) => !chrome.test(s.getAttribute('class') || ''))
            .map((s) => {
                const cs = getComputedStyle(s);
                return {
                    // The drawn path is the only thing that tells two icons apart.
                    sig: (s.innerHTML.match(/d="([^"]{0,32})/) || [])[1] ?? s.innerHTML.slice(0, 32),
                    size: Math.round(s.getBoundingClientRect().width),
                    color: cs.color,
                };
            });
    });

const show = async (type, layout, entries, rules, settle = 900) => {
    await page.evaluate((w) => window.__auraShot.showWidgets([w]), widget(type, layout, entries, rules));
    await page.waitForTimeout(settle);
    return rowIcons();
};

// Iconify fetches its sets, so the first paint of an icon races the network.
// Both icons are drawn once up front; every later render hits the cache.
for (const name of [OWN, RULED]) await show('list', 'default', entriesWith(name), [], 1200);

const sigOf = (icons) => icons?.[0]?.sig ?? '(none)';
const SIG_OWN = sigOf(await show('list', 'default', entriesWith(OWN), [], 1200));
const SIG_RULED = sigOf(await show('list', 'default', entriesWith(RULED), [], 1200));
check('the two probe icons are distinguishable', SIG_OWN !== SIG_RULED && SIG_OWN !== '(none)', SIG_OWN);

const PASSES = [
    {
        name: 'a rule on the icon swaps it',
        rules: [rule('icon', { icon: RULED })],
        expect: (ic) => ic.length === 2 && ic.every((i) => i.sig === SIG_RULED),
    },
    {
        // partOf() hands the row's icon down to the icon part.
        name: 'a rule on the row swaps it too',
        rules: [rule('row', { icon: RULED })],
        expect: (ic) => ic.length === 2 && ic.every((i) => i.sig === SIG_RULED),
    },
    {
        // Only r01 shows up: a rule that names no icon has nothing to draw on the
        // row that brought none, so recolouring cannot conjure one.
        name: 'a rule recolours and resizes the icon',
        rules: [rule('icon', { iconColor: '#ff0099', iconSize: 26 })],
        expect: (ic) =>
            ic.length === 1 && ic[0].color === 'rgb(255, 0, 153)' && ic[0].size === 26 && ic[0].sig === SIG_OWN,
    },
    {
        name: 'a rule hides the icon',
        rules: [rule('icon', { hide: true })],
        expect: (ic) => ic.length === 0,
    },
    {
        name: "the entry's own rule swaps it",
        entryRules: [rule('icon', { icon: RULED })],
        rules: [],
        expect: (ic) => ic.length === 2 && ic.every((i) => i.sig === SIG_RULED),
    },
];

for (const pass of PASSES) {
    console.log(`\n══ ${pass.name} ══`);
    for (const [type, layout, title] of LAYOUTS) {
        // r02 has no icon of its own, so a swap must still produce two icons.
        const icons = await show(type, layout, entriesWith(OWN, pass.entryRules), pass.rules);
        if (!icons) {
            check(`${title}: widget renders`, false, 'not found');
            continue;
        }
        const seen = icons
            .map((i) => `${i.sig === SIG_RULED ? 'RULED' : i.sig === SIG_OWN ? 'OWN' : '?'}/${i.size}/${i.color}`)
            .join(' ');
        check(`${title}: ${pass.name}`, pass.expect(icons), seen || '(no icon)');
    }
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
await browser.close();
process.exit(failed.length ? 1 : 0);
