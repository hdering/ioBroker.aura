// Verifies the per-operation-mode datapoints of the `aircontrol` widget —
// the Daikin case from issue #650.
//
//   node tools/tests/climate-mode-paths.mjs
//
// Daikin (daikin-cloud) does not have ONE setpoint, one fan speed and one vane
// position: it has a set of them per operation mode, and the mode's own name is
// the path segment. `climateProfiles` therefore stores those paths with a
// `{mode}` placeholder that the widget fills at runtime from `common.states` of
// the operation-mode datapoint. Three things can silently go wrong and each is
// pinned here:
//
//   1. the placeholder survives into an id and the widget subscribes to garbage,
//   2. an unresolved placeholder yields a plausible-looking id ("undefined"),
//   3. discovery probes a `{mode}` path for existence and finds no device.
//
// No dev server needed: the profile module is pure, so it is bundled directly.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-climate-mode-paths-${process.pid}.mjs`);
await build({
    stdin: {
        contents: [
            "export * from './src-vis/utils/climateProfiles.ts';",
            "export { de } from './src-vis/i18n/de.ts';",
            "export { en } from './src-vis/i18n/en.ts';",
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
    CLIMATE_FIELDS,
    CLIMATE_PROFILES,
    applyModeSlug,
    buildDpMap,
    deviceRootRegex,
    getProfile,
    isModePath,
    modeSlugFor,
    requiredStateIds,
    stateLabelKey,
    MODE_LABEL_KEYS,
    FAN_LABEL_KEYS,
    VANE_LABEL_KEYS,
    de,
    en,
} = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const eq = (name, got, want) =>
    results.push({
        name,
        ok: JSON.stringify(got) === JSON.stringify(want),
        detail: `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    });
const ok = (name, cond, detail = '') => results.push({ name, ok: !!cond, detail });

const daikin = getProfile('daikin-cloud');
const mitsu = getProfile('mitsubishi-local-control');
const ROOT = 'daikin-cloud.0.1234567890';
// The states of climateControl.operationMode, verbatim from the issue's export.
const MODE_STATES = { 0: 'fanOnly', 1: 'heating', 2: 'cooling', 3: 'auto', 4: 'dry' };

// ── 1. The profile exists and knows the mode-dependent fields ──
ok('the daikin-cloud profile is registered', !!daikin);
ok('the setpoint path is mode-dependent', isModePath(daikin.relPaths.targetTemp));
ok('the fan speed path is mode-dependent', isModePath(daikin.relPaths.fanSpeed));
ok(
    'both vane paths are mode-dependent',
    isModePath(daikin.relPaths.verticalVane) && isModePath(daikin.relPaths.horizontalVane),
);
ok('the operation mode itself is NOT mode-dependent', !isModePath(daikin.relPaths.mode));
ok(
    'the mitsubishi profile stays free of placeholders',
    Object.values(mitsu.relPaths).every((p) => !isModePath(p)),
);

// ── 2. The mode value becomes the path segment ──
// This is the whole mechanism: value 2 is called "cooling", and "cooling" is the
// folder the cooling setpoint sits in.
eq('the live state name wins', modeSlugFor(2, MODE_STATES, daikin), 'cooling');
eq('a device without common.states falls back to the profile', modeSlugFor(2, null, daikin), 'cooling');
eq('an unknown value has no slug', modeSlugFor(9, MODE_STATES, daikin), null);
eq('no mode value yet, no slug', modeSlugFor(null, MODE_STATES, daikin), null);
eq('a device that renumbers its modes is followed, not overruled', modeSlugFor(0, { 0: 'cooling' }, daikin), 'cooling');

// ── 3. Substitution ──
const map = buildDpMap(daikin, ROOT);
eq(
    'the stored id keeps the placeholder',
    map.targetTempDp,
    `${ROOT}.climateControl.temperatureControl.operationModes.{mode}.setpoints.roomTemperature`,
);
eq(
    'cooling resolves to the cooling setpoint',
    applyModeSlug(map.targetTempDp, 'cooling'),
    `${ROOT}.climateControl.temperatureControl.operationModes.cooling.setpoints.roomTemperature`,
);
eq(
    'heating resolves to a DIFFERENT setpoint',
    applyModeSlug(map.targetTempDp, 'heating'),
    `${ROOT}.climateControl.temperatureControl.operationModes.heating.setpoints.roomTemperature`,
);
// An unknown mode must produce no datapoint at all. Anything else — the raw
// template, or a path with "undefined" in it — is a subscription to nothing that
// the widget would render as a live-looking dash.
eq('an unresolved mode yields no datapoint', applyModeSlug(map.targetTempDp, null), '');
eq('an empty slug yields no datapoint', applyModeSlug(map.targetTempDp, ''), '');
eq('a plain id is handed through untouched', applyModeSlug(map.powerDp, null), `${ROOT}.climateControl.onOffMode`);
eq('an empty id stays empty', applyModeSlug('', 'cooling'), '');
ok(
    'no resolved id keeps a placeholder',
    Object.values(map)
        .filter(Boolean)
        .every((id) => !applyModeSlug(id, 'cooling').includes('{mode}')),
);

// ── 4. Switching the profile must not leave foreign datapoints behind ──
// buildDpMap answers for EVERY field, so spreading it clears what the previous
// manufacturer wrote; otherwise a Daikin widget keeps pointing its consumption
// at a Mitsubishi state.
const fieldKeys = CLIMATE_FIELDS.map((f) => f.optionKey);
ok(
    'buildDpMap answers for every field',
    fieldKeys.every((k) => k in map),
);
eq('a field the profile does not know is cleared', map.consumptionDp, undefined);
eq('a field the profile does know is set', map.humidityDp, `${ROOT}.climateControl.sensoryData.roomHumidity`);

// ── 5. Discovery ──
// Daikin devices sit directly under the instance, not under `.devices.`.
const re = deviceRootRegex(daikin);
eq('a daikin state yields its device root', `${ROOT}.climateControl.onOffMode`.match(re)?.[1], ROOT);
eq(
    'a mitsubishi state yields its device root',
    'mitsubishi-local-control.0.devices.e8c7cf294cb3.control.power'.match(deviceRootRegex(mitsu))?.[1],
    'mitsubishi-local-control.0.devices.e8c7cf294cb3',
);
ok(
    'a mitsubishi root pattern does not match a daikin id',
    !`${ROOT}.climateControl.onOffMode`.match(deviceRootRegex(mitsu)),
);
// The setpoint is required for Mitsubishi but can never be probed for Daikin —
// it does not exist in "dry" and its id is unknown before the device reports a
// mode. Probing it anyway would find zero devices.
const required = requiredStateIds(daikin, ROOT);
ok(
    'no required id carries a placeholder',
    required.every((id) => !id.includes('{mode}')),
);
eq('discovery probes exactly the three static states', required.sort(), [
    `${ROOT}.climateControl.onOffMode`,
    `${ROOT}.climateControl.operationMode`,
    `${ROOT}.climateControl.sensoryData.roomTemperature`,
]);
eq(
    'mitsubishi still probes its setpoint',
    requiredStateIds(mitsu, 'mitsubishi-local-control.0.devices.x').includes(
        'mitsubishi-local-control.0.devices.x.control.targetTemperature',
    ),
    true,
);

// ── 6. Raw adapter state names become readable labels ──
eq('cooling is a known mode', stateLabelKey('mode', 'cooling'), 'aircontrol.mode.cool');
eq('fanOnly is a known mode', stateLabelKey('mode', 'fanOnly'), 'aircontrol.mode.vent');
eq('quiet is a known fan speed', stateLabelKey('fan', 'quiet'), 'aircontrol.fan.quiet');
eq('windNice is a known vane position', stateLabelKey('vane', 'windNice'), 'aircontrol.vane.windNice');
eq('an unknown name is shown as the adapter wrote it', stateLabelKey('mode', 'turboPlus'), null);
// "auto" exists in both enums and must not borrow the other one's translation.
eq('auto is a mode label', stateLabelKey('mode', 'auto'), 'aircontrol.mode.auto');
eq('auto is also a fan label', stateLabelKey('fan', 'auto'), 'aircontrol.fan.auto');

// ── 7. The temperature range stays with the datapoint ──
// Daikin allows 10…30 heating but 18…32 cooling. A range frozen into the widget
// options would clamp one of them wrong, so the profile says so out loud.
ok('daikin defers its temperature limits to the datapoint', daikin.tempRangeFromDatapoint === true);
ok('mitsubishi keeps its fixed range', !mitsu.tempRangeFromDatapoint);
ok('every profile id is unique', new Set(CLIMATE_PROFILES.map((p) => p.id)).size === CLIMATE_PROFILES.length);

// ── 8. Every translated label really exists ──
// A missing key renders as the key itself, so a selector would offer a button
// labelled "aircontrol.vane.windNice".
const allRaw = [
    ...Object.keys(MODE_LABEL_KEYS).map((r) => ['mode', r]),
    ...Object.keys(FAN_LABEL_KEYS).map((r) => ['fan', r]),
    ...Object.keys(VANE_LABEL_KEYS).map((r) => ['vane', r]),
];
const missing = [];
for (const [kind, raw] of allRaw) {
    const key = stateLabelKey(kind, raw);
    if (!(key in de)) missing.push(`de:${key}`);
    if (!(key in en)) missing.push(`en:${key}`);
}
// Same for the fallback enums a profile ships for devices without common.states.
for (const p of CLIMATE_PROFILES) {
    for (const e of p.modes) if (!(`aircontrol.mode.${e.labelKey}` in de)) missing.push(`de:mode.${e.labelKey}`);
    for (const e of p.fanSpeeds) if (!(`aircontrol.fan.${e.labelKey}` in de)) missing.push(`de:fan.${e.labelKey}`);
    for (const e of p.modes) if (!(`aircontrol.mode.${e.labelKey}` in en)) missing.push(`en:mode.${e.labelKey}`);
    for (const e of p.fanSpeeds) if (!(`aircontrol.fan.${e.labelKey}` in en)) missing.push(`en:fan.${e.labelKey}`);
}
eq('every label key is translated in both languages', [...new Set(missing)], []);
// The config panel labels one row per field.
const untranslatedFields = CLIMATE_FIELDS.filter(
    (f) => !(`aircontrol.field.${f.key}` in de) || !(`aircontrol.field.${f.key}` in en),
).map((f) => f.key);
eq('every field row has a label', untranslatedFields, []);

const failed = results.filter((r) => !r.ok);
for (const r of results) {
    console.log(`${r.ok ? '  ✓' : '  ✗'} ${r.name}${r.ok ? '' : ` — ${r.detail}`}`);
}
console.log(`\nclimate-mode-paths: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
