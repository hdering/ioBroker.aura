// Compact text rendering of schema slices for MCP results.
//
// Deliberately text, not JSON: the same information as raw schema JSON costs
// roughly 40 % more tokens and reads worse. A model consuming
//
//   - onValue: string — Wert, der beim Einschalten geschrieben wird.
//
// needs no explanation of the shape.

function typeName(o) {
    if (o.enum) {
        return o.enum.map((v) => `"${v}"`).join(' | ');
    }
    if (o.tuple) {
        return `[${o.tuple.map(typeName).join(', ')}]`;
    }
    // ref before array: a named type may itself BE an array (ColorThreshold is a
    // tuple), and checking array first turned "ColorThreshold[]" into "any[][]".
    if (o.ref) {
        return o.ref;
    }
    if (o.type === 'array') {
        return `${o.items ? typeName(o.items) : 'any'}[]`;
    }
    if (Array.isArray(o.type)) {
        return o.type.join(' | ');
    }
    return o.type ?? o.tsType ?? 'any';
}

function renderOption(key, o, brief) {
    const bits = [`- ${key}: ${typeName(o)}`];
    if (brief) {
        // Names and types are what a model needs to write valid JSON; the prose
        // is what makes the answer four times as long. Worth having both.
        if (o.required) {
            bits.push('(Pflicht)');
        }
        if (o.datapoint) {
            bits.push('[Datenpunkt-Id]');
        }
        return bits.join(' ');
    }
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

/** One line per widget type: enough to choose one, not enough to configure it. */
function renderTypeIndex(schema, group) {
    const wanted = typeof group === 'string' && group.trim() ? group.trim().toLowerCase() : '';
    const byGroup = new Map();
    for (const [type, w] of Object.entries(schema.widgets)) {
        if (w.deprecated) {
            continue;
        }
        const line =
            `- ${type} (${w.label}, ${w.defaultSize.w}×${w.defaultSize.h}` +
            `${w.layouts.length > 1 ? `, layouts: ${w.layouts.join('/')}` : ''}` +
            `${w.addMode === 'free' ? ', ohne Datenpunkt' : ''})` +
            `${w.hint ? ` — ${w.hint}` : ''}`;
        if (!byGroup.has(w.group)) {
            byGroup.set(w.group, []);
        }
        byGroup.get(w.group).push(line);
    }
    const groups = schema.groups.filter((g) => byGroup.has(g.id));
    const picked = wanted
        ? groups.filter((g) => g.id.toLowerCase() === wanted || g.label.toLowerCase() === wanted)
        : groups;
    if (wanted && !picked.length) {
        return `Keine Gruppe "${group}". Vorhanden: ${groups.map((g) => `${g.id} (${g.label})`).join(', ')}.`;
    }
    return (
        picked.map((g) => `## ${g.label}\n${byGroup.get(g.id).join('\n')}`).join('\n\n') +
        (wanted ? '' : `\n\nNur eine Gruppe: aura_widget_types mit group=${groups.map((g) => g.id).join('|')}.`)
    );
}

/** Named types reachable from the given options, so the slice stays self-contained. */
function collectRefs(options, schema) {
    const found = new Set();
    const visit = (o, depth) => {
        if (!o || depth > 3) {
            return;
        }
        if (o.ref && !found.has(o.ref)) {
            found.add(o.ref);
            const t = schema.types[o.ref];
            if (t?.fields) {
                Object.values(t.fields).forEach((f) => visit(f, depth + 1));
            }
            if (t?.items) {
                visit(t.items, depth + 1);
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

function renderNamedType(name, t, brief) {
    if (t.enum) {
        return `${name} = ${t.enum.map((v) => `"${v}"`).join(' | ')}`;
    }
    if (t.fields) {
        const lines = Object.entries(t.fields).map(
            ([k, f]) =>
                `    ${k}${f.required ? '' : '?'}: ${typeName(f)}${!brief && f.description ? `  // ${f.description}` : ''}`,
        );
        return `${name} = {\n${lines.join('\n')}\n}`;
    }
    if (t.tuple) {
        return `${name} = [${t.tuple.map(typeName).join(', ')}]`;
    }
    return `${name} = ${typeName(t)}`;
}

/** Full option documentation for the named types. */
function renderTypeDetail(types, schema, brief) {
    const known = types.filter((t) => schema.widgets[t]);
    const unknown = types.filter((t) => !schema.widgets[t]);
    const parts = [];
    const used = [];

    for (const type of known) {
        const w = schema.widgets[type];
        const own = Object.entries(w.options);
        const shared = w.commonOptions.map((k) => [k, schema.commonOptions[k]]).filter(([, o]) => o);
        used.push(...own.map(([, o]) => o), ...shared.map(([, o]) => o));

        parts.push(
            [
                `## ${type} — ${w.label}`,
                `Standardgröße ${w.defaultSize.w}×${w.defaultSize.h}, layouts: ${w.layouts.join(', ')}`,
                w.addMode === 'datapoint' ? 'Braucht einen Datenpunkt.' : 'Braucht keinen Datenpunkt (datapoint: "").',
                '',
                ...own.map(([k, o]) => renderOption(k, o, brief)),
                ...shared.map(([k, o]) => renderOption(k, o, brief)),
            ].join('\n'),
        );
    }

    const refs = collectRefs(used, schema);
    if (refs.length) {
        parts.push(`## Verwendete Typen\n${refs.map((n) => renderNamedType(n, schema.types[n], brief)).join('\n')}`);
    }
    if (unknown.length) {
        parts.push(`## Unbekannt\nKeine Widget-Typen: ${unknown.join(', ')}. Siehe aura_widget_types.`);
    }
    return parts.join('\n\n');
}

/** The fields every widget object needs, straight from the schema. */
function renderWidgetShape(schema, brief) {
    return Object.entries(schema.widgetConfig)
        .map(([k, o]) => renderOption(k, o, brief))
        .join('\n');
}

module.exports = { renderOption, renderTypeDetail, renderTypeIndex, renderWidgetShape };
