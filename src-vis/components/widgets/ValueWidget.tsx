import { useMemo } from 'react';
import { Activity, TrendingUp, Hash } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import type { WidgetProps } from '../../types';
import { contentPositionClass, titlePositionStyle } from '../../utils/widgetUtils';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { CustomGridView } from './CustomGridView';
import { StatusBadges } from './StatusBadges';
import { useStatusFields } from '../../hooks/useStatusFields';
import { useGlobalSettingsStore } from '../../store/globalSettingsStore';
import { formatNum } from '../../utils/formatValue';
import { applyValueTransform } from '../../utils/valueTransform';
import { extractTemplateDpRefs, renderTemplate } from '../../utils/htmlTemplate';
import { proxifyHtmlAssets, resolveHtmlAssets } from '../../utils/assetUrl';
import { useTemplateValues } from '../../hooks/useTemplateValues';

export function ValueWidget({ config }: WidgetProps) {
    const { value } = useDatapoint(config.datapoint);
    const unit = config.options?.unit as string | undefined;
    const htmlTemplate = config.options?.htmlTemplate as string | undefined;
    const layout = config.layout ?? 'default';
    const CardIcon = getWidgetIcon(config.options?.icon as string | undefined, Activity);
    const CompactIcon = getWidgetIcon(config.options?.icon as string | undefined, Hash);
    const DefaultIcon = getWidgetIcon(config.options?.icon as string | undefined, TrendingUp);

    const o = config.options ?? {};
    const showTitle = o.showTitle !== false;
    const showIcon = o.showIcon !== false;
    const titleAlign = (o.titleAlign as string) ?? 'left';
    const showValue = o.showValue !== false;
    const showUnit = o.showUnit !== false;
    const iconSize = (o.iconSize as number) || 20;
    const valueFontSize = Number(o.valueFontSize) || 0;
    const valueSizeStyle = valueFontSize > 0 ? { fontSize: `${valueFontSize}px`, lineHeight: 1.1 } : undefined;
    const valueSizeCls = valueFontSize > 0 ? '' : 'text-xl';
    const { defaultDecimals } = useGlobalSettingsStore();
    const decimals = (o.decimals as number) ?? defaultDecimals;

    // Display-only transform: rawValue * factor + offset. Datapoint itself is untouched.
    const tValue = applyValueTransform(value, Number(o.valueFactor ?? 1), Number(o.valueOffset ?? 0));

    const displayValue =
        tValue === null ? '–' : typeof tValue === 'number' ? formatNum(tValue, decimals) : String(tValue);

    // Threshold-based color: [[maxExclusive, color], …] sorted ascending.
    // Applied to the transformed (displayed) value so thresholds are configured in display units.
    const thresholds = o.colorThresholds as Array<[number, string]> | undefined;
    const thresholdColor = useMemo(() => {
        if (!thresholds?.length) return undefined;
        const num = typeof tValue === 'number' ? tValue : parseFloat(String(tValue));
        if (isNaN(num)) return undefined;
        for (const [thresh, color] of thresholds) {
            if (num < thresh) return color;
        }
        return thresholds[thresholds.length - 1][1];
    }, [thresholds, tValue]);

    const accentColor = thresholdColor ?? 'var(--accent)';
    const valueColor = thresholdColor ?? 'var(--text-primary)';

    const { battery, reach, batteryIcon, reachIcon, statusBadges } = useStatusFields(config);

    // Template tokens: {dp} = own value, {color} = current threshold color (so it
    // can be applied to any element, e.g. an icon), {unit} = configured unit. Any
    // other {<id>} token is a foreign datapoint, subscribed live below.
    const extraRefs = useMemo(() => extractTemplateDpRefs(htmlTemplate), [htmlTemplate]);
    const extraValues = useTemplateValues(extraRefs);
    const htmlValueNode = htmlTemplate ? (
        <div
            dangerouslySetInnerHTML={{
                __html: resolveHtmlAssets(
                    proxifyHtmlAssets(
                        renderTemplate(
                            htmlTemplate,
                            { dp: displayValue, color: accentColor, unit: unit ?? '' },
                            (ref) => {
                                const v = extraValues[ref];
                                if (v === null || v === undefined) return '–';
                                return typeof v === 'number' ? formatNum(v, decimals) : String(v);
                            },
                        ),
                    ),
                ),
            }}
        />
    ) : null;

    // --- CUSTOM ---
    if (layout === 'custom')
        return (
            <CustomGridView
                config={config}
                value={displayValue}
                rawValue={typeof tValue === 'number' ? tValue : null}
                unit={unit}
                extraFields={{ unit: unit ?? '', battery, reach }}
                extraComponents={{
                    icon: <DefaultIcon size={iconSize} style={{ color: accentColor, flexShrink: 0 }} />,
                    'battery-icon': batteryIcon,
                    'reach-icon': reachIcon,
                    'status-badges': statusBadges,
                }}
            />
        );

    // --- CARD: Akzent-Leiste links, großer Wert zentriert ---
    if (layout === 'card') {
        return (
            <div className="aura-widget-row flex h-full gap-3" style={{ position: 'relative' }}>
                <div className="w-1 rounded-full self-stretch" style={{ background: accentColor }} />
                <div className="flex flex-col justify-between flex-1">
                    {(showTitle || showIcon) && (
                        <div className="flex items-center gap-2">
                            {showIcon && (
                                <CardIcon className="aura-widget-icon" size={iconSize} style={{ color: accentColor }} />
                            )}
                            {showTitle && (
                                <p
                                    className="aura-widget-title text-xs truncate"
                                    style={{
                                        color: 'var(--text-secondary)',
                                        textAlign: titleAlign as React.CSSProperties['textAlign'],
                                        flex: '1',
                                        minWidth: 0,
                                    }}
                                >
                                    {config.title}
                                </p>
                            )}
                        </div>
                    )}
                    {showValue &&
                        (htmlValueNode ?? (
                            <div className="aura-widget-value">
                                <span className={`${valueSizeCls}`} style={{ color: valueColor, ...valueSizeStyle }}>
                                    {displayValue}
                                </span>
                                {showUnit && unit && (
                                    <span className="text-lg ml-1 font-medium" style={{ color: accentColor }}>
                                        {unit}
                                    </span>
                                )}
                            </div>
                        ))}
                </div>
                <StatusBadges config={config} />
            </div>
        );
    }

    // --- COMPACT: Inline-Darstellung ---
    if (layout === 'compact') {
        return (
            <div
                className="aura-widget-row flex items-center justify-between h-full gap-2"
                style={{ position: 'relative' }}
            >
                {(showTitle || showIcon) && (
                    <div className="flex items-center gap-2 min-w-0">
                        {showIcon && (
                            <CompactIcon
                                className="aura-widget-icon"
                                size={iconSize}
                                style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
                            />
                        )}
                        {showTitle && (
                            <span
                                className="aura-widget-title text-sm truncate"
                                style={{
                                    color: 'var(--text-primary)',
                                    textAlign: titleAlign as React.CSSProperties['textAlign'],
                                    flex: '1',
                                    minWidth: 0,
                                }}
                            >
                                {config.title}
                            </span>
                        )}
                    </div>
                )}
                {showValue &&
                    (htmlValueNode ?? (
                        <span
                            className={`aura-widget-value ${valueSizeCls} shrink-0`}
                            style={{ color: valueColor, ...valueSizeStyle }}
                        >
                            {displayValue}
                            {showUnit && unit && (
                                <span className="text-sm ml-0.5" style={{ color: 'var(--text-secondary)' }}>
                                    {unit}
                                </span>
                            )}
                        </span>
                    ))}
                <StatusBadges config={config} />
            </div>
        );
    }

    // --- MINIMAL: Nur Zahl, sehr groß ---
    if (layout === 'minimal') {
        return (
            <div
                className="aura-widget-row flex flex-col items-center justify-center h-full"
                style={{ position: 'relative' }}
            >
                {showValue &&
                    (htmlValueNode ?? (
                        <div className="aura-widget-value flex items-baseline gap-1 leading-none">
                            <span className={`${valueSizeCls}`} style={{ color: accentColor, ...valueSizeStyle }}>
                                {displayValue}
                            </span>
                            {showUnit && unit && (
                                <span className="text-lg font-medium" style={{ color: 'var(--text-secondary)' }}>
                                    {unit}
                                </span>
                            )}
                        </div>
                    ))}
                {showTitle && (
                    <span
                        className="aura-widget-title text-xs mt-2 truncate max-w-full"
                        style={{
                            color: 'var(--text-secondary)',
                            textAlign: titleAlign as React.CSSProperties['textAlign'],
                        }}
                    >
                        {config.title}
                    </span>
                )}
                <StatusBadges config={config} />
            </div>
        );
    }

    // --- DEFAULT ---
    const posClass = contentPositionClass(config.options?.contentPosition as string | undefined);
    const titlePos = config.options?.titlePosition as string | undefined;
    const titleStyle = titlePositionStyle(titlePos);

    return (
        <div className={`aura-widget-row flex flex-col h-full gap-2 ${posClass}`} style={{ position: 'relative' }}>
            {(showTitle || showIcon) && (
                <div className="flex items-center gap-2" style={titleStyle}>
                    {showIcon && (
                        <DefaultIcon
                            className="aura-widget-icon"
                            size={iconSize}
                            style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
                        />
                    )}
                    {showTitle && (
                        <p
                            className="aura-widget-title text-xs"
                            style={{
                                color: 'var(--text-secondary)',
                                textAlign: titleAlign as React.CSSProperties['textAlign'],
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                flex: '1',
                                minWidth: 0,
                            }}
                        >
                            {config.title}
                        </p>
                    )}
                </div>
            )}
            {showValue &&
                (htmlValueNode ?? (
                    <div className="aura-widget-value flex items-end gap-1.5">
                        <span className={`${valueSizeCls}`} style={{ color: valueColor, ...valueSizeStyle }}>
                            {displayValue}
                        </span>
                        {showUnit && unit && (
                            <span className="text-sm mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                {unit}
                            </span>
                        )}
                    </div>
                ))}
            <StatusBadges config={config} />
        </div>
    );
}
