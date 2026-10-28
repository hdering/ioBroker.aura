/**
 * Paging settings of the chart widgets (issue #871): paging on/off, start on the current window,
 * what the picked date is, the link group and the navigation datapoints. One editor for the
 * advanced, the simple and the distribution chart — each passes its own option keys.
 */
import { useT } from '../../../i18n';
import { StatusDpField } from '../StatusDpField';
import { Unavailable } from '../Unavailable';
import { inputCls, inputStyle } from './chartShared';

export interface ChartNavKeys {
    paging: string;
    startOnCurrent: string;
    anchor: string;
    group: string;
    dateDp: string;
    rangeDp: string;
    commandDp: string;
}

/** Option keys of the simple and the distribution chart. */
export const PLAIN_NAV_KEYS: ChartNavKeys = {
    paging: 'dayNav',
    startOnCurrent: 'dayNavDefault',
    anchor: 'navAnchor',
    group: 'navGroup',
    dateDp: 'navDateDp',
    rangeDp: 'navRangeDp',
    commandDp: 'navCommandDp',
};

/** Option keys of the advanced chart. */
export const ECHART_NAV_KEYS: ChartNavKeys = {
    paging: 'echartDayNav',
    startOnCurrent: 'echartDayNavDefault',
    anchor: 'echartNavAnchor',
    group: 'echartNavGroup',
    dateDp: 'echartNavDateDp',
    rangeDp: 'echartNavRangeDp',
    commandDp: 'echartNavCommandDp',
};

export function ChartNavSettings({
    o,
    set,
    keys,
}: {
    o: Record<string, unknown>;
    set: (patch: Record<string, unknown>) => void;
    keys: ChartNavKeys;
}) {
    const t = useT();
    const paging = o[keys.paging] === true;
    const needsPaging = paging ? undefined : t('echart.navNeedsPaging');
    const str = (k: string) => (o[k] as string | undefined) ?? undefined;
    return (
        <div data-testid="chart-nav-settings">
            <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                <input
                    type="checkbox"
                    checked={paging}
                    onChange={(e) => set({ [keys.paging]: e.target.checked })}
                    className="rounded"
                />
                <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    {t('echart.dayNavToggle')}
                </span>
            </label>
            <Unavailable reason={needsPaging}>
                <label className="flex items-center gap-2 mt-2 ml-5 cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={o[keys.startOnCurrent] === true}
                        onChange={(e) => set({ [keys.startOnCurrent]: e.target.checked })}
                        className="rounded"
                    />
                    <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        {t('echart.dayNavDefaultToggle')}
                    </span>
                </label>
                <div className="flex items-center gap-2 mt-2 ml-5">
                    <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        {t('echart.navAnchor')}
                    </span>
                    <select
                        value={o[keys.anchor] === 'start' ? 'start' : 'end'}
                        onChange={(e) => set({ [keys.anchor]: e.target.value === 'start' ? 'start' : undefined })}
                        className={`${inputCls} flex-1 min-w-0`}
                        style={inputStyle}
                    >
                        <option value="end">{t('echart.navAnchorEnd')}</option>
                        <option value="start">{t('echart.navAnchorStart')}</option>
                    </select>
                </div>
            </Unavailable>
            <div className="mt-3">
                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                    {t('echart.navGroup')}
                </label>
                <input
                    type="text"
                    value={str(keys.group) ?? ''}
                    onChange={(e) => set({ [keys.group]: e.target.value || undefined })}
                    placeholder="z.B. energie"
                    className={`${inputCls} w-full`}
                    style={inputStyle}
                />
                <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                    {t('echart.navGroupHint')}
                </p>
            </div>
            <p className="text-[11px] mt-3 mb-1 font-medium" style={{ color: 'var(--text-secondary)' }}>
                {t('echart.navDpsTitle')}
            </p>
            <div className="flex flex-col gap-2">
                <StatusDpField
                    label={t('echart.navRangeDp')}
                    hint={t('echart.navRangeDpHint')}
                    placeholder="0_userdata.0.chart.range"
                    value={str(keys.rangeDp)}
                    onChange={(id) => set({ [keys.rangeDp]: id })}
                />
                <Unavailable reason={needsPaging} className="flex flex-col gap-2">
                    <StatusDpField
                        label={t('echart.navDateDp')}
                        hint={t('echart.navDateDpHint')}
                        placeholder="0_userdata.0.chart.date"
                        value={str(keys.dateDp)}
                        onChange={(id) => set({ [keys.dateDp]: id })}
                    />
                    <StatusDpField
                        label={t('echart.navCommandDp')}
                        hint={t('echart.navCommandDpHint')}
                        placeholder="0_userdata.0.chart.command"
                        value={str(keys.commandDp)}
                        onChange={(id) => set({ [keys.commandDp]: id })}
                    />
                </Unavailable>
            </div>
        </div>
    );
}
