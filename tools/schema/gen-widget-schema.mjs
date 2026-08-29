#!/usr/bin/env node
/**
 * Generates the machine-readable AURA widget schema.
 *
 *   node tools/schema/gen-widget-schema.mjs [--check]
 *
 * Output: public/ai/aura-widget-schema.json (copied to www/ai/… by the build,
 * so it is servable at <aura>/ai/aura-widget-schema.json).
 *
 * The schema describes every widget type an AURA dashboard can hold — its label,
 * default size, available layouts and the option keys it evaluates — so that a
 * language model can produce a valid widget/tab JSON for the existing import
 * dialog ("Widget importieren") without having to read the source.
 *
 * Three sources, in descending order of trust:
 *   1. widgetRegistry.tsx + widgetLayouts.ts — bundled and executed, so the
 *      labels, sizes and layout lists can never drift from the app.
 *   2. A named options interface where the widget has one (StatusOverviewOptions,
 *      AutoListOptions, …) — field types and JSDoc taken verbatim.
 *   3. The option reads in the widget component itself (see extract-options.mjs).
 *
 * On top of that sits the hand-written overlay (widget-schema-overlay.mjs) for
 * descriptions and corrections. `--check` fails when the committed JSON is stale.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

import { SourceIndex } from './ts-source-index.mjs';
import { extractOptionKeys, readWidgetMap, optionsInterfaceName } from './extract-options.mjs';
import { KEY_DESCRIPTIONS, WIDGET_OPTION_NOTES, DROP_KEYS, EXTRA_OPTIONS } from './widget-schema-overlay.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const SRC = path.join(ROOT, 'src-vis');
const WIDGETS_DIR = path.join(SRC, 'components/widgets');
const OUT_FILE = path.join(ROOT, 'public/ai/aura-widget-schema.json');
const CACHE_DIR = path.join(ROOT, 'node_modules/.cache');

/** A key read by at least this many widgets is hoisted into `commonOptions`. */
const COMMON_MIN = 6;

// ── 1. Registry + layout list, executed rather than parsed ────────────────────

async function loadRegistry() {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const entry = path.join(CACHE_DIR, 'aura-schema-entry.ts');
    fs.writeFileSync(
        entry,
        [
            `export { WIDGET_REGISTRY, WIDGET_GROUPS, DEFAULT_CONDITION_SLOTS } from ${JSON.stringify(path.join(SRC, 'widgetRegistry').replace(/\\/g, '/'))};`,
            `export { getAvailableLayouts } from ${JSON.stringify(path.join(SRC, 'utils/widgetLayouts').replace(/\\/g, '/'))};`,
        ].join('\n'),
    );

    // The registry imports lucide icon components purely to render them; the
    // schema only needs the `iconName` strings next to them. Stub the package so
    // the bundle stays tiny and does not depend on lucide's own build.
    const stubLucide = {
        name: 'stub-lucide',
        setup(build) {
            build.onResolve({ filter: /^lucide-react$/ }, () => ({ path: 'lucide', namespace: 'stub' }));
            build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
                contents: 'module.exports = new Proxy({}, { get: () => () => null });',
                loader: 'js',
            }));
        },
    };

    const outfile = path.join(CACHE_DIR, 'aura-schema-registry.mjs');
    await esbuild.build({
        entryPoints: [entry],
        outfile,
        bundle: true,
        format: 'esm',
        platform: 'node',
        logLevel: 'silent',
        plugins: [stubLucide],
    });
    return import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
}

// ── 2. Type normalisation ─────────────────────────────────────────────────────

const PRIMITIVES = new Set(['string', 'number', 'boolean']);

/**
 * Split on commas that are not nested inside brackets, so `Record<string, X>`
 * inside a tuple stays one member.
 *
 * @param s
 */
function splitTopLevel(s) {
    const out = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if ('<[({'.includes(c)) {
            depth++;
        } else if ('>])}'.includes(c)) {
            depth--;
        } else if (c === ',' && depth === 0) {
            out.push(s.slice(start, i).trim());
            start = i + 1;
        }
    }
    out.push(s.slice(start).trim());
    return out.filter(Boolean);
}

/**
 * Turn a TypeScript type string into a schema entry, registering any named type
 * it references in `types` so the schema stays self-contained.
 *
 * @param raw
 * @param index
 * @param types
 * @param depth
 */
function normalizeType(raw, index, types, depth = 0) {
    if (!raw) {
        return {};
    }
    let t = String(raw)
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/\s*\|\s*undefined$/, '');

    // 'a' | 'b' | 'c'
    const parts = t.split('|').map((p) => p.trim());
    if (parts.length > 1 && parts.every((p) => /^'[^']*'$/.test(p))) {
        return { type: 'string', enum: parts.map((p) => p.slice(1, -1)) };
    }
    if (/^'[^']*'$/.test(t)) {
        return { type: 'string', enum: [t.slice(1, -1)] };
    }

    if (PRIMITIVES.has(t)) {
        return { type: t };
    }
    if (t === 'unknown' || t === 'any') {
        return {};
    }
    // An inline object type spread over several lines; the field reader only
    // sees its opening brace.
    if (t.startsWith('{')) {
        return { type: 'object' };
    }

    // string | number — an option that legitimately accepts either.
    if (parts.length > 1 && parts.every((p) => PRIMITIVES.has(p))) {
        return { type: parts };
    }

    // [number, string] — a fixed-length tuple, e.g. one colour threshold.
    const tuple = t.match(/^\[(.+)\]$/);
    if (tuple) {
        return {
            type: 'array',
            tuple: splitTopLevel(tuple[1]).map((p) => normalizeType(p, index, types, depth + 1)),
        };
    }

    // Foo[] / Array<Foo>
    const arr = t.match(/^(.+)\[\]$/) ?? t.match(/^Array<(.+)>$/);
    if (arr) {
        const items = normalizeType(arr[1], index, types, depth + 1);
        return { type: 'array', items };
    }

    // SomeInterface['field']
    const indexed = t.match(/^([A-Za-z_$][\w$]*)\['([^']+)'\]$/);
    if (indexed) {
        const fields = index.interfaceFields(indexed[1]);
        const field = fields[indexed[2]];
        if (field) {
            return normalizeType(field.type, index, types, depth + 1);
        }
        return { type: 'string' };
    }

    // Record<…> / Partial<…> and other generics — keep the source text, it is
    // more informative to a reader than a bare "object".
    if (/[<>{]/.test(t)) {
        return { type: 'object', tsType: t };
    }

    // A named alias or interface.
    const union = index.stringUnion(t);
    if (union) {
        types[t] ??= { type: 'string', enum: union };
        return { type: 'string', ref: t };
    }
    if (depth < 2 && !types[t]) {
        const fields = index.interfaceFields(t);
        if (Object.keys(fields).length) {
            types[t] = { type: 'object', fields: {} };
            for (const [k, f] of Object.entries(fields)) {
                types[t].fields[k] = {
                    ...normalizeType(f.type, index, types, depth + 1),
                    ...(f.optional ? {} : { required: true }),
                    ...(f.description ? { description: f.description } : {}),
                };
            }
        }
    }

    // An alias that is neither a union of literals nor an object — a tuple, for
    // instance (`type ColorThreshold = [number, string]`). Resolve it one level.
    if (depth < 2 && !types[t]) {
        const alias = index.typeAliasBody(t);
        if (alias && alias !== t && !alias.startsWith('{')) {
            const resolved = normalizeType(alias, index, types, depth + 1);
            if (resolved.type) {
                types[t] = resolved;
            }
        }
    }

    return types[t] ? { type: types[t].type, ref: t } : { tsType: t };
}

// ── 3. Per-widget option collection ───────────────────────────────────────────

/**
 * Option keys ending in …Dp / …Datapoint hold an ioBroker state id. Flagging
 * them is the single most useful hint in the whole schema: it tells a generator
 * that the value must be an id that exists, not free text it may invent.
 *
 * @param options
 */
function markDatapointKeys(options) {
    for (const [key, entry] of Object.entries(options)) {
        if (entry.type === 'string' && /(?:Dp|Datapoint)$/.test(key)) {
            entry.datapoint = true;
        }
    }
    return options;
}

function collectWidgetOptions(type, file, index, types) {
    const options = {};

    // 3a. A named options interface, where one exists.
    const ifaceName = file ? optionsInterfaceName(file) : null;
    if (ifaceName) {
        for (const [key, field] of Object.entries(index.interfaceFields(ifaceName))) {
            options[key] = {
                ...normalizeType(field.type, index, types),
                ...(field.description ? { description: field.description } : {}),
                ...(field.optional ? {} : { required: true }),
                source: 'interface',
            };
        }
    }

    // 3b. The reads in the component. Fills in defaults the interface does not
    //     carry and adds keys that never made it into one.
    if (file) {
        for (const [key, info] of Object.entries(extractOptionKeys(file, WIDGETS_DIR))) {
            const existing = options[key];
            if (existing) {
                if (existing.default === undefined && info.default !== undefined) {
                    existing.default = info.default;
                }
                continue;
            }
            options[key] = {
                ...normalizeType(info.type, index, types),
                ...(info.default !== undefined ? { default: info.default } : {}),
                source: 'component',
            };
        }
    }

    // 3c. Overlay: drop misreads, add what the readers cannot see, annotate.
    for (const key of DROP_KEYS[type] ?? []) {
        delete options[key];
    }
    for (const [key, entry] of Object.entries(EXTRA_OPTIONS[type] ?? {})) {
        options[key] = { ...(options[key] ?? {}), ...entry, source: 'overlay' };
    }
    for (const [key, entry] of Object.entries(options)) {
        if (KEY_DESCRIPTIONS[key]) {
            entry.description = KEY_DESCRIPTIONS[key];
        }
    }
    const stale = [];
    for (const [key, note] of Object.entries(WIDGET_OPTION_NOTES[type] ?? {})) {
        if (options[key]) {
            options[key] = { ...options[key], ...note };
        } else {
            stale.push(`${type}.${key}`);
        }
    }

    return { options: markDatapointKeys(options), stale };
}

// ── 4. Assembly ───────────────────────────────────────────────────────────────

/**
 * Same value domain — the precondition for describing a key once, centrally.
 *
 * @param a
 * @param b
 */
function sameDomain(a, b) {
    return a.type === b.type && a.ref === b.ref && JSON.stringify(a.enum) === JSON.stringify(b.enum);
}

/**
 * Same domain AND same default, so a widget can defer to the shared entry.
 *
 * @param a
 * @param b
 */
function sameShape(a, b) {
    return sameDomain(a, b) && JSON.stringify(a.default) === JSON.stringify(b.default);
}

/**
 * The value at least half of the entries agree on, else undefined.
 *
 * @param entries
 */
function majorityDefault(entries) {
    const votes = new Map();
    for (const e of entries) {
        const k = JSON.stringify(e.default ?? null);
        votes.set(k, (votes.get(k) ?? 0) + 1);
    }
    const [best, count] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
    return count * 2 >= entries.length ? JSON.parse(best) : undefined;
}

async function build() {
    const reg = await loadRegistry();
    const index = new SourceIndex(SRC);
    const widgetMap = readWidgetMap(WIDGETS_DIR);
    const types = {};

    const perWidget = {};
    const staleNotes = [];
    for (const meta of reg.WIDGET_REGISTRY) {
        const { options, stale } = collectWidgetOptions(meta.type, widgetMap[meta.type] ?? null, index, types);
        perWidget[meta.type] = { meta, options };
        staleNotes.push(...stale);
    }

    // Hoist option keys that most widgets share (showTitle, iconSize, …) into a
    // single block. Without this, ~40 % of the file is the same dozen keys
    // repeated 55 times — and the whole point is to fit in a prompt.
    const tally = new Map();
    for (const { options } of Object.values(perWidget)) {
        for (const [key, entry] of Object.entries(options)) {
            const list = tally.get(key) ?? [];
            list.push(entry);
            tally.set(key, list);
        }
    }
    const commonOptions = {};
    for (const [key, entries] of tally) {
        if (entries.length < COMMON_MIN) {
            continue;
        }
        // Agreement is on the value domain, not on the default: `showTitle` means
        // the same everywhere even where one widget defaults it to false.
        const ref = entries.find((e) => e.description) ?? entries[0];
        const agreeing = entries.filter((e) => sameDomain(e, ref));
        if (agreeing.length < COMMON_MIN) {
            continue;
        }
        const dflt = majorityDefault(agreeing);
        commonOptions[key] = {
            type: ref.type,
            ...(ref.enum ? { enum: ref.enum } : {}),
            ...(ref.ref ? { ref: ref.ref } : {}),
            ...(ref.items ? { items: ref.items } : {}),
            ...(dflt !== undefined && dflt !== null ? { default: dflt } : {}),
            ...(ref.datapoint ? { datapoint: true } : {}),
            description: KEY_DESCRIPTIONS[key] ?? ref.description,
        };
    }

    const widgets = {};
    const missingDesc = [];
    for (const type of Object.keys(perWidget).sort()) {
        const { meta, options } = perWidget[type];
        const common = [];
        const own = {};
        for (const key of Object.keys(options).sort()) {
            const entry = options[key];
            const shared = commonOptions[key];
            if (shared && sameShape(entry, shared)) {
                common.push(key);
                continue;
            }
            const { source, ...rest } = entry;
            // Same key, different default (or a widget-specific note): keep the
            // entry here but let it inherit the shared wording.
            if (shared && sameDomain(entry, shared) && !rest.description) {
                rest.description = shared.description;
            }
            if (!rest.description) {
                missingDesc.push(`${type}.${key}`);
            }
            own[key] = rest;
        }
        widgets[type] = {
            label: meta.label,
            group: meta.widgetGroup,
            addMode: meta.addMode,
            ...(meta.hint ? { hint: meta.hint } : {}),
            ...(meta.hidden ? { deprecated: true } : {}),
            defaultSize: { w: meta.defaultW, h: meta.defaultH },
            layouts: reg.getAvailableLayouts(type),
            conditionSlots: meta.conditionSlots ?? reg.DEFAULT_CONDITION_SLOTS,
            ...(meta.popupDefaults ? { popupOptionKeys: Object.keys(meta.popupDefaults) } : {}),
            commonOptions: common,
            options: own,
        };
    }

    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const schema = {
        $meta: {
            name: 'AURA widget schema',
            auraVersion: pkg.version,
            generator: 'tools/schema/gen-widget-schema.mjs',
            purpose:
                'Describes every AURA widget type so a JSON widget/tab config can be generated ' +
                'and pasted into the dashboard editor ("Widget importieren").',
            usage: [
                'A widget object needs id, type, title, datapoint and gridPos.',
                'gridPos is in grid cells, not pixels: x/w are columns, y/h are rows. The column count is NOT ' +
                    'fixed — it follows the dashboard width and the configured horizontal snap, so take it from the prompt.',
                'options accepts the keys under widgets.<type>.options plus every key ' +
                    'listed in widgets.<type>.commonOptions (defined once under commonOptions).',
                'layout must be one of widgets.<type>.layouts; omit it for "default".',
                'An option marked "datapoint": true must be an existing ioBroker state id — never invent one.',
                'Names referenced as "ref" are defined under types.',
                'A missing "description" means the key is only documented by its name, type and default.',
            ],
        },
        widgetConfig: {
            id: { type: 'string', required: true, description: 'Eindeutige Id, z. B. "w-1712345678-a1b2".' },
            type: { type: 'string', required: true, description: 'Widget-Typ, Schlüssel aus "widgets".' },
            title: { type: 'string', required: true, description: 'Überschrift des Widgets.' },
            datapoint: {
                type: 'string',
                required: true,
                description: 'ioBroker-State-Id. Leerstring bei Typen mit addMode "free" (Uhr, Überschrift, Gruppe …).',
            },
            gridPos: {
                type: 'object',
                required: true,
                description:
                    'Position und Größe in Rasterzellen: x/w Spalten, y/h Zeilen. Die Spaltenzahl ist nicht fest — ' +
                    'sie folgt der Dashboardbreite und der Raster-Einstellung und steht im Prompt.',
                fields: {
                    x: { type: 'number', required: true },
                    y: { type: 'number', required: true },
                    w: { type: 'number', required: true },
                    h: { type: 'number', required: true },
                },
            },
            layout: { type: 'string', description: 'Darstellungsvariante, siehe widgets.<type>.layouts.' },
            options: { type: 'object', description: 'Widget-spezifische Optionen, siehe widgets.<type>.' },
            mobileOrder: { type: 'number', description: 'Reihenfolge in der einspaltigen Mobilansicht.' },
        },
        groups: reg.WIDGET_GROUPS,
        commonOptions,
        types,
        widgets,
    };

    return { schema, missingDesc, staleNotes };
}

// ── 5. CLI ────────────────────────────────────────────────────────────────────

const { schema, missingDesc, staleNotes } = await build();
const json = `${JSON.stringify(schema, null, 2)}\n`;
const check = process.argv.includes('--check');

if (check) {
    const current = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, 'utf8') : '';
    if (current !== json) {
        console.error('aura-widget-schema.json is stale — run: npm run schema');
        process.exit(1);
    }
    console.log('aura-widget-schema.json is up to date.');
} else {
    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, json);
    const widgetCount = Object.keys(schema.widgets).length;
    const optionCount = Object.values(schema.widgets).reduce(
        (n, w) => n + Object.keys(w.options).length + w.commonOptions.length,
        0,
    );
    console.log(
        `${path.relative(ROOT, OUT_FILE).replace(/\\/g, '/')}: ${widgetCount} widgets, ` +
            `${optionCount} options (${Object.keys(schema.commonOptions).length} shared), ` +
            `${Object.keys(schema.types).length} types, ${(json.length / 1024).toFixed(0)} KB`,
    );
    console.log(`ohne Beschreibung: ${missingDesc.length}`);
    if (staleNotes.length) {
        console.warn(`Overlay-Notizen ohne passenden Schluessel (${staleNotes.length}): ${staleNotes.join(', ')}`);
    }
    if (process.argv.includes('--report')) {
        const byType = {};
        for (const entry of missingDesc) {
            const [t, k] = entry.split('.');
            (byType[t] ??= []).push(k);
        }
        for (const [t, keys] of Object.entries(byType).sort((a, b) => b[1].length - a[1].length)) {
            console.log(`  ${t.padEnd(16)} ${String(keys.length).padStart(3)}  ${keys.join(' ')}`);
        }
    }
}
