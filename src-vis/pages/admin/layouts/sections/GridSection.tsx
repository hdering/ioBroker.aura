import { useLayoutSetting } from '../shared/useLayoutSetting';
import { SliderSetting } from '../shared/SliderSetting';
import { OverrideState } from '../shared/OverrideState';
import { ToggleRow } from '../shared/SettingControls';
import { ResetDefaultsButton } from '../shared/ResetDefaultsButton';
import { useDashboardStore } from '../../../../store/dashboardStore';
import { DEFAULT_FRONTEND } from '../../../../store/configStore';
import { useT } from '../../../../i18n';
import { OVERRIDE_COLOR, OVERRIDE_TINT } from '../shared/scopeBands';

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
    'gridWidthMode',
    'fluidDesignWidth',
    'fluidMinScale',
    'fluidMaxScale',
    'gridHeightMode',
    'hideGridScrollbar',
] as const;

/** Vertical behaviour of the fluid grid (#413) — see utils/gridColumns.ts gridRows. */
type HeightMode = 'fixed' | 'scale' | 'fill';
const HEIGHT_MODES: readonly HeightMode[] = ['fixed', 'scale', 'fill'];

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
    const [widthMode, widthModeOv] = eff('gridWidthMode');
    const [designW, designWOv] = eff('fluidDesignWidth');
    const [minScale, minScaleOv] = eff('fluidMinScale');
    const [maxScale, maxScaleOv] = eff('fluidMaxScale');
    const [heightMode, heightModeOv] = eff('gridHeightMode');
    const effectiveHeightMode = (heightMode ?? 'fixed') as HeightMode;
    const heightLabel = (m: HeightMode) =>
        m === 'scale'
            ? t('settings.grid.heightScale')
            : m === 'fill'
              ? t('settings.grid.heightFill')
              : t('settings.grid.heightFixed');
    const heightHint = (m: HeightMode) =>
        t(
            m === 'scale'
                ? 'settings.grid.heightScaleHint'
                : m === 'fill'
                  ? 'settings.grid.heightFillHint'
                  : 'settings.grid.heightFixedHint',
        );
    const fluid = (widthMode ?? 'fixed') === 'fluid';

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
            {/* Fluid width (#413): opt-in, the column count stays and the columns
                stretch to the window. Positions are untouched, so switching back is free. */}
            <div
                data-aura-grid-group="width"
                className="rounded-lg p-4 space-y-4"
                style={{ border: '1px solid var(--app-border)' }}
            >
                <ToggleRow
                    label={t('settings.grid.fluid')}
                    hint={t('settings.grid.fluidHint')}
                    value={fluid}
                    onChange={(v) => set('gridWidthMode', v ? 'fluid' : 'fixed')}
                    isOverridden={widthModeOv}
                    info={
                        <OverrideState
                            contextId={contextId}
                            keys={['gridWidthMode']}
                            label={t('settings.grid.fluid')}
                            format={(_, v) =>
                                v === 'fluid' ? t('settings.grid.fluidOn') : t('settings.grid.fluidOff')
                            }
                        />
                    }
                />
                {fluid && (
                    <ChoiceSetting
                        label={t('settings.grid.height')}
                        hint={heightHint(effectiveHeightMode)}
                        value={effectiveHeightMode}
                        options={HEIGHT_MODES.map((m) => ({ value: m, label: heightLabel(m), hint: heightHint(m) }))}
                        onChange={(v) => set('gridHeightMode', v)}
                        isOverridden={heightModeOv}
                        info={
                            <OverrideState
                                contextId={contextId}
                                keys={['gridHeightMode']}
                                label={t('settings.grid.height')}
                                format={(_, v) => heightLabel((v ?? 'fixed') as HeightMode)}
                            />
                        }
                    />
                )}
                {fluid && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <SliderSetting
                            label={t('settings.grid.fluidDesignWidth')}
                            hint={t('settings.grid.fluidDesignWidthHint')}
                            value={(designW ?? 0) as number}
                            min={0}
                            max={3840}
                            step={10}
                            unit=" px"
                            onChange={(v) => set('fluidDesignWidth', v)}
                            isOverridden={designWOv}
                            info={
                                <OverrideState
                                    contextId={contextId}
                                    keys={['fluidDesignWidth']}
                                    label={t('settings.grid.fluidDesignWidth')}
                                    format={(_, v) => (v ? `${v} px` : t('settings.grid.fluidAuto'))}
                                />
                            }
                            presets={[
                                { label: t('settings.grid.fluidAuto'), value: 0 },
                                { label: '1024', value: 1024 },
                                { label: '1280', value: 1280 },
                                { label: '1920', value: 1920 },
                            ]}
                        />
                        <SliderSetting
                            label={t('settings.grid.fluidMinScale')}
                            hint={t('settings.grid.fluidMinScaleHint')}
                            value={Math.round(((minScale ?? 0.6) as number) * 100)}
                            min={20}
                            max={100}
                            step={5}
                            unit=" %"
                            onChange={(v) => set('fluidMinScale', v / 100)}
                            isOverridden={minScaleOv}
                            info={
                                <OverrideState
                                    contextId={contextId}
                                    keys={['fluidMinScale']}
                                    label={t('settings.grid.fluidMinScale')}
                                    format={(_, v) => `${Math.round(Number(v) * 100)} %`}
                                />
                            }
                            presets={[
                                { label: '50', value: 50 },
                                { label: '60', value: 60 },
                                { label: '80', value: 80 },
                                { label: '100', value: 100 },
                            ]}
                        />
                        <SliderSetting
                            label={t('settings.grid.fluidMaxScale')}
                            hint={t('settings.grid.fluidMaxScaleHint')}
                            value={Math.round(((maxScale ?? 0) as number) * 100)}
                            min={0}
                            max={300}
                            step={10}
                            unit=" %"
                            onChange={(v) => set('fluidMaxScale', v / 100)}
                            isOverridden={maxScaleOv}
                            info={
                                <OverrideState
                                    contextId={contextId}
                                    keys={['fluidMaxScale']}
                                    label={t('settings.grid.fluidMaxScale')}
                                    format={(_, v) =>
                                        v ? `${Math.round(Number(v) * 100)} %` : t('settings.grid.mobileOff')
                                    }
                                />
                            }
                            presets={[
                                { label: t('settings.grid.mobileOff'), value: 0 },
                                { label: '150', value: 150 },
                                { label: '200', value: 200 },
                            ]}
                        />
                    </div>
                )}
            </div>
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

/** A row of mutually exclusive buttons, styled like the slider presets. */
function ChoiceSetting<T extends string>({
    label,
    hint,
    value,
    options,
    onChange,
    isOverridden,
    info,
}: {
    label: string;
    hint?: string;
    value: T;
    /** `hint` becomes the button's tooltip, so the other choices explain themselves too. */
    options: { value: T; label: string; hint?: string }[];
    onChange: (v: T) => void;
    isOverridden?: boolean;
    info?: React.ReactNode;
}) {
    const accent = isOverridden ? OVERRIDE_COLOR : 'var(--accent)';
    return (
        <div
            data-aura-grid-choice={label}
            className={isOverridden ? 'rounded-r-lg pl-3 -ml-3' : undefined}
            style={
                isOverridden
                    ? {
                          boxShadow: `inset 3px 0 0 ${OVERRIDE_COLOR}`,
                          background: `linear-gradient(90deg, ${OVERRIDE_TINT}, transparent 45%)`,
                      }
                    : undefined
            }
            data-overridden={isOverridden ? 'true' : undefined}
        >
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                {label}
            </p>
            <div className="flex gap-1.5 flex-wrap mb-1">
                {options.map((o) => {
                    const active = value === o.value;
                    return (
                        <button
                            key={o.value}
                            data-value={o.value}
                            title={o.hint}
                            onClick={() => onChange(o.value)}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium hover:opacity-80"
                            style={{
                                background: active ? accent : 'var(--app-bg)',
                                color: active ? '#fff' : 'var(--text-secondary)',
                                border: `1px solid ${active ? accent : 'var(--app-border)'}`,
                            }}
                        >
                            {o.label}
                        </button>
                    );
                })}
            </div>
            {hint && (
                <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                    {hint}
                </p>
            )}
            {info && <div className="mt-2">{info}</div>}
        </div>
    );
}
