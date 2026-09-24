import { useLayoutSetting } from '../shared/useLayoutSetting';
import { SliderSetting } from '../shared/SliderSetting';
import { OverrideState } from '../shared/OverrideState';
import { ToggleRow } from '../shared/SettingControls';
import { ResetDefaultsButton } from '../shared/ResetDefaultsButton';
import { useDashboardStore } from '../../../../store/dashboardStore';
import { DEFAULT_FRONTEND } from '../../../../store/configStore';
import { useT } from '../../../../i18n';

interface GridSectionProps {
    contextId: string | null;
}

/** Keys owned by this card — reset touches exactly these. */
const GRID_KEYS = [
    'gridRowHeight',
    'gridSnapX',
    'mobileBreakpoint',
    'mobileCols',
    'tabletBreakpoint',
    'tabletCols',
    'hideGridScrollbar',
] as const;

export function GridSection({ contextId }: GridSectionProps) {
    const t = useT();
    const rescaleAllWidgetsX = useDashboardStore((s) => s.rescaleAllWidgetsX);
    const { eff, set, resetKeys, isDirty, level, frontend } = useLayoutSetting(contextId);

    const MARGIN = (frontend.gridGap ?? 10) as number;

    const [rowH, rowHOv] = eff('gridRowHeight');
    const [snapX, snapXOv] = eff('gridSnapX');
    const [mob, mobOv] = eff('mobileBreakpoint');
    const [mobCols, mobColsOv] = eff('mobileCols');
    const [tab, tabOv] = eff('tabletBreakpoint');
    const [tabCols, tabColsOv] = eff('tabletCols');
    const [hideScroll, hideScrollOv] = eff('hideGridScrollbar');

    const effectiveRowH = (rowH ?? 20) as number;
    const effectiveSnapX = (snapX ?? effectiveRowH) as number;
    const effectiveTab = (tab ?? 0) as number;
    const effectiveTabCols = (tabCols ?? 2) as number;
    const effectiveMob = (mob ?? 600) as number;
    const effectiveMobCols = (mobCols ?? 1) as number;

    function resetDefaults() {
        // Column snap drives widget widths — keep them visually stable, exactly
        // like the snapX slider does.
        if (level === 'global') {
            const factor = (effectiveSnapX + MARGIN) / (DEFAULT_FRONTEND.gridSnapX + MARGIN);
            if (factor !== 1) rescaleAllWidgetsX(factor);
        }
        resetKeys(GRID_KEYS);
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
                <ResetDefaultsButton
                    onReset={resetDefaults}
                    disabled={!isDirty(GRID_KEYS)}
                    scoped={level !== 'global'}
                />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <SliderSetting
                    label={t('settings.grid.rowHeight')}
                    value={effectiveRowH}
                    min={10}
                    max={160}
                    step={10}
                    unit=" px"
                    onChange={(v) => set('gridRowHeight', v)}
                    isOverridden={rowHOv}
                    info={
                        <OverrideState
                            contextId={contextId}
                            keys={['gridRowHeight']}
                            label={t('settings.grid.rowHeight')}
                            format={(_, v) => `${v} px`}
                        />
                    }
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
                    info={
                        <OverrideState
                            contextId={contextId}
                            keys={['gridSnapX']}
                            label={t('settings.grid.snapX')}
                            format={(_, v) => `${v} px`}
                        />
                    }
                    presets={[
                        { label: '20', value: 20 },
                        { label: '40', value: 40 },
                        { label: '60', value: 60 },
                        { label: '80', value: 80 },
                        { label: '120', value: 120 },
                    ]}
                />
            </div>
            <ToggleRow
                label={t('settings.grid.hideScrollbar')}
                hint={t('settings.grid.hideScrollbarHint')}
                value={(hideScroll ?? false) as boolean}
                onChange={(v) => set('hideGridScrollbar', v)}
                isOverridden={hideScrollOv}
                info={
                    <OverrideState
                        contextId={contextId}
                        keys={['hideGridScrollbar']}
                        label={t('settings.grid.hideScrollbar')}
                    />
                }
            />
            {/* Mobile and tablet belong together: each is a breakpoint plus its column
                count, so they sit in two labelled boxes side by side (#413). */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div
                    data-aura-grid-group="mobile"
                    className="rounded-lg p-4 space-y-4"
                    style={{ border: '1px solid var(--app-border)' }}
                >
                    <p
                        className="text-xs font-semibold uppercase tracking-wide"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        {t('settings.grid.groupMobile')}
                    </p>
                    <SliderSetting
                        label={t('settings.grid.mobileBreak')}
                        value={effectiveMob}
                        min={0}
                        max={1024}
                        step={10}
                        unit=" px"
                        onChange={(v) => set('mobileBreakpoint', v)}
                        isOverridden={mobOv}
                        info={
                            <OverrideState
                                contextId={contextId}
                                keys={['mobileBreakpoint']}
                                label={t('settings.grid.mobileBreak')}
                                format={(_, v) => `${v} px`}
                            />
                        }
                        presets={[
                            { label: '480', value: 480 },
                            { label: '600', value: 600 },
                            { label: '768', value: 768 },
                            { label: t('settings.grid.mobileOff'), value: 0 },
                        ]}
                    />
                    {/* Phone columns (#413): 1 keeps the classic single-column stack. */}
                    <SliderSetting
                        label={t('settings.grid.mobileCols')}
                        value={effectiveMobCols}
                        min={1}
                        max={4}
                        step={1}
                        onChange={(v) => set('mobileCols', v)}
                        isOverridden={mobColsOv}
                        info={
                            <OverrideState
                                contextId={contextId}
                                keys={['mobileCols']}
                                label={t('settings.grid.mobileCols')}
                                format={(_, v) => String(v)}
                            />
                        }
                        presets={[
                            { label: '1', value: 1 },
                            { label: '2', value: 2 },
                            { label: '3', value: 3 },
                            { label: '4', value: 4 },
                        ]}
                    />
                </div>
                <div
                    data-aura-grid-group="tablet"
                    className="rounded-lg p-4 space-y-4"
                    style={{ border: '1px solid var(--app-border)' }}
                >
                    <p
                        className="text-xs font-semibold uppercase tracking-wide"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        {t('settings.grid.groupTablet')}
                    </p>
                    {/* Tablet band (#413): widgets flow into N columns between the two
                    breakpoints. Off (0) keeps the desktop grid — and its horizontal
                    scrollbar — on tablets, which is what existing designs expect. */}
                    <SliderSetting
                        label={t('settings.grid.tabletBreak')}
                        value={effectiveTab}
                        min={0}
                        max={1600}
                        step={10}
                        unit=" px"
                        onChange={(v) => set('tabletBreakpoint', v)}
                        isOverridden={tabOv}
                        info={
                            <OverrideState
                                contextId={contextId}
                                keys={['tabletBreakpoint']}
                                label={t('settings.grid.tabletBreak')}
                                format={(_, v) => `${v} px`}
                            />
                        }
                        presets={[
                            { label: '768', value: 768 },
                            { label: '1024', value: 1024 },
                            { label: '1280', value: 1280 },
                            { label: t('settings.grid.mobileOff'), value: 0 },
                        ]}
                    />
                    <SliderSetting
                        label={t('settings.grid.tabletCols')}
                        value={effectiveTabCols}
                        min={1}
                        max={4}
                        step={1}
                        onChange={(v) => set('tabletCols', v)}
                        isOverridden={tabColsOv}
                        info={
                            <OverrideState
                                contextId={contextId}
                                keys={['tabletCols']}
                                label={t('settings.grid.tabletCols')}
                                format={(_, v) => String(v)}
                            />
                        }
                        presets={[
                            { label: '2', value: 2 },
                            { label: '3', value: 3 },
                            { label: '4', value: 4 },
                        ]}
                    />
                </div>
            </div>
        </div>
    );
}
