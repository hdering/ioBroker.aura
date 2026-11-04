// UI test (#915): the group action must not change a group's height.
//
//   • Two groups with the same children and header items, one with the master control
//     on (every action type): the header bar, the divider under it, the box and every
//     child come out the same height.
//   • Title and icon off: the control still sits inside the bar instead of
//     overhanging its border.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5199    (or set AURA_BASE)
//   AURA_BASE=http://localhost:5199 node tools/tests/group-action-header.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5199';
const kids = (def) =>
    [0, 1, 2].map((i) => ({
        id: `${def}-c${i}`,
        type: 'switch',
        title: `Licht ${i + 1}`,
        datapoint: `demo.sw${i}`,
        layout: 'default',
        options: {},
        gridPos: { x: 0, y: i * 3, w: 11, h: 3 },
    }));
// The report's header items: a bare dp slot plus a coloured "An" counter.
const headerItems = [
    { id: 'hi-1', source: 'dp', slot: 'r1-left' },
    { id: 'hi-2', source: 'dp', slot: 'r1-center', dp: 'demo.sw0', unit: 'An', color: 'var(--accent-yellow)' },
];
const ACTIONS = [
    { groupActionType: 'momentary', groupPulseLabel: 'Alle Aus', groupPulseValue: 'false' },
    { groupActionType: 'switch' },
    // No shutter/dimmer among the children: the frontend hides these controls, the
    // editor shows their placeholder.
    { groupActionType: 'shutter', editorOnly: true },
    { groupActionType: 'dimmer', editorOnly: true },
];
const group = (id, x, options) => ({
    id,
    type: 'group',
    title: 'Licht Wohnzimmer',
    datapoint: '',
    layout: 'default',
    options: { icon: 'mdi:lightbulb-on', defId: `def-${id}`, ...options },
    gridPos: { x, y: 0, w: 11, h: 11 },
});

let passed = 0;
let failed = 0;
const check = (ok, label, detail = '') => {
    if (ok) passed++;
    else failed++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const show = async (widgets, editMode) => {
    await page.evaluate(
        ({ widgets, defs, editMode }) => {
            localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 }));
            window.__auraShot.mock({ 'demo.sw0': false, 'demo.sw1': false, 'demo.sw2': false });
            window.__auraShot.groupDefs(defs);
            window.__auraShot.showWidgets(widgets, { editMode });
        },
        { widgets, defs: Object.fromEntries(widgets.map((w) => [w.options.defId, kids(w.options.defId)])), editMode },
    );
    await page.waitForTimeout(1200);
};

const probe = (id) =>
    page.evaluate((id) => {
        const root = document.querySelector(`.aura-widget-${id}`);
        const box = root?.closest('.react-grid-item')?.getBoundingClientRect();
        const head = root?.querySelector('.aura-group-header')?.getBoundingClientRect();
        // The master control is the header's last .nodrag element (button, switch, slider).
        const ctls = root?.querySelectorAll('.aura-group-header .nodrag');
        const ctl = ctls?.length ? ctls[ctls.length - 1].getBoundingClientRect() : null;
        const kidsH = [...(root?.querySelectorAll('.react-grid-layout > .react-grid-item') ?? [])].map((k) =>
            Math.round(k.getBoundingClientRect().height),
        );
        return {
            box: box ? Math.round(box.height) : null,
            head: head ? Math.round(head.height) : null,
            headTop: head?.top ?? null,
            headBottom: head?.bottom ?? null,
            ctlTop: ctl?.top ?? null,
            ctlBottom: ctl?.bottom ?? null,
            kids: kidsH.join(','),
        };
    }, id);

for (const editMode of [false, true]) {
    console.log(`group action header — ${editMode ? 'editor' : 'frontend'}`);

    for (const { editorOnly, ...action } of ACTIONS) {
        if (editorOnly && !editMode) continue;
        const label = action.groupActionType;
        await show(
            [
                group('gmit', 0, { groupSwitch: true, headerItems, ...action }),
                group('gohne', 11, { groupSwitch: false, headerItems, ...action }),
            ],
            editMode,
        );
        const a = await probe('gmit');
        const b = await probe('gohne');
        check(a.ctlTop !== null, `${label}: master control rendered`);
        check(a.head === b.head, `${label}: header bar same height`, `${a.head} vs ${b.head}`);
        check(a.box === b.box, `${label}: group box same height`, `${a.box} vs ${b.box}`);
        check(a.kids === b.kids, `${label}: children same height`, `${a.kids} vs ${b.kids}`);

        await show([group('gbare', 0, { groupSwitch: true, showTitle: false, showIcon: false, ...action })], editMode);
        const c = await probe('gbare');
        check(
            c.ctlTop !== null && c.ctlTop >= c.headTop && c.ctlBottom <= c.headBottom,
            `${label}: control stays inside a bar without title and icon`,
            `ctl ${c.ctlTop?.toFixed(1)}–${c.ctlBottom?.toFixed(1)}, bar ${c.headTop?.toFixed(1)}–${c.headBottom?.toFixed(1)}`,
        );
    }
}

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
