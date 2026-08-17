/** The tokens a custom date pattern may use — shared by the formatter and the pickers. */
export const DATE_TOKENS = ['yyyy', 'yy', 'MM', 'dd', 'HH', 'hh', 'mm', 'ss'] as const;

export type DateToken = (typeof DATE_TOKENS)[number];

/** Fresh instance per call so `exec` loops never inherit a stale `lastIndex`. */
export function tokenRe() {
    return /yyyy|yy|MM|dd|HH|hh|mm|ss/g;
}

/** The tokens `pattern` names, in the order they appear and without repeats. */
export function patternTokens(pattern: string): DateToken[] {
    const hits = (pattern.match(tokenRe()) ?? []) as DateToken[];
    return hits.filter((tok, i) => hits.indexOf(tok) === i);
}
