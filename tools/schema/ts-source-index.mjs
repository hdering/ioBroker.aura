// Shared TypeScript source index for the schema generator.
//
// Not a real parser — a set of narrow regex readers over the src-vis sources.
// That is enough because the option shapes we care about are written in a very
// regular style (string-literal union aliases, flat interfaces with one field
// per line). Anything the readers cannot make sense of is reported as unknown
// rather than guessed, so a wrong entry never reaches the schema.

import fs from 'node:fs';
import path from 'node:path';

/**
 * Recursively collect every .ts/.tsx file under `dir`.
 *
 * @param dir
 */
export function collectSources(dir) {
    const out = [];
    const walk = (d) => {
        for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
            const full = path.join(d, ent.name);
            if (ent.isDirectory()) {
                walk(full);
            } else if (/\.tsx?$/.test(ent.name)) {
                out.push(full);
            }
        }
    };
    walk(dir);
    return out;
}

export class SourceIndex {
    constructor(root) {
        this.root = root;
        this.files = collectSources(root);
        /** @type {Map<string, string>} absolute path → contents */
        this.text = new Map();
        for (const f of this.files) {
            this.text.set(f, fs.readFileSync(f, 'utf8'));
        }
        this._aliasCache = new Map();
        this._ifaceCache = new Map();
    }

    /** Every source file's text, for cross-file lookups. */
    *entries() {
        yield* this.text.entries();
    }

    read(file) {
        return this.text.get(file) ?? '';
    }

    /**
     * Resolve `export type Name = 'a' | 'b' | 'c'` (single- or multi-line) to
     * its literal members. Returns null for anything that is not a pure union
     * of string literals — a partially understood union is worse than none.
     *
     * @param name
     */
    stringUnion(name) {
        if (this._aliasCache.has(name)) {
            return this._aliasCache.get(name);
        }
        let result = null;
        const re = new RegExp(`(?:export\\s+)?type\\s+${escapeRe(name)}\\s*=\\s*([^;]+);`);
        for (const [, src] of this.entries()) {
            const m = src.match(re);
            if (!m) {
                continue;
            }
            const body = stripLineComments(m[1])
                .replace(/\s+/g, ' ')
                .trim()
                .replace(/^\|\s*/, '');
            const parts = body.split('|').map((p) => p.trim());
            if (parts.length && parts.every((p) => /^'[^']*'$/.test(p))) {
                result = parts.map((p) => p.slice(1, -1));
            } else if (parts.length === 1 && /^[A-Za-z_$][\w$]*$/.test(parts[0]) && parts[0] !== name) {
                // An alias of an alias: `type ConditionPart = ConditionSlot`. Not
                // following it left the union unresolved, and everything keyed by
                // it (conditions[].elements) came out as a bare object.
                result = this.stringUnion(parts[0]);
            }
            break;
        }
        this._aliasCache.set(name, result);
        return result;
    }

    /**
     * The right-hand side of `type Name = …;`, whitespace-collapsed. Used for
     * the shapes that are aliases rather than interfaces — tuples such as
     * `type ColorThreshold = [number, string]`.
     *
     * @param name
     */
    typeAliasBody(name) {
        // `[^;]+` stopped at the first semicolon INSIDE the body, which for a
        // union of object literals is the second field of the first member:
        // ClickAction came back as "| { kind: 'none' } | { kind: 'popup-thermostat'"
        // and every kind after it was invisible. The end of the alias is the
        // first `;` at brace depth zero.
        const re = new RegExp(`(?:export\\s+)?type\\s+${escapeRe(name)}\\s*=\\s*`);
        for (const [, src] of this.entries()) {
            const m = src.match(re);
            if (!m) {
                continue;
            }
            const from = m.index + m[0].length;
            let depth = 0;
            for (let i = from; i < src.length; i++) {
                const c = src[i];
                if ('<[({'.includes(c)) {
                    depth++;
                } else if ('>])}'.includes(c)) {
                    // Clamped: a stray `>` (a conditional type) must not push the
                    // depth negative and make the terminator unreachable.
                    depth = Math.max(0, depth - 1);
                } else if (c === ';' && depth === 0) {
                    return stripLineComments(src.slice(from, i)).replace(/\s+/g, ' ').trim();
                }
            }
        }
        return null;
    }

    /**
     * Find `interface Name [extends A, B] { … }` — or the equivalent
     * `type Name = { … }` alias — anywhere in the tree and return its raw body
     * plus the names it extends. Brace-counted so nested object types inside a
     * field do not end the body early.
     *
     * @param name
     */
    interfaceBody(name) {
        if (this._ifaceCache.has(name)) {
            return this._ifaceCache.get(name);
        }
        let result = null;
        const re = new RegExp(
            `(?:export\\s+)?(?:interface\\s+${escapeRe(name)}\\b([^{]*)|type\\s+${escapeRe(name)}\\s*=\\s*)\\{`,
        );
        for (const [file, src] of this.entries()) {
            const m = src.match(re);
            if (!m) {
                continue;
            }
            const open = m.index + m[0].length - 1;
            let depth = 0;
            let end = -1;
            for (let i = open; i < src.length; i++) {
                if (src[i] === '{') {
                    depth++;
                } else if (src[i] === '}') {
                    depth--;
                    if (depth === 0) {
                        end = i;
                        break;
                    }
                }
            }
            if (end < 0) {
                break;
            }
            // m[1] is undefined for the `type Name = { … }` form, which has no heritage.
            const heritage = (m[1] ?? '').replace(/\s+/g, ' ');
            const ext = heritage.includes('extends')
                ? heritage
                      .slice(heritage.indexOf('extends') + 7)
                      .split(',')
                      .map((s) => s.trim().replace(/<.*$/, ''))
                      .filter(Boolean)
                : [];
            result = { file, body: src.slice(open + 1, end), extends: ext };
            break;
        }
        this._ifaceCache.set(name, result);
        return result;
    }

    /**
     * Flatten an interface (following `extends`) into
     * `{ key: { type, optional, description } }`.
     *
     * Descriptions come from the JSDoc block above the field or the trailing
     * `//` comment on the same line — both are used consistently in this repo.
     * Fields inherited from a base interface are listed too; a redeclared field
     * wins over the inherited one.
     *
     * @param name
     * @param seen
     */
    interfaceFields(name, seen = new Set()) {
        if (seen.has(name)) {
            return {};
        }
        seen.add(name);
        const found = this.interfaceBody(name);
        if (!found) {
            return {};
        }

        const out = {};
        for (const base of found.extends) {
            Object.assign(out, this.interfaceFields(base, seen));
        }

        const lines = found.body.split('\n');
        let doc = [];
        let depth = 0;
        for (let li = 0; li < lines.length; li++) {
            const rawLine = lines[li];
            const line = rawLine.trim();
            if (!line) {
                doc = [];
                continue;
            }
            // Collect a JSDoc block for the field that follows it.
            if (line.startsWith('/**') || line.startsWith('*') || line.startsWith('*/')) {
                if (line.startsWith('/**')) {
                    doc = [];
                }
                const t = line
                    .replace(/^\/\*\*/, '')
                    .replace(/^\*\//, '')
                    .replace(/^\*/, '')
                    .replace(/\*\/$/, '')
                    .trim();
                if (t) {
                    doc.push(t);
                }
                continue;
            }
            if (line.startsWith('//')) {
                continue;
            } // section header comment

            // An inline object type that OPENS on this line: collect the rest of
            // it, so the field's type is the whole literal.
            //
            // Without this the type was the lone "{" the regex below captured, and
            // the schema answered `object` and nothing else — the shape of
            // `contactAppearance` (the labels of a contact row) lived only in the
            // source, and a model had to fall back to `states` to rename a state.
            // A literal that never closes falls through to the line-by-line
            // behaviour below rather than swallowing the rest of the interface.
            let joined = null;
            if (depth === 0 && /:\s*[^/]*\{\s*(?:\/\/.*)?$/.test(line)) {
                let open = 0;
                const parts = [];
                for (let j = li; j < lines.length && j < li + 60; j++) {
                    const text = stripLineComments(lines[j]).trim();
                    parts.push(text);
                    open += (text.match(/\{/g) ?? []).length - (text.match(/\}/g) ?? []).length;
                    if (open === 0) {
                        joined = { text: parts.join(' ').replace(/\s+/g, ' '), last: j };
                        break;
                    }
                }
            }
            if (joined) {
                li = joined.last;
            }

            // Skip over nested object literals in a field type.
            const before = depth;
            if (!joined) {
                depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
            }
            if (before > 0) {
                continue;
            }

            const m = (joined ? joined.text : line).match(/^([A-Za-z_$][\w$]*)(\?)?\s*:\s*(.+?);?\s*(?:\/\/\s*(.*))?$/);
            if (!m) {
                doc = [];
                continue;
            }
            const [, key, opt, rawType, trailing] = m;
            const description = doc.join(' ') || (trailing ?? '').trim() || undefined;
            out[key] = {
                type: rawType.replace(/;$/, '').trim(),
                optional: !!opt,
                description: description || undefined,
            };
            doc = [];
        }
        return out;
    }
}

export function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Drop `//` comments, which several unions carry per member:
 *
 *   export type NameFilterOp =
 *       | 'remove'   // drop every occurrence of value
 *       | 'replace'  // value → value2
 *
 * Without this the members read as `'remove' // drop every…` and the union is
 * rejected as not-purely-literal. A `//` inside a string literal (an URL) is
 * left alone by only cutting where the quote count so far is even.
 *
 * @param s
 */
export function stripLineComments(s) {
    return s
        .split('\n')
        .map((line) => {
            const at = line.indexOf('//');
            if (at < 0) {
                return line;
            }
            const quotes = (line.slice(0, at).match(/'/g) ?? []).length;
            return quotes % 2 === 0 ? line.slice(0, at) : line;
        })
        .join('\n');
}
