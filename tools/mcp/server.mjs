#!/usr/bin/env node
/**
 * MCP server for AURA dashboards — phase A, read-only.
 *
 * Pairs with the ioBroker MCP server: that one knows which datapoints exist, in
 * which room, on which device; this one knows what AURA can render and whether a
 * proposed configuration is actually valid. Together they let a model design a
 * dashboard from the real installation instead of from guesses.
 *
 * Deliberately without any write tool. Writing the dashboard means a
 * read-modify-write across two states (`config.dashboard` and
 * `config.group-defs`), a backup beforehand, and a story for the case where an
 * editor is open in a browser — that is phase B. Everything here is safe to run
 * against a live system.
 *
 *   AURA_IOBROKER_URL   address of Aura's own server, default http://127.0.0.1:8095
 *   AURA_NAMESPACE      adapter instance, default aura.0
 *   AURA_SCHEMA         path to the widget schema, default public/ai/…
 */

import './stdio-guard.mjs';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStdio } from './jsonrpc.mjs';
import { renderTypeIndex, renderTypeDetail, renderWidgetShape } from './render.mjs';
import { validateAny } from './validate.mjs';
import { listStateIds, auraNamespace, ioBrokerUrl } from './iobroker.mjs';
import {
    readDashboard,
    readGroupDefs,
    readGrid,
    allTabs,
    findTab,
    designColumns,
    collectDefIds,
} from './aura-config.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = process.env.AURA_SCHEMA ?? path.resolve(HERE, '../../public/ai/aura-widget-schema.json');

let schemaCache = null;
function schema() {
    if (!schemaCache) {
        if (!fs.existsSync(SCHEMA_PATH)) {
            throw new Error(`Widget-Schema nicht gefunden: ${SCHEMA_PATH}. "npm run schema" im AURA-Repo ausführen.`);
        }
        schemaCache = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    }
    return schemaCache;
}

const text = (s) => ({ content: [{ type: 'text', text: s }] });
const fail = (s) => ({ content: [{ type: 'text', text: s }], isError: true });

// ── Tools ─────────────────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: 'aura_widget_types',
        description:
            'Lists every AURA widget type with label, default size and available layouts. Start here to pick ' +
            'the right types, then fetch their options with aura_widget_schema.',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'aura_widget_schema',
        description:
            'Full option documentation for the named widget types, plus the structure of a widget object. ' +
            'Only ask for the types you actually intend to use — the complete schema is large.',
        inputSchema: {
            type: 'object',
            properties: {
                types: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Widget type keys, e.g. ["switch","thermostat"].',
                },
            },
            required: ['types'],
        },
    },
    {
        name: 'aura_dashboard',
        description:
            'The dashboard structure of the running AURA instance: layouts, sections and tabs with their widget ' +
            'counts, the grid geometry and the column width this dashboard is designed for.',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'aura_tab',
        description:
            'The widgets of one tab, as JSON. Use it as a template for style and sizing, and to find free space.',
        inputSchema: {
            type: 'object',
            properties: {
                tab: { type: 'string', description: 'Tab name, slug or id.' },
                layout: { type: 'string', description: 'Layout name or slug, when the tab name is ambiguous.' },
                section: { type: 'string', description: 'Section name or slug, when the tab name is ambiguous.' },
            },
            required: ['tab'],
        },
    },
    {
        name: 'aura_validate',
        description:
            'Checks a widget or a tab payload against the widget schema BEFORE it is imported: unknown options, ' +
            'wrong layouts, bad gridPos, overlapping widgets, missing datapoints. Always run this on generated ' +
            'JSON — a wrong option name is otherwise ignored silently.',
        inputSchema: {
            type: 'object',
            properties: {
                json: {
                    type: 'string',
                    description: 'The widget or aura-tab JSON to check, as a string.',
                },
                checkDatapoints: {
                    type: 'boolean',
                    description: 'Verify every datapoint id against the live ioBroker object tree. Default true.',
                },
            },
            required: ['json'],
        },
    },
];

async function callTool(name, args) {
    switch (name) {
        case 'aura_widget_types':
            return text(
                `AURA ${schema().$meta?.auraVersion ?? ''} — ${Object.keys(schema().widgets).length} Widget-Typen\n\n` +
                    `${renderTypeIndex(schema())}`,
            );

        case 'aura_widget_schema': {
            const types = Array.isArray(args?.types) ? args.types : [];
            if (!types.length) {
                return fail('Keine Typen angegeben. aura_widget_types listet die verfügbaren.');
            }
            return text(
                `# Aufbau eines Widgets\n${renderWidgetShape(schema())}\n\n${renderTypeDetail(types, schema())}`,
            );
        }

        case 'aura_dashboard': {
            const [layouts, grid] = await Promise.all([readDashboard(), readGrid()]);
            if (!layouts.length) {
                return text(`${auraNamespace()} hat noch keine Layouts konfiguriert.`);
            }
            const cols = designColumns(layouts);
            const lines = allTabs(layouts).map(
                (t) =>
                    `- ${t.layoutName} / ${t.sectionName} / ${t.name}` +
                    ` — ${t.widgets.length} Widget(s)${t.disabled ? ', deaktiviert' : ''}`,
            );
            return text(
                [
                    `# Dashboard ${auraNamespace()} (${ioBrokerUrl()})`,
                    '',
                    `Raster: Zeilenhöhe ${grid.rowHeight} px, Spaltenbreite ${grid.snapX} px, Abstand ${grid.gap} px.`,
                    `Entworfen für ${cols} Spalten — x + w eines Widgets darf ${cols} nicht überschreiten.`,
                    '',
                    '# Tabs',
                    ...lines,
                ].join('\n'),
            );
        }

        case 'aura_tab': {
            const layouts = await readDashboard();
            const found = findTab(layouts, args ?? {});
            if (found.error) {
                const names = allTabs(layouts).map((t) => `${t.layoutName}/${t.sectionName}/${t.name}`);
                return fail(`${found.error}\nVorhanden:\n${names.map((n) => `- ${n}`).join('\n')}`);
            }
            const defs = await readGroupDefs();
            const used = collectDefIds(found.tab.widgets, defs);
            const groupDefs = Object.fromEntries([...used].map((id) => [id, defs[id]]));
            const payload = {
                _type: 'aura-tab',
                _version: 1,
                grid: await readGrid(),
                tab: { name: found.tab.name, widgets: found.tab.widgets },
                ...(used.size ? { groupDefs } : {}),
            };
            return text(
                `${found.tab.layoutName} / ${found.tab.sectionName} / ${found.tab.name}\n` +
                    '```json\n' +
                    JSON.stringify(payload, null, 1) +
                    '\n```',
            );
        }

        case 'aura_validate': {
            let payload;
            try {
                payload = JSON.parse(String(args?.json ?? ''));
            } catch (e) {
                return fail(`Kein gültiges JSON: ${e.message}`);
            }

            const ctx = {};
            let dpNote = 'Datenpunkte nicht geprüft.';
            if (args?.checkDatapoints !== false) {
                try {
                    ctx.knownDatapoints = await listStateIds();
                    dpNote = `${ctx.knownDatapoints.size} Datenpunkte gegengeprüft.`;
                } catch (e) {
                    dpNote = `Datenpunkte NICHT geprüft (${e.message}).`;
                }
            }
            try {
                const layouts = await readDashboard();
                if (layouts.length) {
                    ctx.columns = designColumns(layouts);
                }
            } catch {
                /* column bound is optional */
            }

            const { errors, warnings } = validateAny(payload, schema(), ctx);
            const parts = [];
            if (errors.length) {
                parts.push(`# ${errors.length} Fehler\n${errors.map((e) => `- ${e}`).join('\n')}`);
            }
            if (warnings.length) {
                parts.push(`# ${warnings.length} Hinweis(e)\n${warnings.map((w) => `- ${w}`).join('\n')}`);
            }
            if (!errors.length && !warnings.length) {
                parts.push('Keine Beanstandungen.');
            }
            parts.push(dpNote + (ctx.columns ? ` Spaltengrenze ${ctx.columns}.` : ''));
            const out = parts.join('\n\n');
            return errors.length ? fail(out) : text(out);
        }

        default:
            return fail(`Unbekanntes Werkzeug: ${name}`);
    }
}

// ── Wiring ────────────────────────────────────────────────────────────────────

await serveStdio({
    serverInfo: { name: 'aura', version: '1.0.0' },
    tools: TOOLS,
    callTool,
});
