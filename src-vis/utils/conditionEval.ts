import type { WidgetCondition, ConditionClause } from '../types';

// Shared condition-evaluation logic. Used by useConditionStyle (widgets),
// useTabConditionStyle (tabs) and useBadges (badge visibility) so the operator
// semantics stay identical across all three.

export function evaluateClause(clause: ConditionClause, raw: unknown, values: Map<string, unknown>): boolean {
    const str = String(raw ?? '');
    const num = Number(raw);

    // Resolve the comparison value: static string vs second datapoint
    const isDpCompare = clause.valueType === 'datapoint';
    const cmpRaw: unknown = isDpCompare ? (values.get(clause.value) ?? null) : clause.value;
    const cmpStr = isDpCompare ? String(cmpRaw ?? '') : clause.value;
    const cmpNum = Number(cmpRaw);

    switch (clause.operator) {
        case '==':
            return str === cmpStr;
        case '!=':
            return str !== cmpStr;
        case '>':
            return !isNaN(num) && !isNaN(cmpNum) && num > cmpNum;
        case '>=':
            return !isNaN(num) && !isNaN(cmpNum) && num >= cmpNum;
        case '<':
            return !isNaN(num) && !isNaN(cmpNum) && num < cmpNum;
        case '<=':
            return !isNaN(num) && !isNaN(cmpNum) && num <= cmpNum;
        case 'true':
            return raw === true || raw === 1 || str === 'true' || str === '1';
        case 'false':
            return raw === false || raw === 0 || str === 'false' || str === '0';
        case 'contains':
            return str.includes(cmpStr);
        default:
            return false;
    }
}

export function evaluateCondition(cond: WidgetCondition, values: Map<string, unknown>): boolean {
    if (!cond.clauses.length) return false;
    const results = cond.clauses.map((c) => evaluateClause(c, values.get(c.datapoint) ?? null, values));
    return cond.logic === 'AND' ? results.every(Boolean) : results.some(Boolean);
}
