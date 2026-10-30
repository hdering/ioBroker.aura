/**
 * Editor of the custom grid's 'widget' cell (#838): picks an existing chart
 * widget of the dashboard — on a tab or in a popup view — and shows it here,
 * its settings stay on that widget.
 */
import { useMemo } from 'react';
import type { CustomCell, WidgetConfig } from '../../types';
import { useDashboardStore } from '../../store/dashboardStore';
import { BUILTIN_VIEW_IDS, usePopupConfigStore } from '../../store/popupConfigStore';
import { mirrorableCharts } from '../../utils/embedCell';
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
    hostId,
    onChange,
}: {
    cell: CustomCell;
    /** The widget that owns the grid — it must not mirror itself. */
    hostId: string;
    onChange: (patch: Partial<CustomCell>) => void;
}) {
    const t = useT();
    const layouts = useDashboardStore((s) => s.layouts);
    const views = usePopupConfigStore((s) => s.views);
    const charts = useMemo(() => {
        const out: { w: WidgetConfig; where: string }[] = [];
        for (const l of layouts)
            for (const sec of l.sections)
                for (const tab of sec.tabs)
                    for (const w of mirrorableCharts(tab.widgets, hostId))
                        out.push({ w, where: layouts.length > 1 ? `${l.name} › ${tab.name}` : tab.name });
        // The built-in views are templates for any datapoint — nothing to mirror.
        for (const v of views.filter((x) => !BUILTIN_VIEW_IDS.has(x.id)))
            for (const w of mirrorableCharts(v.widgets, hostId)) out.push({ w, where: `Popup › ${v.name}` });
        return out;
    }, [layouts, views, hostId]);

    return (
        <div className="aura-widget-cell-editor">
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
                    : 'Zeigt das Diagramm hier noch einmal; Änderungen daran gelten für das Original. ' +
                      'Ein Diagramm aus einem Popup wird als Vorlage gezeigt — {{dp}}-Platzhalter darin bleiben leer.'}
            </p>
        </div>
    );
}
