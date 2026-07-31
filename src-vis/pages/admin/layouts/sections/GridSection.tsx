import { RotateCcw } from 'lucide-react';
import { useLayoutSetting } from '../shared/useLayoutSetting';
import { SliderSetting } from '../shared/SliderSetting';
import { ToggleRow } from '../shared/SettingControls';
import { useDashboardStore } from '../../../../store/dashboardStore';
import { DEFAULT_FRONTEND } from '../../../../store/configStore';
import { useT } from '../../../../i18n';

interface GridSectionProps {
    contextId: string | null;
}

/** Keys owned by this card — reset touches exactly these. */
const GRID_KEYS = ['gridRowHeight', 'gridSnapX', 'mobileBreakpoint', 'hideGridScrollbar'] as const;

export function GridSection({ contextId }: GridSectionProps) {
    const t = useT();
    const rescaleAllWidgetsX = useDashboardStore((s) => s.rescaleAllWidgetsX);
    const { eff, set, setPatch, clear, level, frontend } = useLayoutSetting(contextId);

    const MARGIN = (frontend.gridGap ?? 10) as number;

    const [rowH, rowHOv] = eff('gridRowHeight');
    const [snapX, snapXOv] = eff('gridSnapX');
    const [mob, mobOv] = eff('mobileBreakpoint');
    const [hideScroll, hideScrollOv] = eff('hideGridScrollbar');

    const effectiveRowH = (rowH ?? 20) as number;
    const effectiveSnapX = (snapX ?? effectiveRowH) as number;
    const effectiveMob = (mob ?? 600) as number;

    // Global scope resets to the shipped defaults; a layout/section scope drops
    // its own overrides so the values inherit again.
    const canReset =
        level === 'global'
            ? GRID_KEYS.some((k) => frontend[k] !== DEFAULT_FRONTEND[k])
            : rowHOv || snapXOv || mobOv || hideScrollOv;

    function resetDefaults() {
        if (level !== 'global') {
            GRID_KEYS.forEach((k) => clear(k));
            return;
        }
        // Column snap drives widget widths — keep them visually stable, exactly
        // like the snapX slider does.
        const factor = (effectiveSnapX + MARGIN) / (DEFAULT_FRONTEND.gridSnapX + MARGIN);
        if (factor !== 1) rescaleAllWidgetsX(factor);
        setPatch({
            gridRowHeight: DEFAULT_FRONTEND.gridRowHeight,
            gridSnapX: DEFAULT_FRONTEND.gridSnapX,
            mobileBreakpoint: DEFAULT_FRONTEND.mobileBreakpoint,
            hideGridScrollbar: DEFAULT_FRONTEND.hideGridScrollbar,
        });
    }

    return (
        <div
            className="rounded-xl p-6 space-y-4"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {t('settings.grid.title')}
                </h2>
                <button
                    onClick={resetDefaults}
                    disabled={!canReset}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{
                        background: 'var(--app-bg)',
                        color: 'var(--accent-red)',
                        border: '1px solid var(--app-border)',
                    }}
                    title={level === 'global' ? t('settings.grid.resetHint') : t('layouts.scope.resetHint')}
                >
                    <RotateCcw size={13} />
                    {level === 'global' ? t('settings.grid.reset') : t('layouts.scope.reset')}
                </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                <SliderSetting
                    label={t('settings.grid.rowHeight')}
                    value={effectiveRowH}
                    min={10}
                    max={160}
                    step={10}
                    unit=" px"
                    onChange={(v) => set('gridRowHeight', v)}
                    isOverridden={rowHOv}
                    onClearOverride={() => clear('gridRowHeight')}
                    presets={[
                        { label: '20', value: 20 },
                        { label: '40', value: 40 },
                        { label: '60', value: 60 },
                        { label: '80', value: 80 },
                        { label: '120', value: 120 },
                    ]}
                />
                <SliderSetting
                    label={t('settings.grid.snapX')}
                    value={effectiveSnapX}
                    min={10}
                    max={160}
                    step={10}
                    unit=" px"
                    onChange={(v) => {
                        const oldSnap = effectiveSnapX;
                        const factor = (oldSnap + MARGIN) / (v + MARGIN);
                        if (!contextId) rescaleAllWidgetsX(factor);
                        set('gridSnapX', v);
                    }}
                    isOverridden={snapXOv}
                    onClearOverride={() => clear('gridSnapX')}
                    presets={[
                        { label: '20', value: 20 },
                        { label: '40', value: 40 },
                        { label: '60', value: 60 },
                        { label: '80', value: 80 },
                        { label: '120', value: 120 },
                    ]}
                />
                <SliderSetting
                    label={t('settings.grid.mobileBreak')}
                    value={effectiveMob}
                    min={0}
                    max={1024}
                    step={10}
                    unit=" px"
                    onChange={(v) => set('mobileBreakpoint', v)}
                    isOverridden={mobOv}
                    onClearOverride={() => clear('mobileBreakpoint')}
                    presets={[
                        { label: '480', value: 480 },
                        { label: '600', value: 600 },
                        { label: '768', value: 768 },
                        { label: t('settings.grid.mobileOff'), value: 0 },
                    ]}
                />
            </div>
            <div className="flex items-start gap-2">
                <div className="flex-1">
                    <ToggleRow
                        label={t('settings.grid.hideScrollbar')}
                        hint={t('settings.grid.hideScrollbarHint')}
                        value={(hideScroll ?? false) as boolean}
                        onChange={(v) => set('hideGridScrollbar', v)}
                    />
                </div>
                {hideScrollOv && (
                    <button
                        onClick={() => clear('hideGridScrollbar')}
                        className="mt-2 text-[10px] px-2 py-0.5 rounded-full hover:opacity-80 shrink-0"
                        style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}
                        title={t('layouts.scope.resetHint')}
                    >
                        {t('layouts.scope.reset')}
                    </button>
                )}
            </div>
        </div>
    );
}
