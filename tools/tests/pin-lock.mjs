// Verifies the PIN gate in front of sections ("Bereiche") and tabs: which view is
// locked, what a code has to match, when an unlocked entry falls shut again and
// where "cancel" sends the viewer.
//
//   node tools/tests/pin-lock.mjs
//
// No dev server needed: utils/pinLock.ts is pure and store/pinStore.ts only holds
// the unlock map, so esbuild bundles both and the test drives them directly.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-pin-${process.pid}.mjs`);
await build({
    stdin: {
        contents: [
            "export * from './src-vis/utils/pinLock.ts';",
            "export { usePinStore, unlockedReader } from './src-vis/store/pinStore.ts';",
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
const {
    normalizePin,
    hasPin,
    relockMode,
    pinMatches,
    sectionPinKey,
    tabPinKey,
    pendingPinTarget,
    activePinKeys,
    pinEscapeTarget,
    usePinStore,
    unlockedReader,
} = await import(pathToFileURL(bundle).href);
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

// ── the dashboard the cases run against ───────────────────────────────────────
// living: free.  office: section PIN.  cellar: free section with a locked tab.
const SECTIONS = [
    {
        id: 'sec-living',
        name: 'Wohnen',
        tabs: [
            { id: 'default', name: 'Übersicht' },
            { id: 'tab-media', name: 'Medien' },
        ],
    },
    {
        id: 'sec-office',
        name: 'Büro',
        pin: '1234',
        tabs: [{ id: 'default', name: 'Schreibtisch' }],
    },
    {
        id: 'sec-cellar',
        name: 'Keller',
        tabs: [
            { id: 'tab-heating', name: 'Heizung', pin: '9', pinRelock: 'session' },
            { id: 'tab-water', name: 'Wasser' },
        ],
    },
];
const sec = (id) => SECTIONS.find((s) => s.id === id);
const tab = (secId, tabId) => sec(secId).tabs.find((t) => t.id === tabId);
const open = (...keys) => unlockedReader(Object.fromEntries(keys.map((k) => [k, 'leave'])));

// ── the PIN itself ────────────────────────────────────────────────────────────
console.log('\n── PIN value ──');
eq('normalizePin trims', normalizePin('  12 '), '12');
eq('normalizePin of a number is empty', normalizePin(7), '');
check('hasPin false without a pin', hasPin({}) === false);
check('hasPin false for whitespace only', hasPin({ pin: '   ' }) === false);
check('hasPin true for a code', hasPin({ pin: '0000' }) === true);
check('an item without a pin opens with anything', pinMatches({}, '') === true);
check('exact code opens', pinMatches({ pin: '1234' }, '1234') === true);
check('wrong code stays shut', pinMatches({ pin: '1234' }, '1235') === false);
check('a prefix of the code stays shut', pinMatches({ pin: '1234' }, '123') === false);
check('leading zeros are significant', pinMatches({ pin: '0123' }, '123') === false);
check('a padded entry still opens', pinMatches({ pin: '1234' }, ' 1234 ') === true);
eq('relock defaults to leave', relockMode({ pin: '1' }), 'leave');
eq('relock session is kept', relockMode({ pin: '1', pinRelock: 'session' }), 'session');
eq('an unknown relock value falls back to leave', relockMode({ pin: '1', pinRelock: 'forever' }), 'leave');

// ── keys ──────────────────────────────────────────────────────────────────────
console.log('\n── unlock keys ──');
eq('section key', sectionPinKey('sec-office'), 'section:sec-office');
eq('tab key carries its section', tabPinKey('sec-living', 'default'), 'tab:sec-living:default');
check(
    'the same tab id in two sections gets two keys',
    tabPinKey('sec-living', 'default') !== tabPinKey('sec-office', 'default'),
);
eq('active keys of a view', activePinKeys('sec-living', 'default'), ['section:sec-living', 'tab:sec-living:default']);
eq('no section, no keys', activePinKeys(undefined, 'default'), []);

// ── which view is locked ──────────────────────────────────────────────────────
console.log('\n── pendingPinTarget ──');
const none = open();
check('a free view has no target', pendingPinTarget(sec('sec-living'), tab('sec-living', 'default'), none) === null);
eq('a locked section reports itself', pendingPinTarget(sec('sec-office'), tab('sec-office', 'default'), none), {
    scope: 'section',
    key: 'section:sec-office',
    name: 'Büro',
    pin: '1234',
    relock: 'leave',
});
eq(
    'a locked tab in a free section reports the tab',
    pendingPinTarget(sec('sec-cellar'), tab('sec-cellar', 'tab-heating'), none),
    { scope: 'tab', key: 'tab:sec-cellar:tab-heating', name: 'Heizung', pin: '9', relock: 'session' },
);
check(
    'a free tab of that section is not gated',
    pendingPinTarget(sec('sec-cellar'), tab('sec-cellar', 'tab-water'), none) === null,
);
check(
    'unlocking the section opens it',
    pendingPinTarget(sec('sec-office'), tab('sec-office', 'default'), open('section:sec-office')) === null,
);
check(
    'unlocking the tab opens it',
    pendingPinTarget(sec('sec-cellar'), tab('sec-cellar', 'tab-heating'), open('tab:sec-cellar:tab-heating')) === null,
);
check(
    'a tab unlock does not open its locked section',
    pendingPinTarget(sec('sec-office'), tab('sec-office', 'default'), open('tab:sec-office:default'))?.scope ===
        'section',
);
// The section wins so a locked section cannot leak its tab names via the prompt.
const bothLocked = { id: 's', name: 'S', pin: '11', tabs: [] };
eq(
    'section before tab when both are locked',
    pendingPinTarget(bothLocked, { id: 't', name: 'Geheim', pin: '22' }, none).scope,
    'section',
);
eq(
    'the tab follows once the section is open',
    pendingPinTarget(bothLocked, { id: 't', name: 'Geheim', pin: '22' }, open('section:s')).scope,
    'tab',
);
check('a view without a section is not gated', pendingPinTarget(null, { id: 't', name: 'T', pin: '2' }, none) === null);

// ── relock behaviour ──────────────────────────────────────────────────────────
console.log('\n── relock ──');
const st = () => usePinStore.getState();
usePinStore.setState({ unlocked: {} });
st().unlock('tab:sec-cellar:tab-heating', 'session');
st().unlock('section:sec-office', 'leave');
eq('both are open', Object.keys(st().unlocked).sort(), ['section:sec-office', 'tab:sec-cellar:tab-heating']);
// Viewer moves on to the living-room section: the "leave" entry drops, the
// "session" entry survives until the page is reloaded.
st().retain(activePinKeys('sec-living', 'default'));
eq('leave entry drops on navigating away', Object.keys(st().unlocked), ['tab:sec-cellar:tab-heating']);
st().unlock('section:sec-office', 'leave');
st().retain(activePinKeys('sec-office', 'default'));
eq('the entry of the current view survives', Object.keys(st().unlocked).sort(), [
    'section:sec-office',
    'tab:sec-cellar:tab-heating',
]);
st().lock('section:sec-office');
eq('explicit lock removes one entry', Object.keys(st().unlocked), ['tab:sec-cellar:tab-heating']);
st().lockAll();
eq('lockAll clears everything', Object.keys(st().unlocked), []);
check('the unlock map starts empty on every load', Object.keys(usePinStore.getState().unlocked).length === 0);

// ── where "cancel" goes ───────────────────────────────────────────────────────
console.log('\n── escape target ──');
eq(
    'back to the last view the viewer was allowed to see',
    pinEscapeTarget(SECTIONS, 'sec-office', { sectionId: 'sec-living', tabId: 'tab-media' }, none),
    { sectionId: 'sec-living', tabId: 'tab-media' },
);
eq(
    'a deleted last view falls back to the first free tab',
    pinEscapeTarget(SECTIONS, 'sec-cellar', { sectionId: 'gone', tabId: 'gone' }, none),
    { sectionId: 'sec-cellar', tabId: 'tab-water' },
);
eq(
    'a last view that has since been locked is skipped',
    pinEscapeTarget(SECTIONS, 'sec-office', { sectionId: 'sec-office', tabId: 'default' }, none),
    { sectionId: 'sec-living', tabId: 'default' },
);
eq('the current section is preferred over the first one', pinEscapeTarget(SECTIONS, 'sec-cellar', null, none), {
    sectionId: 'sec-cellar',
    tabId: 'tab-water',
});
eq(
    'an unlocked section counts as free again',
    pinEscapeTarget(SECTIONS, 'sec-office', null, open('section:sec-office')),
    { sectionId: 'sec-office', tabId: 'default' },
);
check(
    'no free view anywhere → no cancel',
    pinEscapeTarget([{ id: 's1', name: 'A', pin: '1', tabs: [{ id: 't', name: 'T' }] }], 's1', null, none) === null,
);
check(
    'a section whose every tab is locked offers nothing',
    pinEscapeTarget([{ id: 's1', name: 'A', tabs: [{ id: 't', name: 'T', pin: '5' }] }], 's1', null, none) === null,
);

// ── summary ───────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    failed.forEach((f) => console.log(`  FAIL ${f.name} - ${f.detail}`));
    process.exit(1);
}
