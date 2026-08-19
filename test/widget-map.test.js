'use strict';

/**
 * Guards the type → component map for widgets.
 *
 * Regression: WidgetFrame.tsx kept its own private copy of the map next to the shared
 * `components/widgets/widgetMap.ts`. A new type added only to the private copy rendered
 * fine on the dashboard but showed "Unbekannter Widget-Typ" everywhere the shared map is
 * used — the Spiegel widget, the popup embed and the tab embed (this happened to `menu`).
 *
 * Two invariants, checked statically so no browser/dev-server is needed:
 *   1. Every WidgetType from src-vis/types/index.ts has an entry in the shared map.
 *   2. No other module defines a second type → component map.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// ── 1. Shared map covers every widget type ───────────────────────────────────
const types = read('src-vis/types/index.ts')
    .split('export type WidgetType =')[1]
    .split(';')[0]
    .split('|')
    .map((s) => s.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);

assert.ok(types.length > 40, `expected the WidgetType union, got ${types.length} entries`);

const mapSrc = read('src-vis/components/widgets/widgetMap.ts');
const mapBody = mapSrc.split('export function getWidgetMap')[1];
assert.ok(mapBody, 'getWidgetMap() not found in widgetMap.ts');

const keys = [...mapBody.matchAll(/^\s{8}([A-Za-z0-9_]+): [A-Za-z0-9_]+,$/gm)].map((m) => m[1]);

const missing = types.filter((t) => !keys.includes(t));
assert.deepStrictEqual(missing, [], `widget types without a component in widgetMap.ts: ${missing.join(', ')}`);

const unknown = keys.filter((k) => !types.includes(k));
assert.deepStrictEqual(unknown, [], `widgetMap.ts entries that are not a WidgetType: ${unknown.join(', ')}`);

// ── 2. widgetMap.ts is the only map ──────────────────────────────────────────
function walk(dir) {
    return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) return walk(rel);
        return /\.tsx?$/.test(e.name) ? [rel] : [];
    });
}

const duplicates = walk('src-vis')
    .filter((f) => f !== 'src-vis/components/widgets/widgetMap.ts')
    .filter((f) => /function getWidgetMap\s*\(/.test(read(f)));

assert.deepStrictEqual(
    duplicates,
    [],
    `these modules define a second widget map — import getWidgetMap from components/widgets/widgetMap.ts instead: ${duplicates.join(', ')}`,
);

console.log(`✓ widget map: ${types.length} widget types, all mapped, single source of truth`);
