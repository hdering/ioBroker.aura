import { Fragment, useEffect, useMemo, useState, useCallback } from 'react';
import { RefreshCw, List } from 'lucide-react';
import type { WidgetProps, ioBrokerObject, ioBrokerState, ElementConditionRule } from '../../types';
import { useElementConditionStyles, type ElementCondInput } from '../../hooks/useElementConditionStyles';
import { partOf, rowHidden, type ElementCondResult } from '../../utils/rowConditions';
import { getObjectViewDirect, useIoBroker } from '../../hooks/useIoBroker';
import { ensureDatapointCache } from '../../hooks/useDatapointList';
import { saveAll, saveToIoBroker } from '../../store/persistManager';
import { isRelevantDp } from '../../utils/dpRelevance';
import { getRoleDisplay } from '../../utils/listEntryDisplay';
import { getThresholdColor, type ColorThreshold } from '../../utils/colorThresholds';
import { CustomGridView } from './CustomGridView';
import { applyDpNameFilter } from '../../utils/dpNameFilter';
import {
    buildEnumMemberIndex,
    collectEnumFilterOptions,
    enumIdsForObject,
    matchesEnumFilter,
    splitEnumFilter,
    type EnumFilterOption,
} from '../../utils/enumFilter';
import { formatItemName, finishItemName, hasLiveToken, type NameFilterRule } from '../../utils/nameFilter';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { useT } from '../../i18n';
import { usePopupAutoHeight } from '../../contexts/PopupAutoHeightContext';
import { formatLastChange } from '../../utils/formatLastChange';
import { useGlobalSettingsStore } from '../../store/globalSettingsStore';
import { type NumberFormat } from '../../utils/formatValue';
import { computeListStats, type ListStat } from '../../utils/listStats';
import { StatLine } from './StatLine';
import { stripDpTokens, useDpTokenResolver } from './DynamicTitle';
import { publishListCount, unpublishList } from '../../utils/publishWidgetState';
import {
    listEntryTarget,
    listDimmerIds,
    listShutterTargets,
    listPulseIds,
    type GroupTarget,
    type GroupActionType,
    type GroupActionConfigOpts,
} from '../../utils/groupTargets';
import { GroupActionControl } from './GroupActionControl';
import { EntrySubLine, subCondKey, type EntrySubDp } from './EntrySubLine';
import { useTemplateValues } from '../../hooks/useTemplateValues';
import { resolveSubDpTemplate } from '../../utils/subDpTemplate';
import { ListFilterChip } from './ListFilterChip';
import {
    buildFilterChoices,
    filterEmptyText,
    filterModeLabel,
    matchesFilterMode,
    matchesSearch,
    normalizeFilterMode,
    type ListFilterOptions,
    type ListFilterRow,
} from '../../utils/listFilter';
import { useRowPopup } from '../../hooks/useRowPopup';
import type { RowClickSetting, RowPopupOptions } from '../../utils/rowClickAction';
import {
    ShutterControl,
    StepperControl,
    PresetButtons,
    MomentaryButton,
    StateDisplay,
    ContactDisplay,
    TimeDisplay,
    InputControl,
    DateEntryControl,
    entryDateText,
    formatEntryTime,
    entryValueText,
    resolveContactDisplay,
    NON_TOGGLE_DISPLAY_TYPES,
    type EntryControlConfig,
} from './entryControls';
import type { ValueTransformSettings } from '../../utils/valueTransform';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AutoListEntry extends EntryControlConfig {
    id: string;
    label?: string;
    rooms?: string[];
    unit?: string;
    role?: string;
    trueLabel?: string;
    falseLabel?: string;
    writable?: boolean; // false = read-only; undefined/true = writable
    /** Per-DP text color when on/true/>0. Overrides global activeColor. */
    activeColor?: string;
    /** Per-DP text color when off/false/0. Overrides global inactiveColor. */
    inactiveColor?: string;
    /** Per-DP entry background when on/true/>0. Overrides global activeBg. */
    activeBg?: string;
    /** Per-DP entry background when off/false/0. Overrides global inactiveBg. */
    inactiveBg?: string;
    /** Per-row click action. Overrides the list-wide setting; undefined = inherit. */
    clickAction?: RowClickSetting;
    /** Heading of this row's popup. Beats options.rowPopupTitle; unset = the row name. */
    popupTitle?: string;
    /** Title bar of this row's popup: true = hide, false = show, unset = as the list. */
    popupHideTitle?: boolean;
    /** Extra display-only datapoints on a second line. Replaces options.subDpTemplate
     *  for this entry; empty/unset = the template applies. */
    subDps?: EntrySubDp[];
    /** Icon in front of the name. Falls back to options.entryIcon (issue #572). */
    icon?: string;
    /** Icon size in px. Default 13. */
    iconSize?: number;
    /** Conditional formatting of this row (issue #572). */
    conditions?: ElementConditionRule[];
}

export interface AutoListOptions
    extends GroupActionConfigOpts, RowPopupOptions, ValueTransformSettings, ListFilterOptions {
    entries: AutoListEntry[];
    /** Colour scale for the numeric values of every row (see utils/colorThresholds). */
    colorThresholds?: ColorThreshold[];
    filterRoles?: string;
    filterIdPattern?: string;
    filterRooms?: string;
    filterFuncs?: string;
    /**
     * Custom enum categories (issue #568): comma-separated FULL enum ids, e.g.
     * 'enum.floors.og, enum.floors.dg'. Ids, not labels - the same name may exist
     * under several categories. OR inside a category, AND across categories.
     */
    filterEnums?: string;
    filterTypes?: string;
    excludeIdPatterns?: string;
    excludeIds?: string[];
    syncIntervalMin?: number;
    decimals?: number;
    numberFormat?: NumberFormat;
    showRoom?: boolean;
    showId?: boolean;
    /** Group entries by their (first) room, rendering the room name as a section heading. */
    groupByRoom?: boolean;
    /** Heading text for entries that have no room assigned. Default 'Ohne Raum'. */
    noRoomLabel?: string;
    /** Font size of room section headings in px. Default 10. */
    roomHeaderFontSize?: number;
    /** Text color of room section headings. Default var(--text-secondary). */
    roomHeaderColor?: string;
    /** Background color of room section headings. Default a faint tint. */
    roomHeaderBg?: string;
    filterRelevant?: boolean;
    /** Entry label template, tokens <Raum> <Gerät> <DPName> <Name> <ID>. Empty = the plain name. */
    namePattern?: string;
    /** Text rules applied to the token values before substitution (see utils/nameFilter). */
    nameFilters?: NameFilterRule[];
    /**
     * Filter the frontend starts with: 'all' (default), the built-ins 'active' /
     * 'inactive', or the id of a filterPresets entry (see utils/listFilter).
     */
    valueFilter?: string;
    showTitle?: boolean;
    showCount?: boolean;
    sortBy?: 'none' | 'label' | 'value';
    sortOrder?: 'asc' | 'desc';
    sortBy2?: 'none' | 'label' | 'value';
    sortOrder2?: 'asc' | 'desc';
    filterAdapters?: string;
    cardMinWidth?: number;
    /** Global default label for on/true/>0 state (fallback when entry has no trueLabel). */
    trueText?: string;
    /** Global default label for off/false/0 state (fallback when entry has no falseLabel). */
    falseText?: string;
    /** Global text color when on. Per-DP activeColor overrides. Default: green. */
    activeColor?: string;
    /** Global text color when off. Per-DP inactiveColor overrides. */
    inactiveColor?: string;
    /** Global entry background when on. Per-DP activeBg overrides. */
    activeBg?: string;
    /** Global entry background when off. Per-DP inactiveBg overrides. */
    inactiveBg?: string;
    /** Publish the filtered count to aura.0.lists.<widgetId>.count */
    publishCount?: boolean;
    /** Backend display filter — independent from frontend valueFilter. Default 'all'. */
    backendValueFilter?: string;
    /** Hide the frontend filter chip in the widget header. Default false. */
    hideFilterButton?: boolean;
    /** Show an aggregate line of numeric values from visible entries below the title. */
    showSum?: boolean;
    /** Which aggregates to show. Default (undefined/empty) = sum only. */
    sumStats?: ListStat[];
    /** Per-stat text prefix. Falls back to a default symbol per stat. */
    statLabels?: Partial<Record<ListStat, string>>;
    /** Per-stat icon (iconify id / lucide name) rendered before the value. */
    statIcons?: Partial<Record<ListStat, string>>;
    /** Legacy prefix label for the sum part (default 'Σ'). Superseded by statLabels.sum. */
    sumLabel?: string;
    /** Text alignment of the sum line. Default 'left'. */
    sumAlign?: 'left' | 'center' | 'right';
    /** Font size of the sum line in px. Default 10. */
    sumFontSize?: number;
    /** Show divider lines between list entries (standard/compact layouts). Default true. */
    showDividers?: boolean;
    /** Show last-change timestamp under every entry (global toggle — dynamic list has no per-DP config). */
    showEntryLastChange?: boolean;
    /** Wrap long entry labels AND text values onto multiple lines instead of truncating / overflowing. Default false. */
    wrapText?: boolean;
    /** When wrapText is on: minimum % of the row reserved for the label (10..90). Value gets the rest. Default 50. */
    labelMinPercent?: number;
    /** Second line for EVERY entry: ids may use `{{parent}}` / `{{dp}}` / `{{name}}` and
     *  are resolved per row. An entry's own `subDps` replaces this. */
    subDpTemplate?: EntrySubDp[];
    /** Template rows whose resolved datapoint does not exist are left out instead of
     *  rendering a dash (a device without BATTERY). Default true. */
    subDpTemplateHideMissing?: boolean;
    /** Icon in front of every row's name — the rows come from a filter, so setting
     *  one per entry is not an option for 40 discovered datapoints (issue #572). */
    entryIcon?: string;
    /** Size of that icon in px. Default 13. */
    entryIconSize?: number;
    /**
     * Conditional formatting applied to EVERY row (issue #572). Clause datapoints may
     * use `{{parent}}` / `{{dp}}` / `{{name}}`, resolved per row — that is what makes one
     * rule work for a whole discovered list. Rules on the entry itself are applied
     * afterwards and therefore win per field.
     */
    rowConditions?: ElementConditionRule[];
    // Group action options (groupSwitch, groupActionType, …) come from GroupActionConfigOpts.
}

export interface DiscoveredDp {
    id: string;
    name: string;
    role?: string;
    type?: string;
    unit?: string;
    write?: boolean;
    rooms: string[];
    /** true if the role/type matches a known widget pattern */
    isRelevant: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Match id against a pattern that is either:
 *   - plain text  → case-insensitive substring match
 *   - /regex/flags → RegExp test (default flag: i)
 */
export function matchesIdPattern(id: string, pattern: string): boolean {
    const p = pattern.trim();
    if (p.startsWith('/')) {
        const lastSlash = p.lastIndexOf('/');
        const body = p.slice(1, lastSlash > 0 ? lastSlash : undefined);
        const flags = lastSlash > 0 ? p.slice(lastSlash + 1) : 'i';
        try {
            return new RegExp(body, flags || 'i').test(id);
        } catch {
            return false;
        }
    }
    return id.toLowerCase().includes(p.toLowerCase());
}

function compareVals(a: ioBrokerState['val'], b: ioBrokerState['val']): number {
    if (a === null || a === undefined) return 1;
    if (b === null || b === undefined) return -1;
    if (typeof a === 'boolean' && typeof b === 'boolean') return (a ? 1 : 0) - (b ? 1 : 0);
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/** true = value counts as "active" (on / > 0) — the polarity the row controls render. */
function isActive(val: ioBrokerState['val']): boolean {
    if (val === null || val === undefined) return false;
    if (typeof val === 'boolean') return val;
    if (typeof val === 'number') return val > 0;
    if (typeof val === 'string') return val !== '' && val !== '0' && val.toLowerCase() !== 'false';
    return false;
}

function isDimmerRole(role?: string) {
    const r = (role ?? '').toLowerCase();
    return r.includes('level') || r.includes('dimmer') || r.includes('brightness');
}

/** Returns true when the role explicitly describes a numeric value — these must
 *  never be rendered as a switch even if their live value happens to be 0 or 1. */
function isNumericRole(role?: string) {
    const r = (role ?? '').toLowerCase();
    return r.startsWith('value.') || r === 'value' || r.startsWith('level.') || r === 'level';
}

/** The entry's own second-line datapoints, empty ids dropped. Empty = the list-wide
 *  template applies — "own" must mean the same thing everywhere or an entry can end up
 *  counted as configured while rendering the template. */
function ownSubDps(entry: AutoListEntry): EntrySubDp[] {
    return (entry.subDps ?? []).filter((s) => !!s?.id);
}

export function resolveName(name: string | Record<string, string> | undefined, fallback: string): string {
    if (!name) return fallback;
    if (typeof name === 'string') return name;
    return name.de ?? name.en ?? Object.values(name)[0] ?? fallback;
}

type ViewRow = { id: string; value: ioBrokerObject };

/**
 * ioBroker's plain `state`/`channel`/`device` object view does not return the
 * `alias.*` namespace - a second range query over `alias.` is required, exactly
 * as in hooks/useDatapointList. Without it a dashboard built purely on aliases
 * finds nothing in the datapoint search (issue #524).
 */
async function viewWithAliases(type: 'state' | 'channel' | 'device'): Promise<ViewRow[]> {
    const [plain, aliases] = await Promise.all([
        getObjectViewDirect(type),
        getObjectViewDirect(type, 'alias.', 'alias.\u9999'),
    ]);
    const seen = new Set(plain.rows.map((r) => r.id));
    const out = [...plain.rows];
    for (const row of aliases.rows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        out.push(row);
    }
    return out;
}

export async function loadFilterOptions(): Promise<{
    roles: string[];
    rooms: string[];
    funcs: string[];
    /** User-defined enum categories, e.g. enum.floors.* (issue #568). */
    enums: EnumFilterOption[];
    types: string[];
    adapters: string[];
}> {
    const [stateRows, enumResult] = await Promise.all([
        viewWithAliases('state'),
        getObjectViewDirect('enum', 'enum.', 'enum.\u9999'),
    ]);
    const rolesSet = new Set<string>();
    const typesSet = new Set<string>();
    const adaptersSet = new Set<string>();
    for (const { id, value: obj } of stateRows) {
        if (obj?.common?.role) rolesSet.add(obj.common.role);
        if (obj?.common?.type) typesSet.add(obj.common.type);
        const parts = id.split('.');
        if (parts.length >= 2) adaptersSet.add(`${parts[0]}.${parts[1]}`);
    }
    const rooms: string[] = [];
    const funcs: string[] = [];
    for (const { value: obj } of enumResult.rows) {
        if (!obj) continue;
        const label = resolveName(obj.common?.name, obj._id.split('.').pop() ?? obj._id);
        if (obj._id.startsWith('enum.rooms.')) rooms.push(label);
        else if (obj._id.startsWith('enum.functions.')) funcs.push(label);
    }
    return {
        roles: Array.from(rolesSet).sort(),
        rooms: rooms.sort(),
        funcs: funcs.sort(),
        enums: collectEnumFilterOptions(enumResult.rows.map((r) => r.value)),
        types: Array.from(typesSet).sort(),
        adapters: Array.from(adaptersSet).sort(),
    };
}

export async function discoverDatapoints(
    opts: Pick<
        AutoListOptions,
        | 'filterRoles'
        | 'filterIdPattern'
        | 'filterRooms'
        | 'filterFuncs'
        | 'filterEnums'
        | 'filterTypes'
        | 'excludeIdPatterns'
        | 'excludeIds'
        | 'filterAdapters'
    >,
): Promise<DiscoveredDp[]> {
    const [stateRows, channelRows, deviceRows, enumResult] = await Promise.all([
        viewWithAliases('state'),
        viewWithAliases('channel'),
        viewWithAliases('device'),
        getObjectViewDirect('enum', 'enum.', 'enum.\u9999'),
    ]);

    // Build parent name map (channels override devices when both exist)
    const parentNames = new Map<string, string>();
    for (const { id, value: obj } of [...deviceRows, ...channelRows]) {
        if (!obj?.common?.name) continue;
        const n = resolveName(obj.common.name as string | Record<string, string>, '');
        if (n) parentNames.set(id, n);
    }

    // Build memberId → { rooms, funcs } map.
    // IMPORTANT: index by each member ID so we can do parent-path traversal below.
    // This mirrors useDatapointList which checks the state ID AND all parent paths,
    // because ioBroker adapters often assign rooms/functions to channels or devices,
    // not to individual state objects.
    const enumMap = new Map<string, { rooms: string[]; funcs: string[] }>();
    for (const { value: obj } of enumResult.rows) {
        if (!obj?.common?.members?.length) continue;
        const isRoom = obj._id.startsWith('enum.rooms.');
        const isFunc = obj._id.startsWith('enum.functions.');
        if (!isRoom && !isFunc) continue;
        const label = resolveName(obj.common.name, obj._id.split('.').pop() ?? obj._id);
        for (const memberId of obj.common.members) {
            if (!enumMap.has(memberId)) enumMap.set(memberId, { rooms: [], funcs: [] });
            const e = enumMap.get(memberId)!;
            if (isRoom) e.rooms.push(label);
            else e.funcs.push(label);
        }
    }

    // Custom categories (enum.floors & co.) get their own index: they are matched by
    // enum id, and their members are usually rooms rather than states, so membership
    // has to be resolved through the nested enums (see utils/enumFilter).
    const enumFilter = splitEnumFilter(opts.filterEnums);
    const customEnumIndex = enumFilter.length ? buildEnumMemberIndex(enumResult.rows.map((r) => r.value)) : null;

    // Role filter: exact match (same as DatapointPicker) with OR semantics for multiple values.
    const roleFilter = (opts.filterRoles ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const idPatterns = (opts.filterIdPattern ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const roomFilter = (opts.filterRooms ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const funcFilter = (opts.filterFuncs ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const typeFilter = (opts.filterTypes ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const adapterFilter = (opts.filterAdapters ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const excludePats = (opts.excludeIdPatterns ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const excludeIdsSet = new Set<string>(opts.excludeIds ?? []);

    return stateRows
        .filter(({ id, value: obj }) => {
            // Malformed rows (missing common) exist in some user DBs - drop them so
            // the mapper below can dereference common safely.
            if (!obj?.common) return false;
            const role = obj.common.role ?? '';
            if (roleFilter.length > 0 && !roleFilter.includes(role)) return false;
            if (idPatterns.length > 0 && !idPatterns.some((p) => matchesIdPattern(id, p))) return false;
            if (adapterFilter.length > 0) {
                const prefix = id.split('.').slice(0, 2).join('.');
                if (!adapterFilter.includes(prefix)) return false;
            }
            const type = (obj.common.type as string | undefined) ?? '';
            if (typeFilter.length > 0 && !typeFilter.includes(type)) return false;
            if (excludeIdsSet.has(id)) return false;
            if (excludePats.some((p) => matchesIdPattern(id, p))) return false;

            // Traverse the state ID and all parent paths to find room/func memberships.
            // e.g. for "hm-rpc.0.ABC.1.STATE" check:
            //   hm-rpc.0.ABC.1.STATE → hm-rpc.0.ABC.1 → hm-rpc.0.ABC → hm-rpc.0
            if (roomFilter.length > 0 || funcFilter.length > 0) {
                const parts = id.split('.');
                const roomsSet = new Set<string>();
                const funcsSet = new Set<string>();
                for (let i = parts.length; i >= 2; i--) {
                    const e = enumMap.get(parts.slice(0, i).join('.'));
                    if (e) {
                        e.rooms.forEach((r) => roomsSet.add(r));
                        e.funcs.forEach((f) => funcsSet.add(f));
                    }
                }
                if (roomFilter.length > 0 && !roomFilter.some((r) => roomsSet.has(r))) return false;
                if (funcFilter.length > 0 && !funcFilter.some((f) => funcsSet.has(f))) return false;
            }
            if (customEnumIndex && !matchesEnumFilter(enumFilter, enumIdsForObject(id, customEnumIndex))) return false;
            return true;
        })
        .map(({ id, value: obj }) => {
            // Build rooms array via parent-path traversal (same logic as filter above)
            const parts = id.split('.');
            const roomsSet = new Set<string>();
            for (let i = parts.length; i >= 2; i--) {
                const e = enumMap.get(parts.slice(0, i).join('.'));
                if (e) e.rooms.forEach((r) => roomsSet.add(r));
            }
            const role = obj.common.role as string | undefined;
            const type = obj.common.type as string | undefined;
            const stateName = resolveName(obj.common.name as string | Record<string, string>, '');
            let parentName = '';
            for (let i = parts.length - 1; i >= 2; i--) {
                const pName = parentNames.get(parts.slice(0, i).join('.'));
                if (pName) {
                    parentName = pName;
                    break;
                }
            }
            let name: string;
            if (parentName && stateName && parentName !== stateName) {
                name = `${parentName} › ${stateName}`;
            } else if (stateName) {
                name = stateName;
            } else if (parentName) {
                name = `${parentName} › ${parts[parts.length - 1]}`;
            } else {
                name = parts[parts.length - 1] ?? id;
            }
            return {
                id,
                name,
                role,
                type,
                unit: (obj.common.unit as string | undefined) || undefined,
                write: obj.common.write !== false ? undefined : false,
                rooms: [...roomsSet],
                isRelevant: isRelevantDp(role, type),
            };
        });
}

// ── Value display: row variant ────────────────────────────────────────────────

function EntryValue({
    entry,
    val,
    writable,
    setState,
    thresholds,
    decimals,
    numFmt,
    activeColor,
    inactiveColor,
    trueText,
    falseText,
    wrap,
    valueMaxPct,
    listTransform,
    cond,
}: {
    entry: AutoListEntry;
    val: ioBrokerState['val'];
    writable: boolean;
    setState: (id: string, v: boolean | number | string) => void;
    thresholds?: ColorThreshold[];
    decimals: number;
    numFmt?: NumberFormat;
    activeColor: string;
    inactiveColor: string;
    trueText?: string;
    falseText?: string;
    wrap?: boolean;
    valueMaxPct?: number;
    /** List-wide value conversion / time format; the entry's own settings win. */
    listTransform?: ValueTransformSettings;
    /** Conditional formatting for this row's value (issue #572). */
    cond?: ElementCondResult;
}) {
    const t = useT();
    // Display-only conversion — text output only, never the writing controls.
    const disp = entryValueText(entry, listTransform, val, decimals, numFmt, t);
    // A condition beats the colour scale — the scale is the default, the rule the
    // exception. Inline weight/style also beat the Tailwind font classes below.
    const condColor = cond?.color;
    const condFont = {
        fontWeight: cond?.bold ? 700 : undefined,
        fontStyle: cond?.italic ? ('italic' as const) : undefined,
    };
    // A rule may replace the value outright — "true" becomes "ONLINE". No control is
    // drawn for it then: the row states a fact instead of offering a switch. No hook
    // runs below this point, so the early return is safe.
    if (cond?.hide) return null;
    if (cond?.text !== undefined)
        return (
            <span className="text-xs font-medium tabular-nums" style={{ color: condColor, ...condFont }}>
                {cond.text}
            </span>
        );
    // For text-style value spans: drop shrink-0 + allow wrapping when wrap=true.
    // maxWidth caps the value (default 50%) so the label always keeps a guaranteed share.
    const textValueCls = wrap
        ? 'text-xs font-medium tabular-nums whitespace-normal break-words [overflow-wrap:anywhere] min-w-0 text-right'
        : 'shrink-0 text-xs font-medium tabular-nums';
    const valueMaxStyle: React.CSSProperties | undefined = wrap ? { maxWidth: `${valueMaxPct ?? 50}%` } : undefined;
    const trueLabel = entry.trueLabel ?? trueText;
    const falseLabel = entry.falseLabel ?? falseText;
    const hasLabels = !!(trueLabel || falseLabel);
    const isBool = typeof val === 'boolean';
    const isBoolLike = (isBool || (typeof val === 'number' && (val === 0 || val === 1))) && !isNumericRole(entry.role);
    const on = val === true || val === 1;

    // Rich control types — shared with the static list (see entryControls).
    const dt = entry.displayType ?? 'auto';
    if (dt === 'shutter') return <ShutterControl entry={entry} val={val} setState={setState} />;
    if (dt === 'stepper')
        return (
            <StepperControl
                entry={entry}
                val={val}
                setState={setState}
                decimals={decimals}
                numFmt={numFmt}
                // The stepper prints the raw value (it writes it back), so its colour
                // must be matched against that value, not the converted one.
                valueColor={getThresholdColor(val, thresholds)}
            />
        );
    if (dt === 'buttons')
        return <PresetButtons entry={entry} val={val} setState={setState} activeColor={activeColor} />;
    if (dt === 'momentary') return <MomentaryButton entry={entry} setState={setState} />;
    if (dt === 'states') return <StateDisplay entry={entry} val={val} />;
    if (dt === 'contact') return <ContactDisplay entry={entry} val={val} />;
    if (dt === 'time')
        return (
            <TimeDisplay
                entry={entry}
                val={disp.value}
                className={textValueCls}
                style={{ ...valueMaxStyle, ...condFont, color: 'var(--text-primary)' }}
            />
        );
    if (dt === 'datepicker') return <DateEntryControl entry={entry} val={val} setState={setState} />;
    if (dt === 'input') return <InputControl entry={entry} val={val} setState={setState} />;

    // Role-based display for sensors (window, door, motion, smoke, …)
    if (isBoolLike && !hasLabels) {
        const roleDisplay = getRoleDisplay(entry.role, val);
        if (roleDisplay) {
            return (
                <span
                    className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full"
                    style={{ background: `${roleDisplay.color}22`, color: roleDisplay.color }}
                >
                    {roleDisplay.label}
                </span>
            );
        }
    }

    if (isBoolLike) {
        if (hasLabels) {
            const fill = on ? activeColor : inactiveColor;
            return (
                <button
                    onClick={writable ? () => setState(entry.id, isBool ? !on : on ? 0 : 1) : undefined}
                    className="shrink-0 text-xs px-2.5 py-0.5 rounded-full font-medium"
                    style={{
                        background: `color-mix(in srgb, ${fill} 18%, transparent)`,
                        color: fill,
                        cursor: writable ? 'pointer' : 'default',
                    }}
                >
                    {on ? trueLabel || 'AN' : falseLabel || 'AUS'}
                </button>
            );
        }
        if (!writable) {
            return (
                <span
                    className="shrink-0 relative w-9 h-[18px] rounded-full pointer-events-none"
                    style={{ background: on ? activeColor : 'var(--app-border)' }}
                >
                    <span
                        className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white"
                        style={{ left: on ? 'calc(100% - 16px)' : '2px' }}
                    />
                </span>
            );
        }
        return (
            <button
                onClick={() => setState(entry.id, isBool ? !on : on ? 0 : 1)}
                className="shrink-0 relative w-9 h-[18px] rounded-full transition-colors"
                style={{ background: on ? activeColor : 'var(--app-border)' }}
            >
                <span
                    className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all"
                    style={{ left: on ? 'calc(100% - 16px)' : '2px' }}
                />
            </button>
        );
    }

    const thresholdColor = getThresholdColor(disp.value, thresholds);

    if (typeof val === 'number' && isDimmerRole(entry.id)) {
        if (!writable) {
            return (
                <span
                    className={textValueCls}
                    style={{
                        ...valueMaxStyle,
                        ...condFont,
                        color: condColor ?? thresholdColor ?? 'var(--text-primary)',
                    }}
                >
                    {Math.round(val)}
                    {entry.unit ?? '%'}
                </span>
            );
        }
        return (
            <div className="shrink-0 flex items-center gap-1.5">
                <input
                    type="range"
                    min={0}
                    max={100}
                    value={val}
                    onChange={(e) => setState(entry.id, Number(e.target.value))}
                    className="w-20 h-1"
                    style={{ accentColor: 'var(--accent)' }}
                />
                <span
                    className="text-[10px] w-8 text-right tabular-nums"
                    style={{ color: condColor ?? thresholdColor ?? 'var(--text-secondary)' }}
                >
                    {Math.round(val)}
                    {entry.unit ?? '%'}
                </span>
            </div>
        );
    }

    return (
        <span
            className={textValueCls}
            style={{ ...valueMaxStyle, ...condFont, color: condColor ?? thresholdColor ?? 'var(--text-primary)' }}
        >
            {disp.text != null ? `${disp.text}${entry.unit && !disp.isTime ? ` ${entry.unit}` : ''}` : '–'}
        </span>
    );
}

// ── Value display: card variant (larger) ──────────────────────────────────────

function CardEntryValue({
    entry,
    val,
    writable,
    setState,
    thresholds,
    decimals,
    numFmt,
    activeColor,
    inactiveColor,
    trueText,
    falseText,
    wrap,
    valueMaxPct: _valueMaxPct,
    listTransform,
    cond,
}: {
    entry: AutoListEntry;
    val: ioBrokerState['val'];
    writable: boolean;
    setState: (id: string, v: boolean | number | string) => void;
    thresholds?: ColorThreshold[];
    decimals: number;
    numFmt?: NumberFormat;
    activeColor: string;
    inactiveColor: string;
    trueText?: string;
    falseText?: string;
    wrap?: boolean;
    /** Accepted for API parity with EntryValue; card layout is vertical so the cap doesn't apply. */
    valueMaxPct?: number;
    /** List-wide value conversion / time format; the entry's own settings win. */
    listTransform?: ValueTransformSettings;
    /** Conditional formatting for this row's value (issue #572). */
    cond?: ElementCondResult;
}) {
    const t = useT();
    // Display-only conversion — text output only, never the writing controls.
    const disp = entryValueText(entry, listTransform, val, decimals, numFmt, t);
    // A condition beats the colour scale — the scale is the default, the rule the
    // exception. Inline weight/style also beat the Tailwind font classes below.
    const condColor = cond?.color;
    const condFont = {
        fontWeight: cond?.bold ? 700 : undefined,
        fontStyle: cond?.italic ? ('italic' as const) : undefined,
    };
    // A rule may replace the value outright — "true" becomes "ONLINE". No control is
    // drawn for it then: the row states a fact instead of offering a switch. No hook
    // runs below this point, so the early return is safe.
    if (cond?.hide) return null;
    if (cond?.text !== undefined)
        return (
            <span className="text-xs font-medium tabular-nums" style={{ color: condColor, ...condFont }}>
                {cond.text}
            </span>
        );
    // Card text values: add break-words when wrap=true so long single tokens still break.
    const cardTextWrap = wrap ? 'break-words [overflow-wrap:anywhere]' : '';
    const trueLabel = entry.trueLabel ?? trueText;
    const falseLabel = entry.falseLabel ?? falseText;
    const hasLabels = !!(trueLabel || falseLabel);
    const isBool = typeof val === 'boolean';
    const isBoolLike = (isBool || (typeof val === 'number' && (val === 0 || val === 1))) && !isNumericRole(entry.role);
    const on = val === true || val === 1;

    // Rich control types — shared with the static list (see entryControls).
    const dt = entry.displayType ?? 'auto';
    if (dt === 'shutter') return <ShutterControl entry={entry} val={val} setState={setState} />;
    if (dt === 'stepper')
        return (
            <StepperControl
                entry={entry}
                val={val}
                setState={setState}
                decimals={decimals}
                numFmt={numFmt}
                // The stepper prints the raw value (it writes it back), so its colour
                // must be matched against that value, not the converted one.
                valueColor={getThresholdColor(val, thresholds)}
            />
        );
    if (dt === 'buttons')
        return <PresetButtons entry={entry} val={val} setState={setState} activeColor={activeColor} />;
    if (dt === 'momentary') return <MomentaryButton entry={entry} setState={setState} />;
    if (dt === 'states') return <StateDisplay entry={entry} val={val} />;
    if (dt === 'contact') return <ContactDisplay entry={entry} val={val} />;
    if (dt === 'time')
        return (
            <TimeDisplay
                entry={entry}
                val={disp.value}
                className={`text-xl font-bold tabular-nums text-center leading-none ${cardTextWrap}`}
                style={{ color: condColor ?? 'var(--text-primary)', ...condFont }}
            />
        );
    if (dt === 'datepicker') return <DateEntryControl entry={entry} val={val} setState={setState} fullWidth />;
    if (dt === 'input') return <InputControl entry={entry} val={val} setState={setState} fullWidth />;

    // Role-based display for sensors
    if (isBoolLike && !hasLabels) {
        const roleDisplay = getRoleDisplay(entry.role, val);
        if (roleDisplay) {
            return (
                <span
                    className="w-full py-1.5 rounded-lg text-xs font-semibold text-center block"
                    style={{ background: `${roleDisplay.color}22`, color: roleDisplay.color }}
                >
                    {roleDisplay.label}
                </span>
            );
        }
    }

    if (isBoolLike) {
        if (hasLabels) {
            const fill = on ? activeColor : inactiveColor;
            return (
                <button
                    onClick={writable ? () => setState(entry.id, isBool ? !on : on ? 0 : 1) : undefined}
                    className="w-full py-1.5 rounded-lg text-xs font-semibold"
                    style={{
                        background: `color-mix(in srgb, ${fill} 18%, transparent)`,
                        color: fill,
                        cursor: writable ? 'pointer' : 'default',
                    }}
                >
                    {on ? trueLabel || 'AN' : falseLabel || 'AUS'}
                </button>
            );
        }
        return (
            <button
                onClick={writable ? () => setState(entry.id, isBool ? !on : on ? 0 : 1) : undefined}
                className="w-full py-1.5 rounded-lg text-xs font-semibold"
                style={{
                    background: on ? activeColor : 'var(--app-border)',
                    color: on ? '#fff' : 'var(--text-secondary)',
                    cursor: writable ? 'pointer' : 'default',
                }}
            >
                {on ? 'AN' : 'AUS'}
            </button>
        );
    }

    const thresholdColor = getThresholdColor(disp.value, thresholds);

    if (typeof val === 'number' && isDimmerRole(entry.id)) {
        if (!writable) {
            return (
                <span
                    className="text-xl font-bold tabular-nums"
                    style={{ color: condColor ?? thresholdColor ?? 'var(--text-primary)' }}
                >
                    {Math.round(val)}
                    <span className="text-sm ml-0.5 font-normal" style={{ color: 'var(--text-secondary)' }}>
                        {entry.unit ?? '%'}
                    </span>
                </span>
            );
        }
        return (
            <div className="w-full flex flex-col items-center gap-1">
                <span
                    className="text-xl font-bold tabular-nums"
                    style={{ color: condColor ?? thresholdColor ?? 'var(--text-primary)' }}
                >
                    {Math.round(val)}
                    <span className="text-sm ml-0.5 font-normal" style={{ color: 'var(--text-secondary)' }}>
                        {entry.unit ?? '%'}
                    </span>
                </span>
                <input
                    type="range"
                    min={0}
                    max={100}
                    value={val}
                    onChange={(e) => setState(entry.id, Number(e.target.value))}
                    className="w-full h-1.5 rounded-full"
                    style={{ accentColor: 'var(--accent)' }}
                />
            </div>
        );
    }

    return (
        <span
            className={`text-xl font-bold tabular-nums text-center leading-none ${cardTextWrap}`}
            style={{ color: condColor ?? thresholdColor ?? 'var(--text-primary)', ...condFont }}
        >
            {disp.text ?? '–'}
            {entry.unit && !disp.isTime && (
                <span className="text-sm ml-0.5 font-normal" style={{ color: 'var(--text-secondary)' }}>
                    {entry.unit}
                </span>
            )}
        </span>
    );
}

// ── Room section heading (used when groupByRoom is on) ────────────────────────

function RoomHeader({ room, style }: { room: string; style?: React.CSSProperties }) {
    return (
        <div
            className="aura-room-header px-3 py-1 text-[10px] font-semibold uppercase tracking-wide truncate"
            style={{
                color: 'var(--text-secondary)',
                background: 'color-mix(in srgb, var(--text-secondary) 8%, transparent)',
                borderTop: '1px solid var(--widget-border)',
                borderBottom: '1px solid var(--widget-border)',
                ...style,
            }}
        >
            {room}
        </div>
    );
}

// ── Main Widget ───────────────────────────────────────────────────────────────

export function AutoListWidget({ config, editMode, onConfigChange }: WidgetProps) {
    const opts = useMemo(() => (config.options ?? { entries: [] }) as unknown as AutoListOptions, [config.options]);
    const entries = useMemo<AutoListEntry[]>(() => (opts.entries ?? []).filter((e) => !!e?.id), [opts.entries]);
    // Inside an auto-height popup-view: render the full list without an inner scrollbar
    // so the popup grid (and dialog) can grow to fit every row. Off elsewhere.
    const autoHeight = usePopupAutoHeight();
    const t = useT();
    const { defaultDecimals, numberFormat: globalNumFmt } = useGlobalSettingsStore();
    const decimals = (opts.decimals as number) ?? defaultDecimals;
    const numFmt = opts.numberFormat ?? globalNumFmt;
    const { subscribe, setState, getState } = useIoBroker();
    const [states, setStates] = useState<Record<string, ioBrokerState | null>>({});
    const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});
    const [resolvedRooms, setResolvedRooms] = useState<Record<string, string[]>>({});
    const [syncing, setSyncing] = useState(false);
    const [lastChangedTs, setLastChangedTs] = useState(0);
    // Frontend filter is a per-viewer runtime toggle held in local state — it is
    // NOT persisted back to config. The read-only frontend runs useConfigSync with
    // ignoreDirty (remote wins) + a 30 s poll, so any frontend write to valueFilter
    // would be overwritten on the next sync and reset the filter. Local-only state
    // applies instantly and survives syncs; the effect only adopts the admin-set
    // default on load / when the admin genuinely changes it.
    const [viewFilter, setViewFilter] = useState<string>(opts.valueFilter ?? 'all');
    useEffect(() => {
        setViewFilter(opts.valueFilter ?? 'all');
    }, [opts.valueFilter]);
    // Free-text search: same reasoning as the filter mode — per viewer, never persisted.
    const [searchTerm, setSearchTerm] = useState('');
    const syncMs = (opts.syncIntervalMin ?? 5) * 60_000;
    const layout = config.layout ?? 'default';
    // Row click -> detail popup for that datapoint (issue #524).
    const rowPopup = useRowPopup(config, opts, editMode);

    // ── Second line: extra datapoints per row ──────────────────────────────────
    // Two sources, the entry's own list beating the list-wide template: hand-picked
    // datapoints on a single entry, or the template resolved against each row's own
    // datapoint ({{parent}}.BATTERY & co.). The template is what makes this usable on
    // a list whose rows come from a filter - see utils/subDpTemplate.
    const subDpTemplate = opts.subDpTemplate;
    const entrySubDps = useMemo(() => {
        const map = new Map<string, EntrySubDp[]>();
        for (const e of entries) {
            const own = ownSubDps(e);
            map.set(e.id, own.length ? own : resolveSubDpTemplate(subDpTemplate, e.id));
        }
        return map;
    }, [entries, subDpTemplate]);
    // Outside the entry subscription above: second-line datapoints take no part in
    // sorting or the statistics line, so they get their own read-only subscription
    // (the same hook the value widget uses for its template datapoints). Filter
    // presets and the free-text search DO read them - see utils/listFilter.
    const subDpRefs = useMemo(() => [...new Set([...entrySubDps.values()].flat().map((s) => s.id))], [entrySubDps]);
    const subValues = useTemplateValues(subDpRefs);
    // Metadata of the datapoints a TEMPLATE resolved to. Two jobs: it tells apart
    // "datapoint exists" from "device does not have it" (so a thermostat without
    // BATTERY does not add a dash to its row), and it supplies the unit the template
    // itself cannot know per device. Hand-picked subDps skip this - the user named
    // that exact datapoint and gets a dash if it is missing, like in the static list.
    const templateIds = useMemo(
        () =>
            subDpTemplate?.length
                ? [
                      ...new Set(
                          entries
                              .filter((e) => ownSubDps(e).length === 0)
                              .flatMap((e) => (entrySubDps.get(e.id) ?? []).map((s) => s.id)),
                      ),
                  ]
                : [],
        [entries, entrySubDps, subDpTemplate],
    );
    const templateIdKey = templateIds.join(',');
    const [templateMeta, setTemplateMeta] = useState<Record<string, { unit?: string }>>({});
    useEffect(() => {
        if (!templateIdKey) {
            setTemplateMeta({});
            return;
        }
        let cancelled = false;
        ensureDatapointCache()
            .then((cache) => {
                if (cancelled) return;
                const byId = new Map(cache.map((c) => [c.id, c]));
                const meta: Record<string, { unit?: string }> = {};
                for (const id of templateIdKey.split(',')) {
                    const found = byId.get(id);
                    if (found) meta[id] = { unit: found.unit };
                }
                setTemplateMeta(meta);
            })
            .catch(() => {
                /* offline - the live-value fallback below still shows what answers */
            });
        return () => {
            cancelled = true;
        };
    }, [templateIdKey]);

    const hideMissingSubDps = opts.subDpTemplateHideMissing !== false;
    // ── Conditional formatting (issue #572) ──────────────────────────────────
    // One hook for the whole list — rows and their second-line datapoints alike.
    // Per row the list-wide rules come first and the entry's own ones after, so the
    // entry wins per field simply by being later in the array.
    const condItems = useMemo<ElementCondInput[]>(() => {
        const listRules = opts.rowConditions ?? [];
        const out: ElementCondInput[] = [];
        for (const e of entries) {
            const rules = e.conditions?.length ? [...listRules, ...e.conditions] : listRules;
            if (rules.length) out.push({ key: e.id, dp: e.id, value: states[e.id]?.val ?? null, rules });
            for (const sub of entrySubDps.get(e.id) ?? []) {
                if (!sub?.id || !sub.conditions?.length) continue;
                out.push({
                    key: subCondKey(e.id, sub.id),
                    dp: sub.id,
                    value: subValues[sub.id] ?? null,
                    rules: sub.conditions,
                });
            }
        }
        return out;
    }, [entries, opts.rowConditions, states, subValues, entrySubDps]);
    const conds = useElementConditionStyles(condItems);

    const subLineFor = (entry: AutoListEntry) => {
        const list = entrySubDps.get(entry.id);
        if (!list?.length) return null;
        const own = ownSubDps(entry).length > 0;
        // A datapoint missing from the cache but answering with a value counts as
        // present: the cache can still be loading, and it lags fresh objects.
        const usable =
            own || !hideMissingSubDps
                ? list
                : list.filter((s) => templateMeta[s.id] !== undefined || subValues[s.id] != null);
        if (!usable.length) return null;
        const resolved = own ? usable : usable.map((s) => (s.unit ? s : { ...s, unit: templateMeta[s.id]?.unit }));
        return (
            <EntrySubLine
                subDps={resolved}
                values={subValues}
                listTransform={opts}
                decimals={decimals}
                numFmt={numFmt}
                entryId={entry.id}
                conds={conds}
            />
        );
    };

    const saveOpts = useCallback(
        (patch: Partial<AutoListOptions>) => {
            onConfigChange({ ...config, options: { ...opts, ...patch } });
        },
        [config, opts, onConfigChange],
    );

    const entryKey = entries.map((e) => e.id).join(',');
    // NB: keyed on entryKey only — no prevKey guard. A prevKey ref survives the
    // StrictMode mount→unmount→remount cycle and would make the remount skip
    // re-subscribing (after the unmount tore the subscriptions down), leaving
    // the list with zero live subscriptions in dev.
    useEffect(() => {
        if (entries.length === 0) return;
        entries.forEach((e) => getState(e.id).then((s) => setStates((prev) => ({ ...prev, [e.id]: s }))));
        const unsubs = entries.map((e) =>
            subscribe(e.id, (s) => {
                setStates((prev) => ({ ...prev, [e.id]: s }));
                if (s) setLastChangedTs((prev) => Math.max(prev, s.lc > 0 ? s.lc : s.ts));
            }),
        );
        ensureDatapointCache().then((cache) => {
            const nameUpdates: Record<string, string> = {};
            const roomUpdates: Record<string, string[]> = {};
            for (const e of entries) {
                const found = cache.find((c) => c.id === e.id);
                if (!found) continue;
                if (!e.label && found.name) nameUpdates[e.id] = found.name;
                // Resolve rooms live so grouping reflects current enum assignments even when
                // the stored entry was added without rooms (e.g. via the datapoint picker).
                if (found.rooms?.length) roomUpdates[e.id] = found.rooms;
            }
            if (Object.keys(nameUpdates).length > 0) setResolvedNames((prev) => ({ ...prev, ...nameUpdates }));
            if (Object.keys(roomUpdates).length > 0) setResolvedRooms((prev) => ({ ...prev, ...roomUpdates }));
        });
        return () => unsubs.forEach((u) => u());
    }, [entryKey]); // eslint-disable-line react-hooks/exhaustive-deps

    const runSync = useCallback(async () => {
        const hasFilter =
            opts.filterRoles ||
            opts.filterIdPattern ||
            opts.filterRooms ||
            opts.filterFuncs ||
            opts.filterEnums ||
            opts.filterTypes ||
            opts.filterAdapters;
        if (!hasFilter) return;
        setSyncing(true);
        try {
            const found = await discoverDatapoints(opts);
            const filtered = (opts.filterRelevant ?? true) ? found.filter((d) => d.isRelevant) : found;
            const existingIds = new Set(entries.map((e) => e.id));
            const newEntries = filtered
                .filter((d) => !existingIds.has(d.id))
                .map((d) => ({
                    id: d.id,
                    label: undefined as string | undefined,
                    rooms: d.rooms,
                    unit: d.unit,
                    role: d.role,
                    writable: d.write,
                }));
            if (newEntries.length > 0) {
                saveOpts({ entries: [...entries, ...newEntries] });
                saveAll();
                // Scoped: the frontend must not push its theme/groups/popup-config
                // copy along with a dashboard edit.
                saveToIoBroker({ only: ['aura-dashboard'] });
            }
        } finally {
            setSyncing(false);
        }
    }, [opts, entries, saveOpts]);

    useEffect(() => {
        const timer = setInterval(runSync, syncMs);
        return () => clearInterval(timer);
    }, [runSync, syncMs]);

    // Label pipeline: composed name → name pattern (incl. the `{{parent}}` variables) →
    // live `[[dp]]` values. The last step is a hook, so the raw labels of every entry are
    // collected first and the resolver subscribes to all referenced datapoints at once.
    const baseName = (entry: AutoListEntry) =>
        applyDpNameFilter(entry.label || resolvedNames[entry.id] || entry.id.split('.').pop() || entry.id);
    const rawLabel = (entry: AutoListEntry) =>
        formatItemName(
            { id: entry.id, name: baseName(entry), room: entry.rooms?.[0] },
            opts.namePattern,
            opts.nameFilters,
        );
    const resolveDpTokens = useDpTokenResolver(entries.map(rawLabel));
    const getLabel = (entry: AutoListEntry) => {
        const raw = rawLabel(entry);
        if (!hasLiveToken(raw)) return raw;
        const base = baseName(entry);
        // 'Ergebnis' rules were deferred until the value was in — see finishItemName.
        return finishItemName(resolveDpTokens(raw, base), opts.nameFilters, base);
    };

    // ── Value filter ───────────────────────────────────────────────────────────
    // Driven by local state so frontend clicks take effect immediately, not
    // only after the config sync round-trips back from the backend. The menu holds
    // the built-ins plus the admin's own presets; a mode that no longer exists
    // (deleted preset) falls back to 'all' instead of hiding every row.
    const filterChoices = useMemo(() => buildFilterChoices(opts), [opts]);
    const valueFilter = normalizeFilterMode(viewFilter, filterChoices);

    // Everything a filter rule / the free-text search may look at for one row: the main
    // value plus the second line's extra datapoints - per entry or resolved from the
    // list-wide template, exactly as they are rendered.
    const filterRow = (entry: AutoListEntry): ListFilterRow => ({
        id: entry.id,
        label: getLabel(entry),
        value: states[entry.id]?.val ?? null,
        subs: (entrySubDps.get(entry.id) ?? []).map((s) => ({
            id: s.id,
            label: s.label,
            value: subValues[s.id] ?? null,
        })),
    });

    // In editMode the Aura admin view honors a separate backendValueFilter so
    // the editor preview can show what users will see (e.g. only active entries).
    const backendValueFilter = opts.backendValueFilter ?? 'all';
    const effectiveFilter = editMode ? backendValueFilter : valueFilter;
    // The search is a frontend-only affordance; the editor preview ignores it. A term
    // typed before the admin hid the field (or the whole chip) is dropped too -
    // otherwise it would keep filtering with no way left to clear it.
    const searchReachable = !opts.hideFilterSearch && !opts.hideFilterButton;
    const effectiveSearch = editMode || !searchReachable ? '' : searchTerm;

    const visibleEntries = useMemo(() => {
        let result =
            effectiveFilter === 'all' && !effectiveSearch.trim()
                ? entries
                : entries.filter((e) => {
                      const row = filterRow(e);
                      return (
                          matchesFilterMode(effectiveFilter, opts.filterPresets, row) &&
                          matchesSearch(row, effectiveSearch)
                      );
                  });
        const sortBy = opts.sortBy ?? 'none';
        const sortOrder = opts.sortOrder ?? 'asc';
        const sortBy2 = opts.sortBy2 ?? 'none';
        const sortOrder2 = opts.sortOrder2 ?? 'asc';
        if (sortBy !== 'none') {
            const cmpFor = (key: 'label' | 'value', a: AutoListEntry, b: AutoListEntry) =>
                key === 'label'
                    ? getLabel(a).localeCompare(getLabel(b), undefined, { numeric: true, sensitivity: 'base' })
                    : compareVals(states[a.id]?.val ?? null, states[b.id]?.val ?? null);
            result = [...result].sort((a, b) => {
                const cmp1 = cmpFor(sortBy, a, b);
                if (cmp1 !== 0) return sortOrder === 'desc' ? -cmp1 : cmp1;
                if (sortBy2 !== 'none' && sortBy2 !== sortBy) {
                    const cmp2 = cmpFor(sortBy2, a, b);
                    return sortOrder2 === 'desc' ? -cmp2 : cmp2;
                }
                return 0;
            });
        }
        return result;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        entries,
        states,
        subValues,
        entrySubDps,
        effectiveFilter,
        effectiveSearch,
        opts.filterPresets,
        opts.sortBy,
        opts.sortOrder,
        opts.sortBy2,
        opts.sortOrder2,
        resolvedNames,
    ]);

    // ── Room grouping ────────────────────────────────────────────────────────────
    // Partition the (already filtered + sorted) entries by their first room. The
    // room name is rendered as a section heading; entries without a room fall into
    // a trailing bucket labelled noRoomLabel. Returns null when grouping is off.
    const groupByRoom = !!opts.groupByRoom;
    const roomSections = useMemo<{ room: string; entries: AutoListEntry[] }[] | null>(() => {
        if (!groupByRoom) return null;
        const NO_ROOM = '\u0000'; // sorts/keys the no-room bucket without clashing with a real room
        const map = new Map<string, AutoListEntry[]>();
        for (const e of visibleEntries) {
            const rooms = resolvedRooms[e.id] ?? e.rooms;
            const key = rooms?.[0] ?? NO_ROOM;
            const arr = map.get(key);
            if (arr) arr.push(e);
            else map.set(key, [e]);
        }
        const noRoomLabel = opts.noRoomLabel || 'Ohne Raum';
        return [...map.keys()]
            .sort((a, b) => {
                if (a === NO_ROOM) return 1;
                if (b === NO_ROOM) return -1;
                return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
            })
            .map((key) => ({ room: key === NO_ROOM ? noRoomLabel : key, entries: map.get(key)! }));
    }, [groupByRoom, visibleEntries, resolvedRooms, opts.noRoomLabel]);

    // Count published to ioBroker state = view-mode count using the frontend valueFilter,
    // independent from backendValueFilter (which only affects the editor preview) and
    // from the free-text search (a per-viewer, transient narrowing).
    const viewCount = useMemo(() => {
        if (valueFilter === 'all') return entries.length;
        return entries.filter((e) => matchesFilterMode(valueFilter, opts.filterPresets, filterRow(e))).length;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entries, states, subValues, entrySubDps, valueFilter, opts.filterPresets]);

    useEffect(() => {
        if (!opts.publishCount) return;
        // The published name is a plain string — [[dp]] tokens are a display feature.
        // `config.title` is deliberately NOT a dependency: it only names the object on
        // the first publish, and a title with a live token would otherwise re-fire this
        // effect (and rewrite the unchanged count) on every value change.
        publishListCount(config.id, stripDpTokens(config.title || '') || 'Dynamische Liste', viewCount);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opts.publishCount, viewCount, config.id]);

    // Aggregate (sum / avg / min / max) of numeric values from visible entries.
    const sumInfo = useMemo(
        () => (opts.showSum ? computeListStats(visibleEntries, states, opts) : null),
        [visibleEntries, states, opts],
    );

    useEffect(() => {
        if (opts.publishCount) return;
        unpublishList(config.id).catch(() => {
            /* ignore */
        });
    }, [opts.publishCount, config.id]);

    // ── Group action control (switch / dimmer / shutter / momentary) ────────────
    const groupSwitchEnabled = !!opts.groupSwitch;
    const groupActionType = (opts.groupActionType ?? 'switch') as GroupActionType;
    const groupExcludeSet = useMemo(() => new Set(opts.groupExcludeIds ?? []), [opts.groupExcludeIds]);
    const groupSwitchTargets = useMemo<GroupTarget[]>(() => {
        if (!groupSwitchEnabled || groupActionType !== 'switch') return [];
        return entries
            .filter((e) => !groupExcludeSet.has(e.id))
            .map((e) => listEntryTarget(e, states[e.id]?.val ?? null, opts))
            .filter((x): x is GroupTarget => x !== null);
    }, [groupSwitchEnabled, groupActionType, entries, states, opts, groupExcludeSet]);
    const groupDimmerIds = useMemo(
        () => (groupSwitchEnabled ? listDimmerIds(entries, groupExcludeSet) : []),
        [groupSwitchEnabled, entries, groupExcludeSet],
    );
    const groupShutterTargets = useMemo(
        () => (groupSwitchEnabled ? listShutterTargets(entries, groupExcludeSet) : []),
        [groupSwitchEnabled, entries, groupExcludeSet],
    );
    const groupPulseIds = useMemo(
        () => (groupSwitchEnabled ? listPulseIds(entries, groupExcludeSet) : []),
        [groupSwitchEnabled, entries, groupExcludeSet],
    );
    const masterSwitch = groupSwitchEnabled ? (
        <GroupActionControl
            type={groupActionType}
            cfg={opts}
            setState={setState}
            switchTargets={groupSwitchTargets}
            dimmerIds={groupDimmerIds}
            shutterTargets={groupShutterTargets}
            pulseIds={groupPulseIds}
            editing={editMode}
            placeholderHint={t('group.masterPlaceholder')}
            placeholderLabel={t('group.masterPlaceholderShort')}
        />
    ) : null;

    const o = config.options ?? {};
    const showTitle = opts.showTitle !== false;
    const showIcon = o.showIcon !== false;
    const iconSize = (o.iconSize as number) || 20;
    const titleAlign = (o.titleAlign as string) ?? 'left';
    const showCount = opts.showCount !== false;
    const showLastChange = !!o.showLastChange;
    const lastChangePos = (o.lastChangePosition as string) ?? 'left';

    const lcOverlay =
        showLastChange && lastChangedTs > 0
            ? (() => {
                  const text = formatLastChange(
                      t as (k: string, v?: Record<string, string | number>) => string,
                      lastChangedTs,
                  );
                  const posStyle: React.CSSProperties =
                      lastChangePos === 'center'
                          ? {
                                position: 'absolute',
                                bottom: 6,
                                left: '50%',
                                transform: 'translateX(-50%)',
                                whiteSpace: 'nowrap',
                            }
                          : lastChangePos === 'right'
                            ? { position: 'absolute', bottom: 6, right: 8 }
                            : { position: 'absolute', bottom: 6, left: 8 };
                  return (
                      <div
                          className="aura-last-change pointer-events-none text-[8px] opacity-50 whitespace-nowrap"
                          style={{ ...posStyle, color: 'var(--text-secondary)' }}
                      >
                          {text}
                      </div>
                  );
              })()
            : null;

    const globalThresholds = opts.colorThresholds;
    const globalActiveColor = opts.activeColor || 'var(--accent-green)';
    const globalInactiveColor = opts.inactiveColor || 'var(--text-secondary)';
    const globalActiveBg = opts.activeBg;
    const globalInactiveBg = opts.inactiveBg;
    const showDividers = opts.showDividers ?? true;
    const showEntryLastChange = !!opts.showEntryLastChange;
    const HeaderIcon = getWidgetIcon(o.icon as string | undefined, List);

    // ── Shared header ──────────────────────────────────────────────────────────
    const header =
        showTitle || showIcon || (opts.showSum && sumInfo) || masterSwitch ? (
            <div
                className="shrink-0 py-1.5 flex items-center justify-between"
                style={{ borderBottom: '1px solid var(--widget-border)' }}
            >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    {showIcon && (
                        <HeaderIcon
                            size={iconSize}
                            className="aura-widget-icon shrink-0"
                            style={{ color: 'var(--text-secondary)' }}
                        />
                    )}
                    <div className="flex-1 min-w-0">
                        {showTitle && (
                            <p
                                className="aura-widget-title text-xs font-semibold truncate"
                                style={{
                                    color: 'var(--text-secondary)',
                                    textAlign: titleAlign as React.CSSProperties['textAlign'],
                                }}
                            >
                                {config.title || 'Dynamische Liste'}
                                {showCount && entries.length > 0 && (
                                    <span className="ml-1 opacity-50">
                                        ({valueFilter !== 'all' ? `${visibleEntries.length}/` : ''}
                                        {entries.length})
                                    </span>
                                )}
                            </p>
                        )}
                        {opts.showSum && sumInfo && (
                            <StatLine
                                stats={sumInfo}
                                selected={opts.sumStats}
                                labels={opts.statLabels}
                                icons={opts.statIcons}
                                sumLabel={opts.sumLabel}
                                decimals={decimals}
                                numFmt={numFmt}
                                align={opts.sumAlign ?? 'left'}
                                fontSize={opts.sumFontSize ?? 10}
                            />
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    {masterSwitch}
                    {!opts.hideFilterButton && (
                        <ListFilterChip
                            choices={filterChoices}
                            value={valueFilter}
                            onChange={setViewFilter}
                            search={searchTerm}
                            onSearchChange={setSearchTerm}
                            showSearch={!opts.hideFilterSearch}
                            searchPlaceholder={opts.filterSearchPlaceholder}
                            label={filterModeLabel(valueFilter, filterChoices)}
                        />
                    )}
                    <button
                        onClick={runSync}
                        title="Jetzt synchronisieren"
                        className="hover:opacity-70 transition-opacity p-0.5"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>
        ) : null;

    const empty = (editMode ? entries.length === 0 : visibleEntries.length === 0) && (
        <div className="flex-1 flex items-center justify-center p-4">
            <p className="text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
                {entries.length === 0
                    ? `Noch keine Datenpunkte konfiguriert.${editMode ? ' Bearbeiten → Datenpunkte suchen.' : ''}`
                    : filterEmptyText(
                          effectiveFilter,
                          effectiveSearch,
                          filterModeLabel(effectiveFilter, filterChoices),
                      )}
            </p>
        </div>
    );

    // 'custom' is no longer offered for lists (utils/widgetLayouts NO_CUSTOM) and is
    // undocumented - the branch stays so dashboards that stored it keep rendering.
    if (layout === 'custom') return <CustomGridView config={config} value="" />;

    const wrap = !!opts.wrapText;
    const labelWrapCls = wrap ? 'break-words [overflow-wrap:anywhere]' : 'truncate';
    // Auto-height mode drops the fill-and-scroll classes so the list grows naturally.
    const rootHCls = autoHeight ? '' : 'h-full';
    const fillCls = autoHeight ? '' : 'aura-scroll flex-1 overflow-auto min-h-0';
    const labelMinPct = Math.max(10, Math.min(90, opts.labelMinPercent ?? 50));
    const valueMaxPct = 100 - labelMinPct;
    const labelContainerStyle: React.CSSProperties | undefined = wrap ? { minWidth: `${labelMinPct}%` } : undefined;

    // When grouping is off, render everything as one section with no heading (room=null).
    const sections: { room: string | null; entries: AutoListEntry[] }[] = roomSections ?? [
        { room: null, entries: visibleEntries },
    ];

    // Configurable look of the room section headings (merged into each call site's style;
    // empty values fall back to the RoomHeader component defaults).
    const roomHeaderStyle: React.CSSProperties = {
        ...(opts.roomHeaderColor ? { color: opts.roomHeaderColor } : {}),
        ...(opts.roomHeaderBg ? { background: opts.roomHeaderBg } : {}),
        ...(opts.roomHeaderFontSize ? { fontSize: `${opts.roomHeaderFontSize}px` } : {}),
    };

    // ── ANZAHL (count) — zeigt nur die Anzahl der Einträge ────────────────────
    if (layout === 'count') {
        const count = effectiveFilter === 'all' ? entries.length : visibleEntries.length;
        return (
            <div className="aura-widget-row relative flex flex-col items-center justify-center h-full gap-1">
                {showIcon && <HeaderIcon size={iconSize} style={{ color: 'var(--text-secondary)', opacity: 0.7 }} />}
                <span className="text-xl font-bold tabular-nums leading-none" style={{ color: 'var(--text-primary)' }}>
                    {count}
                </span>
                {showTitle && config.title && (
                    <span
                        className="text-xs truncate max-w-full px-2 text-center"
                        style={{
                            color: 'var(--text-secondary)',
                            textAlign: titleAlign as React.CSSProperties['textAlign'],
                        }}
                    >
                        {config.title}
                    </span>
                )}
                {lcOverlay}
            </div>
        );
    }

    // ── KACHELN (card) ─────────────────────────────────────────────────────────
    if (layout === 'card') {
        return (
            <div className={`aura-widget-row relative flex flex-col ${rootHCls}`}>
                {header}
                {empty}
                {rowPopup.node}
                {visibleEntries.length > 0 && (
                    <div className={`${fillCls} p-2 flex flex-col gap-2`}>
                        {sections.map((sec) => (
                            <div key={sec.room ?? '__all'}>
                                {sec.room != null && (
                                    <RoomHeader room={sec.room} style={{ ...roomHeaderStyle, marginBottom: 6 }} />
                                )}
                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: `repeat(auto-fill, minmax(${opts.cardMinWidth ?? 90}px, 1fr))`,
                                        gap: 6,
                                        alignContent: 'start',
                                    }}
                                >
                                    {sec.entries.map((entry) => {
                                        const state = states[entry.id] ?? null;
                                        const val = state?.val ?? null;
                                        const rc = conds.get(entry.id);
                                        if (rowHidden(rc)) return null;
                                        const cIcon = partOf(rc, 'icon');
                                        const cName = partOf(rc, 'name');
                                        const cValue = partOf(rc, 'value');
                                        // The dynamic list had no row icon at all (issue #572): it comes from the
                                        // entry, from the list-wide default, or from a rule.
                                        const iconName = cIcon.icon ?? entry.icon ?? opts.entryIcon;
                                        const EntryIcon =
                                            iconName && !cIcon.hide ? getWidgetIcon(iconName, null!) : null;
                                        const entryIconSize = entry.iconSize ?? opts.entryIconSize ?? 13;
                                        const label = getLabel(entry);
                                        const eOn = isActive(val);
                                        const entryActiveColor = entry.activeColor || globalActiveColor;
                                        const entryInactiveColor = entry.inactiveColor || globalInactiveColor;
                                        const stateBg =
                                            rc?.row?.bg ??
                                            ((eOn
                                                ? entry.activeBg || globalActiveBg
                                                : entry.inactiveBg || globalInactiveBg) ||
                                                'var(--app-bg)');
                                        const lcTs = showEntryLastChange ? state?.lc || state?.ts || 0 : 0;
                                        const rowProps = rowPopup.row(
                                            entry.id,
                                            label,
                                            { role: entry.role },
                                            entry.clickAction,
                                            entry.popupTitle,
                                            entry.popupHideTitle,
                                        );
                                        return (
                                            <div
                                                key={entry.id}
                                                className="rounded-xl p-2.5 flex flex-col gap-2 relative"
                                                style={{
                                                    background: stateBg,
                                                    border: '1px solid var(--widget-border)',
                                                    cursor: rowProps ? 'pointer' : undefined,
                                                }}
                                                {...rowProps}
                                            >
                                                <span
                                                    className={`flex items-center gap-1 text-[10px] leading-tight ${labelWrapCls}`}
                                                    style={{
                                                        color: cName.color ?? 'var(--text-secondary)',
                                                        fontWeight: cName.bold ? 700 : undefined,
                                                        fontStyle: cName.italic ? 'italic' : undefined,
                                                    }}
                                                >
                                                    {EntryIcon && (
                                                        <EntryIcon
                                                            size={entryIconSize}
                                                            className="shrink-0"
                                                            style={{
                                                                color:
                                                                    cIcon.iconColor ??
                                                                    cIcon.color ??
                                                                    'var(--text-secondary)',
                                                            }}
                                                        />
                                                    )}
                                                    {!cName.hide && (cName.text ?? label)}
                                                </span>
                                                <div className="flex items-center justify-center">
                                                    <CardEntryValue
                                                        cond={cValue}
                                                        entry={entry}
                                                        val={val}
                                                        writable={entry.writable !== false}
                                                        setState={setState}
                                                        thresholds={globalThresholds}
                                                        decimals={decimals}
                                                        numFmt={numFmt}
                                                        activeColor={entryActiveColor}
                                                        inactiveColor={entryInactiveColor}
                                                        trueText={opts.trueText}
                                                        falseText={opts.falseText}
                                                        wrap={wrap}
                                                        valueMaxPct={valueMaxPct}
                                                        listTransform={opts}
                                                    />
                                                </div>
                                                {subLineFor(entry)}
                                                {opts.showRoom && entry.rooms?.length ? (
                                                    <span
                                                        className="text-[9px] truncate opacity-50"
                                                        style={{ color: 'var(--text-secondary)' }}
                                                    >
                                                        {entry.rooms.join(', ')}
                                                    </span>
                                                ) : null}
                                                {lcTs > 0 && (
                                                    <div
                                                        className="aura-last-change text-[9px] truncate text-center"
                                                        style={{ color: 'var(--text-secondary)', opacity: 0.7 }}
                                                    >
                                                        {formatLastChange(
                                                            t as (
                                                                k: string,
                                                                v?: Record<string, string | number>,
                                                            ) => string,
                                                            lcTs,
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {lcOverlay}
            </div>
        );
    }

    // ── KOMPAKT (compact) — 2-column dense list ────────────────────────────────
    if (layout === 'compact') {
        return (
            <div className={`aura-widget-row relative flex flex-col ${rootHCls}`}>
                {header}
                {empty}
                {rowPopup.node}
                {visibleEntries.length > 0 && (
                    <div
                        className={fillCls}
                        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', alignContent: 'start' }}
                    >
                        {sections.map((sec) => (
                            <Fragment key={sec.room ?? '__all'}>
                                {sec.room != null && (
                                    <RoomHeader room={sec.room} style={{ ...roomHeaderStyle, gridColumn: '1 / -1' }} />
                                )}
                                {sec.entries.map((entry, i) => {
                                    const state = states[entry.id] ?? null;
                                    const val = state?.val ?? null;
                                    const rc = conds.get(entry.id);
                                    if (rowHidden(rc)) return null;
                                    const cIcon = partOf(rc, 'icon');
                                    const cName = partOf(rc, 'name');
                                    const cValue = partOf(rc, 'value');
                                    // The dynamic list had no row icon at all (issue #572): it comes from the
                                    // entry, from the list-wide default, or from a rule.
                                    const iconName = cIcon.icon ?? entry.icon ?? opts.entryIcon;
                                    const EntryIcon = iconName && !cIcon.hide ? getWidgetIcon(iconName, null!) : null;
                                    const entryIconSize = entry.iconSize ?? opts.entryIconSize ?? 13;
                                    const label = getLabel(entry);
                                    const isRight = i % 2 === 1;
                                    const eOn = isActive(val);
                                    const entryActiveColor = entry.activeColor || globalActiveColor;
                                    const entryInactiveColor = entry.inactiveColor || globalInactiveColor;
                                    const stateBg =
                                        rc?.row?.bg ??
                                        (eOn ? entry.activeBg || globalActiveBg : entry.inactiveBg || globalInactiveBg);
                                    const lcTs = showEntryLastChange ? state?.lc || state?.ts || 0 : 0;
                                    const rowProps = rowPopup.row(
                                        entry.id,
                                        label,
                                        { role: entry.role },
                                        entry.clickAction,
                                        entry.popupTitle,
                                        entry.popupHideTitle,
                                    );
                                    return (
                                        // Column wrapper so the second line spans the whole cell instead
                                        // of becoming a third flex item next to label and value.
                                        <div
                                            key={entry.id}
                                            className="flex flex-col gap-1 px-2 py-1.5"
                                            style={{
                                                background: stateBg,
                                                borderBottom: showDividers
                                                    ? '1px solid var(--widget-border)'
                                                    : undefined,
                                                borderLeft:
                                                    showDividers && isRight
                                                        ? '1px solid var(--widget-border)'
                                                        : undefined,
                                                cursor: rowProps ? 'pointer' : undefined,
                                            }}
                                            {...rowProps}
                                        >
                                            <div className={`flex gap-1.5 ${wrap ? 'items-start' : 'items-center'}`}>
                                                {EntryIcon && (
                                                    <EntryIcon
                                                        size={entryIconSize}
                                                        className="shrink-0"
                                                        style={{
                                                            color:
                                                                cIcon.iconColor ??
                                                                cIcon.color ??
                                                                'var(--text-secondary)',
                                                        }}
                                                    />
                                                )}
                                                <div className="flex-1 min-w-0" style={labelContainerStyle}>
                                                    <span
                                                        className={`block text-[11px] ${labelWrapCls}`}
                                                        style={{
                                                            color: cName.color ?? 'var(--text-primary)',
                                                            fontWeight: cName.bold ? 700 : undefined,
                                                            fontStyle: cName.italic ? 'italic' : undefined,
                                                        }}
                                                    >
                                                        {!cName.hide && (cName.text ?? label)}
                                                    </span>
                                                    {lcTs > 0 && (
                                                        <span
                                                            className="aura-last-change block text-[8px] truncate"
                                                            style={{ color: 'var(--text-secondary)', opacity: 0.7 }}
                                                        >
                                                            {formatLastChange(
                                                                t as (
                                                                    k: string,
                                                                    v?: Record<string, string | number>,
                                                                ) => string,
                                                                lcTs,
                                                            )}
                                                        </span>
                                                    )}
                                                </div>
                                                <EntryValue
                                                    cond={cValue}
                                                    entry={entry}
                                                    val={val}
                                                    writable={entry.writable !== false}
                                                    setState={setState}
                                                    thresholds={globalThresholds}
                                                    decimals={decimals}
                                                    numFmt={numFmt}
                                                    activeColor={entryActiveColor}
                                                    inactiveColor={entryInactiveColor}
                                                    trueText={opts.trueText}
                                                    falseText={opts.falseText}
                                                    wrap={wrap}
                                                    valueMaxPct={valueMaxPct}
                                                    listTransform={opts}
                                                />
                                            </div>
                                            {subLineFor(entry)}
                                        </div>
                                    );
                                })}
                            </Fragment>
                        ))}
                    </div>
                )}
                {lcOverlay}
            </div>
        );
    }

    // ── BADGES (minimal) — inline pill per entry ───────────────────────────────
    if (layout === 'minimal') {
        return (
            <div className={`aura-widget-row relative flex flex-col ${rootHCls}`}>
                {header}
                {empty}
                {rowPopup.node}
                {visibleEntries.length > 0 && (
                    <div className={`${fillCls} p-2 flex flex-wrap gap-1.5 content-start`}>
                        {sections.map((sec) => (
                            <Fragment key={sec.room ?? '__all'}>
                                {sec.room != null && (
                                    <RoomHeader
                                        room={sec.room}
                                        style={{ ...roomHeaderStyle, flexBasis: '100%', width: '100%' }}
                                    />
                                )}
                                {sec.entries.map((entry) => {
                                    const state = states[entry.id] ?? null;
                                    const val = state?.val ?? null;
                                    const rc = conds.get(entry.id);
                                    if (rowHidden(rc)) return null;
                                    const cIcon = partOf(rc, 'icon');
                                    const cName = partOf(rc, 'name');
                                    const cValue = partOf(rc, 'value');
                                    // The dynamic list had no row icon at all (issue #572): it comes from the
                                    // entry, from the list-wide default, or from a rule.
                                    const iconName = cIcon.icon ?? entry.icon ?? opts.entryIcon;
                                    const EntryIcon = iconName && !cIcon.hide ? getWidgetIcon(iconName, null!) : null;
                                    const entryIconSize = entry.iconSize ?? opts.entryIconSize ?? 13;
                                    const label = getLabel(entry);
                                    const writable = entry.writable !== false;
                                    // Rich controls have no compact pill form — show their value, no toggle.
                                    const lockValue =
                                        !!entry.displayType && NON_TOGGLE_DISPLAY_TYPES.has(entry.displayType);
                                    const trueLabel = entry.trueLabel ?? opts.trueText;
                                    const falseLabel = entry.falseLabel ?? opts.falseText;
                                    const hasLabels = !!(trueLabel || falseLabel);
                                    const isBool = typeof val === 'boolean';
                                    const isBoolLike = isBool || (typeof val === 'number' && (val === 0 || val === 1));
                                    const on = val === true || val === 1;
                                    // Multi-state mapping (window handle etc.): match the value to a
                                    // configured state so the badge shows its label + color + icon.
                                    const stateMatch =
                                        entry.displayType === 'states'
                                            ? (entry.states ?? []).find((s) => String(s.value) === String(val))
                                            : undefined;
                                    // Window/door contact mapping (HmIP/Boolean/… → closed/tilted/open).
                                    const contactMatch =
                                        entry.displayType === 'contact' ? resolveContactDisplay(entry, val) : undefined;
                                    // Display-only conversion / time format (per DP or list-wide).
                                    const disp = entryValueText(entry, opts, val, decimals, numFmt, t);
                                    // Time datapoint rendered as time/date instead of the raw value.
                                    const timeText =
                                        entry.displayType === 'time'
                                            ? formatEntryTime(entry, disp.value, t)
                                            : entry.displayType === 'datepicker'
                                              ? entryDateText(entry, val)
                                              : null;
                                    const roleDisplay =
                                        !stateMatch && !contactMatch && isBoolLike && !hasLabels
                                            ? getRoleDisplay(entry.role, val)
                                            : null;
                                    // Untouched entries keep printing the raw value unrounded —
                                    // that is the badge's established look.
                                    const plainText = disp.active ? disp.text : val != null ? String(val) : null;
                                    const valueStr =
                                        timeText ??
                                        (contactMatch
                                            ? contactMatch.label
                                            : stateMatch
                                              ? (stateMatch.label ?? String(stateMatch.value))
                                              : roleDisplay
                                                ? roleDisplay.label
                                                : isBoolLike && hasLabels
                                                  ? on
                                                      ? trueLabel || 'AN'
                                                      : falseLabel || 'AUS'
                                                  : plainText != null
                                                    ? `${plainText}${entry.unit && !disp.isTime ? `\u202f${entry.unit}` : ''}`
                                                    : '–');
                                    const entryActiveColor = entry.activeColor || globalActiveColor;
                                    const entryInactiveColor = entry.inactiveColor || globalInactiveColor;
                                    const eOn = isActive(val);
                                    const stateBg =
                                        rc?.row?.bg ??
                                        (eOn ? entry.activeBg || globalActiveBg : entry.inactiveBg || globalInactiveBg);
                                    const pillColor = contactMatch
                                        ? contactMatch.color
                                        : stateMatch
                                          ? (stateMatch.color ?? null)
                                          : roleDisplay
                                            ? roleDisplay.color
                                            : isBoolLike && on
                                              ? entryActiveColor
                                              : hasLabels
                                                ? entryInactiveColor
                                                : null;
                                    // A rule wins, then the display-type mapping, then the row icon.
                                    const BadgeIcon = cIcon.hide
                                        ? null
                                        : cIcon.icon
                                          ? getWidgetIcon(cIcon.icon, null!)
                                          : contactMatch
                                            ? getWidgetIcon(contactMatch.icon, null!)
                                            : stateMatch?.icon
                                              ? getWidgetIcon(stateMatch.icon, null!)
                                              : EntryIcon;
                                    const lcTs = showEntryLastChange ? state?.lc || state?.ts || 0 : 0;
                                    const lcText =
                                        lcTs > 0
                                            ? formatLastChange(
                                                  t as (k: string, v?: Record<string, string | number>) => string,
                                                  lcTs,
                                              )
                                            : '';

                                    // A badge is the whole row, so toggling and opening a popup
                                    // would collide: automatic mode only takes over badges that
                                    // have no toggle of their own (sensors, read-only, numeric).
                                    // An explicitly configured action beats the toggle.
                                    const togglable =
                                        writable &&
                                        !roleDisplay &&
                                        !lockValue &&
                                        isBoolLike &&
                                        !rowPopup.explicit(entry.clickAction);
                                    const rowProps = togglable
                                        ? undefined
                                        : rowPopup.row(
                                              entry.id,
                                              label,
                                              { role: entry.role },
                                              entry.clickAction,
                                              entry.popupTitle,
                                              entry.popupHideTitle,
                                          );
                                    return (
                                        <button
                                            key={entry.id}
                                            {...rowProps}
                                            onClick={(e) => {
                                                if (togglable) {
                                                    if (isBool) setState(entry.id, !on);
                                                    else setState(entry.id, on ? 0 : 1);
                                                    return;
                                                }
                                                rowProps?.onClick(e);
                                            }}
                                            title={lcText || undefined}
                                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors hover:opacity-80"
                                            style={{
                                                background:
                                                    stateBg ??
                                                    (pillColor
                                                        ? `color-mix(in srgb, ${pillColor} 12%, transparent)`
                                                        : 'var(--app-bg)'),
                                                color: pillColor ?? 'var(--text-secondary)',
                                                border: `1px solid ${stateBg ? 'transparent' : pillColor ? `color-mix(in srgb, ${pillColor} 34%, transparent)` : 'var(--widget-border)'}`,
                                                cursor: togglable || rowProps ? 'pointer' : 'default',
                                            }}
                                        >
                                            {BadgeIcon && (
                                                <BadgeIcon
                                                    size={entryIconSize}
                                                    className="shrink-0 opacity-70"
                                                    style={{ color: cIcon.iconColor ?? cIcon.color }}
                                                />
                                            )}
                                            <span
                                                className="opacity-70 truncate"
                                                style={{
                                                    maxWidth: 80,
                                                    color: cName.color,
                                                    fontWeight: cName.bold ? 700 : undefined,
                                                    fontStyle: cName.italic ? 'italic' : undefined,
                                                }}
                                            >
                                                {!cName.hide && (cName.text ?? label)}
                                            </span>
                                            {!cValue.hide && (
                                                <span
                                                    className="font-semibold tabular-nums"
                                                    style={{
                                                        color:
                                                            cValue.color ??
                                                            (isBoolLike || roleDisplay || stateMatch || contactMatch
                                                                ? 'inherit'
                                                                : 'var(--text-primary)'),
                                                        fontWeight: cValue.bold ? 700 : undefined,
                                                        fontStyle: cValue.italic ? 'italic' : undefined,
                                                    }}
                                                >
                                                    {cValue.text ?? valueStr}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </Fragment>
                        ))}
                    </div>
                )}
                {lcOverlay}
            </div>
        );
    }

    // ── STANDARD (default) — full-width rows ───────────────────────────────────
    return (
        <div className={`relative flex flex-col ${rootHCls}`}>
            {header}
            {empty}
            {rowPopup.node}
            {visibleEntries.length > 0 && (
                <div className={fillCls}>
                    {sections.map((sec) => (
                        <Fragment key={sec.room ?? '__all'}>
                            {sec.room != null && <RoomHeader room={sec.room} style={roomHeaderStyle} />}
                            {sec.entries.map((entry) => {
                                const state = states[entry.id] ?? null;
                                const val = state?.val ?? null;
                                const rc = conds.get(entry.id);
                                if (rowHidden(rc)) return null;
                                const cIcon = partOf(rc, 'icon');
                                const cName = partOf(rc, 'name');
                                const cValue = partOf(rc, 'value');
                                // The dynamic list had no row icon at all (issue #572): it comes from the
                                // entry, from the list-wide default, or from a rule.
                                const iconName = cIcon.icon ?? entry.icon ?? opts.entryIcon;
                                const EntryIcon = iconName && !cIcon.hide ? getWidgetIcon(iconName, null!) : null;
                                const entryIconSize = entry.iconSize ?? opts.entryIconSize ?? 13;
                                const label = getLabel(entry);
                                const roomLabel = entry.rooms?.join(', ');
                                const eOn = isActive(val);
                                const entryActiveColor = entry.activeColor || globalActiveColor;
                                const entryInactiveColor = entry.inactiveColor || globalInactiveColor;
                                const stateBg =
                                    rc?.row?.bg ??
                                    (eOn ? entry.activeBg || globalActiveBg : entry.inactiveBg || globalInactiveBg);
                                const lcTs = showEntryLastChange ? state?.lc || state?.ts || 0 : 0;
                                const rowProps = rowPopup.row(
                                    entry.id,
                                    label,
                                    { role: entry.role },
                                    entry.clickAction,
                                    entry.popupTitle,
                                    entry.popupHideTitle,
                                );
                                return (
                                    // Column wrapper so the second line spans the whole row instead of
                                    // becoming a third flex item next to label and value.
                                    <div
                                        key={entry.id}
                                        className="flex flex-col gap-1 px-3 py-2"
                                        style={{
                                            background: stateBg,
                                            borderBottom: showDividers ? '1px solid var(--widget-border)' : undefined,
                                            cursor: rowProps ? 'pointer' : undefined,
                                        }}
                                        {...rowProps}
                                    >
                                        <div className={`flex gap-2 ${wrap ? 'items-start' : 'items-center'}`}>
                                            {EntryIcon && (
                                                <EntryIcon
                                                    size={entryIconSize}
                                                    className="shrink-0 mt-0.5"
                                                    style={{
                                                        color:
                                                            cIcon.iconColor ?? cIcon.color ?? 'var(--text-secondary)',
                                                    }}
                                                />
                                            )}
                                            <div className="flex-1 min-w-0" style={labelContainerStyle}>
                                                <div
                                                    className={`text-xs ${labelWrapCls}`}
                                                    style={{
                                                        color: cName.color ?? 'var(--text-primary)',
                                                        fontWeight: cName.bold ? 700 : undefined,
                                                        fontStyle: cName.italic ? 'italic' : undefined,
                                                    }}
                                                >
                                                    {!cName.hide && (cName.text ?? label)}
                                                </div>
                                                {opts.showRoom && (roomLabel || entry.id) && (
                                                    <div
                                                        className="text-[10px] truncate"
                                                        style={{ color: 'var(--text-secondary)' }}
                                                    >
                                                        {roomLabel || entry.id}
                                                    </div>
                                                )}
                                                {opts.showId && (
                                                    <div
                                                        className="text-[9px] truncate font-mono"
                                                        style={{ color: 'var(--text-secondary)' }}
                                                    >
                                                        {entry.id}
                                                    </div>
                                                )}
                                                {lcTs > 0 && (
                                                    <div
                                                        className="aura-last-change text-[9px] truncate"
                                                        style={{ color: 'var(--text-secondary)', opacity: 0.7 }}
                                                    >
                                                        {formatLastChange(
                                                            t as (
                                                                k: string,
                                                                v?: Record<string, string | number>,
                                                            ) => string,
                                                            lcTs,
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            <EntryValue
                                                cond={cValue}
                                                entry={entry}
                                                val={val}
                                                writable={entry.writable !== false}
                                                setState={setState}
                                                thresholds={globalThresholds}
                                                decimals={decimals}
                                                numFmt={numFmt}
                                                activeColor={entryActiveColor}
                                                inactiveColor={entryInactiveColor}
                                                trueText={opts.trueText}
                                                falseText={opts.falseText}
                                                wrap={wrap}
                                                valueMaxPct={valueMaxPct}
                                                listTransform={opts}
                                            />
                                        </div>
                                        {subLineFor(entry)}
                                    </div>
                                );
                            })}
                        </Fragment>
                    ))}
                </div>
            )}
            {lcOverlay}
        </div>
    );
}
