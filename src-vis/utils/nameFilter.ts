/**
 * Text rules for the status-overview name pattern.
 *
 * The name pattern is a display template: tokens like <Raum> or <DPName> are replaced with
 * values taken from the datapoint. Those values arrive exactly as the adapter provides them
 * ("ACTUAL_TEMPERATURE", "HM-CC-RT-DN 0001ABC"), so a rule list can reshape each token value
 * before it is substituted. Rules never influence which datapoints are found — display only.
 *
 * Framework-free on purpose: the widget and the config preview import the same
 * formatItemName, so what the editor previews is exactly what the widget renders.
 */

/** Which token a rule operates on. 'Ergebnis' runs on the finished label, after substitution. */
export type NameFilterField = 'Raum' | 'Gerät' | 'DPName' | 'Name' | 'ID' | 'Ergebnis';

export type NameFilterOp =
    | 'remove' // drop every occurrence of value
    | 'replace' // value → value2
    | 'keepBefore' // everything before the FIRST value
    | 'keepAfter' // everything after the LAST value
    | 'segment' // split by value, take value2 (1-based, negative counts from the end)
    | 'stripPrefix'
    | 'stripSuffix'
    | 'firstWords' // keep the first value words
    | 'lastWords' // keep the last value words
    | 'stripDigits' // drop digits and leftover separators
    | 'case' // value: 'upper' | 'lower' | 'title'
    | 'regexExtract' // /re/flags → group 1, or the whole match
    | 'regexReplace'; // /re/flags → value2 ($1 supported)

export interface NameFilterRule {
    id: string;
    field: NameFilterField;
    op: NameFilterOp;
    value?: string;
    value2?: string;
    /** Rule kept in the list but not applied. */
    disabled?: boolean;
}

export const NAME_FILTER_FIELDS: NameFilterField[] = ['Raum', 'Gerät', 'DPName', 'Name', 'ID', 'Ergebnis'];

/**
 * Parses the project-wide pattern convention (matchesIdPattern in statusOverview.ts):
 * "/body/flags", or a bare pattern. A bare pattern gets the friendly "i" default; a
 * delimited one is taken literally, so "/[A-Z]+/" really means upper case only — text
 * extraction needs that precision, unlike the loose id matching in the exclude field.
 * Returns null for an invalid regex.
 */
export function parseRegex(input?: string): RegExp | null {
    const p = (input ?? '').trim();
    if (!p) return null;
    let body = p;
    let flags = 'i';
    if (p.startsWith('/')) {
        const lastSlash = p.lastIndexOf('/');
        if (lastSlash > 0) {
            body = p.slice(1, lastSlash);
            flags = p.slice(lastSlash + 1);
        } else {
            body = p.slice(1);
        }
    }
    try {
        return new RegExp(body, flags);
    } catch {
        return null;
    }
}

function titleCase(s: string): string {
    return s.toLowerCase().replace(/(^|[\s\-_/.])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** Numeric rule argument (segment index, word count); NaN-safe. */
function num(v: string | undefined, fallback: number): number {
    const n = parseInt((v ?? '').trim(), 10);
    return isNaN(n) ? fallback : n;
}

/**
 * Applies one rule to a text. Never throws: a rule that cannot be applied (missing value,
 * broken regex, no match) returns the text unchanged, so a half-typed rule in the editor
 * degrades to a no-op instead of blanking the label.
 */
export function applyNameFilterRule(text: string, rule: NameFilterRule): string {
    if (rule.disabled) return text;
    const v = rule.value ?? '';
    const v2 = rule.value2 ?? '';

    switch (rule.op) {
        case 'remove':
            return v ? text.split(v).join('') : text;
        case 'replace':
            return v ? text.split(v).join(v2) : text;
        case 'keepBefore': {
            if (!v) return text;
            const i = text.indexOf(v);
            return i === -1 ? text : text.slice(0, i);
        }
        case 'keepAfter': {
            if (!v) return text;
            const i = text.lastIndexOf(v);
            return i === -1 ? text : text.slice(i + v.length);
        }
        case 'segment': {
            if (!v) return text;
            const parts = text.split(v);
            const n = num(v2, 1);
            if (n === 0) return text;
            const part = n > 0 ? parts[n - 1] : parts[parts.length + n];
            return part ?? text;
        }
        case 'stripPrefix':
            return v && text.startsWith(v) ? text.slice(v.length) : text;
        case 'stripSuffix':
            return v && text.endsWith(v) ? text.slice(0, -v.length) : text;
        case 'firstWords': {
            const words = text.split(/\s+/).filter(Boolean);
            const n = Math.max(1, num(v, 1));
            return words.slice(0, n).join(' ');
        }
        case 'lastWords': {
            const words = text.split(/\s+/).filter(Boolean);
            const n = Math.max(1, num(v, 1));
            return words.slice(-n).join(' ');
        }
        case 'stripDigits':
            // Digits plus the separator debris they leave behind ("Sensor 3 (0x1a)" → "Sensor").
            return text
                .replace(/0x[0-9a-f]+/gi, '')
                .replace(/\d+/g, '')
                .replace(/[_\-.:#()[\]]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        case 'case':
            if (v === 'upper') return text.toUpperCase();
            if (v === 'lower') return text.toLowerCase();
            if (v === 'title') return titleCase(text);
            return text;
        case 'regexExtract': {
            const re = parseRegex(v);
            if (!re) return text;
            const m = text.match(re);
            if (!m) return text;
            return m[1] ?? m[0];
        }
        case 'regexReplace': {
            const re = parseRegex(v);
            if (!re) return text;
            // Global by default so "remove every match" works without the user knowing /g.
            const global = re.flags.includes('g') ? re : new RegExp(re.source, `${re.flags}g`);
            try {
                return text.replace(global, v2);
            } catch {
                return text;
            }
        }
        default:
            return text;
    }
}

/** Applies every enabled rule targeting `field`, in list order. */
export function applyNameFilters(text: string, field: NameFilterField, rules?: NameFilterRule[]): string {
    if (!rules?.length) return text;
    let out = text;
    for (const rule of rules) {
        if (rule.field !== field || rule.disabled) continue;
        out = applyNameFilterRule(out, rule);
    }
    return out;
}

/** The subset of a StatusItem a label needs — lets the editor preview pass a plain object. */
export interface NameSource {
    id: string;
    name: string;
    room?: string;
}

/** Token values before any rule ran, keyed by field name (for editor previews). */
export function nameTokens(item: NameSource): Record<Exclude<NameFilterField, 'Ergebnis'>, string> {
    const parts = item.name.split(' › ');
    return {
        Raum: item.room ?? '',
        Gerät: parts[0] || item.name,
        DPName: item.id.split('.').pop() || (parts.length > 1 ? parts[parts.length - 1] : item.name),
        Name: item.name,
        ID: item.id,
    };
}

/**
 * Format a device label from a per-widget template. Tokens (case-insensitive):
 *   <Raum> room · <Gerät>/<Geraet> device part (before " › ") · <DPName> datapoint leaf ·
 *   <Name> full composed name · <ID> full datapoint id.
 * Empty pattern → the composed name unchanged, unless rules exist: then "<Name>" is assumed
 * so rules still take effect without the user also having to write a pattern.
 * Empty result → falls back to the composed name.
 */
export function formatItemName(item: NameSource, pattern?: string, rules?: NameFilterRule[]): string {
    const active = rules?.filter((r) => !r.disabled) ?? [];
    const tpl = pattern || (active.length ? '<Name>' : '');
    if (!tpl) return item.name;

    const tok = nameTokens(item);
    const out = tpl
        .replace(/<Raum>/gi, () => applyNameFilters(tok.Raum, 'Raum', active))
        .replace(/<Ger(?:ä|ae)t>/gi, () => applyNameFilters(tok.Gerät, 'Gerät', active))
        .replace(/<DPName>/gi, () => applyNameFilters(tok.DPName, 'DPName', active))
        .replace(/<Name>/gi, () => applyNameFilters(tok.Name, 'Name', active))
        .replace(/<ID>/gi, () => applyNameFilters(tok.ID, 'ID', active));

    const finished = applyNameFilters(out, 'Ergebnis', active).replace(/\s+/g, ' ').trim();
    return finished || item.name;
}
