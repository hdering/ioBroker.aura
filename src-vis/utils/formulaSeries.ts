/**
 * Computed chart series (issue #930): a formula over several datapoints, e.g. `(is - ib) * u`.
 *
 * Many history adapters log changes only, so the inputs never share timestamps. They are laid on
 * the union of all their timestamps, and at every instant each input holds its LAST known value
 * (sample and hold) — the reading the adapter puts in front of the window seeds it. The formula
 * runs only where every input has a value; anything that is not a finite number (a division by
 * zero) leaves a gap.
 *
 * The formula language is the binding one (utils/expr) — a closed grammar, never `eval`.
 *
 * Pure logic, no React: shared by the chart's data hook, the editor preview and the tests.
 */
import { evalExpr, exprNames, RESERVED_VARS } from './expr';
import type { OpsContext } from './exprOps';

export interface FormulaInput {
    /** Variable name in the formula (`u`, `is`). */
    name: string;
    datapointId: string; // State the variable reads — live value and history alike.
    /** Own history instance — otherwise the series' one. */
    historyInstance?: string;
}

/** Up to this window the inputs are read raw and the formula runs on every reading; beyond it
 *  on bucket averages, which is exact for sums and differences but an approximation for products. */
export const FORMULA_RAW_MAX_MS = 7 * 86_400_000;

/** Row cap of a raw input fetch. */
export const FORMULA_RAW_COUNT = 20_000;

const HOUR = 3_600_000;
const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** A name usable as a formula variable: an identifier that is no reserved binding name. */
export function isFormulaVarName(name: string): boolean {
    return NAME_RE.test(name) && name !== 'Math' && !RESERVED_VARS.includes(name);
}

/** The inputs that can take part: a valid name and a datapoint; a repeated name keeps its first. */
export function usableInputs(inputs: FormulaInput[] | undefined): FormulaInput[] {
    const out: FormulaInput[] = [];
    for (const i of inputs ?? []) {
        const id = (i.datapointId ?? '').trim();
        if (!id || !isFormulaVarName(i.name) || out.some((o) => o.name === i.name)) continue;
        out.push({ ...i, datapointId: id });
    }
    return out;
}

/** A variable name suggested for a picked datapoint: its last id segment, made an identifier. */
export function suggestVarName(datapointId: string, taken: string[]): string {
    const last = datapointId.split('.').pop() ?? '';
    let base = last.replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1');
    if (!isFormulaVarName(base)) base = 'x';
    let name = base;
    for (let n = 2; taken.includes(name); n++) name = `${base}${n}`;
    return name;
}

export type FormulaProblem =
    | { kind: 'empty' }
    | { kind: 'parse' }
    | { kind: 'name'; name: string }
    | { kind: 'duplicate'; name: string }
    | { kind: 'unknown'; name: string }
    | { kind: 'datapoint'; id: string };

/** What keeps a formula series from computing, null when nothing does. */
export function formulaProblem(formula: string | undefined, inputs: FormulaInput[] | undefined): FormulaProblem | null {
    const seen = new Set<string>();
    for (const i of inputs ?? []) {
        if (!i.name && !i.datapointId) continue;
        if (!isFormulaVarName(i.name)) return { kind: 'name', name: i.name };
        if (seen.has(i.name)) return { kind: 'duplicate', name: i.name };
        seen.add(i.name);
    }
    const src = (formula ?? '').trim();
    if (!src) return { kind: 'empty' };
    const names = exprNames(src, seen);
    if (!names) return { kind: 'parse' };
    // A state id written straight into the formula has no history the series could read.
    if (names.dps.length > 0) return { kind: 'datapoint', id: names.dps[0] };
    const unknown = names.vars.find((v) => !seen.has(v));
    return unknown ? { kind: 'unknown', name: unknown } : null;
}

const OPS: OpsContext = { formatNum: (n, d) => n.toFixed(d), decimals: 2, t: (key) => key };

/** The formula over one set of values; null when it yields no finite number. */
export function evalFormula(formula: string, vars: Record<string, number>): number | null {
    const v = evalExpr(formula, { resolveRaw: () => null, vars, ops: OPS }, Object.keys(vars));
    const n = typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'number' ? v : null;
    return n !== null && Number.isFinite(n) ? n : null;
}

export interface FormulaSource {
    name: string;
    /** Sorted `[ts, value]` rows. Rows before the window seed the held value. */
    data: [number, number][];
}

/**
 * The formula over the inputs, every input holding its last value (see the file comment).
 * Rows before `start` only seed; the curve opens at `start` once every input is known there.
 */
export function combineFormula(formula: string, sources: FormulaSource[], start: number): [number, number][] {
    if (sources.length === 0) return [];
    const times = new Set<number>([start]);
    for (const s of sources) for (const [ts] of s.data) if (ts > start) times.add(ts);
    const timeline = [...times].sort((a, b) => a - b);
    const pos = sources.map(() => 0);
    const vars: Record<string, number> = {};
    const out: [number, number][] = [];
    for (const t of timeline) {
        let complete = true;
        sources.forEach((s, i) => {
            while (pos[i] < s.data.length && s.data[pos[i]][0] <= t) {
                vars[s.name] = s.data[pos[i]][1];
                pos[i]++;
            }
            if (!(s.name in vars)) complete = false;
        });
        if (!complete) continue;
        const v = evalFormula(formula, vars);
        if (v !== null) out.push([t, v]);
    }
    return out;
}

/**
 * The formula per bucket over per-input bucket values — the `delta` bars of several counters
 * (each differenced on its own, with its own resets). A bucket missing in any input is left out
 * rather than computed from a partial sum.
 */
export function combineBuckets(formula: string, sources: FormulaSource[]): [number, number][] {
    if (sources.length === 0) return [];
    const maps = sources.map((s) => new Map(s.data));
    const out: [number, number][] = [];
    for (const [bucket] of sources[0].data) {
        const vars: Record<string, number> = {};
        let complete = true;
        sources.forEach((s, i) => {
            const v = maps[i].get(bucket);
            if (v === undefined) complete = false;
            else vars[s.name] = v;
        });
        if (!complete) continue;
        const v = evalFormula(formula, vars);
        if (v !== null) out.push([bucket, v]);
    }
    return out;
}

/** The held value at `t`: the last row at or before it, null before the first. */
function heldAt(points: [number, number][], t: number): number | null {
    let v: number | null = null;
    for (const [ts, val] of points) {
        if (ts > t) break;
        v = val;
    }
    return v;
}

/**
 * Area under a held curve over `[start, end]`, per hour — W over time gives Wh. Each row holds
 * until the next; the last until `end`. Time before the first known value counts nothing.
 */
export function integrate(points: [number, number][], start: number, end: number): number | null {
    if (end <= start) return null;
    let v = heldAt(points, start);
    let t = start;
    let area = 0;
    let any = v !== null;
    for (const [ts, val] of points) {
        if (ts <= start) continue;
        if (ts >= end) break;
        if (v !== null) area += v * (ts - t);
        v = val;
        t = ts;
        any = true;
    }
    if (v !== null) area += v * (end - t);
    return any ? area / HOUR : null;
}

export type FormulaBucketMode = 'average' | 'min' | 'max' | 'minmax' | 'total';

/**
 * A raw computed curve cut into `step` buckets from `start` to `end`, like an adapter's
 * aggregation. The average is time-weighted (a value that held for 50 min counts 50 min); a row
 * per bucket, stamped in the middle of the part of it that lies before `end`. `minmax` keeps both
 * extremes at their own instants.
 */
export function bucketFormula(
    points: [number, number][],
    start: number,
    end: number,
    step: number,
    mode: FormulaBucketMode,
): [number, number][] {
    const out: [number, number][] = [];
    if (step <= 0 || end <= start) return out;
    let i = 0;
    for (let b = start; b < end; b += step) {
        const e = Math.min(b + step, end);
        while (i < points.length && points[i][0] < b) i++;
        const held = heldAt(points, b);
        const inside: [number, number][] = [];
        for (let k = i; k < points.length && points[k][0] < e; k++) inside.push(points[k]);
        const rows: [number, number][] =
            held !== null && (inside.length === 0 || inside[0][0] > b) ? [[b, held], ...inside] : inside;
        if (rows.length === 0) continue;
        const mid = Math.round((b + e) / 2);
        if (mode === 'average') {
            // Time-weighted from the first known value on — a bucket the data only reaches halfway
            // into averages that half.
            const from = rows[0][0];
            const area = integrate(rows, from, e);
            if (area !== null && e > from) out.push([mid, (area * HOUR) / (e - from)]);
            continue;
        }
        const vals = rows.map((r) => r[1]);
        if (mode === 'min') out.push([mid, Math.min(...vals)]);
        else if (mode === 'max') out.push([mid, Math.max(...vals)]);
        else if (mode === 'total') out.push([mid, inside.reduce((sum, r) => sum + r[1], 0)]);
        else {
            let lo = rows[0];
            let hi = rows[0];
            for (const r of rows) {
                if (r[1] < lo[1]) lo = r;
                if (r[1] > hi[1]) hi = r;
            }
            out.push(...(lo === hi ? [lo] : lo[0] <= hi[0] ? [lo, hi] : [hi, lo]));
        }
    }
    return out;
}

/** Time-weighted mean of a held curve over `[start, end]`. */
export function timeAverage(points: [number, number][], start: number, end: number): number | null {
    const first = points.find((p) => p[0] >= start)?.[0];
    const from = heldAt(points, start) !== null ? start : first;
    if (from === undefined || end <= from) return null;
    const area = integrate(points, from, end);
    return area === null ? null : (area * HOUR) / (end - from);
}
