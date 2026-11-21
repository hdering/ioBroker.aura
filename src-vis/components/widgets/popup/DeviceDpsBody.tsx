import { useEffect, useState } from 'react';
import type { ClickAction, WidgetConfig } from '../../../types';
import { fetchDatapointBranch, type DatapointEntry } from '../../../hooks/useDatapointList';
import { getObjectDirect } from '../../../hooks/useIoBroker';
import { resolveDeviceIdForDp, type DeviceModel } from '../../../utils/batteryLibrary';
import { isRelevantDp } from '../../../utils/dpRelevance';
import { PopupAutoHeightContext } from '../../../contexts/PopupAutoHeightContext';
import { DEFAULT_POPUP_PADDING } from '../../../store/popupConfigStore';
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

/**
 * The device/channel objects above `dpId`, read one by one (cached per session) - instead
 * of the whole device + channel list, which on a large installation held the popup back
 * for many seconds. Only `kind` is filled; the resolvers above read nothing else.
 */
async function ancestorKinds(dpId: string): Promise<Map<string, DeviceModel>> {
    const parts = dpId.split('.');
    const ids: string[] = [];
    for (let i = parts.length - 1; i >= 2; i--) ids.push(parts.slice(0, i).join('.'));
    const objs = await Promise.all(ids.map((id) => getObjectDirect(id).catch(() => null)));
    const index = new Map<string, DeviceModel>();
    ids.forEach((id, i) => {
        const t = objs[i]?.type;
        if (t === 'device' || t === 'channel') index.set(id, { id, name: '', kind: t });
    });
    return index;
}

/** Lexical parent strang, e.g. `alias.0.Steckdose.on` -> `alias.0.Steckdose`. */
function parentId(dpId: string): string {
    const i = dpId.lastIndexOf('.');
    return i > 0 ? dpId.slice(0, i) : dpId;
}

/**
 * "Alle Datenpunkte dieses Geraets" popup body (issue #524).
 *
 * Reads the sibling datapoints with one ranged object query on their branch and renders them through the static list widget, so switches,
 * sliders, multi-state displays and value formatting all come for free. Rows are
 * pinned to `clickAction: none` - a popup inside a popup helps nobody.
 */
export function DeviceDpsBody({
    widget,
    action,
    padding = DEFAULT_POPUP_PADDING,
}: {
    widget: WidgetConfig;
    action: DpsAction;
    /** Inner padding in px, resolved by WidgetClickPopup (issue #621). */
    padding?: number;
}) {
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
            let base: string;
            if (scope === 'parent') {
                base = parentId(dpId);
            } else {
                const index = await ancestorKinds(dpId);
                base = scope === 'channel' ? resolveChannelId(dpId, index) : resolveDeviceIdForDp(dpId, index);
            }
            // Just this branch - not the whole object DB (#882).
            let found = await fetchDatapointBranch(base);
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
        <div style={{ padding, width: 'min(88vw, 520px)' }}>
            {/* Auto-height so the list renders every row and the popup body scrolls
                as a whole instead of growing a second inner scrollbar. */}
            <PopupAutoHeightContext.Provider value={true}>
                <ListWidget config={listConfig} editMode={false} onConfigChange={() => {}} />
            </PopupAutoHeightContext.Provider>
        </div>
    );
}
