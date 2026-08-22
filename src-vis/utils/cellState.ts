// Active-state detection for custom-layout cells whose look depends on a value:
// 'state-icon' (issue #467), 'switch' and 'state-text' (issue #567). Kept out of the
// renderer so it stays pure and unit-testable (tools/tests/cell-state.mjs).
import type { ConditionOperator } from '../types';
import { evaluateClause } from './conditionEval';

/** The three fields that describe how a value turns into an on/off state. `CustomCell`
 *  carries them, widget option bags spell them the same way. */
export interface StateEvalConfig {
    stateMode?: 'boolean' | 'condition';
    stateOperator?: ConditionOperator;
    stateValue?: string;
}

/** Default truthiness of a state-driven cell: the ioBroker boolean shapes plus the 'on'
 *  string MQTT devices report (issue #567). Anything else needs stateMode 'condition'. */
export function isTruthyState(value: unknown): boolean {
    if (value === true || value === 1) return true;
    if (typeof value !== 'string') return false;
    const v = value.trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'on';
}

/** Loose truthiness for the standalone widgets, which historically used `Boolean(value)`:
 *  every non-zero number and every non-empty string counts as on — except the explicit
 *  off words, which used to read as on and never should have (issue #567). */
export function isTruthyStateLoose(value: unknown): boolean {
    if (typeof value !== 'string') return Boolean(value);
    const v = value.trim().toLowerCase();
    if (v === '' || v === 'off' || v === 'false' || v === '0') return false;
    return true;
}

/** 'condition' mode runs the shared operator engine (numeric dimmers, ON/OFF strings, …),
 *  'boolean' mode (default) coerces. `dpId` only labels the clause — the value is passed in.
 *  `loose` picks isTruthyStateLoose for the boolean fallback (standalone widgets). */
export function cellStateActive(cfg: StateEvalConfig, value: unknown, dpId: string, loose = false): boolean {
    if (cfg.stateMode === 'condition')
        return evaluateClause(
            {
                datapoint: dpId,
                operator: cfg.stateOperator ?? '>',
                value: cfg.stateValue ?? '0',
                valueType: 'static',
            },
            value,
            new Map(),
        );
    return loose ? isTruthyStateLoose(value) : isTruthyState(value);
}
