// Does a condition on a SECOND-LINE datapoint reach its icon? (issue #601)
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/list-subline-cond-icon.mjs
//
// A second-line datapoint is a single element, not a four-part row: its editor
// offers no target select, so every rule lands under 'row'. The line read the
// result through partOf(res, 'value'), which deliberately keeps the icon and the
// hide flag away from a row's parts — so a rule could recolour the text but never
// swap, add or hide the icon. elementOf() is what the line reads now.
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
const rule = (effects) => ({ id: 'sc', logic: 'AND', clauses: ALWAYS, ...effects });

const VALUES = { 'demo.a.STATE': 21, 'demo.batt': 87, 'demo.rssi': -62 };

// The first extra datapoint brings its own icon, the second brings none — a rule
// has to beat the one and supply the other.
const subDps = (conditions) => [
    { id: 'demo.batt', label: 'Batt', icon: OWN, fontSize: 11, conditions },
    { id: 'demo.rssi', label: 'RSSI', fontSize: 11, conditions },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
await page.evaluate((v) => {
    window.__auraShot.mock(v);
    window.__auraShot.mockServerState(v);
}, VALUES);

/** Icon signature, size and colour of every icon inside a second line. */
const subIcons = () =>
    page.evaluate(() =>
        [...document.querySelectorAll('.aura-entry-subline')].flatMap((line) =>
            [...line.querySelectorAll('svg')].map((s) => ({
                // The drawn path is the only thing that tells two icons apart.
                sig: (s.innerHTML.match(/d="([^"]{0,32})/) || [])[1] ?? s.innerHTML.slice(0, 32),
                size: Math.round(s.getBoundingClientRect().width),
                color: getComputedStyle(s).color,
            })),
        ),
    );

/** Text of every second line, so a hidden item can be told from a missing line. */
const subText = () =>
    page.evaluate(() =>
        [...document.querySelectorAll('.aura-entry-subline')].map((el) => el.innerText.replace(/\s+/g, ' ').trim()),
    );

const show = async (type, layout, { entries, options = {} }, settle = 500) => {
    await page.evaluate((w) => window.__auraShot.showWidgets([w]), {
        id: 'sc-probe',
        type,
        title: 'sc',
        datapoint: '',
        layout,
        gridPos: { x: 0, y: 0, w: 16, h: 10 },
        options: { entries, showDividers: false, syncIntervalMin: 999, ...options },
    });
    await page.waitForTimeout(settle);
};

const entriesWith = (conditions) => [
    { id: 'demo.a.STATE', label: 'r01', displayType: 'value', subDps: subDps(conditions) },
];

/** The first widget of the session races the dashboard mount, and Iconify fetches
 *  its sets over the network — so wait for the icons instead of guessing a delay.
 *  Every later render hits the cache. */
const awaitIcons = async (want) => {
    for (let i = 0; i < 25; i++) {
        const ic = await subIcons();
        if (ic.length >= want) return ic;
        await page.waitForTimeout(200);
    }
    return subIcons();
};

await show('list', 'default', { entries: entriesWith([rule({ icon: OWN })]) }, 200);
const SIG_OWN = (await awaitIcons(2))[0]?.sig ?? '(none)';
await show('list', 'default', { entries: entriesWith([rule({ icon: RULED })]) }, 200);
const SIG_RULED = (await awaitIcons(2))[0]?.sig ?? '(none)';
check('the two probe icons are distinguishable', SIG_OWN !== SIG_RULED && SIG_OWN !== '(none)', SIG_OWN);

// The badges layout has no second line at all, so it is not in the list.
const LAYOUTS = [
    ['list', 'default', 'static/default'],
    ['list', 'card', 'static/card'],
    ['list', 'compact', 'static/compact'],
    ['autolist', 'default', 'dynamic/default'],
    ['autolist', 'card', 'dynamic/card'],
    ['autolist', 'compact', 'dynamic/compact'],
];

const PASSES = [
    {
        name: 'a rule swaps the icon and adds one where there was none',
        rules: [rule({ icon: RULED })],
        expect: (ic) => ic.length === 2 && ic.every((i) => i.sig === SIG_RULED),
    },
    {
        // Only the datapoint that brought an icon shows one: recolouring cannot
        // conjure an icon out of nothing.
        name: 'a rule recolours and resizes the icon',
        rules: [rule({ iconColor: '#ff0099', iconSize: 21 })],
        expect: (ic) =>
            ic.length === 1 && ic[0].sig === SIG_OWN && ic[0].color === 'rgb(255, 0, 153)' && ic[0].size === 21,
    },
    {
        name: 'a rule hides the item',
        rules: [rule({ hide: true })],
        expect: (ic) => ic.length === 0,
        text: (lines) => lines.every((l) => l === ''),
    },
    {
        // The regression guard: the colour always worked, and has to keep working
        // alongside the icon.
        name: 'a rule paints text and icon at once',
        rules: [rule({ icon: RULED, color: '#00cc44' })],
        expect: (ic) => ic.length === 2 && ic.every((i) => i.sig === SIG_RULED && i.color === 'rgb(0, 204, 68)'),
    },
];

for (const pass of PASSES) {
    console.log(`\n== ${pass.name} ==`);
    for (const [type, layout, title] of LAYOUTS) {
        await show(type, layout, { entries: entriesWith(pass.rules) });
        const icons = await subIcons();
        const seen = icons
            .map((i) => `${i.sig === SIG_RULED ? 'RULED' : i.sig === SIG_OWN ? 'OWN' : '?'}/${i.size}/${i.color}`)
            .join(' ');
        check(`${title}: ${pass.name}`, pass.expect(icons), seen || '(no icon)');
        if (pass.text) {
            const lines = await subText();
            check(`${title}: the hidden item leaves no text behind`, pass.text(lines), JSON.stringify(lines));
        }
    }
}

// The dynamic list's list-wide template carries conditions too — same key, same
// merge, but the datapoint is resolved per row first.
console.log('\n== the dynamic list-wide template ==');
await show('autolist', 'default', {
    entries: [{ id: 'demo.a.STATE', label: 'r01', displayType: 'value' }],
    options: {
        subDpTemplate: [{ id: 'demo.batt', label: 'Batt', fontSize: 11, conditions: [rule({ icon: RULED })] }],
    },
});
{
    const icons = await subIcons();
    check(
        'template: the rule reaches the icon',
        icons.length === 1 && icons[0].sig === SIG_RULED,
        JSON.stringify(icons),
    );
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
await browser.close();
process.exit(failed.length ? 1 : 0);
