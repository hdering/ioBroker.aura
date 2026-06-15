import { useState, type CSSProperties } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import type { WidgetProps, CustomGrid } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { CustomGridView } from './CustomGridView';
import { StatusBadges } from './StatusBadges';
import { useStatusFields } from '../../hooks/useStatusFields';

type SliderAction = {
    id: string;
    icon: string;
    label?: string;
    dp: string;
    value?: string | number | boolean;
};

export const DEFAULT_SLIDER_GRID: CustomGrid = [
    { type: 'title', fontSize: 14, bold: true, align: 'left', valign: 'top' },
    { type: 'empty' },
    { type: 'field', fieldKey: 'value', align: 'right', valign: 'top' },
    { type: 'component', componentKey: 'slider', align: 'center', valign: 'middle' },
    { type: 'empty' },
    { type: 'empty' },
    { type: 'component', componentKey: 'actions', align: 'left', valign: 'bottom' },
    { type: 'empty' },
    { type: 'component', componentKey: 'status-badges', align: 'right', valign: 'bottom' },
];

export function SliderWidget({ config }: WidgetProps) {
    const o = config.options ?? {};
    const layout = config.layout ?? 'default';
    const { setState } = useIoBroker();

    const min = (o.min as number) ?? 0;
    const max = (o.max as number) ?? 100;
    const step = (o.step as number) ?? 1;
    const isVertical = (o.orientation as string) === 'vertical';
    const sliderColor = (o.color as string) || 'var(--slider-fill, var(--accent))';
    const commitOnRelease = !!o.commitOnRelease;
    const readOnly = !!o.readOnly;
    const unit = (o.unit as string) ?? '';
    const showTitle = o.showTitle !== false;
    const showValue = o.showValue !== false;
    const showUnit = o.showUnit !== false;
    const showMinMax = !!o.showMinMax;
    const showIcon = o.showIcon !== false;
    const iconSize = (o.iconSize as number) || 20;
    const actions = (o.actions as SliderAction[] | undefined) ?? [];
    const titleAlign = (o.titleAlign as string) ?? 'left';
    const WidgetIcon = getWidgetIcon(o.icon as string | undefined, SlidersHorizontal);
    const barStyle = !!o.barStyle;
    const barSize = (o.barSize as number) ?? 100;

    const { value: rawVal } = useDatapoint(config.datapoint);
    const numericVal = typeof rawVal === 'number' ? rawVal : Number.isFinite(Number(rawVal)) ? Number(rawVal) : min;

    const [pending, setPending] = useState<number | null>(null);
    const displayVal = pending ?? numericVal;
    const fillRatio = Math.max(0, Math.min(1, (displayVal - min) / (max - min)));

    const writeStepped = (v: number) => {
        const stepped = Math.round(v / step) * step;
        const clamped = Math.max(min, Math.min(max, stepped));
        setState(config.datapoint, clamped);
    };

    const onSliderChange = (v: number) => {
        if (commitOnRelease) setPending(v);
        else writeStepped(v);
    };

    const onSliderRelease = () => {
        if (commitOnRelease && pending != null) {
            writeStepped(pending);
            setPending(null);
        }
    };

    const triggerAction = (a: SliderAction) => {
        if (!a.dp) return;
        setState(a.dp, a.value !== undefined ? a.value : true);
    };

    const { battery, reach, batteryIcon, reachIcon, statusBadges } = useStatusFields(config);

    // ── Bar-style pointer handling ──────────────────────────────────────────────
    const getBarValue = (e: React.PointerEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = isVertical ? 1 - (e.clientY - rect.top) / rect.height : (e.clientX - rect.left) / rect.width;
        return min + Math.max(0, Math.min(1, ratio)) * (max - min);
    };

    const onBarPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onSliderChange(getBarValue(e));
    };

    const onBarPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!(e.buttons & 1)) return;
        onSliderChange(getBarValue(e));
    };

    // ── Elements ────────────────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vertAttrs: any = isVertical ? { orient: 'vertical' } : {};

    const sliderEl = (
        <input
            {...vertAttrs}
            type="range"
            min={min}
            max={max}
            step={step}
            value={displayVal}
            disabled={readOnly}
            onChange={readOnly ? undefined : (e) => onSliderChange(Number(e.target.value))}
            onMouseUp={readOnly ? undefined : onSliderRelease}
            onTouchEnd={readOnly ? undefined : onSliderRelease}
            onKeyUp={readOnly ? undefined : onSliderRelease}
            style={
                {
                    '--slider-thumb-color': sliderColor,
                    ...(isVertical
                        ? {
                              writingMode: 'vertical-lr' as React.CSSProperties['writingMode'],
                              direction: 'rtl',
                              height: '100%',
                              width: 'auto',
                          }
                        : { width: '100%' }),
                    ...(readOnly ? { opacity: 1, cursor: 'default' } : {}),
                } as unknown as CSSProperties
            }
            className={`aura-widget-action nodrag h-1.5 rounded-full appearance-none${readOnly ? '' : ' cursor-pointer'}`}
        />
    );

    const barTrack = (
        <div
            className={`aura-widget-action nodrag relative rounded-2xl overflow-hidden select-none${readOnly ? '' : ' cursor-pointer'}`}
            style={{
                width: isVertical ? `${barSize}%` : '100%',
                height: isVertical ? '100%' : `${barSize}%`,
                background: `color-mix(in srgb, ${sliderColor} 20%, var(--app-bg))`,
            }}
            onPointerDown={readOnly ? undefined : onBarPointerDown}
            onPointerMove={readOnly ? undefined : onBarPointerMove}
            onPointerUp={readOnly ? undefined : onSliderRelease}
        >
            {/* Fill */}
            {isVertical ? (
                <div
                    className="absolute bottom-0 left-0 right-0 rounded-t-2xl"
                    style={{ height: `${fillRatio * 100}%`, background: sliderColor }}
                />
            ) : (
                <div
                    className="absolute top-0 left-0 bottom-0 rounded-r-2xl"
                    style={{ width: `${fillRatio * 100}%`, background: sliderColor }}
                />
            )}
            {/* Handle line */}
            {readOnly ? null : isVertical ? (
                <div
                    className="absolute pointer-events-none rounded-full"
                    style={{
                        top: `${(1 - fillRatio) * 100}%`,
                        transform: 'translateY(6px)',
                        left: '20%',
                        right: '20%',
                        height: '3px',
                        background: 'rgba(255,255,255,0.85)',
                    }}
                />
            ) : (
                <div
                    className="absolute pointer-events-none rounded-full"
                    style={{
                        left: `${fillRatio * 100}%`,
                        transform: 'translateX(-9px)',
                        top: '20%',
                        bottom: '20%',
                        width: '3px',
                        background: 'rgba(255,255,255,0.85)',
                    }}
                />
            )}
        </div>
    );

    const actionsEl =
        actions.length > 0 ? (
            <div className="aura-widget-action nodrag flex items-center gap-1 flex-wrap">
                {actions.map((a) => {
                    const Icon = getWidgetIcon(a.icon, SlidersHorizontal);
                    return (
                        <button
                            key={a.id}
                            type="button"
                            onClick={() => triggerAction(a)}
                            title={a.label ?? a.icon}
                            className="nodrag p-1.5 rounded-full hover:opacity-80 transition-opacity"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--app-border)',
                            }}
                        >
                            <Icon size={14} />
                        </button>
                    );
                })}
            </div>
        ) : null;

    const valueStr = `${displayVal}${showUnit && unit ? unit : ''}`;

    if (layout === 'custom') {
        const customGrid = (o.customGrid as CustomGrid | undefined) ?? DEFAULT_SLIDER_GRID;
        return (
            <CustomGridView
                config={{ ...config, options: { ...o, customGrid } }}
                value={valueStr}
                rawValue={displayVal}
                extraFields={{ value: String(displayVal), unit, min: String(min), max: String(max), battery, reach }}
                extraComponents={{
                    slider: barStyle ? barTrack : sliderEl,
                    actions: actionsEl,
                    'battery-icon': batteryIcon,
                    'reach-icon': reachIcon,
                    'status-badges': statusBadges,
                }}
            />
        );
    }

    if (isVertical) {
        return (
            <div className="aura-widget-row flex flex-col h-full items-center gap-1" style={{ position: 'relative' }}>
                {showValue && (
                    <p
                        className="aura-widget-value text-xl font-bold shrink-0"
                        style={{ color: 'var(--text-primary)' }}
                    >
                        {valueStr}
                    </p>
                )}
                {showMinMax && (
                    <span className="text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>
                        {max}
                    </span>
                )}
                <div className={`flex-1 flex items-center justify-center min-h-0${barStyle ? ' w-full' : ''}`}>
                    {barStyle ? barTrack : sliderEl}
                </div>
                {showMinMax && (
                    <span className="text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>
                        {min}
                    </span>
                )}
                {actionsEl}
                <StatusBadges config={config} />
            </div>
        );
    }

    return (
        <div className="aura-widget-row flex flex-col h-full gap-2" style={{ position: 'relative' }}>
            {(showTitle || showIcon || showValue) && (
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        {showIcon && (
                            <WidgetIcon
                                className="aura-widget-icon"
                                size={iconSize}
                                style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
                            />
                        )}
                        {showTitle && (
                            <p
                                className="aura-widget-title text-xs truncate flex-1 min-w-0"
                                style={{
                                    color: 'var(--text-secondary)',
                                    textAlign: titleAlign as React.CSSProperties['textAlign'],
                                }}
                            >
                                {config.title}
                            </p>
                        )}
                    </div>
                    {showValue && (
                        <p
                            className="aura-widget-value text-xl font-bold shrink-0"
                            style={{ color: 'var(--text-primary)' }}
                        >
                            {valueStr}
                        </p>
                    )}
                </div>
            )}
            <div className="flex-1 flex items-center gap-2 min-h-0">
                {showMinMax && (
                    <span className="text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>
                        {min}
                    </span>
                )}
                {barStyle ? (
                    <div className="flex-1 self-stretch flex items-center">{barTrack}</div>
                ) : (
                    <div className="flex-1">{sliderEl}</div>
                )}
                {showMinMax && (
                    <span className="text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>
                        {max}
                    </span>
                )}
            </div>
            {actionsEl}
            <StatusBadges config={config} />
        </div>
    );
}
