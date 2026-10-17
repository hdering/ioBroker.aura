import type { WidgetConfig } from '../types';
import type React from 'react';
import {
    STATUS_FIXED_KEYS,
    STATUS_ITEM_CELL_PREFIX,
    StatusSymbolRow,
    useStatusSymbols,
} from '../components/widgets/StatusBadges';

interface StatusFields {
    battery: string;
    reach: string;
    batteryIcon: React.ReactNode;
    reachIcon: React.ReactNode;
    window: string;
    windowIcon: React.ReactNode;
    /** All configured status symbols — built-in and own ones — in a single flex row, in their set order. */
    statusBadges: React.ReactNode;
    /** Each own symbol on its own, keyed 'status-item:<id>' — spread into extraComponents (#792). */
    statusItemCells: Record<string, React.ReactNode>;
}

/**
 * Computes text strings and badge icon nodes for battery / reach / window.
 * Text (battery, reach) → use as extraFields in CustomGridView.
 * Icons (batteryIcon, reachIcon) → use as extraComponents in CustomGridView.
 * Same evaluation as StatusBadges (useStatusSymbols). With statusBadgesAlertOnly
 * an icon only shows while its own value is an alarm.
 */
export function useStatusFields(config: WidgetConfig): StatusFields {
    const { symbols, readings: r } = useStatusSymbols(config);
    const nodeOf = (key: string) => symbols.find((s) => s.key === key)?.node ?? null;

    let battery = '';
    if (r.battDpId) {
        if (r.battMode === 'percent') battery = r.battPercent === null ? '–' : `${Math.round(r.battPercent)}%`;
        else battery = r.isBattLow ? 'Niedrig' : 'OK';
    }
    const reach = r.reachDpId ? (r.isUnreach ? 'Nicht erreichbar' : 'Erreichbar') : '';
    const windowText = r.windowDpId ? (r.isWindowOpen ? 'Fenster offen' : 'Fenster zu') : '';

    const statusItemCells: Record<string, React.ReactNode> = {};
    for (const s of symbols) {
        if (!(STATUS_FIXED_KEYS as readonly string[]).includes(s.key))
            statusItemCells[STATUS_ITEM_CELL_PREFIX + s.key] = s.node;
    }

    return {
        battery,
        reach,
        window: windowText,
        batteryIcon: nodeOf('battery'),
        reachIcon: nodeOf('reach'),
        windowIcon: nodeOf('window'),
        statusBadges: symbols.length ? <StatusSymbolRow symbols={symbols} /> : null,
        statusItemCells,
    };
}
