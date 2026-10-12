// Custom grids built from a widget's fixed layouts (#768) — the pure part.
//
//   node tools/tests/custom-grid-presets-logic.mjs
//
// No dev server needed: utils/customGridPresets is pure and bundled with esbuild.
// For every preset type × every layout the type offers it checks that the grid is
// well-formed, that it only uses fields/components the widget really hands to its
// custom grid, and that the visibility options are honoured. How the result LOOKS
// next to the original is tools/tests/custom-grid-from-layout.mjs (browser).
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-custom-grid-presets-${process.pid}.mjs`);
await build({
    stdin: {
        contents: [
            "export * from './src-vis/utils/customGridPresets/index.ts';",
            "export { getAvailableLayouts } from './src-vis/utils/widgetLayouts.ts';",
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
    buildCustomGridFromLayout,
    customOptionsFromLayout,
    hasCustomGridPreset,
    CUSTOM_GRID_PRESET_TYPES,
    getAvailableLayouts,
} = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });

// Widget source per type — the keys a preset uses must be handed over there.
const SOURCE = {
    value: 'ValueWidget.tsx',
    binarysensor: 'BinarySensorWidget.tsx',
    windowcontact: 'WindowContactWidget.tsx',
    stateimage: 'StateImageWidget.tsx',
    switch: 'SwitchWidget.tsx',
    thermostat: 'ThermostatWidget.tsx',
    weather: 'WeatherWidget.tsx',
    knob: 'KnobWidget.tsx',
    dimmer: 'DimmerWidget.tsx',
    shutter: 'ShutterWidget.tsx',
    slider: 'SliderWidget.tsx',
    enum: 'EnumWidget.tsx',
    button: 'ButtonWidget.tsx',
    httpRequest: 'HttpRequestWidget.tsx',
    input: 'InputWidget.tsx',
};
// Types whose layouts draw no status badges (no battery / reach DPs).
const NO_BADGES = new Set(['weather', 'knob', 'button', 'httpRequest', 'input']);
// Keys every widget gets from useStatusFields.
const SHARED_COMPONENTS = new Set(['status-badges']);

/** Is `key` an entry of the extraFields / extraComponents object literal in the widget source? */
function handedOver(src, key) {
    const esc = key.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    // key: value — or the shorthand `{ key, }` of a plain identifier
    const plain = /^[a-z]\w*$/i.test(key);
    return (
        new RegExp(`(^|[\\s{,])('${esc}'|${plain ? esc : '\\u0000'})\\s*:`, 'm').test(src) ||
        (plain && new RegExp(`^\\s*${esc},\\s*$`, 'm').test(src))
    );
}

/** Structural checks: cell count, spans inside the grid, no two cells claiming one slot. */
function wellFormed(grid) {
    const errs = [];
    const { cols, rows, cells } = grid;
    if (cells.length !== cols * rows) errs.push(`cells ${cells.length} ≠ ${cols}×${rows}`);
    if (grid.colSizes && grid.colSizes.length !== cols) errs.push('colSizes length');
    if (grid.rowSizes && grid.rowSizes.length !== rows) errs.push('rowSizes length');
    const owner = Array.from({ length: cols * rows }, () => -1);
    cells.forEach((c, i) => {
        if (c.type === 'empty') return;
        const r = Math.floor(i / cols);
        const col = i % cols;
        const cs = c.colSpan ?? 1;
        const rs = c.rowSpan ?? 1;
        if (col + cs > cols) errs.push(`cell ${i} colSpan past the edge`);
        if (r + rs > rows) errs.push(`cell ${i} rowSpan past the edge`);
        for (let rr = r; rr < Math.min(rows, r + rs); rr++) {
            for (let cc = col; cc < Math.min(cols, col + cs); cc++) {
                const k = rr * cols + cc;
                if (owner[k] !== -1) errs.push(`slot ${k} claimed by ${owner[k]} and ${i}`);
                owner[k] = i;
            }
        }
    });
    return errs;
}

const RICH = {
    showTitle: true,
    showIcon: true,
    unit: '°C',
    batteryDp: 'x.batt',
    unreachDp: 'x.reach',
    showWarnings: true,
};

check('preset types registered', CUSTOM_GRID_PRESET_TYPES.length >= 7, CUSTOM_GRID_PRESET_TYPES.join(', '));

for (const type of CUSTOM_GRID_PRESET_TYPES) {
    const src = readFileSync(join('src-vis/components/widgets', SOURCE[type]), 'utf8');
    const layouts = getAvailableLayouts(type).filter((l) => l !== 'custom');
    check(`${type}: offers custom`, getAvailableLayouts(type).includes('custom'));
    for (const layout of layouts) {
        check(`${type} ${layout}: preset exists`, hasCustomGridPreset(type, layout));
        for (const [variant, options] of [
            ['defaults', {}],
            ['everything on', RICH],
        ]) {
            const grid = buildCustomGridFromLayout({ type, options }, layout);
            if (!grid) {
                check(`${type} ${layout} (${variant}): builds`, false);
                continue;
            }
            const errs = wellFormed(grid);
            check(`${type} ${layout} (${variant}): well-formed`, errs.length === 0, errs.join('; '));
            for (const c of grid.cells) {
                if (c.type === 'component' && !SHARED_COMPONENTS.has(c.componentKey))
                    check(
                        `${type} ${layout}: component '${c.componentKey}' handed over by the widget`,
                        handedOver(src, c.componentKey),
                    );
                if (c.type === 'field')
                    check(
                        `${type} ${layout}: field '${c.fieldKey}' handed over by the widget`,
                        handedOver(src, c.fieldKey),
                    );
            }
        }
        // Visibility options carry over.
        const noTitle = buildCustomGridFromLayout({ type, options: { showTitle: false } }, layout);
        check(`${type} ${layout}: showTitle off → no title cell`, !noTitle.cells.some((c) => c.type === 'title'));
        const noIcon = buildCustomGridFromLayout({ type, options: { showIcon: false } }, layout);
        check(
            `${type} ${layout}: showIcon off → no icon cell`,
            !noIcon.cells.some((c) => c.type === 'component' && /^icon(-card|-compact|-button)?$/.test(c.componentKey)),
        );
        if (!NO_BADGES.has(type)) {
            const badges = buildCustomGridFromLayout({ type, options: { batteryDp: 'x.b' } }, layout);
            check(
                `${type} ${layout}: battery DP → one status-badges cell`,
                badges.cells.filter((c) => c.componentKey === 'status-badges').length === 1,
            );
            const none = buildCustomGridFromLayout({ type, options: {} }, layout);
            check(
                `${type} ${layout}: no status DPs → no badges cell`,
                !none.cells.some((c) => c.componentKey === 'status-badges'),
            );
        }
    }
}

// Things the presets must not do.
check('custom → custom has no preset', buildCustomGridFromLayout({ type: 'value' }, 'custom') === null);
check('unknown type has no preset', buildCustomGridFromLayout({ type: 'gauge' }, 'default') === null);
const card = buildCustomGridFromLayout({ type: 'binarysensor', options: {} }, 'card');
check('card preset carries the card face', !!card.bg && !!card.borderColor);
const plain = buildCustomGridFromLayout({ type: 'binarysensor', options: {} }, 'default');
check('non-card preset has no face', plain.bg === undefined && plain.borderColor === undefined);
const thermoDial = buildCustomGridFromLayout({ type: 'thermostat', options: { showPresets: false } }, 'dial');
check(
    'thermostat dial without presets → just the dial',
    thermoDial.cells.length === 1 && thermoDial.cells[0].componentKey === 'dial',
);
const valueNoUnit = buildCustomGridFromLayout({ type: 'value', options: {} }, 'default');
check('value without unit option → no unit cell', !valueNoUnit.cells.some((c) => c.type === 'unit'));
const knobScale = customOptionsFromLayout({ type: 'knob', options: { unit: '%' } }, 'knob-scale');
check(
    'knob scale → grid with the dial plus dialStyle skala, other options kept',
    knobScale.dialStyle === 'skala' &&
        knobScale.unit === '%' &&
        knobScale.customGrid?.cells.some((c) => c.componentKey === 'dial'),
);
const blank = customOptionsFromLayout(
    { type: 'knob', options: { customGrid: { cols: 1, rows: 1, cells: [] } } },
    '__blank',
);
check('"__blank" drops the grid', blank.customGrid === undefined);
const noPreset = customOptionsFromLayout({ type: 'gauge', options: { a: 1 } }, 'default');
check(
    'no preset → no grid, no patch',
    noPreset.customGrid === undefined && noPreset.a === 1 && !('dialStyle' in noPreset),
);

const failed = results.filter((r) => !r.ok);
for (const r of failed) console.log(`  FAIL ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
console.log(`custom-grid-presets: ${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
