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
    // A discriminated union: one line per variant, its own fields behind it. As a
    // bare "object" this was the biggest hole in the schema — ClickAction is the
    // most-used shared option and neither its kinds nor their fields were
    // written down anywhere a model could reach.
    if (t.variants) {
        const key = t.discriminator || 'kind';
        const lines = t.variants.map((v) => {
            const fields = Object.entries(v.fields || {})
                .map(([k, f]) => `${k}${f.required ? '' : '?'}: ${typeName(f)}`)
                .join('; ');
            return (
                `    { ${key}: "${v.value}"${fields ? `; ${fields}` : ''} }` +
                (!brief && v.description ? `  // ${v.description}` : '')
            );
        });
        // The note goes FIRST: the question a reader arrives with ("which one
        // writes a datapoint?") is answered before the list, not after it.
        return (!brief && t.description ? `// ${t.description}\n` : '') + `${name} = one of\n${lines.join('\n')}`;
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

/** How many lines a named type costs, so a caller can decide before fetching it. */
function typeSize(name, t) {
    return renderNamedType(name, t, false).split('\n').length;
}

/**
 * The named types, on their own — the answer to `aura_types`.
 *
 * They are the expensive half of the schema: measured against the real schema the
 * "Verwendete Typen" block is 62-77 % of what aura_widget_schema returns, and a
 * model that asks for four widget types in four calls pays for the shared ones
 * four times over. Fetching them once, by name, is the cheap way round.
 */
function renderNamedTypes(names, schema, brief) {
    const all = Object.keys(schema.types);
    // Case-insensitive, and a partial name still finds its type: the names reach
    // the model inside a type line ("conditions: WidgetCondition[]"), where the
    // brackets and the plural are easy to carry along by mistake.
    const resolve = (name) => {
        const needle = String(name).replace(/\[\]$/, '').trim();
        if (schema.types[needle]) {
            return needle;
        }
        const lower = needle.toLowerCase();
        return all.find((n) => n.toLowerCase() === lower) || null;
    };
    const parts = [];
    const missing = [];
    for (const name of names) {
        const hit = resolve(name);
        if (hit) {
            parts.push(renderNamedType(hit, schema.types[hit], brief));
        } else {
            missing.push(name);
        }
    }
    for (const name of missing) {
        const lower = String(name).toLowerCase();
        const near = all.filter((n) => n.toLowerCase().includes(lower) || lower.includes(n.toLowerCase()));
        parts.push(
            `Keinen Typ "${name}"` +
                (near.length ? ` — gemeint ist vielleicht: ${near.slice(0, 6).join(', ')}.` : '.') +
                ' Die Namen stehen in der Typzeile von aura_widget_schema.',
        );
    }
    return parts.join('\n');
}

/**
 * Full option documentation for the named types.
 *
 * `opts.sharedTypes === false` leaves out the "Verwendete Typen" block and names
 * what was left out instead, with its line count. That block is the expensive
 * part — 62 to 77 % of the answer, measured — and it repeats in full on every
 * call, so a model that fetches four widget types one at a time pays for
 * `CustomCell` four times. It can now fetch the types it needs once, by name,
 * with aura_types.
 *
 * `opts.only` narrows the option list to the named keys, for the frequent case of
 * looking up two settings on a widget with sixty.
 */
function renderTypeDetail(types, schema, brief, opts = {}) {
    const known = types.filter((t) => schema.widgets[t]);
    const unknown = types.filter((t) => !schema.widgets[t]);
    const wanted = Array.isArray(opts.only) && opts.only.length ? new Set(opts.only) : null;
    const parts = [];
    const used = [];

    for (const type of known) {
        const w = schema.widgets[type];
        const pick = (entries) => (wanted ? entries.filter(([k]) => wanted.has(k)) : entries);
        const own = pick(Object.entries(w.options));
        const shared = pick(w.commonOptions.map((k) => [k, schema.commonOptions[k]]).filter(([, o]) => o));
        used.push(...own.map(([, o]) => o), ...shared.map(([, o]) => o));
        // A filter that matches nothing is a typo in the option name, not an empty
        // widget — saying so beats printing a heading with no lines under it.
        const missing = wanted ? [...wanted].filter((k) => !w.options[k] && !w.commonOptions.includes(k)) : [];

        parts.push(
            [
                `## ${type} — ${w.label}`,
                `Standardgröße ${w.defaultSize.w}×${w.defaultSize.h}, layouts: ${w.layouts.join(', ')}`,
                w.addMode === 'datapoint' ? 'Braucht einen Datenpunkt.' : 'Braucht keinen Datenpunkt (datapoint: "").',
                ...(wanted ? [`Gefiltert auf ${[...wanted].join(', ')} — ohne "options" die vollständige Liste.`] : []),
                '',
                ...own.map(([k, o]) => renderOption(k, o, brief)),
                ...shared.map(([k, o]) => renderOption(k, o, brief)),
                ...(missing.length ? [`(${type} kennt nicht: ${missing.join(', ')})`] : []),
            ].join('\n'),
        );
    }

    const refs = collectRefs(used, schema);
    if (refs.length && opts.sharedTypes === false) {
        const listed = refs.map((n) => `${n} (${typeSize(n, schema.types[n])} Z.)`).join(', ');
        parts.push(`## Verwendete Typen (nicht ausgegeben)\n${listed}\nEinzeln holen: aura_types mit names=["…"].`);
    } else if (refs.length) {
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

module.exports = {
    renderNamedTypes,
    renderOption,
    renderTypeDetail,
    renderTypeIndex,
    renderWidgetShape,
    typeSize,
};
