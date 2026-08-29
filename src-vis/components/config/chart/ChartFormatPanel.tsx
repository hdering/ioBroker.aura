import { useT } from '../../../i18n';
import { ValueFormatRow } from '../ValueFormatRow';
import type { NumberFormat } from '../../../utils/formatValue';

/**
 * "Zahlenformat" tab of the chart's "Datenpunkte verwalten" dialog: decimal places and thousands
 * separator for the WHOLE chart (issue #600).
 *
 * Sits in front of the series because that is what it is — the default every series inherits;
 * a single series overrides it in its own detail. Both settings used to live in the options panel
 * behind the dialog, where the series being formatted were out of sight.
 */
export function ChartFormatPanel({
    decimals,
    numberFormat,
    onChange,
}: {
    decimals: number | undefined;
    numberFormat: NumberFormat | undefined;
    onChange: (patch: Record<string, unknown>) => void;
}) {
    const t = useT();
    return (
        <div className="aura-chart-format flex flex-col gap-1.5 max-w-[420px]">
            <ValueFormatRow decimals={decimals} numberFormat={numberFormat} onChange={onChange} />
            <p className="text-[10px] leading-snug" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                {t('echart.formatAllSeriesHint')}
            </p>
        </div>
    );
}
