import { formatNum } from './formatValue';

/** Format a Y-axis tick value, optionally using compact notation (K/M/B). */
export function formatYTick(value: number, decimals: number, compact: boolean): string {
    if (!compact) return formatNum(value, decimals);
    const abs = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    if (abs >= 1e9) {
        const n = abs / 1e9;
        return `${sign}${n >= 10 ? Math.round(n) : n.toFixed(1).replace(/\.0$/, '')}B`;
    }
    if (abs >= 1e6) {
        const n = abs / 1e6;
        return `${sign}${n >= 10 ? Math.round(n) : n.toFixed(1).replace(/\.0$/, '')}M`;
    }
    if (abs >= 1e3) {
        const n = abs / 1e3;
        return `${sign}${n >= 10 ? Math.round(n) : n.toFixed(1).replace(/\.0$/, '')}K`;
    }
    return formatNum(value, decimals);
}
