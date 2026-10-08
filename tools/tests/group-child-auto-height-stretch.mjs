// "Höhe automatisch an Inhalt anpassen" on a fluid grid that stretches its rows
// (#759, gridHeightMode 'scale' / 'fill'). The content-sized rows used to be
// counted on the design pitch and then drawn on the stretched one, so every
// auto-height card — on the tab and inside a group — carried the stretch as empty
// space under its content, and the group grew along. They are now counted on the
// rows the grid really draws. A group's stored h is the stretch reference in
// design rows: its own design hug must not pass for a deliberate stretch.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5197
//   AURA_BASE=http://localhost:5197 node tools/tests/group-child-auto-height-stretch.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const pageErrors = [];
const mock = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`test.e.${i}`, { val: i * 1.5, unit: 'kWh' }]));

// The export from the issue: three lists of three entries at a stored h=6, the
// group at h=20 — exactly the design hug of those stored rows.
const list = (id, n, y) => ({
    id,
    type: 'list',
    title: `Liste ${n}`,
    datapoint: '',
    gridPos: { x: 0, y, w: 19, h: 6 },
    options: {
        entries: [0, 1, 2].map((i) => ({ id: `test.e.${n * 3 + i}`, label: `E${i}` })),
        transparent: true,
        showCount: false,
        showDividers: false,
        hideFilterButton: true,
        showIcon: false,
        autoHeight: true,
    },
});
const KIDS = [list('c759-0', 0, 0), list('c759-1', 1, 5), list('c759-2', 2, 10)];
const GROUP = {
    id: 'w-759',
    type: 'group',
    title: 'Allgemein',
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 23, h: 20 },
    options: { defId: 'def-759' },
};
const SOLO = { ...list('solo-759', 3, 20), gridPos: { x: 0, y: 20, w: 19, h: 6 } };

async function measure(width, settings, editMode = false, { height = 1000, alone = false } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
    await page.evaluate(
        ([m, kids, widgets, settings, editMode]) => {
            window.__auraShot.mockServerState(m);
            window.__auraShot.mock(m);
            window.__auraShot.setFrontend({
                gridSnapX: 20,
                gridGap: 10,
                tabletBreakpoint: 0,
                guidelinesEnabled: false,
                gridWidthMode: 'fixed',
                fluidDesignWidth: 1280,
                fluidMinScale: 0.6,
                fluidMaxScale: 0,
                gridHeightMode: 'fixed',
                ...settings,
            });
            window.__auraShot.groupDefs({ 'def-759': kids });
            window.__auraShot.showWidgets(widgets, { editMode });
        },
        [mock, KIDS, alone ? [GROUP] : [GROUP, SOLO], settings, editMode],
    );
    let prev = '';
    let m = null;
    for (let i = 0; i < 20; i++) {
        await page.waitForTimeout(200);
        m = await page.evaluate(() => {
            // Card height and the empty space between its last row and its bottom edge.
            const card = (id) => {
                const el = document.querySelector(`.aura-widget-${id}`);
                if (!el) return null;
                const b = el.getBoundingClientRect();
                const rows = [...el.querySelectorAll('.px-3.py-2')];
                const last = rows.length ? rows[rows.length - 1].getBoundingClientRect().bottom : b.top;
                return { h: Math.round(b.height), slack: Math.round(b.bottom - last) };
            };
            const g = document.querySelector('[data-aura-widget="w-759"]')?.getBoundingClientRect();
            return {
                group: g ? Math.round(g.height) : -1,
                kids: ['c759-0', 'c759-1', 'c759-2'].map(card),
                solo: card('solo-759'),
            };
        });
        const k = JSON.stringify(m);
        if (k === prev && i > 2) break;
        prev = k;
    }
    await ctx.close();
    return m;
}

const fixed = await measure(1280, {});
console.log('  fixed:', JSON.stringify(fixed));
check('fixed: group hugs its content-sized lists', fixed.group > 0 && fixed.group <= 600, `${fixed.group}`);

// At 1920 px against a 1280 px design the 'scale' rows are 1.5× (30 px + 10 px gap);
// 'fill' stretches them to the screen. The slack left over is the rounding to whole
// rows, so it may exceed the fixed grid's by less than one stretched row.
for (const [mode, maxExtra] of [
    ['fill', 15],
    ['scale', 30],
]) {
    const m = await measure(1920, { gridWidthMode: 'fluid', gridHeightMode: mode });
    console.log(`  ${mode}:`, JSON.stringify(m));
    check(`${mode}: group is not stretched along`, m.group <= fixed.group * 1.15, `${m.group} vs ${fixed.group} fixed`);
    m.kids.forEach((k, n) =>
        check(
            `${mode}: group list ${n} carries no stretched slack`,
            k && k.slack <= fixed.kids[n].slack + maxExtra,
            `${k?.slack} vs ${fixed.kids[n].slack} fixed`,
        ),
    );
    check(
        `${mode}: tab-level list carries no stretched slack`,
        m.solo && m.solo.slack <= fixed.solo.slack + maxExtra,
        `${m.solo?.slack} vs ${fixed.solo.slack} fixed`,
    );
    check(
        `${mode}: content never cut`,
        [...m.kids, m.solo].every((k) => k && k.slack >= 16),
        JSON.stringify([...m.kids, m.solo].map((k) => k?.slack)),
    );
}

// The group alone on the tab — the issue's picture. 'fill' then stretches every row
// to ~30 px (40 px with the gap), the coarsest case: whole rows on that pitch leave
// up to one of them as slack, but no more. Before the fix: group 803 px, slack 91.
const aloneOpts = { height: 900, alone: true };
const aloneFixed = await measure(1600, {}, false, aloneOpts);
const aloneFill = await measure(1600, { gridWidthMode: 'fluid', gridHeightMode: 'fill' }, false, aloneOpts);
console.log('  alone fixed:', JSON.stringify(aloneFixed));
console.log('  alone fill:', JSON.stringify(aloneFill));
check(
    'fill, group alone: group is not stretched along',
    aloneFill.group <= aloneFixed.group * 1.2,
    `${aloneFill.group} vs ${aloneFixed.group} fixed`,
);
aloneFill.kids.forEach((k, n) =>
    check(
        `fill, group alone: list ${n} slack within one stretched row`,
        k && k.slack >= 16 && k.slack <= aloneFixed.kids[n].slack + 40,
        `${k?.slack} vs ${aloneFixed.kids[n].slack} fixed`,
    ),
);

// The editor stays on the design pitch, fluid or not.
const editor = await measure(1920, { gridWidthMode: 'fluid', gridHeightMode: 'fill' }, true);
check('editor: unchanged by the fluid rows', editor.group === fixed.group, `${editor.group} vs ${fixed.group}`);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
