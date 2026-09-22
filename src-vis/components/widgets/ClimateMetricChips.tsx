/**
 * Zeichnet die Werte des Raumklima-Widgets (utils/climateMetrics.ts).
 *
 * Ein Eintrag sieht je nach Platz anders aus, aber immer gleich aufgebaut:
 * Icon, optionale Beschriftung, Wert, Einheit. Die drei Altwerte (Soll, Feuchte,
 * Luftdruck) laufen durch dieselben Bausteine und behalten über `fontSize` ihre
 * bisherige Größe.
 */

import { Droplets, Gauge, Thermometer, type LucideIcon } from 'lucide-react';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { SLOT_FONT_SIZE, type FormattedMetric, type ResolvedClimateMetric } from '../../utils/climateMetrics';

/**
 * Icons, die vor der Werteliste fest im Bündel steckten. Ohne sie liefe das
 * Feuchte-Icon eines bestehenden Widgets plötzlich über den Icon-Dienst und
 * erschiene erst nach dem ersten Bild.
 */
const BUNDLED: Record<string, LucideIcon> = { Droplets, Gauge, Thermometer };

function MetricIcon({ name, size, color }: { name?: string; size: number; color?: string }) {
    if (!name) return null;
    const Icon = BUNDLED[name] ?? getWidgetIcon(name, null!);
    return <Icon size={size} strokeWidth={1.5} style={{ flexShrink: 0, color }} />;
}

/** Ein Wert als Zeile — für die rechte Spalte und das Raster. */
export function ClimateMetricValue({
    metric,
    formatted,
    fontScale,
    showLabel = true,
}: {
    metric: ResolvedClimateMetric;
    formatted: FormattedMetric;
    fontScale: number;
    showLabel?: boolean;
}) {
    const base = metric.fontSize ?? SLOT_FONT_SIZE[metric.slot];
    const fontSize = Math.round(base * fontScale);
    const iconSize = Math.round(base * fontScale);
    const display = metric.display ?? 'value';
    const color = formatted.color;

    if (display === 'dot') {
        return (
            <span
                className="flex items-center gap-1 font-medium whitespace-nowrap"
                style={{ fontSize, color: 'var(--text-secondary)' }}
            >
                <span
                    style={{
                        width: Math.round(fontSize * 0.55),
                        height: Math.round(fontSize * 0.55),
                        borderRadius: '50%',
                        flexShrink: 0,
                        background: formatted.active ? (color ?? 'var(--accent)') : 'var(--app-border)',
                    }}
                />
                {showLabel && metric.label && <span>{metric.label}</span>}
                {!metric.label && <span>{formatted.text}</span>}
            </span>
        );
    }

    if (display === 'badge') {
        return (
            <span
                className="px-1.5 py-0.5 rounded-full whitespace-nowrap inline-flex items-center gap-1"
                style={{
                    fontSize,
                    background: color ? `color-mix(in srgb, ${color} 18%, transparent)` : 'var(--app-border)',
                    color: color ?? 'var(--text-secondary)',
                }}
            >
                <MetricIcon name={metric.icon} size={iconSize} />
                {showLabel && metric.label && <span>{metric.label}</span>}
                <span>
                    {formatted.text}
                    {formatted.unit}
                </span>
            </span>
        );
    }

    return (
        <span
            className="flex items-center gap-1 font-medium whitespace-nowrap"
            style={{ fontSize, color: 'var(--text-secondary)' }}
        >
            <MetricIcon name={metric.icon} size={iconSize} color={color} />
            {showLabel && metric.label && <span style={{ opacity: 0.8 }}>{metric.label}</span>}
            <span style={color ? { color } : undefined}>
                {formatted.text}
                {formatted.unit}
            </span>
        </span>
    );
}

/** Ein großer Wert neben der Temperatur. */
export function ClimateMetricPrimary({
    metric,
    formatted,
    fontScale,
}: {
    metric: ResolvedClimateMetric;
    formatted: FormattedMetric;
    fontScale: number;
}) {
    const base = metric.fontSize ?? SLOT_FONT_SIZE.primary;
    return (
        <div className="flex flex-col leading-none min-w-0">
            {metric.label && (
                <span
                    className="truncate"
                    style={{ fontSize: Math.round(10 * fontScale), color: 'var(--text-secondary)' }}
                >
                    {metric.label}
                </span>
            )}
            <span
                className="font-bold whitespace-nowrap"
                style={{ fontSize: Math.round(base * fontScale), color: formatted.color ?? 'var(--text-primary)' }}
            >
                {formatted.text}
                {formatted.unit && (
                    <span
                        className="ml-0.5 font-medium"
                        style={{ fontSize: Math.round(base * 0.6 * fontScale), color: 'var(--text-secondary)' }}
                    >
                        {formatted.unit}
                    </span>
                )}
            </span>
        </div>
    );
}

/** Das umbrechende Raster unter den Hauptwerten. */
export function ClimateMetricGrid({
    metrics,
    formatted,
    fontScale,
    columns,
    showLabels = true,
}: {
    metrics: ResolvedClimateMetric[];
    formatted: Record<string, FormattedMetric>;
    fontScale: number;
    /** 0 = umbrechende Reihe, sonst feste Spaltenzahl. */
    columns?: number;
    showLabels?: boolean;
}) {
    if (!metrics.length) return null;
    const style: React.CSSProperties = columns
        ? { display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: '2px 10px' }
        : { display: 'flex', flexWrap: 'wrap', columnGap: 10, rowGap: 2 };
    return (
        <div className="aura-climate-metrics min-w-0" style={style}>
            {metrics.map((m) => (
                <ClimateMetricValue
                    key={m.id}
                    metric={m}
                    formatted={formatted[m.id]}
                    fontScale={fontScale}
                    showLabel={showLabels}
                />
            ))}
        </div>
    );
}
