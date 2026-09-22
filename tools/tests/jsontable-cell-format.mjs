// Verifies the per-column display format of the JSON table (issue #697).
//
//   node tools/tests/jsontable-cell-format.mjs
//
// A JSON datapoint can hold a millisecond timestamp the table should print as a date,
// Wh that read better as kWh, or a long float that needs a decimal cap. The column
// carries the same option keys the lists use; checked here is that they are applied in
// the same order (factor/offset -> time format -> decimals), that an unconfigured column
// is left completely untouched, and that text values survive a conversion unharmed.
//
// No dev server needed - the formatter is pure and is bundled with esbuild.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-jsontable-format-${process.pid}.mjs`);
await build({
    stdin: {
        contents: "export * from './src-vis/utils/jsonTableFormat.ts';",
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
            // Without an explicit number format `formatNum` falls back to the global
            // settings store, which runs browser-only socket setup on load. Every check
            // below passes the format in, so the store is replaced by a stub.
            name: 'stub-settings',
            setup(b) {
                b.onResolve({ filter: /globalSettingsStore$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
                b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
                    contents: "export const useGlobalSettingsStore = { getState: () => ({ numberFormat: 'plain' }) };",
                    loader: 'js',
                }));
            },
        },
    ],
});
const { formatCellValue, hasCellFormat, cellText } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

let failed = 0;
const check = (label, ok, detail = '') => {
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${ok || !detail ? '' : ` - ${detail}`}`);
    if (!ok) failed++;
};
const eq = (label, actual, expected) => check(label, actual === expected, `got ${JSON.stringify(actual)}`);

// The translator is only reached by the long date / weekday tokens, which are not
// exercised here - the numeric presets format without it.
const t = (key) => key;

// 2024-07-10 00:00 local time, the example from the issue.
const MS = new Date(2024, 6, 10, 0, 0, 0).getTime();

// ── Nothing configured: the value passes through ────────────────────────────────
check('an empty column carries no format', !hasCellFormat({}));
eq('unconfigured number stays verbatim', formatCellValue({}, 1720562400000, t), '1720562400000');
eq('unconfigured text stays verbatim', formatCellValue({}, 'Wohnzimmer', t), 'Wohnzimmer');
eq('boolean keeps its tick', formatCellValue({}, true, t), '✓');
eq('null keeps the placeholder', formatCellValue({}, null, t), cellText(null));
eq('empty string stays empty', formatCellValue({}, '', t), '');

// ── Time formatting: the point of the issue ─────────────────────────────────────
check('a time format counts as a format', hasCellFormat({ valueTimeFormat: 'date' }));
eq('ms timestamp as date', formatCellValue({ valueTimeFormat: 'date' }, MS, t), '10.07.2024');
eq('ms timestamp as date + time', formatCellValue({ valueTimeFormat: 'datetime' }, MS, t), '10.07.2024 00:00');
eq('seconds timestamp as date', formatCellValue({ valueTimeFormat: 'date' }, Math.floor(MS / 1000), t), '10.07.2024');
eq('ISO string as date', formatCellValue({ valueTimeFormat: 'date' }, '2024-07-10T08:15:00', t), '10.07.2024');
eq(
    'custom pattern',
    formatCellValue({ valueTimeFormat: 'custom', valueTimePattern: 'yyyy-MM-dd' }, MS, t),
    '2024-07-10',
);
eq(
    'a non-time value falls back to the dash',
    formatCellValue({ valueTimeFormat: 'date' }, 'kaputt', t),
    cellText(null),
);
eq('an empty cell is not formatted as a time', formatCellValue({ valueTimeFormat: 'date' }, null, t), cellText(null));
eq('"none" leaves the value alone', formatCellValue({ valueTimeFormat: 'none' }, MS, t), String(MS));

// ── Conversion, and its order relative to the time format ───────────────────────
eq('Wh to kWh', formatCellValue({ valueFactor: 0.001, decimals: 2 }, 1234, t, 'plain'), '1.23');
eq(
    'the conversion runs before the time format',
    formatCellValue({ valueFactor: 1000, valueTimeFormat: 'date' }, MS / 1000, t),
    '10.07.2024',
);
eq('float noise is trimmed away', formatCellValue({ valueFactor: 1 / 60 }, 300, t), '5');
eq(
    'a numeric string is converted too',
    formatCellValue({ valueFactor: 0.001, decimals: 1 }, '2500', t, 'plain'),
    '2.5',
);
eq('text survives a conversion', formatCellValue({ valueFactor: 0.001 }, 'n/a', t), 'n/a');

// ── Decimal places ──────────────────────────────────────────────────────────────
check('decimals alone counts as a format', hasCellFormat({ decimals: 0 }));
eq('decimals cap a long float', formatCellValue({ decimals: 1 }, 21.3456, t, 'plain'), '21.3');
eq('decimals 0 rounds', formatCellValue({ decimals: 0 }, 21.6, t, 'plain'), '22');
eq('decimals pad', formatCellValue({ decimals: 2 }, 7, t, 'plain'), '7.00');
eq('the number format groups', formatCellValue({ decimals: 1 }, 1234.5, t, 'de'), '1.234,5');
eq('decimals leave text alone', formatCellValue({ decimals: 2 }, 'AUS', t, 'plain'), 'AUS');

console.log(failed === 0 ? '\nAll JSON table cell formats OK' : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
