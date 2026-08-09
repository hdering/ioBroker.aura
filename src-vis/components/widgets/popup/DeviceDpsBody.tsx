import { useEffect, useState } from 'react';
import type { ClickAction, WidgetConfig } from '../../../types';
import { ensureDatapointCache, type DatapointEntry } from '../../../hooks/useDatapointList';
import { loadDeviceModelIndex, resolveDeviceIdForDp, type DeviceModel } from '../../../utils/batteryLibrary';
import { isRelevantDp } from '../../../utils/dpRelevance';
import { PopupAutoHeightContext } from '../../../contexts/PopupAutoHeightContext';
import { ListWidget, type StaticListEntry } from '../ListWidget';

type DpsAction = Extract<ClickAction, { kind: 'popup-dps' }>;

/** Nearest `channel` ancestor; falls back to the lexical parent when none exists. */
function resolveChannelId(dpId: string, index: Map<string, DeviceModel>): string {
    const parts = dpId.split('.');
    for (let i = parts.length - 1; i >= 2; i--) {
        const id = parts.slice(0, i).join('.');
        if (index.get(id)?.kind === 'channel') return id;
    }
    return parts.slice(0, Math.max(2, parts.length - 1)).join('.');
}

/** Lexical parent strang, e.g. `alias.0.Steckdose.on` -> `alias.0.Steckdose`. */
function parentId(dpId: string): string {
    const i = dpId.lastIndexOf('.');
    return i > 0 ? dpId.slice(0, i) : dpId;
}

/**
 * "Alle Datenpunkte dieses Geraets" popup body (issue #524).
 *
 * Reads the sibling datapoints straight from the datapoint cache (which already
 * contains aliases) and renders them through the static list widget, so switches,
 * sliders, multi-state displays and value formatting all come for free. Rows are
 * pinned to `clickAction: none` - a popup inside a popup helps nobody.
 */
export function DeviceDpsBody({ widget, action }: { widget: WidgetConfig; action: DpsAction }) {
    const dpId = action.dp || widget.datapoint || '';
    const scope = action.scope ?? 'parent';
    const relevantOnly = !!action.relevantOnly;
    const [dps, setDps] = useState<DatapointEntry[] | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!dpId) {
                setDps([]);
                return;
            }
            const cache = await ensureDatapointCache();
            let base: string;
            if (scope === 'parent') {
                base = parentId(dpId);
            } else {
                const index = await loadDeviceModelIndex();
                base = scope === 'channel' ? resolveChannelId(dpId, index) : resolveDeviceIdForDp(dpId, index);
            }
            const prefix = `${base}.`;
            let found = cache.filter((d) => d.id.startsWith(prefix));
            if (relevantOnly) found = found.filter((d) => isRelevantDp(d.role, d.type));
            found.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' }));
            if (!cancelled) setDps(found);
        })();
        return () => {
            cancelled = true;
        };
    }, [dpId, scope, relevantOnly]);

    if (dps === null) {
        return (
            <div className="px-6 py-8 text-xs" style={{ color: 'var(--text-secondary)' }}>
                Datenpunkte werden geladen...
            </div>
        );
    }

    if (dps.length === 0) {
        return (
            <div className="px-6 py-8 text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
                {dpId ? 'Keine weiteren Datenpunkte gefunden.' : 'Kein Datenpunkt gesetzt.'}
            </div>
        );
    }

    const entries: StaticListEntry[] = dps.map((d) => ({
        id: d.id,
        label: d.name,
        unit: d.unit,
        role: d.role,
        writable: d.write,
        clickAction: { kind: 'none' },
    }));

    const listConfig: WidgetConfig = {
        ...widget,
        id: `${widget.id}-dps`,
        type: 'list',
        title: '',
        layout: 'default',
        datapoint: '',
        options: {
            entries,
            showTitle: false,
            showIcon: false,
            showCount: false,
            showId: true,
            hideFilterButton: true,
        },
    };

    return (
        <div className="p-3" style={{ width: 'min(88vw, 520px)' }}>
            {/* Auto-height so the list renders every row and the popup body scrolls
                as a whole instead of growing a second inner scrollbar. */}
            <PopupAutoHeightContext.Provider value={true}>
                <ListWidget config={listConfig} editMode={false} onConfigChange={() => {}} />
            </PopupAutoHeightContext.Provider>
        </div>
    );
}
