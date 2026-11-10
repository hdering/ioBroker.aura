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

    // Objects with object events (#946): every change reaches the component, until it unsubscribes
    const objectCbs = new Map();
    f.api.subscribeObject = (id, cb) => {
        objectCbs.set(id, cb);
        return () => objectCbs.delete(id);
    };
    await socket.subscribeObject('x.0.three', oc);
    objectCbs.get('x.0.three')?.({ _id: 'x.0.three', native: { v: 2 } });
    check('socket: subscribeObject hands on object changes', objs, [['x.0.three', 'x.0.three']]);
    await socket.unsubscribeObject('x.0.three', oc);
    check('socket: unsubscribeObject ends the object subscription', objectCbs.has('x.0.three'), false);
}

// ── object subscriptions by pattern: the bridge, then hooks/useIoBroker on a fake socket ──
{
    const subs = new Map(); // id or pattern -> cb
    const f = fakeApi();
    f.api.subscribeObject = (id, cb) => {
        subs.set(id, cb);
        return () => subs.delete(id);
    };
    const socket = m.createWebComponentSocket(f.api, 'en');
    const objs = [];
    const oc = (id, obj) => objs.push([id, obj === null ? null : obj?.v]);
    await socket.subscribeObject('system.adapter.*', oc);
    subs.get('system.adapter.*')({ v: 3 }, 'system.adapter.flow.0');
    subs.get('system.adapter.*')(null, 'system.adapter.flow.0');
    check('objects: a pattern calls back with the ID of the object', objs, [
        ['system.adapter.flow.0', 3],
        ['system.adapter.flow.0', null],
    ]);
    await socket.unsubscribeObject('system.adapter.*', oc);
    check('objects: a pattern unsubscribes through the host', subs.size, 0);
}
{
    // the real socket layer, bundled with a fake socket library in place of /socket.io/socket.io.js
    const ioBundle = join(cache, `aura-web-components-io-objects-${process.pid}.mjs`);
    await build({
        entryPoints: [join(process.cwd(), 'src-vis/hooks/useIoBroker.ts')],
        bundle: true,
        platform: 'node',
        format: 'esm',
        outfile: ioBundle,
        define: { 'import.meta.env.DEV': 'false' },
        logLevel: 'warning',
    });
    const sockets = [];
    globalThis.window ??= { location: { origin: 'http://aura.test', protocol: 'http:' } };
    globalThis.io = {
        connect() {
            const handlers = {};
            const sock = {
                connected: true,
                emitted: [],
                on(event, cb) {
                    (handlers[event] ??= []).push(cb);
                },
                emit(event, ...args) {
                    const cb = typeof args.at(-1) === 'function' ? args.pop() : null;
                    sock.emitted.push([event, ...args]);
                    if (cb && event === 'getObject') {
                        setTimeout(() => cb(null, { _id: args[0], common: { name: 'current' } }), 0);
                    }
                },
                disconnect() {},
                fire(event, ...args) {
                    for (const h of handlers[event] ?? []) {
                        h(...args);
                    }
                },
            };
            sockets.push(sock);
            return sock;
        },
    };
    const quiet = console.log;
    console.log = () => {}; // the connect banner
    const io = await import(pathToFileURL(ioBundle).href);
    rmSync(ioBundle, { force: true });
    const s = io.getSocket();
    s.fire('connect');
    console.log = quiet;
    const sent = (command) => s.emitted.filter((e) => e[0] === command).map((e) => e[1]);

    const got = [];
    const a = (obj, id) => got.push(['a', id, obj === null ? null : obj.common.name]);
    const b = (obj, id) => got.push(['b', id, obj === null ? null : obj.common.name]);
    const offA = io.subscribeObjectDirect('flow.0.diagrams.d1', a);
    const offP = io.subscribeObjectDirect('system.adapter.*', a);
    const offP2 = io.subscribeObjectDirect('system.adapter.*', b);
    check('io objects: one subscribeObjects per ID or pattern', sent('subscribeObjects'), [
        'flow.0.diagrams.d1',
        'system.adapter.*',
    ]);
    s.fire('objectChange', 'flow.0.diagrams.d1', { common: { name: 'changed' } });
    s.fire('objectChange', 'system.adapter.flow.0', { common: { name: 'instance' } });
    s.fire('objectChange', 'system.adapterX', { common: { name: 'no match' } });
    s.fire('objectChange', 'system.adapter.flow.0', null);
    check('io objects: exact and pattern subscribers get the ID of the object, deletion as null', got, [
        ['a', 'flow.0.diagrams.d1', 'changed'],
        ['a', 'system.adapter.flow.0', 'instance'],
        ['b', 'system.adapter.flow.0', 'instance'],
        ['a', 'system.adapter.flow.0', null],
        ['b', 'system.adapter.flow.0', null],
    ]);

    // a subscriber that throws does not keep the change from the others
    got.length = 0;
    const error = console.error;
    console.error = () => {};
    const offBad = io.subscribeObjectDirect('x.0.*', () => {
        throw new Error('broken component');
    });
    const offAfter = io.subscribeObjectDirect('x.0.one', a);
    const offAfterP = io.subscribeObjectDirect('x.0.*', a);
    s.fire('objectChange', 'x.0.one', { common: { name: 'x' } });
    console.error = error;
    check('io objects: a throwing subscriber leaves the others alone', got, [
        ['a', 'x.0.one', 'x'],
        ['a', 'x.0.one', 'x'],
    ]);
    offBad();
    offAfter();
    offAfterP();

    // reconnect: everything subscribed again; one object is handed out, a pattern names none to read
    got.length = 0;
    const sentBefore = s.emitted.length;
    console.log = () => {};
    s.fire('disconnect');
    s.fire('reconnect');
    console.log = quiet;
    await new Promise((r) => setTimeout(r, 5));
    const renewed = (command) =>
        s.emitted
            .slice(sentBefore)
            .filter((e) => e[0] === command)
            .map((e) => e[1]);
    check('io objects: every subscription renewed after a reconnect', renewed('subscribeObjects'), [
        'flow.0.diagrams.d1',
        'system.adapter.*',
    ]);
    check('io objects: after a reconnect only the object is read', renewed('getObject'), ['flow.0.diagrams.d1']);
    check('io objects: after a reconnect the object reaches its subscriber', got, [
        ['a', 'flow.0.diagrams.d1', 'current'],
    ]);

    // unsubscribing: the server hears it after the last subscriber of a pattern
    const before = sent('unsubscribeObjects').length;
    offP();
    check(
        'io objects: a pattern stays subscribed while a subscriber is left',
        sent('unsubscribeObjects').length,
        before,
    );
    offP2();
    offA();
    check('io objects: unsubscribed after the last one', sent('unsubscribeObjects').slice(before), [
        'system.adapter.*',
        'flow.0.diagrams.d1',
    ]);
    got.length = 0;
    s.fire('objectChange', 'system.adapter.flow.0', { common: { name: 'late' } });
    check('io objects: nothing after unsubscribing', got, []);
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

// ── wildcard state subscriptions: the pattern, the bridge, hooks/useIoBroker ──
{
    const patternBundle = join(cache, `aura-web-components-pattern-${process.pid}.mjs`);
    await build({
        entryPoints: [join(process.cwd(), 'src-vis/utils/idPattern.ts')],
        bundle: true,
        platform: 'node',
        format: 'esm',
        outfile: patternBundle,
        logLevel: 'warning',
    });
    const p = await import(pathToFileURL(patternBundle).href);
    rmSync(patternBundle, { force: true });
    const matches = (pattern, id) => p.idPatternToRegExp(pattern).test(id);
    check(
        'pattern: is one',
        ['a.0.x.*', '*.STATE', 'a.0.x'].map((id) => p.isIdPattern(id)),
        [true, true, false],
    );
    check(
        'pattern: * at the end covers everything below, dots included',
        [matches('a.0.x.*', 'a.0.x.y'), matches('a.0.x.*', 'a.0.x.y.z'), matches('a.0.x.*', 'a.0.xy')],
        [true, true, false],
    );
    check(
        'pattern: * in the middle, the rest literal and anchored',
        [
            matches('hm-rpc.0.*.STATE', 'hm-rpc.0.ABC.1.STATE'),
            matches('hm-rpc.0.*.STATE', 'hm-rpc.0.ABC.STATE_X'),
            matches('hm-rpc.0.*.STATE', 'xhm-rpc.0.A.STATE'),
        ],
        [true, false, false],
    );
    check(
        'pattern: regex characters of an ID are literal (js-controller pattern2RegEx)',
        [matches('a.0.(x)+$.*', 'a.0.(x)+$.y'), matches('a.0.x.*', 'a10x.y'), matches('*', 'anything')],
        [true, false, true],
    );
}
{
    // the bridge: a pattern calls back with the concrete ID; it has no state or object of its own
    const f = fakeApi();
    const reads = [];
    f.api.getState = async (id) => (reads.push(id), { val: id });
    f.api.getObject = async (id) => (reads.push(id), { _id: id });
    f.api.subscribeState = (id, cb) => {
        f.subs.set(id, new Set([cb]));
        return () => f.subs.get(id).delete(cb);
    };
    const socket = m.createWebComponentSocket(f.api, 'en');
    const got = [];
    const cb = (id, state) => got.push([id, state?.val]);
    await socket.subscribeState(['a.0.x.*', 'a.0.y'], cb);
    for (const fn of f.subs.get('a.0.x.*')) {
        fn({ val: 1 }, 'a.0.x.one');
    }
    for (const fn of f.subs.get('a.0.y')) {
        fn({ val: 2 }); // an exact subscription may leave the ID out
    }
    check('patterns: the bridge passes the ID of the state that changed', got, [
        ['a.0.x.one', 1],
        ['a.0.y', 2],
    ]);
    check(
        'patterns: no state and no object of a pattern, and no read for them',
        [await socket.getState('a.0.x.*'), await socket.getObject('a.0.x.*'), reads],
        [null, null, []],
    );
    socket.unsubscribeState('a.0.x.*', cb);
    check('patterns: unsubscribed through the bridge', f.subs.get('a.0.x.*').size, 0);
}
{
    // the real socket layer, bundled with a fake socket library in place of /socket.io/socket.io.js
    const ioBundle = join(cache, `aura-web-components-io-patterns-${process.pid}.mjs`);
    await build({
        entryPoints: [join(process.cwd(), 'src-vis/hooks/useIoBroker.ts')],
        bundle: true,
        platform: 'node',
        format: 'esm',
        outfile: ioBundle,
        define: { 'import.meta.env.DEV': 'false' },
        logLevel: 'warning',
    });
    const sockets = [];
    let serverValue = 1;
    globalThis.window ??= { location: { origin: 'http://aura.test', protocol: 'http:' } };
    globalThis.io = {
        connect() {
            const handlers = {};
            const sock = {
                connected: true,
                emitted: [],
                on(event, cb) {
                    (handlers[event] ??= []).push(cb);
                },
                emit(event, ...args) {
                    const cb = typeof args.at(-1) === 'function' ? args.pop() : null;
                    sock.emitted.push([event, ...args]);
                    if (cb && event === 'getState') {
                        setTimeout(() => cb(null, { val: serverValue, ack: true, ts: serverValue }), 0);
                    }
                },
                disconnect() {},
                fire(event, ...args) {
                    for (const h of handlers[event] ?? []) {
                        h(...args);
                    }
                },
            };
            sockets.push(sock);
            return sock;
        },
    };
    const quiet = console.log;
    console.log = () => {}; // the connect banner
    const io = await import(pathToFileURL(ioBundle).href);
    rmSync(ioBundle, { force: true });
    const s = io.getSocket();
    s.fire('connect');
    console.log = quiet;
    const sent = (command) => s.emitted.filter((e) => e[0] === command).map((e) => e[1]);
    const state = (val) => ({ val, ack: true, ts: Date.now() });

    const got = [];
    const onPattern = (st, id) => got.push(['pattern', id, st.val]);
    const onMiddle = (st, id) => got.push(['middle', id, st.val]);
    const onExact = (st, id) => got.push(['exact', id, st.val]);
    const offP = io.subscribeStateDirect('a.0.x.*', onPattern);
    const offP2 = io.subscribeStateDirect('a.0.x.*', onExact);
    offP2();
    const offM = io.subscribeStateDirect('hm-rpc.0.*.STATE', onMiddle);
    const offE = io.subscribeStateDirect('a.0.x.one', onExact);
    check('io patterns: the server is subscribed once per pattern', sent('subscribe'), [
        'a.0.x.*',
        'hm-rpc.0.*.STATE',
        'a.0.x.one',
    ]);
    s.fire('stateChange', 'a.0.x.one', state(1));
    s.fire('stateChange', 'a.0.x.two', state(2));
    s.fire('stateChange', 'hm-rpc.0.ABC.1.STATE', state(3));
    s.fire('stateChange', 'a.0.y', state(4));
    check('io patterns: matching changes reach pattern and exact subscribers, with their ID', got, [
        ['exact', 'a.0.x.one', 1],
        ['pattern', 'a.0.x.one', 1],
        ['pattern', 'a.0.x.two', 2],
        ['middle', 'hm-rpc.0.ABC.1.STATE', 3],
    ]);
    check(
        'io patterns: what a pattern delivered is cached; the exact ID stays maintained',
        [io.getStateFromCache('a.0.x.two')?.val, io.isStateFresh('a.0.x.one')],
        [2, true],
    );

    // a write is echoed to the pattern subscribers as well
    got.length = 0;
    io.setStateEchoed('a.0.x.three', 5);
    await tick();
    check('io patterns: the optimistic echo of a write reaches a pattern', got, [['pattern', 'a.0.x.three', 5]]);

    // reconnect: patterns subscribed again, but never read as a state
    s.emitted.length = 0;
    got.length = 0;
    console.log = () => {};
    s.fire('disconnect');
    serverValue = 9;
    s.fire('reconnect');
    console.log = quiet;
    await new Promise((r) => setTimeout(r, 5));
    check(
        'io patterns: subscribed again after a reconnect',
        sent('subscribe').filter((id) => id.includes('*')),
        ['a.0.x.*', 'hm-rpc.0.*.STATE'],
    );
    check(
        'io patterns: a pattern is not read as a state on reconnect',
        sent('getState').filter((id) => id.includes('*')),
        [],
    );
    check(
        'io patterns: a cached state that changed while offline reaches its pattern',
        got.filter((g) => g[1] === 'a.0.x.two'),
        [['pattern', 'a.0.x.two', 9]],
    );

    // unsubscribing ends the pattern; the exact path keeps working without one
    got.length = 0;
    offP();
    offM();
    check('io patterns: unsubscribed after the last subscriber', sent('unsubscribe'), ['a.0.x.*', 'hm-rpc.0.*.STATE']);
    s.fire('stateChange', 'a.0.x.one', state(6));
    s.fire('stateChange', 'a.0.x.two', state(7));
    check('io patterns: without patterns only the exact subscriber hears', got, [['exact', 'a.0.x.one', 6]]);
    offE();
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
    check('entries: once per adapter and tag, without a tag none', entries.filter((e) => !e.missing).length, 2);
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
    check(
        'entries: installed flow - no known entry on top, only the missing others',
        entries.filter((e) => e.missing).map((e) => e.tag),
        ['iob-fullcalendar', 'iob-cameras-rtsp', 'iob-cameras-snapshot'],
    );
    check('entry: tested component (KNOWN_WEB_COMPONENTS) is not marked', entries[0].untested, false);
    check('entry: any other component is marked untested', entries[1].untested, true);
    check('entry: version of the installed adapter', [entries[0].version, entries[1].version], ['0.1.0', '1.0.0']);
    check(
        'tested: tag and adapter must both match',
        [
            m.isTestedWebComponent('iob-flow-diagram', 'flow'),
            m.isTestedWebComponent('iob-flow-diagram', 'other'),
            m.isTestedWebComponent('iob-other-tile', 'other'),
        ],
        [true, false, false],
    );

    // A known component is offered while its adapter is missing (#891)
    const none = m.webComponentPickerEntries([], 'de');
    check(
        'known: offered without any adapter',
        none.map((e) => e.tag),
        ['iob-flow-diagram', 'iob-fullcalendar', 'iob-cameras-rtsp', 'iob-cameras-snapshot'],
    );
    check('known: same key as the installed one', none[0].key, 'wc:flow|iob-flow-diagram');
    check('known: name in the frontend language', none[0].label, 'Fluss-Diagramm');
    check('known: marked missing', none[0].missing, true);
    check('known: hint names the missing adapter', none[0].hint.endsWith('Adapter flow (nicht installiert)'), true);
    check('known: preferred size', none[0].size, { width: 480, height: 340 });
    check('known: English', m.webComponentPickerEntries([], 'en')[0].label, 'Flow diagram');
    check(
        'known: after the installed ones',
        m.webComponentPickerEntries([bare], 'de').map((e) => e.tag),
        ['iob-other-tile', 'iob-flow-diagram', 'iob-fullcalendar', 'iob-cameras-rtsp', 'iob-cameras-snapshot'],
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
    check(
        'host settings: the cameras draw no title of their own',
        m.withoutHostSettings({ camera: 'cameras.0.cam1', title: 'Einfahrt' }, 'iob-cameras-rtsp', 'cameras'),
        { camera: 'cameras.0.cam1' },
    );
    check('host settings: the snapshot camera too', m.hostOwnedSettings('iob-cameras-snapshot', 'cameras'), ['title']);
    {
        const withTitle = {
            manifestVersion: 1,
            tag: 'iob-other-tile',
            module: 'x.js',
            settings: { type: 'panel', items: { title: { type: 'text' }, dp: { type: 'objectId' } } },
        };
        const numberTitle = { ...withTitle, settings: { type: 'panel', items: { title: { type: 'number' } } } };
        check(
            'host settings: any text setting "title" (generic)',
            m.hostOwnedSettings('iob-other-tile', 'other', withTitle),
            ['title'],
        );
        check(
            'host settings: generic rule drops it',
            m.withoutHostSettings({ title: 'x', dp: 'a.0.b' }, 'iob-other-tile', 'other', withTitle),
            { dp: 'a.0.b' },
        );
        check(
            'host settings: "title" of another type stays',
            m.hostOwnedSettings('iob-other-tile', 'other', numberTitle),
            [],
        );
        check(
            'host settings: known list and generic rule merge without doubles',
            m.hostOwnedSettings('iob-flow-diagram', 'flow', { ...withTitle, tag: 'iob-flow-diagram' }),
            ['title', 'fullView'],
        );
    }
    check('host settings: reason keys', ['title', 'fullView', 'x'].map(m.hostSettingReasonKey), [
        'wc.host.title',
        'wc.host.fullView',
        'wc.host.other',
    ]);

    // who answers a click (wcClick)
    check('click: off by default', m.webComponentClick(undefined), 'off');
    check(
        'click: component only on request, anything else off',
        [
            m.webComponentClick('component'),
            m.webComponentClick('off'),
            m.webComponentClick('nonsense'),
            m.webComponentClick('aura'),
        ],
        ['component', 'off', 'off', 'off'],
    );

    // title row from the component (wcTitleSource / wcIconSource, event iob-header)
    check('header: strings only, trimmed', m.parseComponentHeader({ title: ' Einfahrt ', icon: 5 }), {
        title: 'Einfahrt',
    });
    check('header: nothing usable', [m.parseComponentHeader(null), m.parseComponentHeader({ title: '  ' })], [{}, {}]);
    check(
        'header: source defaults to aura',
        [m.headerSource(undefined), m.headerSource('x'), m.headerSource('component')],
        ['aura', 'aura', 'component'],
    );
    {
        const aura = { titleSource: 'aura', iconSource: 'aura' };
        const comp = { titleSource: 'component', iconSource: 'component' };
        const hdr = { title: 'Einfahrt', icon: 'cam.png' };
        const res = (u) => `https://h/adapter/cameras/${u}`;
        check(
            'header: aura ignores the component',
            m.resolveWidgetHeader(aura, 'Kamera', hdr, 'https://h/m.png', res),
            {
                title: 'Kamera',
            },
        );
        check('header: component title and icon', m.resolveWidgetHeader(comp, 'Kamera', hdr, 'https://h/m.png', res), {
            title: 'Einfahrt',
            iconUrl: 'https://h/adapter/cameras/cam.png',
        });
        check(
            'header: nothing reported - widget title, manifest icon',
            m.resolveWidgetHeader(comp, 'Kamera', {}, 'https://h/m.png', res),
            {
                title: 'Kamera',
                iconUrl: 'https://h/m.png',
            },
        );
        check('header: no picture at all - Aura icon', m.resolveWidgetHeader(comp, 'Kamera', {}, undefined, res), {
            title: 'Kamera',
        });
        check(
            'header: title from the component, icon from Aura',
            m.resolveWidgetHeader(
                { titleSource: 'component', iconSource: 'aura' },
                'Kamera',
                hdr,
                'https://h/m.png',
                res,
            ),
            { title: 'Einfahrt' },
        );
    }

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
