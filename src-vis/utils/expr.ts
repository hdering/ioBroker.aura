/**
 * The little expression language behind datapoint bindings.
 *
 * It is what makes `{{ a * 2 }}`, `{h:javascript.0.h;w:javascript.0.w;h * w}` and the
 * argument lists of the vis chain work. Deliberately NOT JavaScript: ioBroker.vis
 * compiles bindings with `new Function`, but aura renders HTML that may come out of a
 * datapoint (HtmlWidget reads `htmlDatapoint`), and the substitution happens in the
 * main origin *before* the sandboxed iframe. A script writing that datapoint would
 * therefore gain arbitrary code execution with socket access — so this is a real
 * parser over a closed grammar instead, with a whitelist of callable functions.
 *
 * Grammar, lowest precedence first:
 *   |            filter pipe (the operations of utils/exprOps)
 *   ? :          conditional
 *   ??  ||  &&
 *   == != === !==      < <= > >=
 *   + -          * / %
 *   unary - + !
 *   postfix  [...]  .name  (...)
 *   literals, ( ... ), identifier chains
 *
 * An identifier chain is either a variable, `Math.…`, or an ioBroker state id —
 * decided by `resolveChain`, not by the parser, because the set of declared
 * variables differs per binding.
 *
 * Failure is always silent and total: a source that does not parse yields `null`,
 * and the caller leaves the whole token in the text verbatim. That mirrors how
 * unknown `{…}` tokens have always behaved.
 */
import { extractJsonPath, joinDpRef } from './dpRef';
import { applyOp, isOp, toNum, type OpArg, type OpsContext } from './exprOps';

/** Which field of a state a reference addresses — value, timestamp, last change. */
export type DpField = 'val' | 'ts' | 'lc';

export interface ExprRef {
    /** Canonical datapoint ref, JSON path included (see utils/dpRef). */
    ref: string;
    field: DpField;
}

export interface ExprContext {
    /** Live value behind a ref. The ref may carry a `?path` suffix. */
    resolveRaw: (ref: string, field: DpField) => unknown;
    /** Raw variable values: the reserved ones plus everything declared as `name:id`. */
    vars: Record<string, unknown>;
    ops: OpsContext;
}

/** Variables every binding knows without declaring them. */
export const RESERVED_VARS: readonly string[] = ['dp', 'color', 'unit', 'language', 'view', 'wid', 'wname'];

// State id: namespace char + at least one further dot-segment, no whitespace.
// `#` and `-` are legal inside a segment because adapters use them (Shelly).
const DP_ID_RE = /^[A-Za-z0-9_][\w#-]*(?:\.[\w#-]+)+$/;

// Pathological input protection. The grammar has no loops, so these bounds plus a
// recursion limit are all that stand between a template and a hung render.
const MAX_LEN = 4000;
const MAX_TOKENS = 500;
const MAX_DEPTH = 50;

// ── AST ───────────────────────────────────────────────────────────────────────

interface ChainNode {
    k: 'chain';
    /** Dot-separated parts as written, e.g. ['senec', '0', 'ENERGY', 'P']. */
    segs: string[];
    /** Constant `['soc']` / `[1]` accessors folded onto the chain at parse time. */
    idx: (string | number)[];
}

export type ExprAst =
    | { k: 'lit'; v: unknown }
    | ChainNode
    | { k: 'un'; op: string; a: ExprAst }
    | { k: 'bin'; op: string; a: ExprAst; b: ExprAst }
    | { k: 'cond'; c: ExprAst; a: ExprAst; b: ExprAst }
    | { k: 'call'; fn: string; args: ExprAst[] }
    | { k: 'index'; a: ExprAst; i: ExprAst }
    | { k: 'pipe'; a: ExprAst; op: string; args: ExprAst[] };

type Node = ExprAst;

// ── callable whitelist ────────────────────────────────────────────────────────

const MATH_FNS: Record<string, (...a: number[]) => number> = {
    abs: Math.abs,
    min: Math.min,
    max: Math.max,
    round: Math.round,
    floor: Math.floor,
    ceil: Math.ceil,
    trunc: Math.trunc,
    sign: Math.sign,
    pow: Math.pow,
    sqrt: Math.sqrt,
    log: Math.log,
    exp: Math.exp,
    hypot: Math.hypot,
};

/** Math functions that may also be called without the `Math.` prefix. */
const BARE_MATH = new Set(['abs', 'min', 'max', 'round', 'floor', 'ceil', 'sqrt', 'pow']);

const GLOBAL_FNS: Record<string, (...a: unknown[]) => unknown> = {
    Number: (v) => Number(v),
    String: (v) => String(v ?? ''),
    Boolean: (v) => Boolean(v),
    parseFloat: (v) => parseFloat(String(v ?? '')),
    parseInt: (v, radix) => parseInt(String(v ?? ''), radix === undefined ? 10 : Number(radix)),
    isNaN: (v) => isNaN(Number(v)),
};

const MATH_CONSTS: Record<string, number> = { PI: Math.PI, E: Math.E };

function isCallable(name: string): boolean {
    if (name.startsWith('Math.')) return Object.prototype.hasOwnProperty.call(MATH_FNS, name.slice(5));
    if (Object.prototype.hasOwnProperty.call(GLOBAL_FNS, name)) return true;
    return BARE_MATH.has(name);
}

function callFn(name: string, args: unknown[]): unknown {
    if (Object.prototype.hasOwnProperty.call(GLOBAL_FNS, name)) return GLOBAL_FNS[name](...args);
    const mathName = name.startsWith('Math.') ? name.slice(5) : name;
    const fn = MATH_FNS[mathName];
    return fn ? fn(...args.map(toNum)) : null;
}

// ── lexer ─────────────────────────────────────────────────────────────────────

interface Token {
    t: 'num' | 'str' | 'id' | 'p';
    v: string;
    n?: number;
}

// Longest first, so `<=` never lexes as `<` + `=`.
const PUNCT = [
    '===',
    '!==',
    '==',
    '!=',
    '<=',
    '>=',
    '&&',
    '||',
    '??',
    '?',
    ':',
    '+',
    '-',
    '*',
    '/',
    '%',
    '!',
    '(',
    ')',
    '[',
    ']',
    ',',
    '|',
    '.',
    '<',
    '>',
];

const WORD_CH = /[A-Za-z0-9_$#]/;

function isWordChar(c: string | undefined): boolean {
    return !!c && WORD_CH.test(c);
}

/** Throws on anything the grammar does not cover — callers turn that into `null`. */
function tokenize(src: string): Token[] {
    const out: Token[] = [];
    let i = 0;
    while (i < src.length) {
        const c = src[i];
        if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
            i++;
            continue;
        }

        if (c === '"' || c === "'") {
            let s = '';
            i++;
            while (i < src.length && src[i] !== c) {
                if (src[i] === '\\' && i + 1 < src.length) {
                    s += src[i + 1];
                    i += 2;
                } else {
                    s += src[i++];
                }
            }
            if (i >= src.length) throw new Error('unterminated string');
            i++;
            out.push({ t: 'str', v: s });
        } else if (isWordChar(c)) {
            let j = i;
            // A digit may start a number (`0.5`, `1e3`) or an ioBroker id (`0_userdata`).
            // Whatever the number pattern matches decides — unless a word character
            // follows it, because then the digits were only the head of an id.
            const numeric = /^\d/.test(c) ? /^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(src.slice(i)) : null;
            if (numeric && !isWordChar(src[i + numeric[0].length])) {
                out.push({ t: 'num', v: numeric[0], n: Number(numeric[0]) });
                j = i + numeric[0].length;
            } else {
                while (isWordChar(src[j])) j++;
                // Extend over `.` and `-` while the next character is still a word
                // character, so `shelly.0.SHSW-25#4C7525#1.Relay0.Switch` stays whole.
                let chain = src.slice(i, j);
                while ((src[j] === '.' || src[j] === '-') && isWordChar(src[j + 1])) {
                    const sep = src[j];
                    j++;
                    let k = j;
                    while (isWordChar(src[k])) k++;
                    chain += sep + src.slice(j, k);
                    j = k;
                }
                out.push({ t: 'id', v: chain });
            }
            i = j;
        } else {
            const p = PUNCT.find((op) => src.startsWith(op, i));
            if (!p) throw new Error(`unexpected ${c}`);
            out.push({ t: 'p', v: p });
            i += p.length;
        }
        if (out.length > MAX_TOKENS) throw new Error('expression too long');
    }
    return out;
}

// ── parser ────────────────────────────────────────────────────────────────────

class Parser {
    private pos = 0;
    private depth = 0;

    constructor(private readonly toks: Token[]) {}

    private peek(): Token | undefined {
        return this.toks[this.pos];
    }

    private isP(v: string): boolean {
        const t = this.peek();
        return !!t && t.t === 'p' && t.v === v;
    }

    private eat(v: string): boolean {
        if (!this.isP(v)) return false;
        this.pos++;
        return true;
    }

    private expect(v: string): void {
        if (!this.eat(v)) throw new Error(`expected ${v}`);
    }

    /** Counts the constructs that really nest — parentheses, calls, indices, unary
     *  operators. Precedence levels are not nesting and must not be counted, or ten
     *  brackets would already exhaust the budget. */
    private enter(): void {
        if (++this.depth > MAX_DEPTH) throw new Error('expression too deeply nested');
    }

    private leave(): void {
        this.depth--;
    }

    parse(): Node {
        const n = this.pipe();
        if (this.pos !== this.toks.length) throw new Error('trailing input');
        return n;
    }

    /** `value | round(1) | HEX2` — the operations of utils/exprOps. */
    private pipe(): Node {
        let left = this.ternary();
        while (this.isP('|')) {
            this.pos++;
            const t = this.peek();
            // Arithmetic operations are punctuation, so `| *(4)` has to be allowed too.
            if (!t || (t.t !== 'id' && !(t.t === 'p' && isOp(t.v)))) throw new Error('operation expected after |');
            this.pos++;
            const name = t.v;
            if (!isOp(name)) throw new Error(`unknown operation ${name}`);
            const args: Node[] = [];
            if (this.eat('(')) {
                if (!this.isP(')')) {
                    do {
                        args.push(this.pipe());
                    } while (this.eat(','));
                }
                this.expect(')');
            }
            left = { k: 'pipe', a: left, op: name, args };
        }
        return left;
    }

    private ternary(): Node {
        const c = this.binary(0);
        if (!this.eat('?')) return c;
        const a = this.pipe();
        this.expect(':');
        const b = this.pipe();
        return { k: 'cond', c, a, b };
    }

    private static readonly LEVELS: string[][] = [
        ['??'],
        ['||'],
        ['&&'],
        ['===', '!==', '==', '!='],
        ['<=', '>=', '<', '>'],
        ['+', '-'],
        ['*', '/', '%'],
    ];

    private binary(level: number): Node {
        if (level >= Parser.LEVELS.length) return this.unary();
        let left = this.binary(level + 1);
        for (;;) {
            const t = this.peek();
            if (!t || t.t !== 'p' || !Parser.LEVELS[level].includes(t.v)) break;
            this.pos++;
            const right = this.binary(level + 1);
            left = { k: 'bin', op: t.v, a: left, b: right };
        }
        return left;
    }

    private unary(): Node {
        for (const op of ['-', '+', '!']) {
            if (this.isP(op)) {
                this.pos++;
                this.enter();
                const a = this.unary();
                this.leave();
                return { k: 'un', op, a };
            }
        }
        return this.postfix();
    }

    private postfix(): Node {
        let node = this.primary();
        for (;;) {
            if (this.eat('[')) {
                const i = this.pipe();
                this.expect(']');
                node = this.addPath(node, i);
            } else if (this.isP('.')) {
                // Only reachable after a bracket or a call — the lexer already folds
                // `a.b` into one chain.
                this.pos++;
                const t = this.peek();
                if (!t || t.t !== 'id') throw new Error('property name expected');
                this.pos++;
                node = this.addPath(node, { k: 'lit', v: t.v });
            } else if (this.isP('(')) {
                if (node.k !== 'chain' || node.idx.length) throw new Error('not callable');
                const fn = node.segs.join('.');
                if (!isCallable(fn)) throw new Error(`unknown function ${fn}`);
                this.pos++;
                const args: Node[] = [];
                if (!this.isP(')')) {
                    do {
                        args.push(this.pipe());
                    } while (this.eat(','));
                }
                this.expect(')');
                node = { k: 'call', fn, args };
            } else {
                break;
            }
        }
        return node;
    }

    /**
     * Constant accessors are folded onto the chain so `0_userdata.0.Akku['soc']`
     * becomes the ref `0_userdata.0.Akku?soc` — the very thing useTemplateValues
     * already knows how to subscribe. Only a computed index needs a runtime lookup.
     */
    private addPath(node: Node, index: Node): Node {
        if (node.k === 'chain' && index.k === 'lit' && (typeof index.v === 'string' || typeof index.v === 'number')) {
            return { ...node, idx: [...node.idx, index.v] };
        }
        return { k: 'index', a: node, i: index };
    }

    private primary(): Node {
        const t = this.peek();
        if (!t) throw new Error('unexpected end');
        if (t.t === 'num') {
            this.pos++;
            return { k: 'lit', v: t.n };
        }
        if (t.t === 'str') {
            this.pos++;
            return { k: 'lit', v: t.v };
        }
        if (t.t === 'id') {
            this.pos++;
            if (t.v === 'true') return { k: 'lit', v: true };
            if (t.v === 'false') return { k: 'lit', v: false };
            if (t.v === 'null') return { k: 'lit', v: null };
            return { k: 'chain', segs: t.v.split('.'), idx: [] };
        }
        if (this.eat('(')) {
            this.enter();
            const n = this.pipe();
            this.leave();
            this.expect(')');
            return n;
        }
        throw new Error(`unexpected ${t.v}`);
    }
}

// ── parse cache ───────────────────────────────────────────────────────────────

const CACHE = new Map<string, Node | null>();
const CACHE_MAX = 500;

/** Parsed form of `src`, or `null` when it is not a valid expression. Cached, so
 *  collecting the refs and rendering every frame parse the source exactly once. */
export function parseExpr(src: string): Node | null {
    const cached = CACHE.get(src);
    if (cached !== undefined) return cached;

    let ast: Node | null = null;
    if (src.trim() && src.length <= MAX_LEN) {
        try {
            ast = new Parser(tokenize(src)).parse();
        } catch {
            ast = null;
        }
    }
    if (CACHE.size >= CACHE_MAX) CACHE.clear();
    CACHE.set(src, ast);
    return ast;
}

// ── chain resolution ──────────────────────────────────────────────────────────

type Resolved =
    | { kind: 'var'; name: string; path: (string | number)[] }
    | { kind: 'dp'; ref: string; field: DpField }
    | { kind: 'const'; v: unknown }
    | { kind: 'none' };

/**
 * Decide what an identifier chain means. Variables win over state ids, so a binding
 * that declares `dp:…` shadows a (hypothetical) adapter called `dp`.
 */
function resolveChain(node: ChainNode, varNames: ReadonlySet<string>): Resolved {
    const { segs, idx } = node;
    const head = segs[0];

    // `Math.PI` reads as a constant; any other uncalled `Math.…` is nothing at all —
    // it must not fall through to the state-id test, which it would pass.
    if (head === 'Math') {
        if (segs.length === 2 && Object.prototype.hasOwnProperty.call(MATH_CONSTS, segs[1])) {
            return { kind: 'const', v: MATH_CONSTS[segs[1]] };
        }
        return { kind: 'none' };
    }
    if (varNames.has(head)) return { kind: 'var', name: head, path: [...segs.slice(1), ...idx] };

    // `senec.0.P.lc` addresses the last-change timestamp — but only when what remains
    // is still a state id, so a two-segment `something.lc` stays the id it looks like.
    let base = segs;
    let field: DpField = 'val';
    const last = segs[segs.length - 1];
    if (segs.length >= 3 && (last === 'ts' || last === 'lc') && DP_ID_RE.test(segs.slice(0, -1).join('.'))) {
        base = segs.slice(0, -1);
        field = last;
    }

    const id = base.join('.');
    if (DP_ID_RE.test(id)) return { kind: 'dp', ref: joinDpRef(id, idx.join('.')), field };
    if (segs.length === 1) return { kind: 'var', name: head, path: idx };
    return { kind: 'none' };
}

function varNameSet(extra: Iterable<string> | undefined): ReadonlySet<string> {
    const set = new Set<string>(RESERVED_VARS);
    if (extra) for (const n of extra) set.add(n);
    return set;
}

// ── reference collection ──────────────────────────────────────────────────────

function walkRefs(node: Node, varNames: ReadonlySet<string>, out: Map<string, ExprRef>): void {
    switch (node.k) {
        case 'chain': {
            const r = resolveChain(node, varNames);
            if (r.kind === 'dp') out.set(`${r.ref}\u0000${r.field}`, { ref: r.ref, field: r.field });
            return;
        }
        case 'un':
            return walkRefs(node.a, varNames, out);
        case 'bin':
            walkRefs(node.a, varNames, out);
            return walkRefs(node.b, varNames, out);
        case 'cond':
            walkRefs(node.c, varNames, out);
            walkRefs(node.a, varNames, out);
            return walkRefs(node.b, varNames, out);
        case 'index':
            walkRefs(node.a, varNames, out);
            return walkRefs(node.i, varNames, out);
        case 'call':
            for (const a of node.args) walkRefs(a, varNames, out);
            return;
        case 'pipe':
            walkRefs(node.a, varNames, out);
            for (const a of node.args) walkRefs(a, varNames, out);
            return;
        default:
    }
}

/** Datapoints an expression reads — exactly what the widget has to subscribe to. */
export function exprRefs(src: string, declaredVars?: Iterable<string>): ExprRef[] {
    const ast = parseExpr(src);
    if (!ast) return [];
    const out = new Map<string, ExprRef>();
    walkRefs(ast, varNameSet(declaredVars), out);
    return [...out.values()];
}

// ── evaluation ────────────────────────────────────────────────────────────────

/** Operation arguments are literals; an expression argument is reduced to one. */
function toOpArg(value: unknown): OpArg {
    if (value === null || value === undefined) return null;
    const t = typeof value;
    if (t === 'number' || t === 'string' || t === 'boolean') return value as OpArg;
    try {
        return JSON.stringify(value);
    } catch {
        return null;
    }
}

function evalNode(node: Node, ctx: ExprContext, varNames: ReadonlySet<string>): unknown {
    switch (node.k) {
        case 'lit':
            return node.v;

        case 'chain': {
            const r = resolveChain(node, varNames);
            if (r.kind === 'const') return r.v;
            if (r.kind === 'dp') return ctx.resolveRaw(r.ref, r.field);
            if (r.kind === 'var') {
                const base = ctx.vars[r.name] ?? null;
                return r.path.length ? extractJsonPath(base, r.path.join('.')) : base;
            }
            return null;
        }

        case 'un': {
            const a = evalNode(node.a, ctx, varNames);
            if (node.op === '!') return !a;
            if (node.op === '-') return -toNum(a);
            return toNum(a);
        }

        case 'bin': {
            const a = evalNode(node.a, ctx, varNames);
            // Short-circuit exactly like JavaScript, so `x || 0` still guards a null.
            if (node.op === '&&') return a ? evalNode(node.b, ctx, varNames) : a;
            if (node.op === '||') return a ? a : evalNode(node.b, ctx, varNames);
            if (node.op === '??') return a ?? evalNode(node.b, ctx, varNames);
            const b = evalNode(node.b, ctx, varNames);
            return binary(node.op, a, b);
        }

        case 'cond':
            return evalNode(node.c, ctx, varNames) ? evalNode(node.a, ctx, varNames) : evalNode(node.b, ctx, varNames);

        case 'call':
            return callFn(
                node.fn,
                node.args.map((a) => evalNode(a, ctx, varNames)),
            );

        case 'index': {
            const a = evalNode(node.a, ctx, varNames);
            const i = evalNode(node.i, ctx, varNames);
            return extractJsonPath(a, String(i ?? ''));
        }

        case 'pipe':
            return applyOp(
                node.op,
                evalNode(node.a, ctx, varNames),
                node.args.map((a) => toOpArg(evalNode(a, ctx, varNames))),
                ctx.ops,
            );

        default:
            return null;
    }
}

function binary(op: string, a: unknown, b: unknown): unknown {
    switch (op) {
        // `+` keeps the JS double meaning: text concatenation when either side is text.
        case '+':
            return typeof a === 'string' || typeof b === 'string'
                ? String(a ?? '') + String(b ?? '')
                : toNum(a) + toNum(b);
        case '-':
            return toNum(a) - toNum(b);
        case '*':
            return toNum(a) * toNum(b);
        case '/':
            return toNum(a) / toNum(b);
        case '%':
            return toNum(a) % toNum(b);
        // Loose comparison compares as text, so '1' == 1 the way ioBroker users expect.
        case '==':
            return String(a ?? '') === String(b ?? '');
        case '!=':
            return String(a ?? '') !== String(b ?? '');
        case '===':
            return a === b;
        case '!==':
            return a !== b;
        case '<':
            return toNum(a) < toNum(b);
        case '<=':
            return toNum(a) <= toNum(b);
        case '>':
            return toNum(a) > toNum(b);
        case '>=':
            return toNum(a) >= toNum(b);
        default:
            return null;
    }
}

/** Evaluate `src`. Returns `undefined` when it does not parse — the caller then
 *  leaves the token in the text rather than swallowing it. */
export function evalExpr(src: string, ctx: ExprContext, declaredVars?: Iterable<string>): unknown {
    const ast = parseExpr(src);
    if (!ast) return undefined;
    try {
        return evalNode(ast, ctx, varNameSet(declaredVars));
    } catch {
        return null;
    }
}

/**
 * How a computed value reads in the output.
 *
 * Numbers stay technical — a decimal comma would wreck the SVG coordinates and CSS
 * lengths these expressions mostly produce. `formatValue(n)` is the way to ask for a
 * localized number. The `toPrecision` pass hides binary-float noise
 * (0.1 + 0.2 → 0.3 rather than 0.30000000000000004).
 */
export function exprToString(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return isFinite(value) ? String(Number(value.toPrecision(12))) : '';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value);
    } catch {
        return '';
    }
}

// ── the vis operation chain ───────────────────────────────────────────────────

export interface ParsedOp {
    name: string;
    args: OpArg[];
}

/** Split on `,` at bracket depth zero and outside quotes. */
function splitArgs(src: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let quote = '';
    let cur = '';
    for (const ch of src) {
        if (quote) {
            cur += ch;
            if (ch === quote) quote = '';
        } else if (ch === '"' || ch === "'") {
            quote = ch;
            cur += ch;
        } else if (ch === '(' || ch === '[') {
            depth++;
            cur += ch;
        } else if (ch === ')' || ch === ']') {
            depth--;
            cur += ch;
        } else if (ch === ',' && depth === 0) {
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
 * Chain arguments are raw text, not expressions — that is what lets vis write
 * `date(hh:mm)` and `default(–)` without quotes. Quoted, numeric and boolean
 * spellings are recognised, everything else is taken literally.
 */
function parseOpArg(raw: string): OpArg {
    const s = raw.trim();
    if (!s) return null;
    if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) return s.slice(1, -1);
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (s === 'null') return null;
    if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return Number(s);
    return s;
}

// `round`, `round(1)`, `*(4)`, `date(hh:mm)` — name, then an optional argument list.
const OP_RE = /^([A-Za-z_][\w]*|[*+\-/%])\s*(?:\((.*)\)\s*)?$/;

/**
 * Parse the `;`-separated tail of a vis binding into operations.
 * Returns `null` as soon as one member is not an operation, so the whole token is
 * then left verbatim instead of half-applied.
 */
export function parseOpChain(parts: string[]): ParsedOp[] | null {
    const ops: ParsedOp[] = [];
    for (const part of parts) {
        const m = OP_RE.exec(part.trim());
        if (!m || !isOp(m[1])) return null;
        ops.push({ name: m[1], args: m[2] === undefined ? [] : splitArgs(m[2]).map(parseOpArg) });
    }
    return ops;
}

/** Run a parsed chain over a value. */
export function applyOpChain(value: unknown, ops: ParsedOp[], ctx: OpsContext): unknown {
    return ops.reduce<unknown>((acc, op) => applyOp(op.name, acc, op.args, ctx), value);
}

/** Whether a string can be used as a datapoint reference inside a binding. */
export function isDpId(id: string): boolean {
    return DP_ID_RE.test(id);
}
