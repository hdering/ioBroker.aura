// Verifies how the Statusübersicht widget recognises window/door contacts — especially
// rotary handles (HmIP-SRH, HM-Sec-RHS), which publish role `state` with a
// CLOSED/TILTED/OPEN enum instead of a contact role and were therefore never listed.
// Also covers the value side: a numeric 2 (HomeMatic OPEN) must not read as closed the
// way a plain truthy check does, and the loading rule that keeps the widget from
// reporting "Alles in Ordnung" while the datapoints are still coming in.
//
//   node tools/tests/status-overview-window.mjs
//
// No dev server needed: categoryOf/evaluateItem/contactLevel are pure, and the
// `common.states` normaliser is bundled with the datapoint hook's io layer stubbed out.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });

const bundle = join(cache, `aura-status-window-${process.pid}.mjs`);
await build({
    stdin: {
        contents: [
            "export { categoryOf, evaluateItem, contactLevel, hasContactStates, isStatusLoading } from './src-vis/utils/statusOverview.ts';",
            "export { normalizeStates } from './src-vis/hooks/useDatapointList.ts';",
        ].join('\n'),
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    external: ['react'],
    logLevel: 'warning',
    plugins: [
        {
            name: 'stub-io',
            setup(b) {
                b.onResolve({ filter: /^\.\/useIoBroker$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
                b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
                    contents: 'export const getObjectViewDirect = () => Promise.resolve({ rows: [] });',
                    loader: 'js',
                }));
            },
        },
    ],
});
const { categoryOf, evaluateItem, contactLevel, hasContactStates, isStatusLoading, normalizeStates } = await import(
    pathToFileURL(bundle).href
);
rmSync(bundle, { force: true });

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` - ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

/** A datapoint the way ensureDatapointCache hands it over. */
const dp = (over = {}) => ({
    id: 'hm-rpc.1.0007DBE98D9753.1.STATE',
    name: 'Drehgriffkontakt rechts › STATE',
    type: 'number',
    role: 'state',
    rooms: ['Wohnzimmer'],
    funcs: ['Verschluss'],
    logging: [],
    ...over,
});

const HM_CONTACT = { 0: 'CLOSED', 1: 'TILTED', 2: 'OPEN' };
/** The two datapoints from the issue: HmIP-SRH and HM-Sec-RHS, both role `state`. */
const SRH = dp({ states: HM_CONTACT });
const RHS = dp({
    id: 'hm-rpc.2.NEQ1476335.1.STATE',
    name: 'Drehgriffkontakt links',
    states: HM_CONTACT,
});

// ── 1. common.states normalisation (all three ioBroker spellings) ─────────────
{
    eq('states: object map', normalizeStates(HM_CONTACT), { 0: 'CLOSED', 1: 'TILTED', 2: 'OPEN' });
    eq('states: array (index = value)', normalizeStates(['CLOSED', 'TILTED', 'OPEN']), {
        0: 'CLOSED',
        1: 'TILTED',
        2: 'OPEN',
    });
    eq('states: legacy "0:a;1:b" string', normalizeStates('0:CLOSED;1:TILTED;2:OPEN'), {
        0: 'CLOSED',
        1: 'TILTED',
        2: 'OPEN',
    });
    eq('states: label may contain a colon', normalizeStates('0:a:b'), { 0: 'a:b' });
    eq('states: undefined stays undefined (cache entry stays small)', normalizeStates(undefined), undefined);
    eq('states: empty object stays undefined', normalizeStates({}), undefined);
    eq('states: garbage stays undefined', normalizeStates(42), undefined);
}

// ── 2. Structural detection ──────────────────────────────────────────────────
{
    eq('rotary handle (HmIP-SRH) is a window candidate', categoryOf(SRH, {}), 'window');
    eq('rotary handle (HM-Sec-RHS) is a window candidate', categoryOf(RHS, {}), 'window');
    eq('German enum labels work too', categoryOf(dp({ states: { 0: 'Zu', 1: 'Gekippt', 2: 'Offen' } }), {}), 'window');
    eq(
        'string-valued enum works too',
        categoryOf(dp({ type: 'string', states: { closed: 'closed', tilted: 'tilted', open: 'open' } }), {}),
        'window',
    );
    eq(
        'contact role still wins',
        categoryOf(dp({ role: 'sensor.window', type: 'boolean', states: undefined }), {}),
        'window',
    );
    eq('category off → no candidate', categoryOf(SRH, { catWindow: false }), null);

    // Not a contact: a closed/open-only enum (a thermostat's derived WINDOW_STATE) would
    // only duplicate the real contact, and unrelated enums must stay out entirely.
    eq('closed/open-only enum is not matched', hasContactStates(dp({ states: { 0: 'CLOSED', 1: 'OPEN' } })), false);
    eq('no enum at all', hasContactStates(dp({ states: undefined })), false);
    eq(
        'unrelated enum (voltage status)',
        hasContactStates(dp({ states: { 0: 'NORMAL', 1: 'UNKNOWN', 2: 'OVERFLOW', 3: 'EXTERNAL' } })),
        false,
    );
    eq('alarm enum is not a contact', hasContactStates(dp({ states: { 0: 'NO ALARM', 1: 'ALARM' } })), false);
}

// ── 3. Value → contact level ─────────────────────────────────────────────────
{
    eq('SRH 0 → closed', contactLevel(SRH, 0), 'closed');
    eq('SRH 1 → tilted', contactLevel(SRH, 1), 'tilted');
    eq('SRH 2 → open', contactLevel(SRH, 2), 'open');
    eq('enum value as string', contactLevel(SRH, '2'), 'open');
    eq('German labels', contactLevel(dp({ states: { 0: 'Zu', 1: 'Gekippt', 2: 'Offen' } }), 1), 'tilted');

    // Without an enum: boolean contacts keep working, and a numeric OPEN (2) must not
    // fall back to "closed" the way a truthy check would.
    const bare = dp({ role: 'sensor.window', type: 'boolean', states: undefined });
    eq('boolean true → open', contactLevel(bare, true), 'open');
    eq('boolean false → closed', contactLevel(bare, false), 'closed');
    eq('numeric 2 without enum → open', contactLevel(dp({ states: undefined }), 2), 'open');
    eq('numeric 0 without enum → closed', contactLevel(dp({ states: undefined }), 0), 'closed');
    eq('null → closed', contactLevel(bare, null), 'closed');
    eq("'closed' string → closed", contactLevel(bare, 'closed'), 'closed');
    eq("'OPEN' string → open", contactLevel(bare, 'OPEN'), 'open');
    eq("'0' string → closed", contactLevel(bare, '0'), 'closed');
}

// ── 4. Evaluation: what the widget lists ─────────────────────────────────────
{
    const ev = (d, val, includeOk = false) => evaluateItem(d, val, 'window', {}, undefined, includeOk);

    const tilted = ev(SRH, 1);
    check('tilted is listed', !!tilted, 'nothing returned');
    eq('tilted: label', tilted?.label, 'Gekippt');
    eq('tilted: severity', tilted?.severity, 'warn');

    const open = ev(RHS, 2);
    check('open is listed', !!open, 'nothing returned');
    eq('open: label', open?.label, 'Offen');
    eq('open: severity', open?.severity, 'crit');

    eq('closed is not an alert', ev(SRH, 0), null);
    eq('closed with "show all": label', ev(SRH, 0, true)?.label, 'Geschlossen');
    eq('closed with "show all": severity', ev(SRH, 0, true)?.severity, 'ok');

    // Regression: the role wording stays in charge, and a numeric contact carrying a
    // window role no longer reads 2 as closed.
    const role = dp({ role: 'sensor.window', type: 'boolean', states: undefined });
    eq('role label for open (unchanged)', ev(role, true)?.label, 'Geöffnet');
    eq('role label for closed (unchanged)', ev(role, false, true)?.label, 'Geschlossen');
    eq(
        'numeric 2 on a window role is an alert',
        ev(dp({ role: 'sensor.window', states: undefined }), 2)?.severity,
        'crit',
    );
}

// ── 5. Loading: no verdict before the data is in ─────────────────────
{
    const load = (over) => isStatusLoading({ discovered: true, settled: false, loaded: 0, expected: 0, ...over });
    eq('datapoint scan still running', load({ discovered: false }), true);
    eq('scan done, values outstanding', load({ loaded: 3, expected: 12 }), true);
    eq('scan done, no candidates at all', load({}), false);
    eq('all values in', load({ loaded: 12, expected: 12 }), false);
    // Grace period: a getState reply lost on a flaky link must not spin forever.
    eq('grace period expired', load({ settled: true, loaded: 3, expected: 12 }), false);
    eq('grace period does not skip the scan', load({ discovered: false, settled: true }), true);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
