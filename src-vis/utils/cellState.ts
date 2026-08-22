// Active-state detection for custom-layout cells whose look depends on a value:
// 'state-icon' (issue #467), 'switch' and 'state-text' (issue #567). Kept out of the
// renderer so it stays pure and unit-testable (tools/tests/cell-state.mjs).
import type { CustomCell } from '../types';
import { evaluateClause } from './conditionEval';

/** Default truthiness of a state-driven cell: the ioBroker boolean shapes plus the 'on'
 *  string MQTT devices report (issue #567). Anything else needs stateMode 'condition'. */
export function isTruthyState(value: unknown): boolean {
    if (value === true || value === 1) return true;
    if (typeof value !== 'string') return false;
    const v = value.trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'on';
}

/** 'condition' mode runs the shared operator engine (numeric dimmers, ON/OFF strings, …),
 *  'boolean' mode (default) coerces. `dpId` only labels the clause — the value is passed in. */
export function cellStateActive(cell: CustomCell, value: unknown, dpId: string): boolean {
    if (cell.stateMode === 'condition')
        return evaluateClause(
            {
                datapoint: dpId,
                operator: cell.stateOperator ?? '>',
                value: cell.stateValue ?? '0',
                valueType: 'static',
            },
            value,
            new Map(),
        );
    return isTruthyState(value);
}
