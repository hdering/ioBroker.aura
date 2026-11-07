import { useState } from 'react';
import { Database, Plus, X } from 'lucide-react';
import { useT } from '../../../i18n';
import type { EChartSeriesConfig } from '../../../hooks/useMultiSeriesData';
import { useTemplateStates } from '../../../hooks/useTemplateValues';
import { DatapointPicker } from '../DatapointPicker';
import {
    evalFormula,
    formulaProblem,
    suggestVarName,
    usableInputs,
    type FormulaInput,
    type FormulaProblem,
} from '../../../utils/formulaSeries';
import { inputCls, inputStyle } from './chartShared';

/**
 * Inputs and formula of a computed series (issue #930): one row per input — a short name and a
 * datapoint — then the expression over those names, with the result as of now underneath. A
 * picked datapoint suggests a name from its last id segment. History instance, aggregation and
 * period value stay in the "Verlauf" section like for any series.
 */
export function ChartSeriesFormulaPanel({
    s,
    update,
}: {
    s: EChartSeriesConfig;
    update: (patch: Partial<EChartSeriesConfig>) => void;
}) {
    const t = useT();
    const inputs: FormulaInput[] = s.formulaInputs ?? [];
    // Row whose datapoint the picker fills; -1 = a new row.
    const [pickFor, setPickFor] = useState<number | null>(null);
    const setInputs = (next: FormulaInput[]) => update({ formulaInputs: next });
    const patchRow = (k: number, patch: Partial<FormulaInput>) =>
        setInputs(inputs.map((row, i) => (i === k ? { ...row, ...patch } : row)));
    /** A picked datapoint; an empty or untouched default name follows it. */
    const pickDp = (k: number, id: string) => {
        const taken = inputs.filter((_, i) => i !== k).map((r) => r.name);
        if (k < 0 || k >= inputs.length) {
            setInputs([...inputs, { name: suggestVarName(id, taken), datapointId: id }]);
            return;
        }
        const row = inputs[k];
        const keepName = row.name && row.name !== suggestVarName(row.datapointId, taken);
        patchRow(k, { datapointId: id, ...(keepName ? {} : { name: suggestVarName(id, taken) }) });
    };

    const usable = usableInputs(inputs);
    const states = useTemplateStates(usable.map((i) => i.datapointId));
    const problem = formulaProblem(s.formula, inputs);
    const vars: Record<string, number> = {};
    for (const i of usable) {
        const v = states[i.datapointId]?.val;
        const n = typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : Number(v);
        if (v !== null && v !== undefined && v !== '' && Number.isFinite(n)) vars[i.name] = n;
    }
    const complete = usable.length > 0 && usable.every((i) => i.name in vars);
    const result = !problem && complete ? evalFormula((s.formula ?? '').trim(), vars) : null;
    const fmt = (n: number) => String(Number(n.toPrecision(6)));

    const problemText = (p: FormulaProblem): string => {
        switch (p.kind) {
            case 'empty':
                return t('echart.formulaEmpty');
            case 'parse':
                return t('echart.formulaParse');
            case 'name':
                return t('echart.formulaBadName', { name: p.name || '–' });
            case 'duplicate':
                return t('echart.formulaDuplicate', { name: p.name });
            case 'unknown':
                return t('echart.formulaUnknown', { name: p.name });
            case 'datapoint':
                return t('echart.formulaDatapoint', { id: p.id });
        }
    };

    return (
        <div className="space-y-2.5" data-testid="echart-formula-panel">
            <div>
                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                    {t('echart.formulaInputs')}
                </label>
                <div className="space-y-1">
                    {inputs.map((row, k) => (
                        <div key={k} className="flex gap-1 items-center" data-testid="echart-formula-input">
                            <input
                                type="text"
                                value={row.name}
                                onChange={(e) => patchRow(k, { name: e.target.value.trim() })}
                                placeholder="a"
                                className="w-16 shrink-0 text-xs rounded-lg px-2 py-2 font-mono focus:outline-none"
                                style={inputStyle}
                                aria-label={t('echart.formulaInputName')}
                                data-testid="echart-formula-input-name"
                            />
                            <input
                                type="text"
                                value={row.datapointId}
                                onChange={(e) => patchRow(k, { datapointId: e.target.value })}
                                placeholder={t('echart.dpPlaceholder')}
                                className="flex-1 min-w-0 text-xs rounded-lg px-2.5 py-2 font-mono focus:outline-none"
                                style={inputStyle}
                                aria-label={t('echart.datapoint')}
                                data-testid="echart-formula-input-dp"
                            />
                            <button
                                onClick={() => setPickFor(k)}
                                className="px-2 self-stretch rounded-lg hover:opacity-80 shrink-0"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--text-secondary)',
                                    border: '1px solid var(--app-border)',
                                }}
                                title={t('echart.fromIoBroker')}
                            >
                                <Database size={13} />
                            </button>
                            <button
                                onClick={() => setInputs(inputs.filter((_, i) => i !== k))}
                                className="px-1.5 self-stretch rounded-lg hover:opacity-80 shrink-0"
                                style={{ color: 'var(--text-secondary)' }}
                                title={t('echart.formulaRemoveInput')}
                                aria-label={t('echart.formulaRemoveInput')}
                            >
                                <X size={13} />
                            </button>
                        </div>
                    ))}
                </div>
                <button
                    onClick={() => setPickFor(-1)}
                    className="mt-1.5 flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md hover:opacity-80"
                    style={{
                        background: 'var(--app-bg)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--app-border)',
                    }}
                    data-testid="echart-formula-add"
                >
                    <Plus size={12} />
                    {t('echart.formulaAddInput')}
                </button>
            </div>

            <div>
                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                    {t('echart.formula')}
                </label>
                <input
                    type="text"
                    value={s.formula ?? ''}
                    onChange={(e) => update({ formula: e.target.value })}
                    placeholder="(a - b) * c"
                    className={`${inputCls} font-mono`}
                    style={inputStyle}
                    data-testid="echart-formula"
                />
                <p
                    className="text-[11px] mt-1 tabular-nums"
                    style={{ color: problem && inputs.length > 0 ? 'var(--danger, #ef4444)' : 'var(--text-secondary)' }}
                    data-testid="echart-formula-preview"
                >
                    {problem
                        ? inputs.length > 0
                            ? problemText(problem)
                            : t('echart.formulaStart')
                        : result !== null
                          ? `${t('echart.formulaNow')}: ${fmt(result)}${s.unit ? ` ${s.unit}` : ''}   (${usable
                                .map((i) => `${i.name}=${fmt(vars[i.name])}`)
                                .join(' · ')})`
                          : t('echart.formulaWaiting')}
                </p>
                <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                    {t('echart.formulaHint')}
                </p>
            </div>

            {pickFor !== null && (
                <DatapointPicker
                    currentValue={pickFor >= 0 ? (inputs[pickFor]?.datapointId ?? '') : ''}
                    onSelect={(id) => {
                        pickDp(pickFor, id);
                        setPickFor(null);
                    }}
                    onClose={() => setPickFor(null)}
                />
            )}
        </div>
    );
}
