// Reads the option keys a widget component actually evaluates.
//
// Every widget binds its options once (`const o = config.options ?? {}`) and
// then reads them in a handful of fixed shapes:
//
//   (o.key as string) ?? 'left'      → string,  default 'left'
//   (o.key as number) || 20          → number,  default 20
//   o.key !== false                  → boolean, default true
//   o.key === true / !!(o.key)       → boolean, default false
//   o.key as ColorThreshold[]        → named type
//
// So the reader matches those shapes instead of parsing TypeScript. A key whose
// type cannot be determined is emitted with type null and flagged in the
// coverage report — never guessed.

import fs from 'node:fs';
import path from 'node:path';

/** Property names that are Array/Object builtins, never option keys. */
const BUILTIN_PROPS = new Set([
    'map',
    'filter',
    'length',
    'forEach',
    'find',
    'findIndex',
    'some',
    'every',
    'reduce',
    'slice',
    'splice',
    'join',
    'push',
    'pop',
    'shift',
    'unshift',
    'includes',
    'indexOf',
    'lastIndexOf',
    'sort',
    'reverse',
    'concat',
    'flat',
    'flatMap',
    'keys',
    'values',
    'entries',
    'toString',
    'valueOf',
    'hasOwnProperty',
    'call',
    'apply',
    'bind',
    'then',
    'catch',
    'finally',
    'constructor',
    'current',
]);

/**
 * Bindings of `config.options` to a local identifier, with their positions.
 *
 * @param src
 */
function optionAliases(src) {
    /** alias → offsets of its options bindings */
    const aliases = new Map();
    const patterns = [
        // const o = config.options ?? {}
        // const o = (config.options ?? {}) as SomeOptions
        // const o = (config.options ?? { entries: [] }) as unknown as SomeOptions
        /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*\(?\s*config\.options\s*\?\?/g,
        // const o = useMemo(() => config.options ?? {}, …)
        /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*useMemo\(\s*\(\)\s*=>\s*\(?\s*config\.options\s*\?\?/g,
    ];
    for (const re of patterns) {
        for (const m of src.matchAll(re)) {
            if (!aliases.has(m[1])) {
                aliases.set(m[1], []);
            }
            aliases.get(m[1]).push(m.index);
        }
    }
    return aliases;
}

/**
 * Every offset at which `name` is bound to something — a declaration, a function
 * parameter, a destructuring target.
 *
 * Widgets bind their options to a one-letter `o`, and `o` is also the most
 * popular arrow parameter in the file (`.filter((o) => …)`, `const o =
 * JSON.parse(str)`). Reading `o.power` inside such a scope as an option key is
 * how "Power" ended up on the evcc widget. Since these files read top-down, the
 * nearest binding that PRECEDES a read is its binding in practice — close enough
 * to tell an option read from a shadowed one, and it errs towards dropping a key
 * rather than inventing one.
 *
 * @param src
 * @param name
 */
function bindingOffsets(src, name) {
    const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const word = new RegExp(`(?:^|[^.\\w$])${n}(?![\\w$])`);
    const offsets = [];

    // Declarations: const/let/var o …, catch (o)
    for (const m of src.matchAll(new RegExp(`(?:const|let|var)\\s+(?:[^=;\\n]*?[^.\\w$])?${n}(?![\\w$])`, 'g'))) {
        offsets.push(m.index);
    }
    for (const m of src.matchAll(new RegExp(`catch\\s*\\(\\s*${n}\\s*\\)`, 'g'))) {
        offsets.push(m.index);
    }

    // Arrow parameters. A parameter list is only a parameter list when an arrow
    // follows it — `tiltRange(opts)` is a CALL and must not count as a binding.
    for (const m of src.matchAll(/=>/g)) {
        let i = m.index - 1;
        while (i >= 0 && /\s/.test(src[i])) {
            i--;
        }
        if (i < 0) {
            continue;
        }
        if (src[i] === ')') {
            let depth = 0;
            let j = i;
            for (; j >= 0; j--) {
                if (src[j] === ')') {
                    depth++;
                } else if (src[j] === '(') {
                    depth--;
                    if (depth === 0) {
                        break;
                    }
                }
            }
            if (j >= 0 && word.test(src.slice(j, i + 1))) {
                offsets.push(j);
            }
        } else {
            // Single parameter without parentheses: `o => …`
            let j = i;
            while (j >= 0 && /[\w$]/.test(src[j])) {
                j--;
            }
            if (src.slice(j + 1, i + 1) === name) {
                offsets.push(j + 1);
            }
        }
    }

    // function foo(a, o) { … }
    for (const m of src.matchAll(/function\s*[\w$]*\s*\(([^)]*)\)/g)) {
        if (word.test(m[1])) {
            offsets.push(m.index);
        }
    }

    return [...new Set(offsets)].sort((a, b) => a - b);
}

/**
 * The offset of the innermost binding of `name` in effect at `idx`.
 *
 * @param offsets
 * @param idx
 */
function bindingInEffect(offsets, idx) {
    let best = -1;
    for (const off of offsets) {
        if (off >= idx) {
            break;
        }
        best = off;
    }
    return best;
}

/**
 * Read one type expression off the front of `s`.
 *
 * A regex cannot do this: `Record<string, X>` and `[number, string]` contain the
 * comma that would otherwise end the expression, which is how `Record<string`
 * used to reach the schema truncated. Brackets are counted instead, and a single
 * `|` continues the union while `||` ends the expression.
 *
 * @param s Source text starting right after the `as` keyword.
 */
function readTypeExpression(s) {
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === '<' || c === '[' || c === '(' || c === '{') {
            depth++;
        } else if (c === '>' || c === ']' || c === ')' || c === '}') {
            if (depth === 0) {
                return s.slice(0, i);
            }
            depth--;
        } else if (depth === 0) {
            if (c === ',' || c === ';' || c === '\n' || c === '?') {
                return s.slice(0, i);
            }
            if ((c === '|' || c === '&') && s[i + 1] === c) {
                return s.slice(0, i);
            }
        }
    }
    return s;
}

/**
 * Everything after `alias.key` at `idx`, limited to one expression's worth.
 *
 * @param src
 * @param idx
 * @param accessLen
 */
function inferAt(src, idx, accessLen) {
    const after = src.slice(idx + accessLen, idx + accessLen + 160);
    const before = src.slice(Math.max(0, idx - 6), idx);

    let type = null;
    let dflt;

    // `as SomeType` / `as string | undefined`
    const cast = after.match(/^\s*as\s+(?=[A-Za-z_$])/);
    if (cast) {
        type = readTypeExpression(after.slice(cast[0].length))
            .replace(/\s*\|\s*undefined\s*$/, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // Boolean comparison shapes carry their own default.
    if (/^\s*!==\s*false/.test(after)) {
        type = 'boolean';
        dflt = true;
    } else if (/^\s*===\s*true/.test(after)) {
        type = 'boolean';
        dflt = false;
    } else if (/^\s*===\s*false/.test(after)) {
        type = 'boolean';
        dflt = true;
    } else if (/^\s*!==\s*true/.test(after)) {
        type = 'boolean';
        dflt = false;
    } else if (/!!\(?\s*$/.test(before) && !type) {
        type = 'boolean';
        dflt = false;
    }

    // `?? X` / `|| X` after the (optional) cast.
    if (dflt === undefined) {
        const tail = cast
            ? after.slice(cast[0].length + readTypeExpression(after.slice(cast[0].length)).length)
            : after;
        const d = tail.match(/^\s*\)?\s*(?:\?\?|\|\|)\s*('[^']*'|"[^"]*"|-?\d+(?:\.\d+)?|true|false)/);
        if (d) {
            dflt = literal(d[1]);
        }
    }

    // A literal default reveals the type when no cast was written.
    if (!type && dflt !== undefined) {
        type = typeof dflt === 'boolean' ? 'boolean' : typeof dflt;
    }

    return { type, dflt };
}

function literal(raw) {
    if (raw === 'true') {
        return true;
    }
    if (raw === 'false') {
        return false;
    }
    if (/^-?\d/.test(raw)) {
        return Number(raw);
    }
    return raw.slice(1, -1);
}

/**
 * Modules that dispatch over a FOREIGN widget config rather than the host's, so
 * their option reads belong to some other widget:
 *   widgetMap.ts — the render dispatch, reachable from the mirror widget
 *   popup/       — click-popup bodies, which render the popup's own widget config
 * Following them would attribute every option of every widget to whichever
 * widget happens to import them.
 */
const DISPATCH_MODULES = [/[\\/]widgetMap\.ts$/, /[\\/]popup[\\/]/];

/**
 * Relative imports pointing at another file inside the widgets tree.
 *
 * @param src
 * @param file
 * @param rootDir
 */
function localImports(src, file, rootDir) {
    const out = [];
    for (const m of src.matchAll(/from\s+'(\.[^']+)'/g)) {
        const target = path.resolve(path.dirname(file), m[1]);
        for (const ext of ['.tsx', '.ts', '/index.tsx', '/index.ts']) {
            const cand = target + ext;
            if (!fs.existsSync(cand) || !cand.startsWith(rootDir)) {
                continue;
            }
            if (!DISPATCH_MODULES.some((re) => re.test(cand))) {
                out.push(cand);
            }
            break;
        }
    }
    return out;
}

/**
 * Collect the option keys read by `entryFile` and by the components it pulls in
 * from the widgets tree (status badges, entry controls, popup bodies — they take
 * the same `config` and read further keys off it).
 *
 * Only files that bind `config.options` themselves contribute, so a component
 * imported for unrelated reasons adds nothing.
 *
 * @param entryFile
 * @param rootDir
 * @param root0
 * @param root0.maxDepth
 */
export function extractOptionKeys(entryFile, rootDir, { maxDepth = 3 } = {}) {
    const keys = {};
    const visited = new Set();

    const merge = (key, info, file) => {
        if (BUILTIN_PROPS.has(key)) {
            return;
        }
        const prev = keys[key];
        if (!prev) {
            keys[key] = { type: info.type, default: info.dflt, sources: [file] };
            return;
        }
        if (!prev.type && info.type) {
            prev.type = info.type;
        }
        if (prev.default === undefined && info.dflt !== undefined) {
            prev.default = info.dflt;
        }
        if (!prev.sources.includes(file)) {
            prev.sources.push(file);
        }
    };

    const visit = (file, depth) => {
        if (visited.has(file) || depth > maxDepth) {
            return;
        }
        visited.add(file);
        const src = fs.readFileSync(file, 'utf8');
        const rel = path.relative(rootDir, file).replace(/\\/g, '/');

        for (const [alias, optionBindings] of optionAliases(src)) {
            const offsets = bindingOffsets(src, alias);
            const re = new RegExp(`\\b${alias}\\.([A-Za-z_$][\\w$]*)`, 'g');
            for (const m of src.matchAll(re)) {
                // Only count the read when the binding it resolves to is the
                // options binding, not a same-named parameter in between.
                const binding = bindingInEffect(offsets, m.index);
                if (!optionBindings.some((off) => off === binding)) {
                    continue;
                }
                merge(m[1], inferAt(src, m.index, m[0].length), rel);
            }
        }
        // Direct reads without a local binding.
        for (const m of src.matchAll(/config\.options\?\.([A-Za-z_$][\w$]*)/g)) {
            merge(m[1], inferAt(src, m.index, m[0].length), rel);
        }

        for (const next of localImports(src, file, rootDir)) {
            visit(next, depth + 1);
        }
    };

    visit(entryFile, 0);
    return keys;
}

/**
 * type → component file, read from the widget map (the render dispatch).
 *
 * @param widgetsDir
 */
export function readWidgetMap(widgetsDir) {
    const src = fs.readFileSync(path.join(widgetsDir, 'widgetMap.ts'), 'utf8');

    const compToFile = {};
    for (const m of src.matchAll(/import\s*\{\s*([A-Za-z_$][\w$]*)\s*\}\s*from\s*'\.\/([^']+)'/g)) {
        compToFile[m[1]] = `${m[2]}.tsx`;
    }
    for (const m of src.matchAll(
        /const\s+([A-Za-z_$][\w$]*)\s*=\s*lazyWithReload\(\s*\(\)\s*=>\s*\n?\s*import\('\.\/([^']+)'\)/g,
    )) {
        compToFile[m[1]] = `${m[2]}.tsx`;
    }

    const body = src.slice(src.indexOf('return {'));
    const map = {};
    for (const m of body.matchAll(/^\s+([A-Za-z_$][\w$]*):\s*([A-Za-z_$][\w$]*),\s*$/gm)) {
        const file = compToFile[m[2]];
        if (file) {
            map[m[1]] = path.join(widgetsDir, file);
        }
    }
    return map;
}

/**
 * `const o = (config.options ?? …) as [unknown as] SomeOptions` → 'SomeOptions'.
 *
 * @param file
 */
export function optionsInterfaceName(file) {
    const src = fs.readFileSync(file, 'utf8');
    const m = src.match(/config\.options\s*\?\?[^)]*\)\s*as\s+(?:unknown\s+as\s+)?([A-Za-z_$][\w$]*)/);
    if (!m) {
        return null;
    }
    return m[1] === 'Record' ? null : m[1];
}
