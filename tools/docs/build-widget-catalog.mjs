// Build the machine-readable widget catalog (SSoT) + a compact "referenz.md"
// primer that Claude reads before designing a dashboard mockup.
//
// Structural data (type, slug, group, default grid, layouts, shot files,
// screenshot paths) is derived automatically from widgets-meta.mjs. Because the
// code has no central per-widget option schema (WidgetConfig.options is
// Record<string, unknown>), the per-widget OPTION_SEED and CUSTOM_KEYS maps
// below are hand-maintained and grow as widgets are piloted. Cross-cutting
// options that apply to nearly all widgets live once in CROSSCUTTING.
//
// Run: node tools/docs/build-widget-catalog.mjs
import { writeFileSync } from 'node:fs';
import { WIDGETS, GROUPS } from '../screenshots/widgets-meta.mjs';

const DOCS = 'docs/widgets';

// ── Options that apply to (nearly) every widget ──────────────────────────────
const CROSSCUTTING = [
    { key: 'clickAction', type: 'ClickAction', default: '{ kind: "none" }', note: 'Klick/Tap-Aktion (Popup, Link, DP schreiben …)' },
    { key: 'conditions', type: 'WidgetCondition[]', default: '[]', note: 'Bedingte Farb-/Sichtbarkeits-Styles' },
    { key: 'badges', type: 'BadgeDef[]', default: '[]', note: 'Overlay-Indikatoren an der Kartenecke' },
    { key: 'batteryDp', type: 'datapoint', default: '—', note: 'Batterie-Badge' },
    { key: 'unreachDp', type: 'datapoint', default: '—', note: 'Erreichbarkeits-Badge' },
    { key: 'popupTitle', type: 'string', default: '—', note: 'Titel im geöffneten Popup' },
    { key: 'popupShowHistory', type: 'boolean', default: 'false', note: 'History-Icon im Popup' },
];

// ── Per-widget option schema, seeded from the MD tables + component source ────
// scope: 'widget' = widget-specific · 'datapoint' = DP reference.
const OPTION_SEED = {
    thermostat: [
        { key: 'actualDatapoint', type: 'datapoint', default: '—', note: 'Ist-Temperatur-DP' },
        { key: 'showTitle', type: 'boolean', default: 'true' },
        { key: 'showIcon', type: 'boolean', default: 'true' },
        { key: 'showSetpoint', type: 'boolean', default: 'true' },
        { key: 'showActualTemp', type: 'boolean', default: 'true' },
        { key: 'showControls', type: 'boolean', default: 'true' },
        { key: 'showPresets', type: 'boolean', default: 'true' },
        { key: 'presets', type: 'number[]', default: '[18,20,22,24]' },
        { key: 'icon', type: 'lucide-icon', default: 'Thermometer' },
        { key: 'iconSize', type: 'number(px)', default: '20' },
        { key: 'titleAlign', type: 'enum', enum: ['left', 'center', 'right'], default: 'left' },
        { key: 'decimals', type: 'number', default: 'global' },
        { key: 'minTemp', type: 'number', default: '10' },
        { key: 'maxTemp', type: 'number', default: '30' },
        { key: 'step', type: 'number', default: '0.5' },
        { key: 'colorThresholds', type: '[number,color][]', default: '—', note: 'färbt die Ist-Temperatur' },
    ],
};

// Component keys usable in a widget's custom-layout cells (extraComponents / extraFields).
const CUSTOM_KEYS = {
    thermostat: {
        components: ['icon', 'btn-plus', 'btn-minus', 'battery-icon', 'reach-icon', 'status-badges'],
        fields: ['setpoint', 'actual', 'status', 'battery', 'reach'],
    },
};

// ── Derive one catalog entry per widget ──────────────────────────────────────
function heroShot(w) {
    if (!Array.isArray(w.shots) || !w.shots.length) return `assets/${w.slug}/runtime.png`;
    const def = w.shots.find((s) => s.file === 'layout-default') ?? w.shots[0];
    return `assets/${w.slug}/${def.file}.png`;
}

const widgets = WIDGETS.map((w) => {
    const rt = w.runtime ?? {};
    const shots = Array.isArray(w.shots) ? w.shots.map((s) => ({ file: s.file, layout: s.layout ?? 'default' })) : [];
    return {
        type: w.type,
        slug: w.slug,
        label: w.label,
        group: w.group,
        hint: w.hint,
        defaultGrid: { w: rt.w ?? 12, h: rt.h ?? 6 },
        layouts: w.layouts ?? ['default'],
        options: OPTION_SEED[w.slug] ?? [],
        crosscutting: w.runtime === null ? [] : CROSSCUTTING.map((o) => o.key),
        customComponentKeys: CUSTOM_KEYS[w.slug] ?? null,
        screenshots: {
            hero: heroShot(w),
            config: `assets/${w.slug}/config.png`,
            shots: Object.fromEntries(shots.map((s) => [s.file, `assets/${w.slug}/${s.file}.png`])),
        },
    };
});

const catalog = {
    version: 1,
    generatedFrom: 'tools/screenshots/widgets-meta.mjs',
    generatedAt: new Date().toISOString().slice(0, 10),
    note: 'SSoT for Aura widgets. Options are seeded semi-automatically (see build-widget-catalog.mjs).',
    groups: GROUPS,
    crosscutting: CROSSCUTTING,
    widgets,
};

writeFileSync(`${DOCS}/catalog.json`, JSON.stringify(catalog, null, 2) + '\n');
console.log(`wrote catalog.json (${widgets.length} widgets)`);

// ── Render the compact referenz.md primer ────────────────────────────────────
const L = [];
L.push('# Widget-Referenz (Primer)');
L.push('');
L.push('Maschinenlesbarer Katalog aller Aura-Widgets — Single Source of Truth für Layouts, Optionen und Farben. Für optische Mockups **zuerst diese Seite und die [Design-Tokens](../einstellungen/design-tokens) lesen**, dann die Einzelseiten für Details/Screenshots. Rohdaten: [`catalog.json`](./catalog.json).');
L.push('');
L.push('Nicht nur das Default-Layout verwenden: jedes Widget kann in **allen** unten gelisteten Layouts gerendert werden.');
L.push('');

for (const grp of GROUPS) {
    const inGroup = widgets.filter((w) => w.group === grp.id);
    if (!inGroup.length) continue;
    L.push(`## ${grp.label}`, '');
    L.push('| Widget | `type` | Layouts | Default-Grid (w×h) |');
    L.push('| --- | --- | --- | --- |');
    for (const w of inGroup) {
        L.push(`| [${w.label}](./${w.slug}) | \`${w.type}\` | ${w.layouts.map((l) => `\`${l}\``).join(' · ')} | ${w.defaultGrid.w}×${w.defaultGrid.h} |`);
    }
    L.push('');
}

// Detailed option tables for widgets that have a seeded schema.
const detailed = widgets.filter((w) => w.options.length);
if (detailed.length) {
    L.push('## Detaillierte Optionen', '');
    L.push('Bislang formal erfasst (weitere folgen; alle Optionen stehen auf der jeweiligen Widget-Seite):', '');
    for (const w of detailed) {
        L.push(`### ${w.label} \`${w.type}\``, '');
        L.push('| Option | Typ | Standard | |');
        L.push('| --- | --- | --- | --- |');
        for (const o of w.options) {
            const type = o.enum ? o.enum.map((e) => `\`${e}\``).join(' · ') : `\`${o.type}\``;
            L.push(`| \`${o.key}\` | ${type} | \`${o.default}\` | ${o.note ?? ''} |`);
        }
        L.push('');
        if (w.customComponentKeys) {
            const { components, fields } = w.customComponentKeys;
            L.push(`**Custom-Layout-Schlüssel** — Komponenten: ${components.map((c) => `\`${c}\``).join(', ')} · Felder: ${fields.map((f) => `\`${f}\``).join(', ')}`, '');
        }
    }
}

// Cross-cutting options once.
L.push('## Querschnitts-Optionen', '');
L.push('Gelten für nahezu alle Widgets (außer reinen Layout-/Spezial-Widgets ohne Datenpunkt):', '');
L.push('| Option | Typ | Standard | |');
L.push('| --- | --- | --- | --- |');
for (const o of CROSSCUTTING) L.push(`| \`${o.key}\` | \`${o.type}\` | \`${o.default}\` | ${o.note ?? ''} |`);
L.push('');

writeFileSync(`${DOCS}/referenz.md`, L.join('\n'));
console.log('wrote referenz.md');
