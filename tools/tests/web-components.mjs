// ioBroker web components (@iobroker/web-components) in the webcomponent widget:
// the socket bridge, the theme from Aura's variables, the typed settings, the
// hidden/disabled expressions of the settings form and where iob-navigate leads.
//
//   node tools/tests/web-components.mjs
//
// No dev server needed - utils/webComponentHost.ts is free of React and of the
// live socket and is bundled with esbuild.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-web-components-${process.pid}.mjs`);
await build({
    entryPoints: [join(process.cwd(), 'src-vis/utils/webComponentHost.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const m = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

let failed = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) {
        failed++;
    }
    console.log(
        `${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` - got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`,
    );
}
const tick = () => new Promise((r) => setTimeout(r, 0));

// ── socket bridge ───────────────────────────────────────────────────────────
function fakeApi() {
    const log = [];
    const subs = new Map(); // id -> Set(cb)
    return {
        log,
        subs,
        emit(id, state) {
            for (const cb of subs.get(id) ?? []) {
                cb(state);
            }
        },
        api: {
            subscribeState(id, cb) {
                log.push(['sub', id]);
                if (!subs.has(id)) {
                    subs.set(id, new Set());
                }
                subs.get(id).add(cb);
                return () => {
                    log.push(['unsub', id]);
                    subs.get(id)?.delete(cb);
                };
            },
            getState: async (id) => ({ val: `state of ${id}` }),
            setState: async (id, val, ack) => {
                log.push(['set', id, val, ack]);
            },
            getObject: async (id) => ({ _id: id }),
            getHistory: async () => [],
            getObjectView: async (type, start, end) => ({ [`${type}|${start}|${end}`]: 1 }),
            sendTo: async (instance, command, data) => ({ instance, command, data }),
        },
    };
}

{
    const f = fakeApi();
    const socket = m.createWebComponentSocket(f.api, 'de');
    check('socket: systemLang', socket.systemLang, 'de');

    const got = [];
    const a = (id, state) => got.push(['a', id, state?.val]);
    const b = (id, state) => got.push(['b', id, state?.val]);
    await socket.subscribeState(['x.0.one', 'x.0.two'], a);
    await socket.subscribeState('x.0.one', a); // the same callback again: no second subscription
    await socket.subscribeState('x.0.one', b);
    check(
        'socket: one subscription per id and callback',
        f.log.filter((e) => e[0] === 'sub'),
        [
            ['sub', 'x.0.one'],
            ['sub', 'x.0.two'],
            ['sub', 'x.0.one'],
        ],
    );
    f.emit('x.0.one', { val: 1 });
    f.emit('x.0.two', { val: 2 });
    check('socket: the callback gets id and state', got, [
        ['a', 'x.0.one', 1],
        ['b', 'x.0.one', 1],
        ['a', 'x.0.two', 2],
    ]);

    got.length = 0;
    socket.unsubscribeState('x.0.one', a);
    f.emit('x.0.one', { val: 3 });
    check('socket: unsubscribing one callback leaves the other', got, [['b', 'x.0.one', 3]]);

    got.length = 0;
    socket.unsubscribeState(['x.0.one', 'x.0.two']);
    f.emit('x.0.one', { val: 4 });
    f.emit('x.0.two', { val: 4 });
    check('socket: unsubscribing without a callback drops all', got, []);
    check(
        'socket: every subscription was ended',
        [...f.subs.values()].every((s) => s.size === 0),
        true,
    );

    f.log.length = 0;
    await socket.setState('x.0.one', { val: 7, ack: true });
    await socket.setState('x.0.one', 8);
    await socket.setState('x.0.one', false, true);
    await socket.setState('x.0.one', { val: 'on' }, true);
    check('socket: setState with a value or a { val, ack } object', f.log, [
        ['set', 'x.0.one', 7, true],
        ['set', 'x.0.one', 8, false],
        ['set', 'x.0.one', false, true],
        ['set', 'x.0.one', 'on', true],
    ]);

    check('socket: getState passes through', await socket.getState('x.0.one'), { val: 'state of x.0.one' });
    check(
        'socket: getObjectViewSystem reads to the end of the range',
        await socket.getObjectViewSystem('instance', 'system.adapter.'),
        { 'instance|system.adapter.|\u9999': 1 },
    );
    check('socket: sendTo passes through', await socket.sendTo('flow.0', 'list', { a: 1 }), {
        instance: 'flow.0',
        command: 'list',
        data: { a: 1 },
    });

    // Objects without object events: the current object once
    const objs = [];
    const oc = (id, obj) => objs.push([id, obj?._id]);
    await socket.subscribeObject('x.0.one', oc);
    await tick();
    check('socket: subscribeObject without events delivers the object once', objs, [['x.0.one', 'x.0.one']]);
    objs.length = 0;
    // a read that answers late: the component has unsubscribed by then
    f.api.getObject = (id) => new Promise((r) => setTimeout(() => r({ _id: id }), 5));
    await socket.subscribeObject('x.0.two', oc);
    await socket.unsubscribeObject('x.0.two', oc);
    await new Promise((r) => setTimeout(r, 20));
    check('socket: no object after unsubscribing', objs, []);
}

// ── theme ───────────────────────────────────────────────────────────────────
{
    const vars = {
        '--accent': '#3b82f6',
        '--accent-yellow': '#eab308',
        '--app-bg': '#0f172a',
        '--widget-bg': ' #1e293b ',
        '--text-primary': '#f8fafc',
        '--text-secondary': '#94a3b8',
        '--widget-border': '#334155',
        '--accent-red': '#ef4444',
        '--accent-green': '#22c55e',
        '--widget-radius': '12px',
    };
    const theme = m.themeFromVars((n) => vars[n] ?? '', true, ' Inter, sans-serif ');
    check('theme: type', theme.type, 'dark');
    check(
        'theme: accent is primary, Aura colors carried over',
        [theme.primary, theme.background, theme.paper],
        ['#3b82f6', '#0f172a', '#1e293b'],
    );
    check('theme: text colors', [theme.text, theme.textSecondary, theme.divider], ['#f8fafc', '#94a3b8', '#334155']);
    check(
        'theme: state colors',
        [theme.error, theme.warning, theme.success, theme.info],
        ['#ef4444', '#eab308', '#22c55e', '#3b82f6'],
    );
    check('theme: font', theme.fontFamily, 'Inter, sans-serif');
    check('theme: radius in px', theme.borderRadius, 12);
    const rem = m.themeFromVars((n) => (n === '--widget-radius' ? '0.75rem' : ''), false, '', 16);
    check('theme: radius in rem becomes px (Aura gives 0.75rem)', rem.borderRadius, 12);
    const calc = m.themeFromVars((n) => (n === '--widget-radius' ? 'calc(1rem + 2px)' : ''), false);
    check('theme: a radius that is no plain length keeps the default', typeof calc.borderRadius, 'number');

    const empty = m.themeFromVars(() => '', false);
    check(
        'theme: without variables the defaults fill in',
        [empty.type, typeof empty.primary, typeof empty.paper],
        ['light', 'string', 'string'],
    );
}

// ── settings ────────────────────────────────────────────────────────────────
const manifest = {
    manifestVersion: 1,
    tag: 'iob-test-tile',
    name: 'Test',
    module: 'test.js',
    settings: {
        type: 'panel',
        items: {
            head: { type: 'header', text: 'Datapoint' },
            oid: { type: 'objectId' },
            mode: { type: 'select', default: 'a', options: [{ value: 'a', label: 'A' }] },
            digits: { type: 'number', default: 1 },
            showUnit: { type: 'checkbox', default: true },
            note: { type: 'text', hidden: 'data.mode !== "b"' },
        },
    },
};
check(
    'settings: defaults, stored values typed by the manifest, unknown keys dropped',
    m.typedSettings(manifest, { oid: 'x.0.one', digits: '2', showUnit: false, other: 1 }),
    { oid: 'x.0.one', mode: 'a', digits: 2, showUnit: false },
);
check('settings: nothing stored -> the defaults', m.typedSettings(manifest, undefined), {
    mode: 'a',
    digits: 1,
    showUnit: true,
});

check('expr: hidden while the condition holds', m.evalSettingExpr('data.mode !== "b"', { mode: 'a' }), true);
check('expr: visible otherwise', m.evalSettingExpr('data.mode !== "b"', { mode: 'b' }), false);
check('expr: no expression', m.evalSettingExpr(undefined, {}), false);
check('expr: a broken expression counts as false', m.evalSettingExpr('data.(', {}), false);
check('expr: a throwing expression counts as false', m.evalSettingExpr('data.x.y', {}), false);

// ── iob-navigate ────────────────────────────────────────────────────────────
const layouts = [
    {
        id: 'L1',
        slug: 'home',
        sections: [
            {
                id: 'S1',
                slug: 'main',
                tabs: [
                    { id: 't1', name: 'Wohnzimmer', slug: 'wohnzimmer' },
                    { id: 't2', name: 'Küche', slug: 'kueche' },
                ],
            },
            { id: 'S2', slug: 'more', tabs: [{ id: 't3', name: 'Küche', slug: 'kueche-2' }] },
        ],
    },
    { id: 'L2', slug: 'other', sections: [{ id: 'S9', slug: 'x', tabs: [{ id: 't9', name: 'Bad', slug: 'bad' }] }] },
];
check('navigate: by slug', m.findTabForView('wohnzimmer', layouts, 'L1', 'S1'), {
    layoutId: 'L1',
    sectionId: 'S1',
    tabId: 't1',
});
check('navigate: by name, case-insensitive', m.findTabForView(' KÜCHE ', layouts, 'L1', 'S1'), {
    layoutId: 'L1',
    sectionId: 'S1',
    tabId: 't2',
});
check('navigate: the active section first', m.findTabForView('Küche', layouts, 'L1', 'S2'), {
    layoutId: 'L1',
    sectionId: 'S2',
    tabId: 't3',
});
check('navigate: by id', m.findTabForView('t3', layouts, 'L1', 'S1'), {
    layoutId: 'L1',
    sectionId: 'S2',
    tabId: 't3',
});
check('navigate: only the active layout', m.findTabForView('bad', layouts, 'L1', 'S1'), null);
check('navigate: unknown view', m.findTabForView('nowhere', layouts, 'L1'), null);
check('navigate: no view', m.findTabForView(undefined, layouts, 'L1'), null);

// ── the "add widget" dialog: every component an entry of its own ────────────
{
    const flow = {
        url: 'http://host:8082/adapter/flow/webcomponents/flow-diagram.json',
        adapter: 'flow',
        version: '0.1.0',
        moduleUrl: 'http://host:8082/adapter/flow/webcomponents/flow-diagram.js',
        manifest: {
            manifestVersion: 1,
            tag: 'iob-flow-diagram',
            name: { en: 'Flow diagram', de: 'Fluss-Diagramm' },
            description: { en: 'Animated flow diagram', de: 'Animiertes Fluss-Diagramm' },
            icon: '../flow.svg',
            size: { width: 480, height: 340 },
            settings: { type: 'panel', items: {} },
        },
    };
    const bare = {
        url: 'http://host:8082/adapter/other/wc/tile.json',
        adapter: 'other',
        version: '1.0.0',
        moduleUrl: 'http://host:8082/adapter/other/wc/tile.js',
        manifest: { manifestVersion: 1, tag: 'iob-other-tile', name: { fr: 'Tuile' }, settings: { items: {} } },
    };
    const entries = m.webComponentPickerEntries([flow, flow, bare, { adapter: 'x', manifest: {} }, null], 'de');
    check('entries: once per adapter and tag, without a tag none', entries.length, 2);
    check('entry: key', entries[0].key, 'wc:flow|iob-flow-diagram');
    check('entry: name in the frontend language', entries[0].label, 'Fluss-Diagramm');
    check('entry: description and adapter as hint', entries[0].hint, 'Animiertes Fluss-Diagramm – Adapter flow');
    check('entry: icon relative to the manifest', entries[0].iconUrl, 'http://host:8082/adapter/flow/flow.svg');
    check('entry: preferred size', entries[0].size, { width: 480, height: 340 });
    check('entry: no name in the language - another one', entries[1].label, 'Tuile');
    check(
        'entry: no name at all - the tag',
        m.webComponentPickerEntries([{ ...bare, manifest: { ...bare.manifest, name: undefined } }], 'de')[0].label,
        'iob-other-tile',
    );
    check('entry: no description - only the adapter', entries[1].hint, 'Adapter other');
    check('entry: no icon, no size', [entries[1].iconUrl, entries[1].size], [undefined, undefined]);
    check('entries: English frontend', m.webComponentPickerEntries([flow], 'en')[0].label, 'Flow diagram');
    check('entries: installed flow - no known entry on top', entries.filter((e) => e.missing).length, 0);

    // A known component is offered while its adapter is missing (#891)
    const none = m.webComponentPickerEntries([], 'de');
    check('known: offered without any adapter', none.length, 1);
    check('known: same key as the installed one', none[0].key, 'wc:flow|iob-flow-diagram');
    check('known: name in the frontend language', none[0].label, 'Fluss-Diagramm');
    check('known: marked missing', none[0].missing, true);
    check('known: hint names the missing adapter', none[0].hint.endsWith('Adapter flow (nicht installiert)'), true);
    check('known: preferred size', none[0].size, { width: 480, height: 340 });
    check('known: English', m.webComponentPickerEntries([], 'en')[0].label, 'Flow diagram');
    check(
        'known: after the installed ones',
        m.webComponentPickerEntries([bare], 'de').map((e) => e.tag),
        ['iob-other-tile', 'iob-flow-diagram'],
    );
    check('known: found by tag', m.findKnownWebComponent('iob-flow-diagram')?.adapter, 'flow');
    check('known: unknown tag', m.findKnownWebComponent('iob-other-tile'), undefined);

    // Title and "open large" of the flow diagram belong to Aura's widget frame
    check(
        'host settings: dropped for the flow diagram',
        m.withoutHostSettings({ diagram: 'flow.0.diagrams.a', title: 'x', fullView: true }, 'iob-flow-diagram', 'flow'),
        { diagram: 'flow.0.diagrams.a' },
    );
    check(
        'host settings: other components keep everything',
        m.withoutHostSettings({ title: 'x' }, 'iob-other-tile', 'other'),
        { title: 'x' },
    );

    check('key: parsed', m.parseWebComponentKey('wc:flow|iob-flow-diagram'), {
        adapter: 'flow',
        tag: 'iob-flow-diagram',
    });
    check('key: round trip', m.parseWebComponentKey(m.webComponentKey('a', 'b-c')), { adapter: 'a', tag: 'b-c' });
    check(
        'key: a widget type, a template id or garbage is none',
        ['webcomponent', 'shutter', 'wc:flow', 'wc:flow|', undefined, 7].map((k) => m.parseWebComponentKey(k)),
        [null, null, null, null, null, null],
    );

    const grid = { rowHeight: 20, snapX: 20, gap: 10, padding: 16 };
    // 480 + 2·16 = 512 px wide: (512 + 10) / 30 ≈ 17 columns; 340 + 32 = 372 px high: 382 / 30 ≈ 13 rows
    check('size: px to grid cells with the widget padding', m.webComponentGridSize({ width: 480, height: 340 }, grid), {
        w: 17,
        h: 13,
    });
    check('size: tiny stays at least 2×2', m.webComponentGridSize({ width: 1, height: 1 }, { ...grid, padding: 0 }), {
        w: 2,
        h: 2,
    });
    check(
        'size: none named - the type default applies',
        [m.webComponentGridSize(undefined, grid), m.webComponentGridSize({ width: 0, height: 100 }, grid)],
        [null, null],
    );
}

// ── object views: the ID of a row ───────────────────────────────────────────
check(
    'row of the config view (keyed by name): the object ID',
    m.objectIdOfRow({ id: '12V', value: { _id: 'flow.0.diagrams.12v', type: 'config', common: { name: '12V' } } }),
    'flow.0.diagrams.12v',
);
check('row keyed by ID: unchanged', m.objectIdOfRow({ id: 'a.0.b', value: { _id: 'a.0.b' } }), 'a.0.b');
check(
    'row without an object (e.g. the custom view): its key',
    [m.objectIdOfRow({ id: 'a.0.b', value: { enabled: true } }), m.objectIdOfRow({ id: 'a.0.c' })],
    ['a.0.b', 'a.0.c'],
);

if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
}
console.log('\nall web component checks passed');
