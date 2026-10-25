/**
 * Editor of the custom grid's 'widget' cell (#838): a chart inside one cell.
 * "Neu" keeps the chart's settings in the cell and edits them in a popup with
 * the chart widget's own editor; "Spiegel" picks an existing chart widget of
 * the dashboard and shows it here, its settings stay on that widget.
 */
import { useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import type { CustomCell, WidgetConfig } from '../../types';
import { useDashboardStore } from '../../store/dashboardStore';
import { ConfigModal } from '../config/ConfigModal';
import { EChartConfig } from '../config/EChartConfig';
import { embeddedChartConfig, mirrorableCharts } from '../../utils/embedCell';
import { useT } from '../../i18n';

const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const inputSty: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const hint: React.CSSProperties = { color: 'var(--text-secondary)' };

export function WidgetCellEditor({
    cell,
    index,
    hostId,
    onChange,
}: {
    cell: CustomCell;
    index: number;
    /** The widget that owns the grid — it must not mirror itself. */
    hostId: string;
    onChange: (patch: Partial<CustomCell>) => void;
}) {
    const t = useT();
    const [editing, setEditing] = useState(false);
    const source = cell.embedSource === 'mirror' ? 'mirror' : 'embedded';
    const layouts = useDashboardStore((s) => s.layouts);
    const charts = useMemo(() => {
        const out: { w: WidgetConfig; where: string }[] = [];
        for (const l of layouts)
            for (const sec of l.sections)
                for (const tab of sec.tabs)
                    for (const w of mirrorableCharts(tab.widgets, hostId))
                        out.push({ w, where: layouts.length > 1 ? `${l.name} › ${tab.name}` : tab.name });
        return out;
    }, [layouts, hostId]);

    const chartConfig = embeddedChartConfig(cell, { id: hostId, gridPos: { x: 0, y: 0, w: 6, h: 4 } }, index);
    const series = cell.embed?.options?.echartSeries;
    const seriesCount = Array.isArray(series) ? series.length : 0;

    return (
        <div className="aura-widget-cell-editor space-y-2">
            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
                {(
                    [
                        ['embedded', 'Neu'],
                        ['mirror', 'Spiegel'],
                    ] as const
                ).map(([key, label]) => (
                    <button
                        key={key}
                        type="button"
                        data-aura-embed-source={key}
                        onClick={() => onChange({ embedSource: key === 'embedded' ? undefined : key })}
                        className="flex-1 text-[11px] px-2 py-1.5 transition-colors"
                        style={{
                            background: source === key ? 'var(--accent)' : 'var(--app-bg)',
                            color: source === key ? '#fff' : 'var(--text-secondary)',
                            border: 'none',
                        }}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {source === 'embedded' ? (
                <>
                    <p className="text-[10px]" style={hint}>
                        {t('widget.echart')} mit eigenen Einstellungen in dieser Zelle.{' '}
                        {seriesCount > 0 ? `${seriesCount} Datenreihe(n).` : 'Noch keine Datenreihe.'}
                    </p>
                    <button
                        type="button"
                        onClick={() => setEditing(true)}
                        className="aura-embed-edit w-full flex items-center justify-center gap-1.5 text-xs rounded-lg px-2.5 py-2 hover:opacity-80"
                        style={{
                            background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                            color: 'var(--accent)',
                            border: '1px solid color-mix(in srgb, var(--accent) 27%, transparent)',
                        }}
                    >
                        <BarChart3 size={13} /> Diagramm einrichten…
                    </button>
                    {editing && (
                        <ConfigModal
                            title={`Diagramm in Zelle ${index + 1}`}
                            maxWidth={560}
                            padded
                            storageKey="aura-embed-chart-modal"
                            onClose={() => setEditing(false)}
                        >
                            <EChartConfig
                                config={chartConfig}
                                onConfigChange={(next) =>
                                    onChange({ embed: { type: 'echart', options: next.options ?? {} } })
                                }
                            />
                        </ConfigModal>
                    )}
                </>
            ) : (
                <div>
                    <label className="text-[11px] mb-1 block" style={hint}>
                        Diagramm-Widget
                    </label>
                    <select
                        value={cell.embedWidgetId ?? ''}
                        onChange={(e) => onChange({ embedWidgetId: e.target.value || undefined })}
                        className={inputCls}
                        style={inputSty}
                    >
                        <option value="">– wählen –</option>
                        {charts.map(({ w, where }) => (
                            <option key={w.id} value={w.id}>
                                {`${w.title || t(`widget.${w.type as 'chart' | 'echart' | 'echartsPreset'}`)} — ${where}`}
                            </option>
                        ))}
                    </select>
                    <p className="text-[10px] mt-1" style={hint}>
                        {charts.length === 0
                            ? 'Im Dashboard gibt es noch kein Diagramm-Widget.'
                            : 'Zeigt das Diagramm hier noch einmal; Änderungen daran gelten für das Original.'}
                    </p>
                </div>
            )}
        </div>
    );
}
