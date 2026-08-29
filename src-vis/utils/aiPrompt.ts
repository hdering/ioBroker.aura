/**
 * Builds the prompt a user pastes into ChatGPT/Claude to have a widget or a whole
 * tab designed, then pastes the answer back into "Widget importieren".
 *
 * The whole point is that the model has never seen AURA. Everything it needs has
 * to be in the text: what the widget JSON looks like, which types exist, which
 * options each type reads, which datapoints this installation actually has, and
 * how wide the grid is right now.
 *
 * Size is the constraint that shapes the format. The full schema is ~270 KB, and
 * a complete ioBroker object tree is far bigger — pasting either is neither
 * practical nor cheap. So:
 *   - all types are listed compactly (label, hint, size, layouts),
 *   - full option detail goes in only for the types the user picked,
 *   - datapoints are filtered by room/function and capped.
 *
 * Pure functions only, so the whole thing is testable without a browser.
 */

import type { WidgetConfig } from '../types';

// ── Schema shape (the parts this module reads) ────────────────────────────────

export interface SchemaOption {
    type?: string | string[];
    enum?: string[];
    ref?: string;
    items?: SchemaOption;
    tuple?: SchemaOption[];
    default?: unknown;
    required?: boolean;
    datapoint?: boolean;
    description?: string;
    tsType?: string;
    fields?: Record<string, SchemaOption>;
}

export interface SchemaWidget {
    label: string;
    group: string;
    addMode: string;
    hint?: string;
    deprecated?: boolean;
    defaultSize: { w: number; h: number };
    layouts: string[];
    conditionSlots: string[];
    popupOptionKeys?: string[];
    commonOptions: string[];
    options: Record<string, SchemaOption>;
}

export interface WidgetSchema {
    $meta: { auraVersion?: string; usage?: string[] };
    widgetConfig: Record<string, SchemaOption>;
    groups: { id: string; label: string }[];
    commonOptions: Record<string, SchemaOption>;
    types: Record<string, SchemaOption>;
    widgets: Record<string, SchemaWidget>;
}

/** One datapoint as the picker already knows it (see hooks/useDatapointList). */
export interface PromptDatapoint {
    id: string;
    name: string;
    type?: string;
    unit?: string;
    role?: string;
    write?: boolean;
    rooms: string[];
    funcs: string[];
}

export interface PromptGrid {
    /** Columns currently available across the dashboard. */
    cols: number;
    rowHeight: number;
    snapX: number;
    gap: number;
}

export interface BuildPromptInput {
    schema: WidgetSchema;
    /** What the user wants built, in their own words. */
    task: string;
    /** Widget types to document in full. Empty = compact list only. */
    types: string[];
    datapoints: PromptDatapoint[];
    grid: PromptGrid;
    /** The tab the result will be added to, for context. */
    currentTab?: { name: string; widgets: WidgetConfig[] } | null;
    /** 'widget' asks for a single widget, 'tab' for a whole tab. */
    target: 'widget' | 'tab';
}

/** Hard ceiling on datapoint rows, so an unfiltered installation cannot blow up the prompt. */
export const MAX_DATAPOINTS = 400;

// ── Rendering helpers ─────────────────────────────────────────────────────────

function renderTypeName(o: SchemaOption): string {
    if (o.enum) {
        return o.enum.map((v) => `"${v}"`).join(' | ');
    }
    if (o.tuple) {
        return `[${o.tuple.map(renderTypeName).join(', ')}]`;
    }
    if (o.type === 'array') {
        return `${o.items ? renderTypeName(o.items) : 'any'}[]`;
    }
    if (o.ref) {
        return o.ref;
    }
    if (Array.isArray(o.type)) {
        return o.type.join(' | ');
    }
    return o.type ?? o.tsType ?? 'any';
}

function renderOption(key: string, o: SchemaOption): string {
    const bits = [`- ${key}: ${renderTypeName(o)}`];
    if (o.default !== undefined) {
        bits.push(`(Vorgabe ${JSON.stringify(o.default)})`);
    }
    if (o.required) {
        bits.push('(Pflicht)');
    }
    if (o.datapoint) {
        bits.push('[Datenpunkt-Id]');
    }
    if (o.description) {
        bits.push(`— ${o.description}`);
    }
    return bits.join(' ');
}

/** Named types referenced by the options that actually made it into the prompt. */
function collectRefs(options: SchemaOption[], schema: WidgetSchema): string[] {
    const found = new Set<string>();
    const visit = (o: SchemaOption | undefined, depth: number) => {
        if (!o || depth > 3) {
            return;
        }
        if (o.ref) {
            if (found.has(o.ref)) {
                return;
            }
            found.add(o.ref);
            const target = schema.types[o.ref];
            if (target?.fields) {
                Object.values(target.fields).forEach((f) => visit(f, depth + 1));
            }
            if (target?.items) {
                visit(target.items, depth + 1);
            }
        }
        visit(o.items, depth + 1);
        o.tuple?.forEach((t) => visit(t, depth + 1));
        if (o.fields) {
            Object.values(o.fields).forEach((f) => visit(f, depth + 1));
        }
    };
    options.forEach((o) => visit(o, 0));
    return [...found].filter((n) => schema.types[n]).sort();
}

function renderNamedType(name: string, t: SchemaOption): string {
    if (t.enum) {
        return `${name} = ${t.enum.map((v) => `"${v}"`).join(' | ')}`;
    }
    if (t.fields) {
        const lines = Object.entries(t.fields).map(
            ([k, f]) =>
                `    ${k}${f.required ? '' : '?'}: ${renderTypeName(f)}${f.description ? `  // ${f.description}` : ''}`,
        );
        return `${name} = {\n${lines.join('\n')}\n}`;
    }
    if (t.tuple) {
        return `${name} = [${t.tuple.map(renderTypeName).join(', ')}]`;
    }
    return `${name} = ${renderTypeName(t)}`;
}

function dpRow(dp: PromptDatapoint): string {
    const cells = [
        dp.id,
        dp.name,
        dp.rooms.join('/') || '–',
        dp.funcs.join('/') || '–',
        dp.role ?? '–',
        dp.type ?? '–',
        dp.unit ?? '',
        dp.write === false ? 'nur lesen' : '',
    ];
    // Drop trailing empty cells so a datapoint without unit or write flag does not
    // end in dangling separators.
    while (cells.length && !cells[cells.length - 1]) {
        cells.pop();
    }
    return cells.join(' | ');
}

// ── The prompt ────────────────────────────────────────────────────────────────

export function buildAiPrompt(input: BuildPromptInput): string {
    const { schema, task, types, datapoints, grid, currentTab, target } = input;
    const parts: string[] = [];

    parts.push(
        'Du konfigurierst das ioBroker-Dashboard AURA. Erzeuge aus der Aufgabe unten eine Konfigurations-JSON, ' +
            'die unverändert in den Dialog „Widget importieren“ eingefügt werden kann.',
    );

    parts.push(`## Aufgabe\n${task.trim() || '(keine Angabe — frage nach, was gebaut werden soll)'}`);

    // Output contract first: it is the one thing that must not be gotten wrong.
    if (target === 'tab') {
        parts.push(
            '## Ausgabe\n' +
                'Antworte NUR mit einem JSON-Objekt, ohne Text davor oder danach, ohne Markdown-Codeblock:\n' +
                '```\n' +
                '{\n' +
                '  "_type": "aura-tab",\n' +
                '  "_version": 1,\n' +
                `  "grid": { "rowHeight": ${grid.rowHeight}, "snapX": ${grid.snapX}, "gap": ${grid.gap} },\n` +
                '  "tab": { "name": "<Name>", "widgets": [ <Widget>, … ] }\n' +
                '}\n' +
                '```',
        );
    } else {
        parts.push(
            '## Ausgabe\n' +
                'Antworte NUR mit dem JSON-Objekt eines einzelnen Widgets, ohne Text davor oder danach und ohne ' +
                'Markdown-Codeblock.',
        );
    }

    const widgetFields = Object.entries(schema.widgetConfig).map(([k, o]) => renderOption(k, o));
    parts.push(`## Aufbau eines Widgets\n${widgetFields.join('\n')}`);

    const rules = [
        `Das Raster ist aktuell ${grid.cols} Spalten breit — x + w darf ${grid.cols} nie überschreiten.`,
        `Eine Rasterzeile ist ${grid.rowHeight} px hoch, eine Spalte ${grid.snapX} px breit, Abstand ${grid.gap} px.`,
        'Jedes Widget braucht eine eigene id, z. B. "w-ai-1", "w-ai-2".',
        'Widgets dürfen sich nicht überlappen: Rechtecke aus x/y/w/h müssen disjunkt sein.',
        'datapoint muss eine Id aus der Liste unten sein. Erfinde keine Datenpunkte. Typen mit addMode "free" bekommen einen Leerstring.',
        'Optionen, die als [Datenpunkt-Id] markiert sind, gelten genauso.',
        'layout muss aus der Liste des jeweiligen Typs stammen; ohne Angabe gilt "default".',
        'Verwende nur die unten dokumentierten Optionen. Lass eine Option weg, statt sie zu raten.',
        'Nimm defaultSize als Ausgangsgröße und passe sie nur an, wenn der Inhalt es verlangt.',
    ];
    parts.push(`## Regeln\n${rules.map((r) => `- ${r}`).join('\n')}`);

    // Compact index of everything, so the model can pick a type it was not given
    // in full — and knows it then has to stick to the documented options.
    const byGroup = new Map<string, string[]>();
    for (const [type, w] of Object.entries(schema.widgets)) {
        if (w.deprecated) {
            continue;
        }
        const row =
            `- ${type} (${w.label}, ${w.defaultSize.w}×${w.defaultSize.h}` +
            `${w.layouts.length > 1 ? `, layouts: ${w.layouts.join('/')}` : ''})` +
            `${w.hint ? ` — ${w.hint}` : ''}`;
        const list = byGroup.get(w.group) ?? [];
        list.push(row);
        byGroup.set(w.group, list);
    }
    const indexParts = schema.groups
        .filter((g) => byGroup.has(g.id))
        .map((g) => `### ${g.label}\n${byGroup.get(g.id)!.join('\n')}`);
    parts.push(`## Verfügbare Widget-Typen\n${indexParts.join('\n\n')}`);

    // Full detail for the selected types.
    const selected = types.filter((t) => schema.widgets[t]);
    if (selected.length) {
        const detailed: string[] = [];
        const usedOptions: SchemaOption[] = [];
        for (const type of selected) {
            const w = schema.widgets[type];
            const own = Object.entries(w.options);
            const shared = w.commonOptions.map((k) => [k, schema.commonOptions[k]] as const).filter(([, o]) => o);
            usedOptions.push(...own.map(([, o]) => o), ...shared.map(([, o]) => o));

            const lines = [
                `### ${type} — ${w.label}`,
                `Standardgröße ${w.defaultSize.w}×${w.defaultSize.h}, layouts: ${w.layouts.join(', ')}`,
                w.addMode === 'datapoint' ? 'Braucht einen Datenpunkt.' : 'Braucht keinen Datenpunkt (datapoint: "").',
                '',
                ...own.map(([k, o]) => renderOption(k, o)),
                ...shared.map(([k, o]) => renderOption(k, o!)),
            ];
            detailed.push(lines.join('\n'));
        }
        parts.push(`## Optionen der gewählten Typen\n\n${detailed.join('\n\n')}`);

        const refs = collectRefs(usedOptions, schema);
        if (refs.length) {
            parts.push(
                `## Verwendete Typen\n\`\`\`\n${refs.map((n) => renderNamedType(n, schema.types[n])).join('\n')}\n\`\`\``,
            );
        }
    }

    // Datapoints.
    if (datapoints.length) {
        const rows = datapoints.slice(0, MAX_DATAPOINTS).map(dpRow);
        const capped =
            datapoints.length > MAX_DATAPOINTS
                ? `\n(gekürzt auf ${MAX_DATAPOINTS} von ${datapoints.length} — enger filtern für den Rest)`
                : '';
        parts.push(
            '## Datenpunkte\nid | Name | Raum | Gewerk | Rolle | Typ | Einheit | Schreibschutz\n' +
                `${rows.join('\n')}${capped}`,
        );
    } else {
        parts.push('## Datenpunkte\n(keine ausgewählt — frage nach den Datenpunkt-Ids, statt welche zu erfinden)');
    }

    if (currentTab) {
        const hint =
            'Diese Widgets stehen schon darin. Nutze sie als Vorbild für Stil und Größen und plane Neues an ' +
            'freie Stellen.';
        parts.push(
            `## Aktueller Tab „${currentTab.name}“\n${hint}\n\`\`\`json\n${JSON.stringify(currentTab.widgets, null, 1)}\n\`\`\``,
        );
    }

    return parts.join('\n\n');
}

/** Rough token estimate for the size hint in the dialog (~4 characters per token). */
export function estimateTokens(text: string): number {
    return Math.round(text.length / 4);
}

/** Filter the datapoint list the way the dialog offers it. */
export function filterDatapoints(
    all: PromptDatapoint[],
    opts: { rooms?: string[]; funcs?: string[]; search?: string; writableOnly?: boolean },
): PromptDatapoint[] {
    const rooms = opts.rooms?.filter(Boolean) ?? [];
    const funcs = opts.funcs?.filter(Boolean) ?? [];
    const needle = (opts.search ?? '').trim().toLowerCase();

    return all.filter((dp) => {
        if (rooms.length && !dp.rooms.some((r) => rooms.includes(r))) {
            return false;
        }
        if (funcs.length && !dp.funcs.some((f) => funcs.includes(f))) {
            return false;
        }
        if (opts.writableOnly && dp.write === false) {
            return false;
        }
        if (needle && !dp.id.toLowerCase().includes(needle) && !dp.name.toLowerCase().includes(needle)) {
            return false;
        }
        return true;
    });
}
