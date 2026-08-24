/**
 * Datapoint bindings in free HTML — the value widget's custom template and the HTML
 * widget's content (static as well as HTML that arrives through a datapoint).
 *
 * Four spellings, all evaluated live:
 *
 *   {dp}                                  reserved var, e.g. the widget's own value
 *   {alias.0.Bad.ACTUAL}                  any other datapoint by state id
 *   {alias.0.Bad.ACTUAL;round(1);HEX2}    …put through operations   (ioBroker.vis)
 *   {h:javascript.0.h;w:javascript.0.w;h * w}   named variables + expression  (vis)
 *   {{ alias.0.Bad.ACTUAL * 2 }}          expression with inline ids   (aura)
 *
 * The first two are the original behaviour and are untouched. The `;` forms come from
 * ioBroker.vis so existing bindings can be pasted over:
 * https://github.com/ioBroker/ioBroker.vis-2#bindings-of-objects
 *
 * A JSON path may be appended in three equivalent ways:
 *   {0_userdata.0.batterie?soc}       canonical (see dpRef.ts)
 *   {0_userdata.0.batterie#soc}       `#` inside the braces
 *   {0_userdata.0.batterie}#soc       `#` after the closing brace
 * The `#` forms also work on reserved vars (`{dp}#battery.soc`). An all-uppercase
 * segment after the `#` is never read as a path: that keeps ids that carry a `#`
 * themselves (Shelly: `shelly.0.SHSW-25#XXXXXX#1.Relay0.Switch`) and anchors
 * (`href="{dp}#TOP"`) intact — such cases need the `?` form for a path. A LOWER case
 * anchor right after a token (`href="{dp}#top"`) is read as a path, so write that one
 * as `{dp?…}` or move the anchor out of the token's way. Inside an expression `?` is
 * the conditional operator, so there the path is written `id['soc']`.
 *
 * Nothing else in the markup may be rewritten, and three independent rules see to it:
 * a single-part `{…}` is rejected as soon as it contains whitespace (so `{ color: red }`
 * survives), a `name:value` part only counts as a declaration when the value is a real
 * state id (so `{color:red;background:blue}` does not), and anything that fails to
 * parse is emitted verbatim.
 */

import { joinDpRef, splitDpRef } from './dpRef';
import {
    applyOpChain,
    evalExpr,
    exprRefs,
    exprToString,
    isDpId,
    parseExpr,
    parseOpChain,
    RESERVED_VARS,
    type DpField,
    type ExprContext,
    type ParsedOp,
} from './expr';
import type { OpsContext } from './exprOps';

// `{{ expression }}`, or `{…}` plus an optional `#<json path>` right after the brace.
const TEMPLATE_RE = /\{\{([\s\S]*?)\}\}|\{([^{}]+)\}(#[A-Za-z_$][\w$]*(?:\.[\w$]+|\[\d+\])*)?/g;

// `{{parent}}` and friends belong to the popup placeholder layer (see
// utils/popupPlaceholders, which matches `\{\{(\w+)\}\}`) and must pass through
// untouched. Those never carry whitespace, so a bare word is the reliable tell —
// which is why this test runs on the raw body, before any trimming.
const POPUP_TOKEN_RE = /^\w+$/;

// State ID: namespace char + at least one further dot-segment, no whitespace.
// `#` is allowed inside a segment because some adapters use it (Shelly).
const DP_ID_RE = /^[A-Za-z0-9_][\w#-]*(?:\.[\w#-]+)+$/;

// A `#…` tail only counts as a JSON path if it reads like one.
const HASH_PATH_RE = /^[A-Za-z_$][\w$]*(?:\.[\w$]+|\[\d+\])*$/;

// All-uppercase first segment → serial/MAC part of the id (Shelly), not a path.
const ID_PART_RE = /^[0-9A-Z][0-9A-Z_-]*$/;

interface Token {
    /** Reserved var name (`dp`, `color`, …) when the token is not a state ID. */
    varName: string | null;
    /** Canonical datapoint ref (incl. `?path`), or null for reserved vars. */
    ref: string | null;
    /** JSON path, when the token carried one. */
    path: string | null;
    /** true when the `#…` after the closing brace was consumed as that path. */
    suffixUsed: boolean;
}

/** true for a `#…` tail that reads like a JSON path rather than part of an id
 *  (Shelly serial) or an HTML anchor — both are conventionally upper case. */
function isHashPath(rest: string): boolean {
    if (!HASH_PATH_RE.test(rest)) return false;
    return !ID_PART_RE.test(rest.split(/[.[]/)[0]);
}

/** Split `id#path` — only where the tail really looks like a JSON path. */
function splitHashPath(tok: string): { base: string; path: string | null } {
    const i = tok.indexOf('#');
    if (i <= 0) return { base: tok, path: null };
    const rest = tok.slice(i + 1);
    if (!isHashPath(rest)) return { base: tok, path: null };
    return { base: tok.slice(0, i), path: rest };
}

function parseToken(inner: string, suffix: string | undefined): Token | null {
    const trimmed = inner.trim();
    // Whitespace inside means CSS or prose, never a token: `{ color: red; }`.
    if (!trimmed || /\s/.test(trimmed)) return null;

    let base = trimmed;
    let path: string | null = null;
    const q = trimmed.indexOf('?');
    if (q > 0) {
        base = trimmed.slice(0, q);
        path = trimmed.slice(q + 1).trim() || null;
    } else if (q < 0) {
        const h = splitHashPath(trimmed);
        base = h.base;
        path = h.path;
    }

    let suffixUsed = false;
    if (!path && suffix && isHashPath(suffix.slice(1))) {
        path = suffix.slice(1);
        suffixUsed = true;
    }

    // A var name is a single word, so anything with a dot-segment is a state ID.
    if (DP_ID_RE.test(base)) return { varName: null, ref: joinDpRef(base, path), path, suffixUsed };
    return { varName: base, ref: null, path, suffixUsed };
}

// ── bindings with a `;` ───────────────────────────────────────────────────────

/** Where a chain or a declaration takes its value from. */
interface Source {
    /** Reserved variable, when the source is `dp` / `color` / … */
    varName: string | null;
    ref: string | null;
    field: DpField;
}

interface Declaration extends Source {
    name: string;
}

type Binding =
    | { kind: 'token'; token: Token }
    | { kind: 'chain'; source: Source; ops: ParsedOp[] }
    | { kind: 'expr'; src: string; decls: Declaration[] };

/** Split on `;` outside of quotes — a semicolon inside a string stays put. */
function splitParts(inner: string): string[] {
    const out: string[] = [];
    let quote = '';
    let cur = '';
    for (const ch of inner) {
        if (quote) {
            cur += ch;
            if (ch === quote) quote = '';
        } else if (ch === '"' || ch === "'") {
            quote = ch;
            cur += ch;
        } else if (ch === ';') {
            out.push(cur);
            cur = '';
        } else {
            cur += ch;
        }
    }
    out.push(cur);
    return out;
}

/**
 * Read one `;`-part as a value source: a state id (optionally with a JSON path and a
 * `.ts` / `.lc` suffix) or a reserved variable. Anything else — a CSS value, prose —
 * is rejected, which is what keeps stylesheets out of the binding machinery.
 */
function parseSource(text: string): Source | null {
    const token = parseToken(text, undefined);
    if (!token) return null;
    if (token.varName !== null) {
        return RESERVED_VARS.includes(token.varName) ? { varName: token.varName, ref: null, field: 'val' } : null;
    }

    const { id, path } = splitDpRef(token.ref as string);
    const stamped = /^(.*)\.(ts|lc)$/.exec(id);
    if (stamped && isDpId(stamped[1])) {
        return { varName: null, ref: joinDpRef(stamped[1], path), field: stamped[2] as DpField };
    }
    return { varName: null, ref: token.ref, field: 'val' };
}

// `name: <source>` — the vis way of binding a datapoint to a variable.
const DECL_RE = /^\s*([A-Za-z_$][\w$]*)\s*:\s*(\S+)\s*$/;

function parseDeclaration(part: string): Declaration | null {
    const m = DECL_RE.exec(part);
    if (!m) return null;
    const source = parseSource(m[2]);
    return source ? { name: m[1], ...source } : null;
}

const BINDING_CACHE = new Map<string, Binding | null>();
const BINDING_CACHE_MAX = 500;

/**
 * Classify the body of a `{…}` token. One part is the original single-datapoint
 * token; with more parts it is either a chain of operations or a set of variable
 * declarations followed by an expression. `null` means "leave this text alone".
 */
function parseBinding(inner: string, suffix: string | undefined): Binding | null {
    const key = `${inner}\u0001${suffix ?? ''}`;
    const cached = BINDING_CACHE.get(key);
    if (cached !== undefined) return cached;

    const binding = classifyBinding(inner, suffix);
    if (BINDING_CACHE.size >= BINDING_CACHE_MAX) BINDING_CACHE.clear();
    BINDING_CACHE.set(key, binding);
    return binding;
}

function classifyBinding(inner: string, suffix: string | undefined): Binding | null {
    const parts = splitParts(inner);
    // vis escapes a literal colon as `::`. Classification runs on the raw text so an
    // escaped colon can never look like a declaration; only what is handed to the
    // expression parser and to the operation arguments gets collapsed.
    const unescape = (s: string): string => s.split('::').join(':');

    if (parts.length === 1) {
        const token = parseToken(unescape(inner), suffix);
        return token ? { kind: 'token', token } : null;
    }

    // Leading `name:id` parts declare variables; the first part that is not one
    // starts the expression. Because the expression is never split on `:`, a
    // conditional works without vis' `::` escape (which is still accepted).
    const decls: Declaration[] = [];
    let i = 0;
    for (; i < parts.length; i++) {
        const decl = parseDeclaration(parts[i]);
        if (!decl) break;
        decls.push(decl);
    }

    if (decls.length) {
        // Declarations alone have no value to render.
        if (i >= parts.length) return null;
        const src = unescape(parts.slice(i).join(';'));
        // An expression that does not parse makes the whole token verbatim — otherwise
        // the declared datapoints would be subscribed for output that never appears.
        return parseExpr(src) ? { kind: 'expr', src, decls } : null;
    }

    const source = parseSource(parts[0]);
    if (!source) return null;
    const ops = parseOpChain(parts.slice(1).map(unescape));
    return ops ? { kind: 'chain', source, ops } : null;
}

// ── reference collection ──────────────────────────────────────────────────────

/**
 * Collect the distinct datapoint refs a template reads, in every spelling. The
 * widget subscribes to exactly these — a `.ts` / `.lc` reference needs no separate
 * subscription because the timestamps ride along with the value.
 */
export function extractTemplateDpRefs(template: string | undefined | null): string[] {
    if (!template) return [];
    const refs = new Set<string>();

    for (const m of template.matchAll(TEMPLATE_RE)) {
        if (m[1] !== undefined) {
            if (POPUP_TOKEN_RE.test(m[1])) continue;
            for (const r of exprRefs(m[1])) refs.add(r.ref);
            continue;
        }

        const binding = parseBinding(m[2], m[3]);
        if (!binding) continue;
        if (binding.kind === 'token') {
            if (binding.token.ref) refs.add(binding.token.ref);
        } else if (binding.kind === 'chain') {
            if (binding.source.ref) refs.add(binding.source.ref);
        } else {
            for (const d of binding.decls) if (d.ref) refs.add(d.ref);
            for (const r of exprRefs(
                binding.src,
                binding.decls.map((d) => d.name),
            )) {
                refs.add(r.ref);
            }
        }
    }
    return [...refs];
}

// ── rendering ─────────────────────────────────────────────────────────────────

export interface TemplateContext {
    /** Reserved, already formatted tokens — `{dp}`, `{color}`, `{unit}`. */
    vars: Record<string, string>;
    /** Formatted value of a foreign datapoint, for the plain `{id}` token. */
    resolve: (ref: string) => string;
    /** Formatted value behind `{dp}#battery.soc`; without it the plain var is used. */
    resolveVarPath?: (name: string, path: string) => string;

    // Everything below drives the calculating forms. Without `resolveRaw` and `ops`
    // they stay switched off and their tokens are emitted verbatim — computing on
    // display-formatted strings would be wrong, so half a context is no context.
    /** Raw (unformatted) value behind a ref — `field` picks value / ts / lc. */
    resolveRaw?: (ref: string, field: DpField) => unknown;
    /** Raw counterparts of `vars`, plus `language` / `view` / `wid` / `wname`. */
    rawVars?: Record<string, unknown>;
    ops?: OpsContext;
}

/** The value a chain or declaration source currently holds. */
function sourceValue(source: Source, ctx: TemplateContext): unknown {
    if (source.varName !== null) return ctx.rawVars?.[source.varName] ?? null;
    return ctx.resolveRaw?.(source.ref as string, source.field) ?? null;
}

/**
 * Replace every binding in the template.
 *
 * Braces that match nothing are returned verbatim, and so is anything that fails to
 * parse — an unfinished expression stays visible instead of silently rendering as
 * nothing, which is the behaviour that makes typos findable.
 */
export function renderTemplate(template: string, ctx: TemplateContext): string {
    const canCompute = !!ctx.resolveRaw && !!ctx.ops;
    const exprCtx: ExprContext | null = canCompute
        ? {
              resolveRaw: (ref, field) => (ctx.resolveRaw as NonNullable<typeof ctx.resolveRaw>)(ref, field),
              vars: ctx.rawVars ?? {},
              ops: ctx.ops as OpsContext,
          }
        : null;

    return template.replace(TEMPLATE_RE, (full, exprBody, inner, suffix) => {
        // ── {{ expression }} ──
        if (exprBody !== undefined) {
            const body = String(exprBody);
            if (POPUP_TOKEN_RE.test(body) || !exprCtx) return full;
            const value = evalExpr(body, exprCtx);
            return value === undefined ? full : exprToString(value);
        }

        const binding = parseBinding(String(inner), suffix as string | undefined);
        if (!binding) return full;
        // A `#…` tail we did not use as a path stays part of the output.
        const tail = (suffix as string | undefined) ?? '';

        // ── {dp} / {id} ──
        if (binding.kind === 'token') {
            const token = binding.token;
            const rest = token.suffixUsed ? '' : tail;
            if (token.ref) return ctx.resolve(token.ref) + rest;
            const name = token.varName as string;
            if (!Object.prototype.hasOwnProperty.call(ctx.vars, name)) return full;
            if (token.path && ctx.resolveVarPath) return ctx.resolveVarPath(name, token.path) + rest;
            return ctx.vars[name] + rest;
        }

        if (!exprCtx) return full;

        // ── {id;op;op} ──
        if (binding.kind === 'chain') {
            return (
                exprToString(applyOpChain(sourceValue(binding.source, ctx), binding.ops, ctx.ops as OpsContext)) + tail
            );
        }

        // ── {a:id;b:id2;expression} ──
        const vars: Record<string, unknown> = { ...exprCtx.vars };
        for (const decl of binding.decls) vars[decl.name] = sourceValue(decl, ctx);
        const value = evalExpr(
            binding.src,
            { ...exprCtx, vars },
            binding.decls.map((d) => d.name),
        );
        return value === undefined ? full : exprToString(value) + tail;
    });
}
