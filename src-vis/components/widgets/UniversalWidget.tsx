/**
 * Universal Widget — a freely composable grid of interactive and read-only cells.
 * Has no main datapoint; each cell binds to its own DP via the custom-grid editor.
 * Only supports the 'custom' layout. Renders an optional icon+title header above the grid.
 */
import React from 'react';
import { LayoutGrid } from 'lucide-react';
import type { WidgetProps } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { CustomGridView, DEFAULT_UNIVERSAL_GRID } from './CustomGridView';

export function UniversalWidget({ config }: WidgetProps) {
    const o = config.options ?? {};
    const showTitle = o.showTitle !== false;
    const showIcon = o.showIcon !== false;
    const titleAlign = (o.titleAlign as string) ?? 'left';
    const iconSize = (o.iconSize as number) || 20;
    const Icon = getWidgetIcon(o.icon as string | undefined, LayoutGrid);
    const hasHeader = (showTitle && config.title) || showIcon;

    return (
        <div
            className="aura-widget-row aura-widget-universal flex flex-col w-full h-full gap-2"
            style={{ position: 'relative' }}
        >
            {hasHeader && (
                <div className="flex items-center gap-2 shrink-0">
                    {showIcon && (
                        <Icon
                            className="aura-widget-icon"
                            size={iconSize}
                            style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
                        />
                    )}
                    {showTitle && config.title && (
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
            <div className="flex-1 min-h-0">
                <CustomGridView config={config} value="" fallback={DEFAULT_UNIVERSAL_GRID} />
            </div>
        </div>
    );
}
