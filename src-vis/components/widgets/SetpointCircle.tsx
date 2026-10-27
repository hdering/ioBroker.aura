/**
 * Setpoint control shared by the thermostat and the room climate widget (#838):
 * stepping, quick-select temperatures and the circle menu (#815) built from them.
 * The widget owns the datapoint and hands in `setTemp`; everything here only
 * draws and computes.
 */
import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { applyCircleOrder, CircleMenu, type CircleDirection, type CircleMenuItem } from './CircleMenu';

export const DEFAULT_SETPOINT_PRESETS = [18, 20, 22, 24];

export function setpointPresetText(v: number): string {
    return `${String(v).replace('.', ',')}°`;
}

/** Keep `v` inside [min, max] on the step grid. */
export function clampSetpoint(v: number, min: number, max: number, step: number) {
    return Math.max(min, Math.min(max, Math.round(v / step) * step));
}

/**
 * Entries of the setpoint circle menu in their default order — keys and labels
 * only, so the editor's order list (`circleOrder`) names exactly what the widget
 * draws: −, the quick-select temperatures, +.
 */
export function setpointCircleEntries(controls: boolean, presets: number[]): { key: string; label: string }[] {
    return [
        ...(controls ? [{ key: 'minus', label: 'Kälter (−)' }] : []),
        ...presets.map((v) => ({ key: `preset-${v}`, label: setpointPresetText(v) })),
        ...(controls ? [{ key: 'plus', label: 'Wärmer (+)' }] : []),
    ];
}

/** The circle entries themselves: − and + step and keep the menu open, a preset jumps. */
export function setpointCircleItems({
    controls,
    presets,
    target,
    step,
    itemSize,
    setTemp,
}: {
    controls: boolean;
    presets: number[];
    target: number;
    step: number;
    itemSize: number;
    setTemp: (v: number) => void;
}): CircleMenuItem[] {
    const itemIcon = Math.round(itemSize * 0.42);
    const items: CircleMenuItem[] = [];
    if (controls)
        items.push({
            key: 'minus',
            content: <Minus size={itemIcon} />,
            title: 'Kälter',
            onSelect: () => setTemp(target - step),
            stays: true,
        });
    for (const v of presets)
        items.push({
            key: `preset-${v}`,
            content: setpointPresetText(v),
            title: setpointPresetText(v),
            active: Math.abs(target - v) < 0.1,
            onSelect: () => setTemp(v),
        });
    if (controls)
        items.push({
            key: 'plus',
            content: <Plus size={itemIcon} />,
            title: 'Wärmer',
            onSelect: () => setTemp(target + step),
            stays: true,
        });
    return items;
}

/**
 * The shared `circle*` options, read by the widget itself (the schema generator
 * only sees option reads on the widget's own options binding).
 */
export interface SetpointCircleSettings {
    order: unknown;
    direction: CircleDirection;
    itemSize: number;
    keepOpen: boolean;
    shade: boolean;
    triggerSize?: number;
}

/**
 * The round button with the setpoint (and the reading) that fans the setpoint
 * entries out. Used as the thermostat's circle layout and as the 'circle-menu'
 * component of the custom grids of thermostat and room climate.
 */
export function SetpointCircleMenu({
    settings,
    items,
    title,
    setpointText,
    actualText,
    accentColor,
    actualColor,
    icon,
    below,
    primary = 'setpoint',
    actualValue = null,
    setpointLabel = 'Soll',
}: {
    settings: SetpointCircleSettings;
    items: CircleMenuItem[];
    /** Name for the tooltip / accessible name of the button. */
    title: string;
    /** Formatted setpoint; null = not shown. */
    setpointText: string | null;
    /** Formatted reading ("Ist 20,5°"); null = not shown. */
    actualText: string | null;
    accentColor: string;
    actualColor?: string;
    /** Icon drawn in the button; null = none. */
    icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> | null;
    below?: React.ReactNode;
    /** Which value the button shows large (#864); 'actual' falls back to the setpoint without a reading. */
    primary?: 'setpoint' | 'actual';
    /** Formatted reading without label ("20,5") — the large value when primary is 'actual'. */
    actualValue?: string | null;
    /** Label of the small setpoint line when the reading is shown large. */
    setpointLabel?: string;
}) {
    const Icon = icon;
    // Large and small line of the button — swapped when the reading leads (#864).
    const actualFirst = primary === 'actual' && actualValue !== null;
    const big = actualFirst
        ? { text: `${actualValue}°`, color: actualColor ?? 'var(--text-primary)' }
        : setpointText !== null
          ? { text: `${setpointText}°`, color: accentColor }
          : null;
    const small = actualFirst
        ? setpointText !== null
            ? { text: `${setpointLabel} ${setpointText}°`, color: accentColor }
            : null
        : actualText !== null
          ? { text: actualText, color: actualColor ?? 'var(--text-secondary)' }
          : null;
    return (
        <CircleMenu
            triggerTitle={setpointText !== null ? `${title}: ${setpointText}°C` : title}
            triggerStyle={{ borderColor: accentColor }}
            items={applyCircleOrder(items, settings.order)}
            direction={settings.direction}
            itemSize={settings.itemSize}
            keepOpen={settings.keepOpen}
            shade={settings.shade}
            triggerSize={settings.triggerSize}
            // The setpoint stays visible in the middle while +/− step it.
            center={setpointText !== null ? `${setpointText}°` : undefined}
            trigger={
                <>
                    {Icon && (
                        <Icon
                            className="aura-widget-icon"
                            style={
                                {
                                    '--aura-icon-color': accentColor,
                                    width: '30%',
                                    height: '30%',
                                    flexShrink: 0,
                                } as React.CSSProperties
                            }
                        />
                    )}
                    {big && (
                        <span
                            className="aura-widget-value font-bold tabular-nums"
                            data-aura-circle-line="big"
                            style={{
                                color: big.color,
                                fontSize: '20cqw',
                                lineHeight: 1.1,
                                marginTop: '3cqw',
                            }}
                        >
                            {big.text}
                        </span>
                    )}
                    {small && (
                        <span
                            className="tabular-nums"
                            data-aura-circle-line="small"
                            style={{
                                color: small.color,
                                fontSize: '10cqw',
                                lineHeight: 1.2,
                            }}
                        >
                            {small.text}
                        </span>
                    )}
                </>
            }
            below={below}
        />
    );
}
