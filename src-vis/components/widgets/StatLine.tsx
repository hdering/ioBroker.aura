import { Fragment } from 'react';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { getStatParts, type ListStat, type ListStatsResult } from '../../utils/listStats';

/**
 * Aggregate line shown under a list's title (sum / avg / min / max).
 * Each part may carry an icon and/or text prefix in front of its value; a shared
 * unit is appended once at the end.
 */
export function StatLine({
    stats,
    selected,
    labels,
    icons,
    sumLabel,
    decimals,
    align = 'left',
    fontSize = 10,
}: {
    stats: ListStatsResult;
    selected?: ListStat[];
    labels?: Partial<Record<ListStat, string>>;
    icons?: Partial<Record<ListStat, string>>;
    sumLabel?: string;
    decimals: number;
    align?: 'left' | 'center' | 'right';
    fontSize?: number;
}) {
    const parts = getStatParts(stats, selected, labels, icons, sumLabel, decimals);
    const justify = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';
    const iconSize = Math.round(fontSize * 1.1);
    return (
        <div
            className="tabular-nums flex flex-wrap items-center"
            style={{
                color: 'var(--text-secondary)',
                opacity: 0.75,
                justifyContent: justify,
                fontSize: `${fontSize}px`,
                columnGap: '0.6em',
                rowGap: '0.15em',
            }}
        >
            {parts.map((p, i) => {
                const IconComp = p.icon ? getWidgetIcon(p.icon, null!) : null;
                return (
                    <Fragment key={p.key}>
                        {i > 0 && <span style={{ opacity: 0.5 }}>·</span>}
                        <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
                            {IconComp && <IconComp size={iconSize} />}
                            {p.text && <span>{p.text}</span>}
                            <span>{p.value}</span>
                        </span>
                    </Fragment>
                );
            })}
            {stats.unit && <span className="whitespace-nowrap">{stats.unit}</span>}
        </div>
    );
}
