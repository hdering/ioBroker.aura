// Server-side safety net for foreign writes to aura.0.config.* (lib/configGuard.js).
//
//   node tools/tests/config-guard.mjs
//
// An adapter double stands in for ioBroker. What must hold:
//   1. Acknowledged writes (frontend save, MCP) never produce a backup — they
//      back themselves up — but they do update the "last seen" value.
//   2. A write WITHOUT ack that changes the value saves the PREVIOUS value in the
//      frontend's own backup format: gzip+base64 JSON, all config keys, a
//      .meta.json sidecar labelled 'external-write' with the writer's name.
//   3. Same value again, an unknown state, a missing previous value → nothing.
//   4. Rate limit per state; the hard cap prunes the oldest payloads AND sidecars.
import { createRequire } from 'node:module';
import zlib from 'node:zlib';

const require = createRequire(import.meta.url);
const { createConfigGuard, CONFIG_KEYS } = require('../../lib/configGuard.js');

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${!ok && detail ? ` - ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

function makeAdapter(states) {
    const files = new Map();
    return {
        namespace: 'aura.0',
        files,
        getStateAsync: async (id) => (id in states ? { val: states[id], ack: true } : null),
        writeFileAsync: async (_ns, name, data) => void files.set(name, data),
        readDirAsync: async () => [...files.keys()].map((file) => ({ file })),
        delFileAsync: async (_ns, name) => void files.delete(name),
    };
}
const unzip = (b64) => JSON.parse(zlib.gunzipSync(Buffer.from(b64, 'base64')).toString('utf8'));

let clock = 1_800_000_000_000;
const now = () => clock;

// ── 1 + 2: ack'd write is silent, foreign write saves the previous value ─────
{
    const adapter = makeAdapter({
        'config.dashboard': '{"state":{"layouts":[1]},"version":0}',
        'config.theme': '{"state":{"themeId":"dark"},"version":0}',
    });
    const guard = createConfigGuard(adapter, { now });
    await guard.prime();
    eq(
        'prime reads the existing values',
        guard.cachedValue('config.dashboard'),
        '{"state":{"layouts":[1]},"version":0}',
    );

    const ackd = await guard.onChange('aura.0.config.dashboard', {
        val: '{"state":{"layouts":[2]},"version":0}',
        ack: true,
        from: 'system.adapter.aura.0',
    });
    eq('acknowledged write → no backup', ackd, null);
    eq('… but the value is remembered', guard.cachedValue('config.dashboard'), '{"state":{"layouts":[2]},"version":0}');
    eq('no files so far', adapter.files.size, 0);

    const name = await guard.onChange('aura.0.config.dashboard', {
        val: '{"state":{"layouts":[3]},"version":0}',
        ack: false,
        from: 'system.adapter.javascript.0',
    });
    check(
        'foreign write → backup written',
        typeof name === 'string' && name.startsWith('backup-') && name.endsWith('.json.gz'),
        name,
    );
    eq('payload + sidecar', adapter.files.size, 2);
    const payload = unzip(adapter.files.get(name));
    eq('the backup holds the PREVIOUS dashboard', payload['aura-dashboard'], '{"state":{"layouts":[2]},"version":0}');
    eq('… and the other config keys as they are', payload['aura-theme'], '{"state":{"themeId":"dark"},"version":0}');
    eq('… flags what changed', payload._changed, ['aura-dashboard']);
    eq('… and names the writer', payload._details, [
        { store: 'aura-dashboard', kind: 'external-write', label: 'javascript.0' },
    ]);
    const meta = JSON.parse(adapter.files.get(name.replace('.json.gz', '.meta.json')));
    eq('sidecar carries the same details', meta._details, payload._details);
    check(
        'sidecar timestamp matches the file',
        meta._ts.replace(/[:.]/g, '-') === name.slice('backup-'.length, -'.json.gz'.length),
    );
    eq(
        'the new value is now the remembered one',
        guard.cachedValue('config.dashboard'),
        '{"state":{"layouts":[3]},"version":0}',
    );
}

// ── 3: nothing to save ───────────────────────────────────────────────────────
{
    const adapter = makeAdapter({ 'config.theme': '{"state":{"themeId":"dark"},"version":0}' });
    const guard = createConfigGuard(adapter, { now });
    await guard.prime();
    eq(
        'same value without ack → nothing',
        await guard.onChange('aura.0.config.theme', { val: '{"state":{"themeId":"dark"},"version":0}', ack: false }),
        null,
    );
    eq(
        'unknown config state → nothing',
        await guard.onChange('aura.0.config.messageDefaults', { val: '{}', ack: false }),
        null,
    );
    eq(
        'no previous value (never read) → nothing',
        await guard.onChange('aura.0.config.groups', { val: '{"state":{},"version":0}', ack: false }),
        null,
    );
    eq('no files so far', adapter.files.size, 0);
    // The first write became the previous value — the next foreign write saves it.
    check(
        'the value written first is what the next foreign write backs up',
        typeof (await guard.onChange('aura.0.config.groups', { val: '{"x":1}', ack: false })) === 'string',
    );
    eq('payload + sidecar', adapter.files.size, 2);
}

// ── 4: rate limit and hard cap ───────────────────────────────────────────────
{
    const adapter = makeAdapter({ 'config.dashboard': 'v0' + '.'.repeat(10) });
    const guard = createConfigGuard(adapter, { now, minIntervalMs: 30000, hardCap: 3 });
    await guard.prime();
    const write = async (v) =>
        guard.onChange('aura.0.config.dashboard', {
            val: v + '.'.repeat(10),
            ack: false,
            from: 'system.adapter.javascript.0',
        });
    check('first foreign write saved', !!(await write('v1')));
    clock += 1000;
    eq('a second one inside the interval is rate-limited', await write('v2'), null);
    eq('… still remembered though', guard.cachedValue('config.dashboard'), 'v2' + '.'.repeat(10));
    clock += 30000;
    check('after the interval it saves again', !!(await write('v3')));
    for (let i = 4; i <= 8; i++) {
        clock += 30000;
        await write(`v${i}`);
    }
    const payloads = [...adapter.files.keys()].filter((n) => n.endsWith('.json.gz')).sort();
    const sidecars = [...adapter.files.keys()].filter((n) => n.endsWith('.meta.json')).sort();
    eq('hard cap keeps the newest payloads', payloads.length, 3);
    eq('… and prunes their sidecars with them', sidecars.length, 3);
    check(
        'the kept files are the newest',
        payloads.every((p) => sidecars.includes(p.replace('.json.gz', '.meta.json'))),
    );
    eq(
        'the newest backup holds v7 (the value before v8)',
        unzip(adapter.files.get(payloads[payloads.length - 1]))['aura-dashboard'],
        'v7' + '.'.repeat(10),
    );
}

eq('every frontend key is mapped', Object.values(CONFIG_KEYS).sort(), [
    'aura-config',
    'aura-dashboard',
    'aura-global-settings',
    'aura-group-defs',
    'aura-groups',
    'aura-popup-config',
    'aura-theme',
    'aura-widget-presets',
]);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
