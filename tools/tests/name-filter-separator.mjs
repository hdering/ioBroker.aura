// Name rules: a typed ">" finds the "›" separator of composed names (#950), and the
// separator presets work on the finished label. Pure logic, bundled via esbuild.
//
//   node tools/tests/name-filter-separator.mjs
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const outDir = path.resolve('node_modules/.cache/name-filter-separator');
mkdirSync(outDir, { recursive: true });
const outfile = path.join(outDir, 'bundle.mjs');
await build({
    entryPoints: ['src-vis/utils/nameFilter.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    logLevel: 'error',
});
const { applyNameFilterRule: apply, formatItemName } = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);

let failed = 0;
const eq = (name, got, want) => {
    const ok = got === want;
    if (!ok) failed++;
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : ` - got "${got}", want "${want}"`}`);
};

const N = 'Wohnzimmer Lampe › STATE';
eq('remove " >" ', apply(N, { op: 'remove', value: ' >', field: 'Name' }), 'Wohnzimmer Lampe STATE');
eq(
    'replace " > "',
    apply(N, { op: 'replace', value: ' > ', value2: ' - ', field: 'Name' }),
    'Wohnzimmer Lampe - STATE',
);
eq('keepBefore " >"', apply(N, { op: 'keepBefore', value: ' >', field: 'Name' }), 'Wohnzimmer Lampe');
eq('keepAfter "> "', apply(N, { op: 'keepAfter', value: '> ', field: 'Name' }), 'STATE');
eq('segment " > " -1', apply(N, { op: 'segment', value: ' > ', value2: '-1', field: 'Name' }), 'STATE');
eq('literal ">" still wins', apply('a > b › c', { op: 'keepBefore', value: ' >', field: 'Name' }), 'a');
eq('no separator → unchanged', apply('a b', { op: 'remove', value: '>', field: 'Name' }), 'a b');
eq('regex untouched', apply(N, { op: 'regexReplace', value: '/>/', value2: 'X', field: 'Name' }), N);

const item = { id: 'hm.0.ABC.1.STATE', name: N };
const ruleSeg1 = [{ id: 'a', field: 'Ergebnis', op: 'segment', value: ' › ', value2: '1' }];
const ruleSegL = [{ id: 'a', field: 'Ergebnis', op: 'segment', value: ' › ', value2: '-1' }];
const ruleRepl = [{ id: 'a', field: 'Ergebnis', op: 'replace', value: ' › ', value2: ' ' }];
eq('preset: nur Gerät', formatItemName(item, '', ruleSeg1), 'Wohnzimmer Lampe');
eq('preset: nur Datenpunkt', formatItemName(item, '', ruleSegL), 'STATE');
eq('preset: › durch Leerzeichen', formatItemName(item, '', ruleRepl), 'Wohnzimmer Lampe STATE');

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
