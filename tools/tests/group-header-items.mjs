// UI test (#832): a group draws its header items in its own header bar.
//
//   • Title and icon off, header items set: the bar stays — with its divider — and the
//     children start below it instead of being pushed to the top edge.
//   • The items sit inside .aura-group-header, not in the frame's overlay strip that
//     followed the first child's title and jumped around with it.
//   • Title / icon colour from the header dialog paint the group's head only — the
//     children inside the same box keep their own colours.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5199    (or set AURA_BASE)
//   AURA_BASE=http://localhost:5199 node tools/tests/group-header-items.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5199';
const GID = 'grp';
const DEF = 'def-grp';
const children = [0, 1].map((i) => ({
    id: `${DEF}-c${i}`,
    type: 'value',
    title: `Kind ${i + 1}`,
    datapoint: 'demo.temp',
    layout: 'default',
    options: { unit: '°C', decimals: 0 },
    gridPos: { x: 0, y: i * 3, w: 9, h: 3 },
}));
const items = [
    { id: 'hi-1', source: 'text', slot: 'r1-left', text: 'Küche', icon: 'mdi:fridge', iconColor: '#00fffa' },
    { id: 'hi-2', source: 'dp', slot: 'r1-right', dp: 'demo.temp' },
];
const group = (options, title = '') => ({
    id: GID,
    type: 'group',
    title,
    datapoint: '',
    layout: 'default',
    options: { icon: 'Layers2', defId: DEF, ...options },
    gridPos: { x: 0, y: 0, w: 9, h: 8 },
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

const show = async (widget, editMode) => {
    await page.evaluate(
        ({ widget, children, def, editMode }) => {
            localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 }));
            window.__auraShot.mock({ 'demo.temp': 21 });
            window.__auraShot.groupDefs({ [def]: children });
            window.__auraShot.showWidgets([widget], { editMode, gridRowHeight: 20, gridSnapX: 20, gridGap: 10 });
        },
        { widget, children, def: DEF, editMode },
    );
    await page.waitForTimeout(800);
};

const probe = () =>
    page.evaluate(
        ({ gid, def }) => {
            const root = document.querySelector(`.aura-widget-${gid}`);
            const head = root?.querySelector('.aura-group-header');
            const hb = head?.getBoundingClientRect();
            const kid = root?.querySelector('.react-grid-layout > .react-grid-item')?.getBoundingClientRect();
            const left = root?.querySelector('[data-header-slot="r1-left"]');
            const own = (el) => (el ? getComputedStyle(el).color : null);
            return {
                head: !!head,
                border: head ? getComputedStyle(head).borderBottomStyle : null,
                headBottom: hb ? Math.round(hb.bottom) : null,
                kidTop: kid ? Math.round(kid.top) : null,
                slotInHead: !!left && !!head?.contains(left),
                leftTop: left ? Math.round(left.getBoundingClientRect().top) : null,
                strips: [...(root?.querySelectorAll('[data-header-strip]') ?? [])].filter(
                    (s) => s.closest('[data-header-host]') === root?.querySelector('[data-header-host]'),
                ).length,
                groupTitle: own(head?.querySelector('.aura-widget-title')),
                groupIcon: own(head?.querySelector('.aura-widget-icon')),
                kidTitle: own(root?.querySelector(`.aura-widget-${def}-c0 .aura-widget-title`)),
            };
        },
        { gid: GID, def: DEF },
    );

for (const editMode of [false, true]) {
    console.log(`group header items — ${editMode ? 'editor' : 'frontend'}`);

    // 1. Title and icon off, only header items (the report's setup).
    await show(group({ showIcon: false, showTitle: false, headerItems: items }), editMode);
    const a = await probe();
    check(a.head, 'header bar stays for header items');
    check(a.border === 'solid', 'divider under the bar', a.border);
    check(a.slotInHead, 'row-1 items drawn inside the group header');
    check(a.strips === 0, 'no overlay strip on the group', String(a.strips));
    check(
        a.kidTop !== null && a.headBottom !== null && a.kidTop >= a.headBottom,
        'children start below the bar',
        `${a.kidTop} vs ${a.headBottom}`,
    );
    await page.waitForTimeout(1200);
    const a2 = await probe();
    check(a2.leftTop === a.leftTop, 'row 1 stays in place', `${a.leftTop} → ${a2.leftTop}`);

    // 2. Own title / icon colour reach the head, not the children.
    await show(group({ titleColor: '#ff0000', iconColor: '#00ff00', headerItems: items }, 'Küche'), editMode);
    const b = await probe();
    check(b.groupTitle === 'rgb(255, 0, 0)', 'group title takes titleColor', b.groupTitle);
    check(b.groupIcon === 'rgb(0, 255, 0)', 'group icon takes iconColor', b.groupIcon);
    check(!!b.kidTitle && b.kidTitle !== 'rgb(255, 0, 0)', 'child title keeps its colour', b.kidTitle);
}

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
