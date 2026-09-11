/**
 * How the clauses of one condition combine (issue #635).
 *
 * Before this module every rule had a single `logic: 'AND' | 'OR'` for the whole
 * clause list — the editor drew a chip between every pair of rows, but all of them
 * wrote the same field, so "AND on one row, OR on the next" was impossible. The
 * connector now lives on the clause (`join`), and a clause may sit inside a bracket
 * (`bracket`).
 *
 * Two deliberate restrictions keep this cheap:
 *
 *   1. AND binds tighter than OR, as in every language that has both. `A AND B OR C`
 *      is `(A AND B) OR C`, never `A AND (B OR C)`. Nobody has to learn a rule that
 *      only this dashboard uses.
 *   2. The clause list stays FLAT. A bracket is a marker on consecutive clauses, not
 *      a nested node, so everything that walks `clauses` — foreign-ref collection,
 *      `{{parent}}` resolution, export anonymisation, the schema extractor, the MCP
 *      validator — keeps working untouched. One nesting level is what a dashboard
 *      rule needs; `((A OR B) AND C) OR D` is not a thing anyone builds in a colour
 *      rule.
 *
 * The marker is 'open' / 'in' rather than a depth flag for one reason: a depth flag
 * puts no boundary between two ADJACENT brackets, so `(A OR B) AND (C OR D)` would
 * collapse into a single four-row group.
 *
 * No imports on purpose: this is the piece the pure-logic unit test exercises
 * without a browser.
 */

/** The bit of a clause this module reads. Any clause-like row can be combined. */
export interface JoinableClause {
    join?: 'AND' | 'OR';
    bracket?: 'open' | 'in';
}

export type ClauseLogic = 'AND' | 'OR';

/** One clause, or one bracket, at a single level. */
export type ClauseNode =
    | { kind: 'leaf'; index: number; join: ClauseLogic }
    | { kind: 'group'; items: ClauseNode[]; join: ClauseLogic };

/**
 * The bracket marker as it actually applies, with a dangling 'in' promoted to
 * 'open'.
 *
 * An 'in' whose predecessor is not bracketed has nothing to continue — it happens
 * while the user is rearranging rows, and every reader has to agree on what it
 * means, or the bar in the editor would draw a group the evaluation does not see.
 */
function bracketAt(clauses: readonly JoinableClause[], index: number): 'open' | 'in' | undefined {
    const own = clauses[index]?.bracket;
    if (!own) return undefined;
    if (own === 'open') return 'open';
    return index > 0 && clauses[index - 1]?.bracket ? 'in' : 'open';
}

/**
 * Group the flat clause list into the tree the operators describe.
 *
 * `fallback` is the rule-wide `logic` and answers for every clause that has no
 * `join` of its own — that is what makes a config written before #635 keep its
 * meaning. The join of the first entry at a level is never read; 'AND' is stored
 * there so the type stays simple.
 */
export function clauseTree(clauses: readonly JoinableClause[], fallback: ClauseLogic = 'AND'): ClauseNode[] {
    const joinAt = (index: number, first: boolean): ClauseLogic => (first ? 'AND' : (clauses[index].join ?? fallback));
    const out: ClauseNode[] = [];
    let i = 0;
    while (i < clauses.length) {
        const outerFirst = out.length === 0;
        if (bracketAt(clauses, i)) {
            // A bracket attaches to the outer level with the join of its 'open' row;
            // inside, that same row's join is the one that is not read.
            const join = joinAt(i, outerFirst);
            const items: ClauseNode[] = [{ kind: 'leaf', index: i, join: 'AND' }];
            i++;
            while (i < clauses.length && bracketAt(clauses, i) === 'in') {
                items.push({ kind: 'leaf', index: i, join: joinAt(i, false) });
                i++;
            }
            out.push({ kind: 'group', items, join });
        } else {
            out.push({ kind: 'leaf', index: i, join: joinAt(i, outerFirst) });
            i++;
        }
    }
    return out;
}

/** Split one level into OR-separated runs of AND-ed nodes (AND binds tighter). */
function orRuns(nodes: readonly ClauseNode[]): ClauseNode[][] {
    const runs: ClauseNode[][] = [];
    nodes.forEach((node, i) => {
        if (i === 0 || node.join === 'OR') runs.push([]);
        runs[runs.length - 1].push(node);
    });
    return runs;
}

function nodeHit(node: ClauseNode, hits: readonly boolean[]): boolean {
    return node.kind === 'leaf' ? !!hits[node.index] : evalNodes(node.items, hits);
}

function evalNodes(nodes: readonly ClauseNode[], hits: readonly boolean[]): boolean {
    if (!nodes.length) return false;
    return orRuns(nodes).some((run) => run.every((n) => nodeHit(n, hits)));
}

/**
 * The verdict of a whole clause list, given the per-clause results in order.
 *
 * The single place the former `logic === 'AND' ? every : some` sites now call, so
 * widget conditions, cell/row rules and badges cannot drift apart again. An empty
 * list is false — a rule with no clause has never matched.
 */
export function combineClauseHits(
    clauses: readonly JoinableClause[],
    hits: readonly boolean[],
    fallback: ClauseLogic = 'AND',
): boolean {
    if (!clauses.length) return false;
    return evalNodes(clauseTree(clauses, fallback), hits);
}

/**
 * The set version, for "which list entries made this match" (issue #605).
 *
 * `setFor` returns the entries one clause points at, or `null` for a clause that
 * speaks about the list as a whole rather than about a row. Those are skipped
 * rather than treated as neutral, exactly as the single-logic code did: they stay
 * a global gate, evaluated by the caller. `null` comes back when no clause in the
 * subtree names rows at all — the caller then treats the match as list-wide.
 *
 * AND intersects, OR unions; `order` fixes the output order in both cases.
 */
export function combineClauseSets(
    clauses: readonly JoinableClause[],
    setFor: (index: number) => string[] | null,
    order: readonly string[],
    fallback: ClauseLogic = 'AND',
): string[] | null {
    if (!clauses.length) return null;
    return setNodes(clauseTree(clauses, fallback), setFor, order);
}

function setNodes(
    nodes: readonly ClauseNode[],
    setFor: (index: number) => string[] | null,
    order: readonly string[],
): string[] | null {
    // Clauses that name no rows drop out first, so the joins that decide the
    // grouping are the ones of the entries that actually survive.
    const live: { node: ClauseNode; set: string[] }[] = [];
    for (const node of nodes) {
        const set = node.kind === 'leaf' ? setFor(node.index) : setNodes(node.items, setFor, order);
        if (set) live.push({ node, set });
    }
    if (!live.length) return null;
    const runs: string[][][] = [];
    live.forEach((entry, i) => {
        if (i === 0 || entry.node.join === 'OR') runs.push([]);
        runs[runs.length - 1].push(entry.set);
    });
    const union = new Set<string>();
    for (const [first, ...rest] of runs) {
        // Within a run every set has to agree (AND), so intersect.
        for (const ref of first) if (rest.every((s) => s.includes(ref))) union.add(ref);
    }
    return order.filter((ref) => union.has(ref));
}

/**
 * Write `join` onto every clause that still relies on the rule-wide `logic`.
 *
 * Called by the editor before it changes one connector: without it, setting row 3
 * to OR would leave rows 1 and 2 reading a `logic` the user is no longer looking
 * at, and the rule would quietly mean something else than the chips say.
 */
export function materializeJoins<T extends JoinableClause>(clauses: readonly T[], fallback: ClauseLogic): T[] {
    return clauses.map((cl, i) => (i === 0 || cl.join ? cl : { ...cl, join: fallback }));
}

/** Is this clause the first / last row of a bracket? Drives the editor's bracket bar. */
export function groupEdges(
    clauses: readonly JoinableClause[],
    index: number,
): { inGroup: boolean; first: boolean; last: boolean } {
    const own = bracketAt(clauses, index);
    if (!own) return { inGroup: false, first: false, last: false };
    return {
        inGroup: true,
        first: own === 'open',
        last: bracketAt(clauses, index + 1) !== 'in',
    };
}

/**
 * What the editor's bracket button does on one row, as a three-step cycle:
 *
 *   no bracket  →  join the bracket above, or open a new one
 *   inside one  →  open a NEW bracket here (this is how two adjacent brackets are
 *                  separated — there is no other gesture for it)
 *   opening one →  no bracket
 *
 * The row below is fixed up as well: dropping or splitting a bracket must not leave
 * an 'in' dangling behind it.
 */
export function cycleBracket<T extends JoinableClause>(clauses: readonly T[], index: number): T[] {
    const own = bracketAt(clauses, index);
    const prevBracketed = index > 0 && !!bracketAt(clauses, index - 1);
    const next: 'open' | 'in' | undefined = !own ? (prevBracketed ? 'in' : 'open') : own === 'in' ? 'open' : undefined;
    return clauses.map((cl, i) => {
        if (i === index) return next ? { ...cl, bracket: next } : { ...cl, bracket: undefined };
        // The successor of a row that just left its bracket would continue nothing.
        if (i === index + 1 && !next && cl.bracket === 'in') return { ...cl, bracket: 'open' as const };
        return cl;
    });
}

/**
 * The rule as one line of text — `A UND (B ODER C)`.
 *
 * The chips alone stop being readable as soon as brackets are in play, so the
 * editor prints the whole expression underneath them. `label(i)` names a clause;
 * `and` / `or` are the translated words.
 */
export function describeClauseLogic(
    clauses: readonly JoinableClause[],
    label: (index: number) => string,
    words: { and: string; or: string },
    fallback: ClauseLogic = 'AND',
): string {
    // A bracket around a single clause is a step the user is in the middle of, not
    // something to print — it would read as `(A) UND B`.
    const render = (nodes: readonly ClauseNode[]): string =>
        nodes
            .map((node, i) => {
                const body =
                    node.kind === 'leaf'
                        ? label(node.index)
                        : node.items.length > 1
                          ? `(${render(node.items)})`
                          : render(node.items);
                return i === 0 ? body : `${node.join === 'OR' ? words.or : words.and} ${body}`;
            })
            .join(' ');
    return render(clauseTree(clauses, fallback));
}
