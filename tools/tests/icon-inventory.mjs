// Icon inventory of a layout (#290) — the list a device without internet
// preloads right after start.
//
//   node tools/tests/icon-inventory.mjs
//
// Icons sit all over the config: widget options, custom-grid cells, list
// entries, state maps, badges, tab and section headers, menu and header items,
// popup views, group children. The inventory walks the JSON generically, so
// these checks pin what it must find, what it must NOT mistake for an icon, and
// which legacy PascalCase names it converts. No dev server — pure logic,
// bundled with esbuild.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-icon-inventory-${process.pid}.mjs`);
await build({
    stdin: {
        contents: [
            "export { collectIconIds, collectLayoutIconIds } from './src-vis/utils/iconInventory.ts';",
            "export { isIconifyId, lucidePascalToIconify } from './src-vis/utils/iconId.ts';",
        ].join('\n'),
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { collectIconIds, collectLayoutIconIds, isIconifyId, lucidePascalToIconify } = await import(
    pathToFileURL(bundle).href
);
rmSync(bundle, { force: true });

let failed = 0;
const check = (label, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : ` — ${detail}`}`);
    if (!ok) failed++;
};
const has = (label, set, id) => check(label, set.has(id), `missing ${id} in ${JSON.stringify([...set])}`);
const lacks = (label, set, id) => check(label, !set.has(id), `${id} must not be in ${JSON.stringify([...set])}`);

// ── 1. what counts as an icon id ───────────────────────────────────────────────
check('id: lucide:zap-off', isIconifyId('lucide:zap-off'));
check('id: mdi:garage-open', isIconifyId('mdi:garage-open'));
check('id: a time is not an icon set', !isIconifyId('08:30'));
check('id: a datapoint is not an icon', !isIconifyId('aura.0.config.dashboard'));
check('id: a template is not an icon', !isIconifyId('{value}:{unit}'));
check('id: PascalCase is not a full id', !isIconifyId('ZapOff'));
check('id: uppercase prefix rejected', !isIconifyId('MDI:garage'));
check('id: empty name rejected', !isIconifyId('mdi:'));
check('legacy: ZapOff → lucide:zap-off', lucidePascalToIconify('ZapOff') === 'lucide:zap-off');
check('legacy: full id passes through', lucidePascalToIconify('mdi:home') === 'mdi:home');

// ── 2. the walk finds icons wherever they sit ──────────────────────────────────
{
    const set = collectIconIds({
        type: 'universal',
        title: 'Garage',
        datapoint: 'demo.garage.STATE',
        options: {
            showIcon: true,
            icon: 'mdi:garage',
            iconColor: 'Red', // a colour name under an icon-ish key is not an icon
            iconSize: 24,
            customGrid: {
                cells: [
                    {
                        type: 'state-icon',
                        dpId: 'demo.plug.STATE',
                        trueIcon: 'lucide:lightbulb',
                        falseIcon: 'lucide:lightbulb-off',
                    },
                    { type: 'icon', iconName: 'mdi:car-electric' },
                ],
            },
            entries: [
                { id: 'e1', icon: 'ZapOff', label: 'Legacy name' },
                { id: 'e2', icon: 'Home' },
                { id: 'e3', label: 'Opening hours 08:30' },
            ],
            stateMap: [{ value: 'on', icon: 'mdi:power', label: 'on:off' }],
            badges: [{ icon: 'lucide:bell' }],
            valueTemplate: '{value}:{unit}',
            customCSS: '.x { content: "mdi:not-an-icon-in-css"; }',
        },
    });
    has('walk: widget icon', set, 'mdi:garage');
    has('walk: state-icon true', set, 'lucide:lightbulb');
    has('walk: state-icon false (never rendered while true)', set, 'lucide:lightbulb-off');
    has('walk: cell iconName', set, 'mdi:car-electric');
    has('walk: legacy PascalCase under icon key converted', set, 'lucide:zap-off');
    has('walk: legacy single word converted', set, 'lucide:home');
    has('walk: stateMap icon', set, 'mdi:power');
    has('walk: badge icon', set, 'lucide:bell');
    lacks('walk: colour name is not an icon', set, 'lucide:red');
    lacks('walk: time text is not an icon', set, '08:30');
    lacks('walk: CSS blob is not an icon', set, 'mdi:not-an-icon-in-css');
    // `on:off` matches the id shape — accepted on purpose (one harmless 404),
    // documented here so a change in that trade-off is a conscious one.
    has('walk: on:off is accepted (documented false positive)', set, 'on:off');
    check('walk: nothing else slipped in', set.size === 9, JSON.stringify([...set]));
}

// ── 3. the layout inventory: tree + frame + popups + group children ───────────
{
    const layout = {
        id: 'l1',
        name: 'Tablet',
        slug: 'tablet',
        icon: 'mdi:tablet',
        activeSectionId: 's1',
        settings: {
            iconsOffline: true,
            layoutDrawerItems: [{ id: 'm1', type: 'text', icon: 'lucide:info' }],
        },
        sections: [
            {
                id: 's1',
                name: 'Living',
                slug: 'living',
                icon: 'Sofa',
                activeTabId: 't1',
                tabs: [
                    {
                        id: 't1',
                        name: 'Lights',
                        slug: 'lights',
                        icon: 'lucide:lightbulb',
                        widgets: [
                            {
                                id: 'w1',
                                type: 'light',
                                datapoint: 'demo.l1',
                                gridPos: { x: 0, y: 0, w: 2, h: 2 },
                                options: { icon: 'mdi:ceiling-light' },
                            },
                            { id: 'g1', type: 'group', gridPos: { x: 0, y: 2, w: 4, h: 4 }, options: {} },
                        ],
                    },
                    { id: 't2', name: 'Hidden', slug: 'hidden', hidden: true, icon: 'mdi:weather-sunset', widgets: [] },
                ],
            },
        ],
    };
    const frontend = {
        tabBar: { items: [{ id: 'tb1', type: 'clock', icon: 'lucide:clock' }] },
        layoutDrawerItems: [],
        headerItems: [{ id: 'h1', type: 'datapoint', icon: 'mdi:thermometer' }],
    };
    const popupViews = [
        { id: 'p1', name: 'Popup', widgets: [{ id: 'pw', type: 'universal', options: { icon: 'mdi:popup-icon' } }] },
    ];
    const groupDefs = {
        g1: [{ id: 'c1', type: 'switch', options: { icon: 'mdi:group-child' } }],
        'other-layout-group': [{ id: 'c2', type: 'switch', options: { icon: 'mdi:foreign-child' } }],
    };

    const ids = collectLayoutIconIds({ layout, frontend, popupViews, groupDefs });
    const set = new Set(ids);
    has('layout: layout icon', set, 'mdi:tablet');
    has('layout: section legacy icon', set, 'lucide:sofa');
    has('layout: tab icon', set, 'lucide:lightbulb');
    has('layout: hidden tab icon (never in the bar)', set, 'mdi:weather-sunset');
    has('layout: widget option icon', set, 'mdi:ceiling-light');
    has('layout: own menu override item', set, 'lucide:info');
    has('layout: global tab-bar item', set, 'lucide:clock');
    has('layout: global header item', set, 'mdi:thermometer');
    has('layout: popup view widget', set, 'mdi:popup-icon');
    has('layout: children of a group on this layout', set, 'mdi:group-child');
    lacks("layout: children of another layout's group stay out", set, 'mdi:foreign-child');
    check('layout: sorted, no duplicates', JSON.stringify(ids) === JSON.stringify([...new Set(ids)].sort()));

    const bare = collectLayoutIconIds({ layout: null, frontend: null, popupViews: null, groupDefs: null });
    check('layout: nothing in → empty list', Array.isArray(bare) && bare.length === 0);
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
