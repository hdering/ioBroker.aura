// Verifies the custom enum categories of the dynamic list's datapoint search
// (utils/enumFilter, issue #568): which categories are offered, membership through
// nested enums (a floor holds rooms, the rooms hold the devices) and the OR/AND
// semantics of a selection.
//
//   node tools/tests/list-enum-filter.mjs
//
// No dev server needed - the util is pure, so it is bundled with esbuild and called
// directly with a hand-built enum tree.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-enum-filter-${process.pid}.mjs`);
await build({
    stdin: {
        contents:
            "export { collectEnumFilterOptions, buildEnumMemberIndex, enumIdsForObject, matchesEnumFilter, isCustomEnumId, splitEnumFilter } from './src-vis/utils/enumFilter.ts';",
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
    collectEnumFilterOptions,
    buildEnumMemberIndex,
    enumIdsForObject,
    matchesEnumFilter,
    isCustomEnumId,
    splitEnumFilter,
} = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

const e = (id, name, members = []) => ({ _id: id, type: 'enum', common: { name, members } });

// The reported setup: enum.floors with one enum per storey, rooms assigned to them.
// Rooms in turn hold devices, and the states hang below those devices.
const ENUMS = [
    e('enum.rooms', 'Räume'),
    e('enum.rooms.bad', 'Bad', ['hm-rpc.0.BAD']),
    e('enum.rooms.schlafzimmer', 'Schlafzimmer', ['hm-rpc.0.SZ']),
    e('enum.rooms.wohnzimmer', 'Wohnzimmer', ['shelly.0.WZ']),
    e('enum.functions', 'Gewerke'),
    e('enum.functions.heizung', 'Heizung', ['hm-rpc.0.BAD', 'hm-rpc.0.SZ']),
    e('enum.functions.licht', 'Licht', ['shelly.0.WZ']),
    e('enum.floors', 'Stockwerke'),
    e('enum.floors.og', 'Obergeschoss', ['enum.rooms.bad', 'enum.rooms.schlafzimmer']),
    e('enum.floors.eg', 'Erdgeschoss', ['enum.rooms.wohnzimmer']),
    e('enum.leer', 'Leere Kategorie'),
    e('enum.leer.nichts', 'Nichts drin', []),
];

// ── 1. Which entries the dropdown offers ──────────────────────────────────────
{
    const opts = collectEnumFilterOptions(ENUMS);
    eq(
        'only custom categories are offered',
        opts.map((o) => o.id),
        ['enum.floors.eg', 'enum.floors.og'],
    );
    eq('label is the enum name', opts[1].label, 'Obergeschoss');
    eq('category label comes from the category object', opts[1].categoryLabel, 'Stockwerke');
    check(
        'no room or function leaks into the category list',
        !opts.some((o) => o.id.startsWith('enum.rooms.') || o.id.startsWith('enum.functions.')),
    );
    check(
        'the category root itself is not selectable',
        !opts.some((o) => o.id === 'enum.floors') && isCustomEnumId('enum.floors') === false,
    );
    check(
        'empty categories are left out',
        !opts.some((o) => o.id.startsWith('enum.leer')),
        'they could only ever return an empty search',
    );
}

// ── 2. Membership through nested enums ────────────────────────────────────────
// The whole point of the issue: the floor holds ROOMS, so a plain member lookup for
// the state would find nothing.
{
    const index = buildEnumMemberIndex(ENUMS);
    const og = [...enumIdsForObject('hm-rpc.0.BAD.1.ACTUAL_TEMPERATURE', index)].sort();
    check(
        'a state under a device of a room of a floor belongs to that floor',
        og.includes('enum.floors.og'),
        og.join(', '),
    );
    check('and still to its room', og.includes('enum.rooms.bad'));
    check(
        'a state of the other floor is not a member',
        !enumIdsForObject('shelly.0.WZ.Relay0.Switch', index).has('enum.floors.og'),
    );
    check(
        'the ground floor resolves the same way',
        enumIdsForObject('shelly.0.WZ.Relay0.Switch', index).has('enum.floors.eg'),
    );
    check(
        'a datapoint outside every enum matches nothing',
        enumIdsForObject('admin.0.info.connection', index).size === 0,
    );
}

// A child enum counts towards its parent, mirroring how the admin tree reads.
{
    const nested = [
        e('enum.floors', 'Stockwerke'),
        e('enum.floors.og', 'Obergeschoss', []),
        e('enum.floors.og.links', 'Links', ['hm-rpc.0.LEFT']),
    ];
    const index = buildEnumMemberIndex(nested);
    check(
        'a child enum counts towards its parent',
        enumIdsForObject('hm-rpc.0.LEFT.STATE', index).has('enum.floors.og'),
    );
    const opts = collectEnumFilterOptions(nested);
    eq(
        'nested entries keep their path in the label',
        opts.find((o) => o.id === 'enum.floors.og.links')?.label,
        'Obergeschoss › Links',
    );
}

// A hand-edited member cycle must not hang the search.
{
    const cyclic = [
        e('enum.x', 'X'),
        e('enum.x.a', 'A', ['enum.x.b', 'dev.0.A']),
        e('enum.x.b', 'B', ['enum.x.a', 'dev.0.B']),
    ];
    const index = buildEnumMemberIndex(cyclic);
    check('a member cycle resolves instead of hanging', enumIdsForObject('dev.0.B.STATE', index).has('enum.x.a'));
}

// ── 3. Selection semantics: OR inside a category, AND across categories ───────
{
    const index = buildEnumMemberIndex(ENUMS);
    const of = (id) => enumIdsForObject(id, index);
    const BAD = of('hm-rpc.0.BAD.1.ACTUAL_TEMPERATURE');
    const WZ = of('shelly.0.WZ.Relay0.Switch');

    check('no selection matches everything', matchesEnumFilter([], WZ) && matchesEnumFilter([], new Set()));
    check('single category entry matches its members', matchesEnumFilter(['enum.floors.og'], BAD));
    check('and rejects the others', !matchesEnumFilter(['enum.floors.og'], WZ));
    check(
        'two entries of one category are OR',
        matchesEnumFilter(['enum.floors.og', 'enum.floors.eg'], BAD) &&
            matchesEnumFilter(['enum.floors.og', 'enum.floors.eg'], WZ),
    );

    // Two categories at once - the second one is a hand-made "Wartung" category here.
    const withMaint = [...ENUMS, e('enum.wartung', 'Wartung'), e('enum.wartung.batterie', 'Batterie', ['hm-rpc.0.SZ'])];
    const idx2 = buildEnumMemberIndex(withMaint);
    const SZ = enumIdsForObject('hm-rpc.0.SZ.1.LEVEL', idx2);
    const BAD2 = enumIdsForObject('hm-rpc.0.BAD.1.ACTUAL_TEMPERATURE', idx2);
    check(
        'across categories it is AND',
        matchesEnumFilter(['enum.floors.og', 'enum.wartung.batterie'], SZ) &&
            !matchesEnumFilter(['enum.floors.og', 'enum.wartung.batterie'], BAD2),
        'SZ is upstairs AND has a battery, BAD is only upstairs',
    );
    check(
        'a deleted enum filters everything away instead of matching all',
        !matchesEnumFilter(['enum.floors.weg'], BAD),
    );
}

// ── 4. Stored value round-trip ────────────────────────────────────────────────
{
    eq('csv is split and trimmed', splitEnumFilter(' enum.floors.og , enum.floors.eg '), [
        'enum.floors.og',
        'enum.floors.eg',
    ]);
    eq('empty stays empty', splitEnumFilter(undefined), []);
    eq('a stray comma is dropped', splitEnumFilter('enum.floors.og,,'), ['enum.floors.og']);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
