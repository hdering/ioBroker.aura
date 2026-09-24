/**
 * Confine a user stylesheet to one part of the page with `@scope` (#710).
 *
 * The editor renders the dashboard next to its own admin UI, so custom CSS
 * written for the frontend (`body { font-family: … }`, `:root { --x: … }`)
 * must not reach the admin chrome around the preview.
 *
 * - At-rules that are invalid inside `@scope` (`@import`, `@font-face`,
 *   `@keyframes`, …) are hoisted in front of the block — they only define
 *   resources and style nothing by themselves.
 * - A selector that starts at `html` / `body` / `:root` would find nothing
 *   inside the scope; `:scope` is inserted after that lead instead
 *   (`body .x` → `body :scope .x`), so the rule styles the scope root and
 *   keeps any condition on the ancestor (`body.dark …`).
 */

const HOISTED_AT_RULES = new Set([
    'charset',
    'import',
    'namespace',
    'font-face',
    'keyframes',
    '-webkit-keyframes',
    'property',
    'counter-style',
    'font-feature-values',
    'font-palette-values',
    'page',
]);

// Grouping at-rules whose body holds style rules again.
const NESTING_AT_RULES = new Set(['media', 'supports', 'container', 'layer', 'document', '-moz-document']);

interface Stmt {
    prelude: string;
    /** Block content without the braces; undefined for `…;` statements. */
    body?: string;
}

/** Split CSS into top-level statements, skipping comments and honouring strings. */
function splitStatements(css: string): Stmt[] {
    const out: Stmt[] = [];
    let i = 0;
    let prelude = '';
    const n = css.length;
    while (i < n) {
        const c = css[i];
        if (c === '/' && css[i + 1] === '*') {
            const end = css.indexOf('*/', i + 2);
            i = end < 0 ? n : end + 2;
            continue;
        }
        if (c === '"' || c === "'") {
            const j = skipString(css, i);
            prelude += css.slice(i, j);
            i = j;
            continue;
        }
        if (c === ';') {
            if (prelude.trim()) out.push({ prelude: prelude.trim() });
            prelude = '';
            i++;
            continue;
        }
        if (c === '{') {
            const start = i + 1;
            let depth = 1;
            i++;
            while (i < n && depth > 0) {
                const d = css[i];
                if (d === '/' && css[i + 1] === '*') {
                    const end = css.indexOf('*/', i + 2);
                    i = end < 0 ? n : end + 2;
                    continue;
                }
                if (d === '"' || d === "'") {
                    i = skipString(css, i);
                    continue;
                }
                if (d === '{') depth++;
                else if (d === '}') depth--;
                i++;
            }
            out.push({ prelude: prelude.trim(), body: css.slice(start, depth === 0 ? i - 1 : i) });
            prelude = '';
            continue;
        }
        prelude += c;
        i++;
    }
    if (prelude.trim()) out.push({ prelude: prelude.trim() });
    return out;
}

function skipString(css: string, i: number): number {
    const q = css[i];
    let j = i + 1;
    while (j < css.length && css[j] !== q) {
        if (css[j] === '\\') j++;
        j++;
    }
    return j + 1;
}

function atRuleName(prelude: string): string | null {
    const m = /^@([\w-]+)/.exec(prelude);
    return m ? m[1].toLowerCase() : null;
}

const ROOT_COMPOUND = String.raw`(?:html|body|:root)(?![\w-])[^\s>+~,]*`;
const LEAD_RE = new RegExp(String.raw`^(${ROOT_COMPOUND}(?:\s*>?\s*${ROOT_COMPOUND})*)`, 'i');

/** Split a selector list at top-level commas (not inside `(…)` / `[…]`). */
function splitSelectorList(sel: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let cur = '';
    for (let i = 0; i < sel.length; i++) {
        const c = sel[i];
        if (c === '"' || c === "'") {
            const j = skipString(sel, i);
            cur += sel.slice(i, j);
            i = j - 1;
            continue;
        }
        if (c === '(' || c === '[') depth++;
        else if (c === ')' || c === ']') depth--;
        if (c === ',' && depth === 0) {
            parts.push(cur);
            cur = '';
        } else cur += c;
    }
    parts.push(cur);
    return parts;
}

export function scopeSelector(selector: string): string {
    return splitSelectorList(selector)
        .map((part) => {
            const s = part.trim();
            const m = LEAD_RE.exec(s);
            if (!m) return s;
            const rest = s.slice(m[1].length);
            return `${m[1]} :scope${rest}`;
        })
        .join(', ');
}

function scopeRules(css: string, hoisted: string[]): string {
    const out: string[] = [];
    for (const st of splitStatements(css)) {
        const at = atRuleName(st.prelude);
        if (at && HOISTED_AT_RULES.has(at)) {
            hoisted.push(st.body === undefined ? `${st.prelude};` : `${st.prelude} {${st.body}}`);
        } else if (st.body === undefined) {
            // Stray declaration or `@layer a, b;` — harmless inside the block.
            out.push(`${st.prelude};`);
        } else if (at && NESTING_AT_RULES.has(at)) {
            out.push(`${st.prelude} {\n${scopeRules(st.body, hoisted)}\n}`);
        } else if (at) {
            out.push(`${st.prelude} {${st.body}}`);
        } else {
            out.push(`${scopeSelector(st.prelude)} {${st.body}}`);
        }
    }
    return out.join('\n');
}

/** Wrap `css` in `@scope (<root>) { … }`; see the file comment for the rules. */
export function scopeCss(css: string, root: string): string {
    if (!css.trim()) return '';
    const hoisted: string[] = [];
    const body = scopeRules(css, hoisted);
    return `${hoisted.join('\n')}${hoisted.length ? '\n' : ''}@scope (${root}) {\n${body}\n}\n`;
}
