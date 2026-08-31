// Verifies that every in-app copy re-issues widget ids (issue #606) —
// utils/widgetCopy.ts driving the copy paths of store/dashboardStore.ts.
//
//   node tools/tests/widget-copy.mjs
//
// No dev server needed: esbuild bundles the real dashboard + group-def stores and
// the test drives their actions directly. persistManager and popupConfigStore are
// stubbed away — they boot the ioBroker connection and nothing here saves.
//
// What matters here: a copied tab / section / layout never repeats a widget id
// (that is what made the widget picker mark five widgets at once), group children
// are re-issued too, click actions inside the copy follow the copies instead of
// the originals, and the repair pass fixes dashboards copied before the fix.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-widget-copy-${process.pid}.mjs`);
await build({
    stdin: {
        contents: [
            "export { useDashboardStore } from './src-vis/store/dashboardStore.ts';",
            "export { useGroupDefsStore } from './src-vis/store/groupDefsStore.ts';",
            "export { copyWidget, copyWidgets, makeIdDeduper, remapWidgetRefs } from './src-vis/utils/widgetCopy.ts';",
        ].join('\n'),
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
    plugins: [
        {
            // The stores hang off the ioBroker persistence layer (socket, save
            // scheduling, dirty tracking). None of that is exercised here.
            name: 'stub-persistence',
            setup(b) {
                b.onResolve({ filter: /persistManager$/ }, (a) => ({ path: a.path, namespace: 'stub-persist' }));
                b.onLoad({ filter: /.*/, namespace: 'stub-persist' }, () => ({
                    contents: [
                        'const mem = new Map();',
                        'export const managedStorage = {',
                        '  getItem: (k) => mem.get(k) ?? null,',
                        '  setItem: (k, v) => mem.set(k, v),',
                        '  removeItem: (k) => mem.delete(k),',
                        '};',
                        'export const flushKey = () => {};',
                        'export const markDirty = () => {};',
                        'export const withSuppressedDirty = (fn) => fn();',
                        'export const registerExternalReader = () => {};',
                        'export const registerPreSaveHook = () => {};',
                        'export const isScreenshotMode = () => false;',
                    ].join('\n'),
                    loader: 'js',
                }));
                b.onResolve({ filter: /popupConfigStore$/ }, (a) => ({ path: a.path, namespace: 'stub-popup' }));
                b.onLoad({ filter: /.*/, namespace: 'stub-popup' }, () => ({
                    contents: 'export const usePopupConfigStore = { getState: () => ({ views: [] }) };',
                    loader: 'js',
                }));
            },
        },
    ],
});
const { useDashboardStore, useGroupDefsStore, copyWidget, copyWidgets, makeIdDeduper, remapWidgetRefs } = await import(
    pathToFileURL(bundle).href
);
rmSync(bundle, { force: true });

let pass = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
    if (cond) {
        pass++;
    } else {
        fail++;
        console.error(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`);
    }
};

// ── fixtures ──────────────────────────────────────────────────────────────────

const widget = (id, patch = {}) => ({
    id,
    type: 'value',
    layout: 'default',
    title: id,
    datapoint: `demo.${id}`,
    gridPos: { x: 0, y: 0, w: 10, h: 10 },
    options: {},
    ...patch,
});

const tab = (id, widgets) => ({ id, name: id, slug: id, widgets, conditions: undefined });

/** Every widget id in the whole store, group-def children included. */
function allWidgetIds() {
    const ids = [];
    for (const l of useDashboardStore.getState().layouts) {
        for (const sec of l.sections) {
            for (const t of sec.tabs) {
                for (const w of t.widgets) {
                    ids.push(w.id);
                }
            }
        }
    }
    for (const children of Object.values(useGroupDefsStore.getState().defs)) {
        for (const c of children) {
            ids.push(c.id);
        }
    }
    return ids;
}

const dup = (arr) => arr.filter((v, i) => arr.indexOf(v) !== i);

function seed() {
    useGroupDefsStore.setState({ defs: { 'gd-src': [widget('child-1'), widget('child-2')] }, hydrated: true });
    useDashboardStore.setState({
        activeLayoutId: 'layout-1',
        layouts: [
            {
                id: 'layout-1',
                name: 'L1',
                slug: 'l1',
                activeSectionId: 'section-1',
                sections: [
                    {
                        id: 'section-1',
                        name: 'S1',
                        slug: 's1',
                        activeTabId: 'tab-1',
                        tabs: [
                            tab('tab-1', [
                                widget('w-1', {
                                    type: 'group',
                                    options: { defId: 'gd-src' },
                                }),
                                widget('w-2', {
                                    // click action inside the copied set → must follow the copy
                                    options: { clickAction: { kind: 'popup-widget', widgetId: 'w-1' } },
                                }),
                                widget('w-3', {
                                    // reference to a widget OUTSIDE the copied tab → must stay
                                    options: { clickAction: { kind: 'popup-widget', widgetId: 'w-9' } },
                                }),
                            ]),
                            tab('tab-2', [widget('w-9')]),
                        ],
                    },
                    {
                        id: 'section-2',
                        name: 'S2',
                        slug: 's2',
                        activeTabId: 'tab-3',
                        tabs: [tab('tab-3', [widget('w-5')])],
                    },
                ],
            },
            {
                id: 'layout-2',
                name: 'L2',
                slug: 'l2',
                activeSectionId: 'section-9',
                sections: [{ id: 'section-9', name: 'S9', slug: 's9', activeTabId: 'tab-9', tabs: [tab('tab-9', [])] }],
            },
        ],
    });
}

const tabOf = (layoutId, sectionId, idx) => {
    const l = useDashboardStore.getState().layouts.find((x) => x.id === layoutId);
    const sec = l.sections.find((s) => s.id === sectionId);
    return sec.tabs[idx < 0 ? sec.tabs.length + idx : idx];
};

// ── 1) copy a tab into the same section (the reported case) ───────────────────

console.log('Tab kopieren (gleicher Bereich)');
seed();
useDashboardStore.getState().moveTabToSection('tab-1', 'layout-1', 'section-1', 'layout-1', 'section-1', 'copy');
{
    const src = tabOf('layout-1', 'section-1', 0);
    const copy = tabOf('layout-1', 'section-1', -1);
    check('tab is copied', copy.widgets.length === 3, `got ${copy.widgets.length}`);
    check('no widget id repeats anywhere', dup(allWidgetIds()).length === 0, dup(allWidgetIds()).join(', '));
    check(
        'every copied widget has a new id',
        copy.widgets.every((w, i) => w.id !== src.widgets[i].id),
    );
    check(
        'copied ids keep the w- prefix',
        copy.widgets.every((w) => w.id.startsWith('w-')),
    );
    check('source tab is untouched', src.widgets.map((w) => w.id).join() === 'w-1,w-2,w-3');
    check(
        'in-copy click action points at the copy',
        copy.widgets[1].options.clickAction.widgetId === copy.widgets[0].id,
        copy.widgets[1].options.clickAction.widgetId,
    );
    check('outside reference is left alone', copy.widgets[2].options.clickAction.widgetId === 'w-9');

    const srcDef = useGroupDefsStore.getState().defs['gd-src'];
    const copyDefId = copy.widgets[0].options.defId;
    const copyDef = useGroupDefsStore.getState().defs[copyDefId];
    check('group def is cloned', copyDefId !== 'gd-src' && !!copyDef);
    check(
        'group children get new ids',
        copyDef.every((c, i) => c.id !== srcDef[i].id),
    );
    check(
        'group children keep the child- prefix',
        copyDef.every((c) => c.id.startsWith('child-')),
    );
    check('source group def is untouched', srcDef.map((c) => c.id).join() === 'child-1,child-2');
}

// ── 2) copy a tab into another section ────────────────────────────────────────

console.log('Tab kopieren (anderer Bereich)');
seed();
useDashboardStore.getState().moveTabToSection('tab-1', 'layout-1', 'section-1', 'layout-1', 'section-2', 'copy');
check('no widget id repeats anywhere', dup(allWidgetIds()).length === 0, dup(allWidgetIds()).join(', '));
check('source tab still exists', tabOf('layout-1', 'section-1', 0).widgets.length === 3);

// ── 3) moving a tab keeps its ids ─────────────────────────────────────────────

console.log('Tab verschieben');
seed();
useDashboardStore.getState().moveTabToSection('tab-1', 'layout-1', 'section-1', 'layout-1', 'section-2', 'move');
{
    const moved = tabOf('layout-1', 'section-2', -1);
    check('move keeps the widget ids', moved.widgets.map((w) => w.id).join() === 'w-1,w-2,w-3');
    check('move keeps the group def', moved.widgets[0].options.defId === 'gd-src');
}

// ── 4) duplicate a section / a layout ─────────────────────────────────────────

console.log('Bereich duplizieren');
seed();
useDashboardStore.getState().duplicateSection('section-1', 'S1 Kopie');
check('no widget id repeats anywhere', dup(allWidgetIds()).length === 0, dup(allWidgetIds()).join(', '));
{
    const sec = useDashboardStore.getState().layouts[0].sections.at(-1);
    const copiedTab1 = sec.tabs[0];
    const copiedTab2 = sec.tabs[1];
    check(
        'cross-tab reference inside the duplicate follows the copy',
        copiedTab1.widgets[2].options.clickAction.widgetId === copiedTab2.widgets[0].id,
        copiedTab1.widgets[2].options.clickAction.widgetId,
    );
}

console.log('Layout duplizieren');
seed();
useDashboardStore.getState().duplicateLayout('layout-1', 'L1 Kopie');
check('no widget id repeats anywhere', dup(allWidgetIds()).length === 0, dup(allWidgetIds()).join(', '));

console.log('Bereich in anderes Layout kopieren');
seed();
useDashboardStore.getState().moveSectionToLayout('section-1', 'layout-1', 'layout-2', 'copy');
check('no widget id repeats anywhere', dup(allWidgetIds()).length === 0, dup(allWidgetIds()).join(', '));

// ── 5) single widget copy ─────────────────────────────────────────────────────

console.log('Einzelnes Widget kopieren');
seed();
{
    const src = tabOf('layout-1', 'section-1', 0).widgets[0];
    const copy = copyWidget(src);
    check('fresh id', copy.id !== src.id && copy.id.startsWith('w-'));
    check('fresh group def', copy.options.defId !== 'gd-src');
    check(
        'group children re-issued',
        useGroupDefsStore.getState().defs[copy.options.defId].every((c) => !['child-1', 'child-2'].includes(c.id)),
    );

    const a = copyWidget(src);
    const b = copyWidget(src);
    check('two copies in the same millisecond differ', a.id !== b.id, `${a.id} / ${b.id}`);

    const forView = copyWidget(src, 'pw-42');
    check('explicit id wins', forView.id === 'pw-42');

    const timer = copyWidget(
        widget('w-t', { type: 'timer', options: { events: [{ id: 't_1' }], stateBaseId: 'aura.0.timers.w-t' } }),
    );
    check('timer events re-issued', timer.options.events[0].id !== 't_1');
    check('timer stateBaseId dropped', timer.options.stateBaseId === undefined);
}

// ── 6) reference remapping helper ─────────────────────────────────────────────

console.log('Referenzen umschreiben');
{
    const map = new Map([['w-1', 'w-new']]);
    const src = {
        options: {
            entries: [{ clickAction: { kind: 'popup-widget', widgetId: 'w-1' } }, { clickAction: { kind: 'none' } }],
            items: [{ clickAction: { kind: 'link-widget', layoutId: 'l', tabId: 't', widgetId: 'w-1' } }],
        },
    };
    const out = remapWidgetRefs(src, map);
    check('nested list entry remapped', out.options.entries[0].clickAction.widgetId === 'w-new');
    check('nested carousel item remapped', out.options.items[0].clickAction.widgetId === 'w-new');
    check('untouched branches keep their identity', out.options.entries[1] === src.options.entries[1]);
    check('empty map is a no-op', remapWidgetRefs(src, new Map()) === src);
}

// ── 7) repair pass for dashboards copied before the fix ───────────────────────

console.log('Reparatur bestehender Duplikate');
{
    const dedupe = makeIdDeduper();
    const first = dedupe([widget('w-1'), widget('w-2')]);
    const second = dedupe([widget('w-1'), widget('w-3')]);
    const third = dedupe([widget('w-1')]);
    check('untouched list keeps its identity', first[0].id === 'w-1' && first[1].id === 'w-2');
    check('first twin keeps the id', second[1].id === 'w-3');
    check('later twin is re-issued', second[0].id === 'w-1-2', second[0].id);
    check('and again for the third', third[0].id === 'w-1-3', third[0].id);
    // Same input, second run: the suffix must come out identical, otherwise every
    // reload would hand the twins new ids until the dashboard is saved again.
    const again = makeIdDeduper();
    again([widget('w-1'), widget('w-2')]);
    check('repair is deterministic', again([widget('w-1'), widget('w-3')])[0].id === 'w-1-2');
}

// ── 8) copyWidgets keeps a list self-consistent ───────────────────────────────

console.log('Widget-Liste kopieren');
{
    const list = [widget('a'), widget('b', { options: { clickAction: { kind: 'popup-widget', widgetId: 'a' } } })];
    const copies = copyWidgets(list);
    check('reference inside the list follows the copy', copies[1].options.clickAction.widgetId === copies[0].id);
    check('originals untouched', list[1].options.clickAction.widgetId === 'a');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
