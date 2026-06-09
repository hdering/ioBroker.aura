import { useState } from 'react';
import { Zap, Tag } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { ConfirmOverlay } from './ConfirmOverlay';
import type { WidgetProps } from '../../types';

export type ChipItem = {
    id: string;
    label: string;
    icon?: string;
    dp: string;
    value?: string | number | boolean;
    activeValue?: string | number | boolean;
};

export function ChipsWidget({ config }: WidgetProps) {
    const o = config.options ?? {};
    const { setState } = useIoBroker();
    const [pendingChip, setPendingChip] = useState<ChipItem | null>(null);

    const WidgetIcon = getWidgetIcon(config.options?.icon as string | undefined, Tag);
    const iconSize = (o.iconSize as number) || 20;
    const showTitle = o.showTitle !== false;
    const showIcon = o.showIcon !== false;
    const titleAlign = (o.titleAlign as string) ?? 'left';

    const chips = (o.chips as ChipItem[] | undefined) ?? [];
    const checkDp = (o.checkDp as string) ?? '';
    const layout = (o.layout as string) ?? 'row';
    const align = (o.align as string) ?? 'start';
    const valign = (o.valign as string) ?? 'middle';
    const chipSizeRaw = o.chipSize as string | number | undefined;
    const chipStyle = (o.chipStyle as string) ?? 'outlined';
    const wrapCols = o.wrapCols as number | undefined;
    const gap = (o.gap as number) ?? 6;
    const showConfirm = o.showConfirm === true;
    const confirmText = (o.confirmText as string) ?? '';

    const { value: checkValue } = useDatapoint(checkDp);

    const execute = (chip: ChipItem) => {
        if (!chip.dp) return;
        setState(chip.dp, chip.value !== undefined ? chip.value : true);
    };

    const handleChip = (chip: ChipItem) => {
        if (showConfirm) {
            setPendingChip(chip);
            return;
        }
        execute(chip);
    };

    const isActive = (chip: ChipItem): boolean => {
        if (!checkDp) return false;
        const compareTo = chip.activeValue !== undefined ? chip.activeValue : chip.value;
        if (compareTo === undefined) return false;

        return checkValue == compareTo;
    };

    const h =
        typeof chipSizeRaw === 'number'
            ? Math.max(16, Math.min(500, chipSizeRaw))
            : chipSizeRaw === 'sm'
              ? 28
              : chipSizeRaw === 'lg'
                ? 42
                : 34;
    const fs = `${Math.round(h * 0.35)}px`;
    const px = `${Math.round(h * 0.35)}px`;
    const iconSz = Math.round(h * 0.38);

    const alignFlex = align === 'end' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start';

    const valignJustify = valign === 'top' ? 'flex-start' : valign === 'bottom' ? 'flex-end' : 'center';

    const containerStyle: React.CSSProperties =
        layout === 'grid' && wrapCols
            ? { display: 'grid', gridTemplateColumns: `repeat(${wrapCols}, 1fr)`, gap: `${gap}px` }
            : layout === 'column'
              ? { display: 'flex', flexDirection: 'column', gap: `${gap}px`, alignItems: alignFlex }
              : layout === 'wrap'
                ? { display: 'flex', flexWrap: 'wrap', gap: `${gap}px`, justifyContent: alignFlex }
                : {
                      display: 'flex',
                      gap: `${gap}px`,
                      overflowX: 'auto',
                      scrollbarWidth: 'none',
                      paddingBottom: '2px',
                      justifyContent: alignFlex,
                  };

    const chipBg = (active: boolean) =>
        chipStyle === 'filled'
            ? active
                ? 'var(--accent)'
                : 'var(--app-bg)'
            : chipStyle === 'ghost'
              ? active
                  ? 'var(--accent)22'
                  : 'transparent'
              : active
                ? 'var(--accent)22'
                : 'var(--app-bg)';

    const chipColor = (active: boolean) =>
        active ? (chipStyle === 'filled' ? '#fff' : 'var(--accent)') : 'var(--text-primary)';

    const chipBorder = (active: boolean) =>
        chipStyle === 'ghost' ? 'none' : `1px solid ${active ? 'var(--accent)44' : 'var(--app-border)'}`;

    return (
        <div className="aura-widget-row relative w-full h-full flex flex-col gap-1.5">
            {(showTitle || showIcon) && (
                <div className="flex items-center gap-1.5 shrink-0 min-w-0">
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
            )}
            <div className="aura-widget-action nodrag flex-1 flex flex-col" style={{ justifyContent: valignJustify }}>
                <div className="nodrag" style={containerStyle}>
                    {chips.map((chip) => {
                        const active = isActive(chip);
                        const ChipIcon = chip.icon ? getWidgetIcon(chip.icon, Zap) : null;
                        return (
                            <button
                                key={chip.id}
                                onClick={() => handleChip(chip)}
                                className="flex items-center gap-1.5 rounded-full whitespace-nowrap hover:opacity-80 transition-opacity shrink-0"
                                style={{
                                    background: chipBg(active),
                                    color: chipColor(active),
                                    border: chipBorder(active),
                                    fontSize: fs,
                                    height: `${h}px`,
                                    paddingLeft: px,
                                    paddingRight: px,
                                }}
                            >
                                {ChipIcon && <ChipIcon size={iconSz} />}
                                {chip.label}
                            </button>
                        );
                    })}
                </div>
            </div>
            {pendingChip && (
                <ConfirmOverlay
                    text={confirmText || undefined}
                    onConfirm={() => {
                        execute(pendingChip);
                        setPendingChip(null);
                    }}
                    onCancel={() => setPendingChip(null)}
                />
            )}
        </div>
    );
}
