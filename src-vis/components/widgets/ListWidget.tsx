import { useEffect, useMemo, useRef, useState } from 'react';
import { List, Power } from 'lucide-react';
import { useIoBroker, getObjectViewDirect } from '../../hooks/useIoBroker';
import { ensureDatapointCache } from '../../hooks/useDatapointList';
import { applyDpNameFilter } from '../../utils/dpNameFilter';
import { formatItemName, finishItemName, hasLiveToken, type NameFilterRule } from '../../utils/nameFilter';
import type { WidgetProps, ioBrokerState, ElementConditionRule } from '../../types';
import { useElementConditionStyles, type ElementCondInput } from '../../hooks/useElementConditionStyles';
import { condAnimation, partOf, rowHidden, type ElementCondResult } from '../../utils/rowConditions';
import { resolveName } from './AutoListWidget';
import { getRoleDisplay } from '../../utils/listEntryDisplay';
import { getThresholdColor, type ColorThreshold } from '../../utils/colorThresholds';
import { CustomGridView } from './CustomGridView';
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
import { ConfirmOverlay } from './ConfirmOverlay';
import { EntrySubLine, subCondKey, type EntrySubDp } from './EntrySubLine';
import { useTemplateValues } from '../../hooks/useTemplateValues';
import { ListFilterChip } from './ListFilterChip';
import {
    buildFilterChoices,
    filterEmptyText,
    filterModeLabel,
    matchesFilterMode,
    matchesSearch,
    normalizeFilterMode,
    sortSubKey,
    subValueByKey,
    type ListFilterOptions,
    type ListFilterRow,
    type ListSortKey,
} from '../../utils/listFilter';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StaticListEntry extends EntryControlConfig {
    id: string;
    label?: string;
    unit?: string;
    decimals?: number;
    numberFormat?: NumberFormat;
    role?: string;
    trueLabel?: string;
    falseLabel?: string;
    writable?: boolean; // false = read-only; undefined/true = writable
    icon?: string;
    colorThresholds?: ColorThreshold[]; // [[maxExclusive, colour], …] in any order
    /** Per-DP text color when on/true/>0. Overrides global activeColor. */
    activeColor?: string;
    /** Per-DP text color when off/false/0. Overrides global inactiveColor. */
    inactiveColor?: string;
    /** Per-DP entry background (row/card/pill) when on/true/>0. Overrides global activeBg. */
    activeBg?: string;
    /** Per-DP entry background when off/false/0. Overrides global inactiveBg. */
    inactiveBg?: string;
    /** Per-DP icon size in px (entry icon + switch icon). Falls back to per-layout default. */
    iconSize?: number;
    /** Per-DP label font size in px. Falls back to per-layout default. */
    fontSize?: number;
    /** When switch is shown: 'slide' = toggle (default), 'icon' = clickable power icon. */
    switchStyle?: 'slide' | 'icon';
    /** Icon-style switch only: icon shown in the on/true/>0 state. Falls back to Power. */
    trueIcon?: string;
    /** Icon-style switch only: icon shown in the off/false/0 state. Falls back to Power. */
    falseIcon?: string;
    /** Show last-change timestamp under this entry. */
    showLastChange?: boolean;
    /** Per-row click action. Overrides the list-wide setting; undefined = inherit. */
    clickAction?: RowClickSetting;
    /** Heading of this row's popup. Beats options.rowPopupTitle; unset = the row name. */
    popupTitle?: string;
    /** Title bar of this row's popup: true = hide, false = show, unset = as the list. */
    popupHideTitle?: boolean;
    /**
     * Extra datapoints shown in a second line below this entry — display only.
     * Ignored by the badges (minimal) layout, where a row is a single pill.
     */
    subDps?: EntrySubDp[];
    /** Conditional formatting of this row (issue #572). */
    conditions?: ElementConditionRule[];
    /**
     * This row is a separator, not a datapoint: a rule across the full width that opens
     * a new section. It lives in `entries` like any other row, so it is added, dragged,
     * moved and deleted with the same handles — the alternative, a flag on the datapoint
     * below it, would mean switching one entry off and another on just to move a line.
     * `id` is then synthetic (`divider:<n>`) and carries no ioBroker meaning.
     */
    divider?: boolean;
    /** Heading on the separator. Empty = a plain rule. */
    dividerLabel?: string;
    /** Where the heading sits. Default 'left'. */
    dividerAlign?: 'left' | 'center' | 'right';
    /** Heading size in px. Default 10. */
    dividerFontSize?: number;
    /** Heading colour. Default --text-secondary. */
    dividerColor?: string;
    /** Draw the rule(s) next to the heading. Default true; false = heading only. */
    dividerLine?: boolean;
}

export interface StaticListOptions
    extends GroupActionConfigOpts, RowPopupOptions, ValueTransformSettings, ListFilterOptions {
    entries: StaticListEntry[];
    /**
     * Filter the frontend starts with: 'all' (default), the built-ins 'active' /
     * 'inactive', or the id of a filterPresets entry (see utils/listFilter).
     */
    valueFilter?: string;
    showId?: boolean;
    showRoom?: boolean;
    showTitle?: boolean;
    showCount?: boolean;
    /** Entry label template, tokens <Raum> <Gerät> <DPName> <Name> <ID>. Empty = the plain name. */
    namePattern?: string;
    /** Text rules applied to the token values before substitution (see utils/nameFilter). */
    nameFilters?: NameFilterRule[];
    sortBy?: ListSortKey;
    sortOrder?: 'asc' | 'desc';
    sortBy2?: ListSortKey;
    sortOrder2?: 'asc' | 'desc';
    /** Global default label for on/true/>0 state (fallback when entry has no trueLabel). */
    trueText?: string;
    /** Global default label for off/false/0 state (fallback when entry has no falseLabel). */
    falseText?: string;
    /** Colour scale for numeric values. Per-DP colorThresholds overrides (see utils/colorThresholds). */
    colorThresholds?: ColorThreshold[];
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
    /** Text alignment of the sum line. Default 'left' (inherits titleAlign feel). */
    sumAlign?: 'left' | 'center' | 'right';
    /** Font size of the sum line in px. Default 10. */
    sumFontSize?: number;
    /** Show divider lines between list entries (standard/compact layouts). Default true. */
    showDividers?: boolean;
    /** Hide the frontend filter chip in the widget header. Default false. */
    hideFilterButton?: boolean;
    /** Wrap long entry labels AND text values onto multiple lines instead of truncating / overflowing. Default false. */
    wrapText?: boolean;
    /** When wrapText is on: minimum % of the row reserved for the label (10..90). Value gets the rest. Default 50. */
    labelMinPercent?: number;
    /**
     * Conditional formatting applied to EVERY row (issue #572). Clause datapoints may
     * use `{{parent}}` / `{{dp}}` / `{{name}}`, resolved per row — that is what makes one
     * rule work for a whole list. Rules on the entry itself are applied afterwards and
     * therefore win per field.
     */
    rowConditions?: ElementConditionRule[];
    // Group action options (groupSwitch, groupActionType, …) come from GroupActionConfigOpts.
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function isDimmerRole(id: string) {
    const r = id.toLowerCase();
    return r.includes('level') || r.includes('dimmer') || r.includes('brightness');
}

function isActive(val: ioBrokerState['val']): boolean {
    if (val === null || val === undefined) return false;
    if (typeof val === 'boolean') return val;
    if (typeof val === 'number') return val > 0;
    if (typeof val === 'string') return val !== '' && val !== '0' && val.toLowerCase() !== 'false';
    return false;
}

function compareVals(a: ioBrokerState['val'], b: ioBrokerState['val']): number {
    if (a === null || a === undefined) return 1;
    if (b === null || b === undefined) return -1;
    if (typeof a === 'boolean' && typeof b === 'boolean') return (a ? 1 : 0) - (b ? 1 : 0);
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

// ── Section breaks ─────────────────────────────────────────────────────────────

/**
 * Which rendered entries start a new section, and with what heading.
 *
 * A break is configured on an entry (`dividerBefore`), never on a position — positions do
 * not survive drag & drop, and this list is reordered by hand all the time.
 *
 * Walked over the CONFIG order while checking against what is actually rendered, so a
 * break whose own entry is filtered away (value filter, search) moves to the next visible
 * entry of that section: a heading like "Erdgeschoss" stays as long as the section has a
 * visible member, and vanishes entirely once it has none — instead of leaving a stray line.
 */
/** True for a separator row. Every value-related code path has to skip these. */
export function isDivider(e: StaticListEntry): boolean {
    return e?.divider === true;
}

/** How the separator has to be laid out to span the full width of its container. */
type BreakVariant = 'stack' | 'grid' | 'wrap';

/**
 * A separator row.
 *
 * The rule frames the heading according to its alignment: left-aligned puts the whole
 * rule behind the text, centred splits it in two, right-aligned pushes it in front. A
 * separator without a heading is just the rule, one with the rule switched off just the
 * heading — and one with neither renders nothing at all.
 */
function SectionBreak({ entry, variant, first }: { entry: StaticListEntry; variant: BreakVariant; first: boolean }) {
    const label = entry.dividerLabel?.trim() || undefined;
    const align = entry.dividerAlign ?? 'left';
    const line = entry.dividerLine !== false;
    if (!label && !line) return null;
    const rule = <span className="flex-1 h-px min-w-0" style={{ background: 'var(--widget-border)' }} />;
    const before = line && (align === 'right' || align === 'center');
    const after = line && (align === 'left' || align === 'center' || !label);
    return (
        <div
            className="aura-section-break flex items-center gap-2 px-3 select-none"
            style={{
                // A grid child must be told to span every column; a flex-wrap child needs a
                // full basis so the badges after it start on a new line.
                gridColumn: variant === 'grid' ? '1 / -1' : undefined,
                flexBasis: variant === 'wrap' ? '100%' : undefined,
                // No air above the very first row - the separator sits under the header.
                paddingTop: first ? 2 : 10,
                paddingBottom: label ? 4 : 6,
                // Without a rule the heading alone has to carry the alignment.
                justifyContent: line
                    ? undefined
                    : align === 'left'
                      ? 'flex-start'
                      : align === 'right'
                        ? 'flex-end'
                        : 'center',
            }}
        >
            {before && rule}
            {label && (
                <span
                    className="font-semibold uppercase tracking-wide shrink-0 truncate"
                    style={{
                        color: entry.dividerColor || 'var(--text-secondary)',
                        fontSize: entry.dividerFontSize && entry.dividerFontSize > 0 ? entry.dividerFontSize : 10,
                    }}
                >
                    {label}
                </span>
            )}
            {after && rule}
        </div>
    );
}

/**
 * Sorts the datapoint rows WITHIN each section instead of across the whole list, so an
 * active sort order and a hand-made grouping can coexist — sorting globally would tear
 * the sections apart, which is the whole reason they exist.
 */
function sortWithinSections(rows: StaticListEntry[], cmp: (a: StaticListEntry, b: StaticListEntry) => number) {
    const out: StaticListEntry[] = [];
    let section: StaticListEntry[] = [];
    const flush = () => {
        section.sort(cmp);
        out.push(...section);
        section = [];
    };
    for (const r of rows) {
        if (isDivider(r)) {
            flush();
            out.push(r);
        } else section.push(r);
    }
    flush();
    return out;
}

/**
 * Drops the separators that would render into nothing: one whose section has no visible
 * row left (its datapoints were filtered away) and a leading bare rule, which would
 * separate the list from nothing. A leading separator WITH a heading is kept — that is a
 * section title, and it belongs at the top.
 */
function pruneEmptySections(rows: StaticListEntry[]): StaticListEntry[] {
    return rows.filter((r, i) => {
        if (!isDivider(r)) return true;
        const next = rows[i + 1];
        if (!next || isDivider(next)) return false;
        return i > 0 || !!r.dividerLabel?.trim();
    });
}

// ── Value cell ─────────────────────────────────────────────────────────────────

function EntryValue({
    entry,
    val,
    writable,
    setState,
    globalThresholds,
    decimals,
    numFmt,
    activeColor,
    inactiveColor,
    trueText,
    falseText,
    wrap,
    valueMaxPct,
    listTransform,
    card,
    cond,
}: {
    entry: StaticListEntry;
    val: ioBrokerState['val'];
    writable: boolean;
    setState: (id: string, v: boolean | number | string) => void;
    globalThresholds?: ColorThreshold[];
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
    /** Card layout: cells are narrow (min 90px), so width-hungry controls fill them. */
    card?: boolean;
    /** Conditional formatting for this row's value (issue #572). */
    cond?: ElementCondResult;
}) {
    const t = useT();
    // For text-style value spans: drop shrink-0 + allow wrapping when wrap=true.
    // maxWidth caps the value (default 50%) so the label always keeps a guaranteed
    // share of the row — otherwise flex-basis-0 on the label causes it to collapse
    // when the value's natural width exceeds the container.
    const textValueCls = wrap
        ? 'text-xs font-medium tabular-nums whitespace-normal break-words [overflow-wrap:anywhere] min-w-0 text-right'
        : 'shrink-0 text-xs font-medium tabular-nums';
    const valueMaxStyle: React.CSSProperties | undefined = wrap ? { maxWidth: `${valueMaxPct ?? 50}%` } : undefined;
    const trueLabel = entry.trueLabel ?? trueText;
    const falseLabel = entry.falseLabel ?? falseText;
    const hasLabels = !!(trueLabel || falseLabel);
    const isBool = typeof val === 'boolean';
    const isBoolLike = isBool || (typeof val === 'number' && (val === 0 || val === 1));
    const on = val === true || val === 1;
    const displayType = entry.displayType ?? 'auto';
    const switchStyle = entry.switchStyle ?? 'slide';
    // Display-only conversion: only the text/time branches below use it — the
    // controls write their value back and must stay on the raw one. Thresholds
    // follow the shown value, so they are configured in display units.
    const disp = entryValueText(entry, listTransform, val, decimals, numFmt, t);
    // A condition beats the colour scale — the scale is the default, the rule is the
    // exception. Inline weight/style also beat the Tailwind font classes below.
    const condColor = cond?.color;
    const condFont = {
        fontWeight: cond?.bold ? 700 : undefined,
        fontStyle: cond?.italic ? ('italic' as const) : undefined,
        animation: condAnimation(cond),
    };
    // An entry without its own scale falls back to the list-wide one; an empty
    // array counts as "none" so an imported entry cannot block the fallback.
    const entryThresholds = entry.colorThresholds?.length ? entry.colorThresholds : globalThresholds;
    const thresholdColor = getThresholdColor(disp.value, entryThresholds);

    // Optional confirmation before a switch-like write (like the Switch widget).
    // The pending action is captured and only run once the user confirms.
    const [pendingWrite, setPendingWrite] = useState<(() => void) | null>(null);
    const confirmAnchorRef = useRef<HTMLButtonElement>(null);
    const guardWrite = (action: () => void) => () => {
        if (entry.confirm) setPendingWrite(() => action);
        else action();
    };
    const confirmOverlay = pendingWrite ? (
        <ConfirmOverlay
            popup
            anchorRef={confirmAnchorRef}
            text={entry.confirmText}
            onConfirm={() => {
                pendingWrite();
                setPendingWrite(null);
            }}
            onCancel={() => setPendingWrite(null)}
        />
    ) : null;

    // A rule may replace the value outright — "true" becomes "ONLINE". No control is
    // drawn for it then: the row states a fact instead of offering a switch.
    if (cond?.hide) return null;
    if (cond?.text !== undefined)
        return (
            <span
                className={textValueCls}
                style={{ ...valueMaxStyle, ...condFont, color: condColor ?? 'var(--text-primary)' }}
            >
                {cond.text}
            </span>
        );

    // Reusable: clickable icon as toggle (used when switchStyle === 'icon').
    // The on/off states can each use their own configured icon; both fall back
    // to the Lucide power icon when none is set.
    const renderIconToggle = (active: boolean, onClick: () => void) => {
        const ToggleIcon = getWidgetIcon(active ? entry.trueIcon : entry.falseIcon, Power);
        return (
            <>
                <button
                    ref={confirmAnchorRef}
                    onClick={writable ? guardWrite(onClick) : undefined}
                    className="shrink-0 flex items-center justify-center"
                    style={{
                        color: active ? activeColor : inactiveColor,
                        cursor: writable ? 'pointer' : 'default',
                        background: 'transparent',
                        padding: 2,
                    }}
                    aria-pressed={active}
                >
                    <ToggleIcon size={entry.iconSize ?? 22} strokeWidth={active ? 2.5 : 1.75} />
                </button>
                {confirmOverlay}
            </>
        );
    };

    // Rich control types — rendered by the shared entry-control components.
    if (displayType === 'shutter') return <ShutterControl entry={entry} val={val} setState={setState} />;
    if (displayType === 'stepper')
        return (
            <StepperControl
                entry={entry}
                val={val}
                setState={setState}
                decimals={decimals}
                numFmt={numFmt}
                // The stepper prints the raw value (it writes it back), so its colour
                // must be matched against that value, not the converted one.
                valueColor={getThresholdColor(val, entryThresholds)}
            />
        );
    if (displayType === 'buttons')
        return <PresetButtons entry={entry} val={val} setState={setState} activeColor={activeColor} />;
    if (displayType === 'momentary') return <MomentaryButton entry={entry} setState={setState} icon={entry.icon} />;
    if (displayType === 'states') return <StateDisplay entry={entry} val={val} />;
    if (displayType === 'contact') return <ContactDisplay entry={entry} val={val} />;
    if (displayType === 'time')
        return (
            <TimeDisplay
                entry={entry}
                val={disp.value}
                className={textValueCls}
                style={{ ...valueMaxStyle, ...condFont, color: 'var(--text-primary)' }}
            />
        );
    if (displayType === 'datepicker')
        return <DateEntryControl entry={entry} val={val} setState={setState} fullWidth={card} />;
    if (displayType === 'input') return <InputControl entry={entry} val={val} setState={setState} fullWidth={card} />;

    // Forced "Nur Wert" — skip role/switch/slider, render text only
    if (displayType === 'value') {
        const active = isActive(val);
        return (
            <span
                className={textValueCls}
                style={{
                    ...valueMaxStyle,
                    ...condFont,
                    color: condColor ?? thresholdColor ?? (active ? 'var(--text-primary)' : 'var(--text-secondary)'),
                }}
            >
                {disp.text != null ? `${disp.text}${entry.unit && !disp.isTime ? ` ${entry.unit}` : ''}` : '–'}
            </span>
        );
    }

    // Forced "Slider" — render range 0..100 if writable, else value text with %
    if (displayType === 'slider') {
        const num = typeof val === 'number' ? val : val === true ? 100 : 0;
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
                    {Math.round(num)}
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
                    value={num}
                    onChange={(e) => setState(entry.id, Number(e.target.value))}
                    className="w-20 h-1"
                    style={{ accentColor: 'var(--accent)' }}
                />
                <span
                    className="text-[10px] w-8 text-right tabular-nums"
                    style={{ color: condColor ?? thresholdColor ?? 'var(--text-secondary)' }}
                >
                    {Math.round(num)}
                    {entry.unit ?? '%'}
                </span>
            </div>
        );
    }

    // Forced "Schalter" — toggle / labeled pill
    if (displayType === 'switch') {
        const forcedOn = on || (typeof val === 'number' && val > 0);
        const writeToggle = () => {
            if (isBool) setState(entry.id, !forcedOn);
            else if (typeof val === 'number') setState(entry.id, forcedOn ? 0 : 1);
            else setState(entry.id, !forcedOn);
        };
        if (switchStyle === 'icon') return renderIconToggle(forcedOn, writeToggle);
        if (hasLabels) {
            const fill = forcedOn ? activeColor : inactiveColor;
            return (
                <>
                    <button
                        ref={confirmAnchorRef}
                        onClick={writable ? guardWrite(writeToggle) : undefined}
                        className="shrink-0 text-xs px-2.5 py-0.5 rounded-full font-medium"
                        style={{
                            background: `color-mix(in srgb, ${fill} 18%, transparent)`,
                            color: fill,
                            cursor: writable ? 'pointer' : 'default',
                        }}
                    >
                        {forcedOn ? trueLabel || 'AN' : falseLabel || 'AUS'}
                    </button>
                    {confirmOverlay}
                </>
            );
        }
        if (!writable) {
            return (
                <span
                    className="shrink-0 relative w-9 h-[18px] rounded-full pointer-events-none"
                    style={{ background: forcedOn ? activeColor : 'var(--app-border)' }}
                >
                    <span
                        className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white"
                        style={{ left: forcedOn ? 'calc(100% - 16px)' : '2px' }}
                    />
                </span>
            );
        }
        return (
            <>
                <button
                    ref={confirmAnchorRef}
                    onClick={guardWrite(writeToggle)}
                    className="shrink-0 relative w-9 h-[18px] rounded-full transition-colors"
                    style={{ background: forcedOn ? activeColor : 'var(--app-border)' }}
                >
                    <span
                        className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all"
                        style={{ left: forcedOn ? 'calc(100% - 16px)' : '2px' }}
                    />
                </button>
                {confirmOverlay}
            </>
        );
    }

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
        if (switchStyle === 'icon') {
            return renderIconToggle(on, () => setState(entry.id, isBool ? !on : on ? 0 : 1));
        }
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

    const active = isActive(val);
    return (
        <span
            className={textValueCls}
            style={{
                ...valueMaxStyle,
                ...condFont,
                color: condColor ?? thresholdColor ?? (active ? 'var(--text-primary)' : 'var(--text-secondary)'),
            }}
        >
            {disp.text != null ? `${disp.text}${entry.unit && !disp.isTime ? ` ${entry.unit}` : ''}` : '–'}
        </span>
    );
}

// ── Main Widget ────────────────────────────────────────────────────────────────

export function ListWidget({ config, editMode }: WidgetProps) {
    const opts = useMemo(() => (config.options ?? { entries: [] }) as unknown as StaticListOptions, [config.options]);
    // Inside an auto-height popup-view: render the full list without an inner scrollbar
    // so the popup grid (and dialog) can grow to fit every row. Off elsewhere.
    const autoHeight = usePopupAutoHeight();
    // Two views on the same array: `rows` is what gets rendered (separators included),
    // `entries` is the datapoints only. Everything value-related — subscriptions, filters,
    // sorting, statistics, counts, group actions — reads `entries`, so a separator can
    // never leak into a value calculation.
    const rows = useMemo<StaticListEntry[]>(() => (opts.entries ?? []).filter((e) => !!e?.id), [opts.entries]);
    const entries = useMemo<StaticListEntry[]>(() => rows.filter((e) => !isDivider(e)), [rows]);
    // Row click -> detail popup for that datapoint (issue #524).
    const rowPopup = useRowPopup(config, opts, editMode);
    const t = useT();
    const { defaultDecimals, numberFormat: globalNumFmt } = useGlobalSettingsStore();
    const { subscribe, setState, getState } = useIoBroker();
    // Second-line datapoints live outside the entry subscription below: they take no
    // part in sorting or the statistics line, so they get their own read-only
    // subscription (same hook the value widget uses for its template datapoints).
    // Filter presets and the free-text search DO read them - see utils/listFilter.
    const subDpRefs = useMemo(
        () => [...new Set(entries.flatMap((e) => (e.subDps ?? []).map((s) => s?.id).filter(Boolean) as string[]))],
        [entries],
    );
    const subValues = useTemplateValues(subDpRefs);
    const [states, setStates] = useState<Record<string, ioBrokerState | null>>({});

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
            for (const sub of e.subDps ?? []) {
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
    }, [entries, opts.rowConditions, states, subValues]);
    const conds = useElementConditionStyles(condItems);

    const subLineFor = (entry: StaticListEntry) =>
        entry.subDps?.some((s) => !!s?.id) ? (
            <EntrySubLine
                subDps={entry.subDps}
                values={subValues}
                listTransform={opts}
                decimals={defaultDecimals}
                numFmt={globalNumFmt}
                entryId={entry.id}
                conds={conds}
            />
        ) : null;
    const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});
    const [resolvedRooms, setResolvedRooms] = useState<Record<string, string[]>>({});
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

    // Subscribe to all entry states — keyed on entryKey only, no prevKey guard.
    // A prevKey ref survives the StrictMode mount→unmount→remount cycle and would
    // make the remount skip re-subscribing after the unmount cleaned up, leaving
    // the list with zero live subscriptions in dev.
    const entryKey = entries.map((e) => e.id).join(',');
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
            const updates: Record<string, string> = {};
            for (const e of entries.filter((en) => !en.label)) {
                const found = cache.find((c) => c.id === e.id);
                if (found?.name) updates[e.id] = found.name;
            }
            if (Object.keys(updates).length > 0) setResolvedNames((prev) => ({ ...prev, ...updates }));
        });
        return () => unsubs.forEach((u) => u());
    }, [entryKey]); // eslint-disable-line react-hooks/exhaustive-deps

    // Resolve rooms for showRoom display — and for a <Raum> token in the name pattern.
    const patternNeedsRoom = /<Raum>/i.test(opts.namePattern ?? '');
    useEffect(() => {
        if ((!opts.showRoom && !patternNeedsRoom) || entries.length === 0) return;
        getObjectViewDirect('enum', 'enum.rooms.', 'enum.rooms.\u9999').then((result) => {
            const memberRooms = new Map<string, string[]>();
            for (const { value: obj } of result.rows) {
                if (!obj?.common?.members?.length) continue;
                const label = resolveName(
                    obj.common.name as string | Record<string, string>,
                    obj._id.split('.').pop() ?? obj._id,
                );
                for (const memberId of obj.common.members as string[]) {
                    if (!memberRooms.has(memberId)) memberRooms.set(memberId, []);
                    memberRooms.get(memberId)!.push(label);
                }
            }
            const map: Record<string, string[]> = {};
            for (const e of entries) {
                const parts = e.id.split('.');
                const roomsSet = new Set<string>();
                for (let i = parts.length; i >= 2; i--) {
                    memberRooms.get(parts.slice(0, i).join('.'))?.forEach((r) => roomsSet.add(r));
                }
                if (roomsSet.size > 0) map[e.id] = [...roomsSet];
            }
            setResolvedRooms(map);
        });
    }, [opts.showRoom, patternNeedsRoom, entryKey]); // eslint-disable-line react-hooks/exhaustive-deps

    // Label pipeline: composed name → name pattern (incl. the `{{parent}}` variables) →
    // live `[[dp]]` values. The last step is a hook, so the raw labels of every entry are
    // collected first and the resolver subscribes to all referenced datapoints at once.
    const baseName = (entry: StaticListEntry) =>
        applyDpNameFilter(entry.label || resolvedNames[entry.id] || entry.id.split('.').pop() || entry.id);
    const rawLabel = (entry: StaticListEntry) =>
        formatItemName(
            { id: entry.id, name: baseName(entry), room: resolvedRooms[entry.id]?.[0] },
            opts.namePattern,
            opts.nameFilters,
        );
    const resolveDpTokens = useDpTokenResolver(entries.map(rawLabel));
    const getLabel = (entry: StaticListEntry) => {
        const raw = rawLabel(entry);
        if (!hasLiveToken(raw)) return raw;
        const base = baseName(entry);
        // 'Ergebnis' rules were deferred until the value was in — see finishItemName.
        return finishItemName(resolveDpTokens(raw, base), opts.nameFilters, base);
    };

    // Value filter (same logic as AutoListWidget) — driven by local state so
    // frontend clicks take effect immediately, not only after the config sync.
    // The menu holds the built-ins plus the admin's own presets; a mode that no
    // longer exists (deleted preset) falls back to 'all' instead of hiding all rows.
    const filterChoices = useMemo(() => buildFilterChoices(opts), [opts]);
    const valueFilter = normalizeFilterMode(viewFilter, filterChoices);

    // Everything a filter rule / the free-text search may look at for one row: the
    // main value plus the second line's extra datapoints - which the old three modes
    // could not reach at all, since they only asked "is the main value truthy?".
    const filterRow = (entry: StaticListEntry): ListFilterRow => ({
        id: entry.id,
        label: getLabel(entry),
        value: states[entry.id]?.val ?? null,
        subs: (entry.subDps ?? [])
            .filter((s) => !!s?.id)
            .map((s) => ({ id: s.id, label: s.label, value: subValues[s.id] ?? null })),
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
        // A separator is chrome, not data: it passes every value filter and the search,
        // and is dropped afterwards only if its section ended up empty.
        let result =
            effectiveFilter === 'all' && !effectiveSearch.trim()
                ? rows
                : rows.filter((e) => {
                      if (isDivider(e)) return true;
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
            // Second-line values are looked up once per row, not once per comparison.
            const subsCache = new Map<string, ReturnType<typeof filterRow>['subs']>();
            const subsOf = (e: StaticListEntry) => {
                let cached = subsCache.get(e.id);
                if (!cached) {
                    cached = filterRow(e).subs ?? [];
                    subsCache.set(e.id, cached);
                }
                return cached;
            };
            const cmpFor = (key: string, a: StaticListEntry, b: StaticListEntry) => {
                const sk = sortSubKey(key);
                if (sk !== null) return compareVals(subValueByKey(subsOf(a), sk), subValueByKey(subsOf(b), sk));
                return key === 'label'
                    ? getLabel(a).localeCompare(getLabel(b), undefined, { numeric: true, sensitivity: 'base' })
                    : compareVals(states[a.id]?.val ?? null, states[b.id]?.val ?? null);
            };
            result = sortWithinSections(result, (a, b) => {
                const cmp1 = cmpFor(sortBy, a, b);
                if (cmp1 !== 0) return sortOrder === 'desc' ? -cmp1 : cmp1;
                if (sortBy2 !== 'none' && sortBy2 !== sortBy) {
                    const cmp2 = cmpFor(sortBy2, a, b);
                    return sortOrder2 === 'desc' ? -cmp2 : cmp2;
                }
                return 0;
            });
        }
        return pruneEmptySections(result);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        rows,
        states,
        subValues,
        effectiveFilter,
        effectiveSearch,
        opts.filterPresets,
        opts.sortBy,
        opts.sortOrder,
        opts.sortBy2,
        opts.sortOrder2,
        resolvedNames,
    ]);

    // Compact is a two-column grid and styles its cells by index parity. A separator spans
    // both columns and therefore restarts the grid row, so the column has to be counted
    // rather than derived from the index - otherwise the cell borders sit on the wrong
    // side after a separator.
    const compactCols = useMemo(() => {
        const cols: number[] = [];
        let c = 0;
        for (const e of visibleEntries) {
            if (isDivider(e)) {
                cols.push(0);
                c = 0;
            } else cols.push(c++ % 2);
        }
        return cols;
    }, [visibleEntries]);

    // Count published to ioBroker state = view-mode count using the frontend valueFilter,
    // independent from backendValueFilter (which only affects the editor preview) and
    // from the free-text search (a per-viewer, transient narrowing).
    const viewCount = useMemo(() => {
        if (valueFilter === 'all') return entries.length;
        return entries.filter((e) => matchesFilterMode(valueFilter, opts.filterPresets, filterRow(e))).length;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entries, states, subValues, valueFilter, opts.filterPresets]);

    useEffect(() => {
        if (!opts.publishCount) return;
        // The published name is a plain string — [[dp]] tokens are a display feature.
        // `config.title` is deliberately NOT a dependency: it only names the object on
        // the first publish, and a title with a live token would otherwise re-fire this
        // effect (and rewrite the unchanged count) on every value change.
        publishListCount(config.id, stripDpTokens(config.title || '') || 'Statische Liste', viewCount);
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

    const layout = config.layout ?? 'default';
    // 'custom' is no longer offered for lists (utils/widgetLayouts NO_CUSTOM) and is
    // undocumented - the branch stays so dashboards that stored it keep rendering.
    if (layout === 'custom') return <CustomGridView config={config} value="" />;

    const wrap = !!opts.wrapText;
    const labelWrapCls = wrap ? 'break-words [overflow-wrap:anywhere]' : 'truncate';
    // Auto-height mode drops the fill-and-scroll classes so the list grows naturally.
    const rootHCls = autoHeight ? '' : 'h-full';
    const fillCls = autoHeight ? '' : 'aura-scroll flex-1 overflow-auto min-h-0';
    const fillClsY = autoHeight ? '' : 'aura-scroll flex-1 overflow-y-auto min-h-0';
    const labelMinPct = Math.max(10, Math.min(90, opts.labelMinPercent ?? 50));
    const valueMaxPct = 100 - labelMinPct;
    const labelContainerStyle: React.CSSProperties | undefined = wrap ? { minWidth: `${labelMinPct}%` } : undefined;

    const globalThresholds = opts.colorThresholds;
    const globalActiveColor = opts.activeColor || 'var(--accent-green)';
    const globalInactiveColor = opts.inactiveColor || 'var(--text-secondary)';
    const globalActiveBg = opts.activeBg;
    const globalInactiveBg = opts.inactiveBg;
    const showDividers = opts.showDividers ?? true;
    const HeaderIcon = getWidgetIcon(o.icon as string | undefined, List);
    const statsAlign = opts.sumAlign ?? 'left';

    // ── Shared header ──────────────────────────────────────────────────────────
    const header =
        showTitle || showIcon || (opts.showSum && sumInfo) || masterSwitch ? (
            <div
                className="shrink-0 flex items-center justify-between py-1.5"
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
                    {/* Title and stats share one line: the title shrinks/truncates, the stats
                        keep their natural width. sumAlign 'left' parks them right after the
                        title, 'center'/'right' lets the stats box take the rest of the row. */}
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                        {showTitle && (
                            <p
                                className="aura-widget-title text-xs font-semibold truncate min-w-0"
                                style={{
                                    color: 'var(--text-secondary)',
                                    textAlign: titleAlign as React.CSSProperties['textAlign'],
                                    // A shrink-to-fit box would swallow textAlign, so the
                                    // title only keeps its natural width while it is left
                                    // aligned and the stats want to sit right behind it.
                                    flex: titleAlign === 'left' && statsAlign === 'left' ? '0 1 auto' : '1 1 auto',
                                }}
                            >
                                {config.title || 'Statische Liste'}
                                {showCount && entries.length > 0 && (
                                    <span className="ml-1 opacity-50">
                                        ({valueFilter !== 'all' ? `${visibleEntries.length}/` : ''}
                                        {entries.length})
                                    </span>
                                )}
                            </p>
                        )}
                        {opts.showSum && sumInfo && (
                            <div
                                className="min-w-0"
                                style={{ flex: showTitle && statsAlign === 'left' ? '0 1 auto' : '1 1 auto' }}
                            >
                                <StatLine
                                    stats={sumInfo}
                                    selected={opts.sumStats}
                                    labels={opts.statLabels}
                                    icons={opts.statIcons}
                                    sumLabel={opts.sumLabel}
                                    decimals={defaultDecimals}
                                    numFmt={globalNumFmt}
                                    align={statsAlign}
                                    fontSize={opts.sumFontSize ?? 10}
                                />
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
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
                </div>
            </div>
        ) : null;

    const empty = (editMode ? entries.length === 0 : visibleEntries.length === 0) && (
        <div className="flex-1 flex items-center justify-center p-4">
            <p className="text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
                {entries.length === 0
                    ? `Noch keine Datenpunkte.${editMode ? ' Bearbeiten → Datenpunkt hinzufügen.' : ''}`
                    : filterEmptyText(
                          effectiveFilter,
                          effectiveSearch,
                          filterModeLabel(effectiveFilter, filterChoices),
                      )}
            </p>
        </div>
    );

    // ── KACHELN (card) ─────────────────────────────────────────────────────────
    if (layout === 'card') {
        return (
            <div className={`aura-widget-row relative flex flex-col ${rootHCls}`}>
                {header}
                {empty}
                {rowPopup.node}
                {visibleEntries.length > 0 && (
                    <div
                        className={`${fillCls} p-2`}
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
                            gap: 6,
                            alignContent: 'start',
                        }}
                    >
                        {visibleEntries.map((entry, i) => {
                            // A separator is a row like any other - it just renders as a rule.
                            if (isDivider(entry))
                                return <SectionBreak key={entry.id} entry={entry} variant="grid" first={i === 0} />;
                            const val = states[entry.id]?.val ?? null;
                            const rc = conds.get(entry.id);
                            if (rowHidden(rc)) return null;
                            const cIcon = partOf(rc, 'icon');
                            const cName = partOf(rc, 'name');
                            const cValue = partOf(rc, 'value');
                            const label = getLabel(entry);
                            const iconName = cIcon.icon ?? entry.icon;
                            const EntryIcon = iconName && !cIcon.hide ? getWidgetIcon(iconName, null!) : null;
                            const eOn = isActive(val);
                            const entryActiveColor = entry.activeColor || globalActiveColor;
                            const entryInactiveColor = entry.inactiveColor || globalInactiveColor;
                            const stateBg =
                                (rc?.row?.bg ??
                                    (eOn ? entry.activeBg || globalActiveBg : entry.inactiveBg || globalInactiveBg)) ||
                                'var(--app-bg)';
                            const entryIconSize = entry.iconSize ?? 11;
                            const entryFontSize = entry.fontSize;
                            const lcTs = entry.showLastChange ? states[entry.id]?.lc || states[entry.id]?.ts || 0 : 0;
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
                                        animation: condAnimation(rc?.row),
                                        border: '1px solid var(--widget-border)',
                                        cursor: rowProps ? 'pointer' : undefined,
                                    }}
                                    {...rowProps}
                                >
                                    <span
                                        className={`flex items-center gap-1 leading-tight ${labelWrapCls}${entryFontSize ? '' : ' text-[10px]'}`}
                                        style={{
                                            color: cName.color ?? 'var(--text-secondary)',
                                            fontSize: entryFontSize ?? undefined,
                                            fontWeight: cName.bold ? 700 : undefined,
                                            fontStyle: cName.italic ? 'italic' : undefined,
                                            animation: condAnimation(cName),
                                        }}
                                    >
                                        {EntryIcon && (
                                            <EntryIcon
                                                size={entryIconSize}
                                                className="shrink-0"
                                                style={{
                                                    color: cIcon.iconColor ?? cIcon.color ?? 'var(--text-secondary)',
                                                    animation: condAnimation(cIcon),
                                                }}
                                            />
                                        )}
                                        {!cName.hide && (cName.text ?? label)}
                                    </span>
                                    <div className="flex items-center justify-center">
                                        <EntryValue
                                            cond={cValue}
                                            entry={entry}
                                            val={val}
                                            writable={entry.writable !== false}
                                            setState={setState}
                                            globalThresholds={globalThresholds}
                                            decimals={entry.decimals ?? defaultDecimals}
                                            numFmt={entry.numberFormat ?? globalNumFmt}
                                            activeColor={entryActiveColor}
                                            inactiveColor={entryInactiveColor}
                                            trueText={opts.trueText}
                                            falseText={opts.falseText}
                                            wrap={wrap}
                                            valueMaxPct={valueMaxPct}
                                            listTransform={opts}
                                            card
                                        />
                                    </div>
                                    {subLineFor(entry)}
                                    {lcTs > 0 && (
                                        <div
                                            className="aura-last-change text-[9px] truncate text-center"
                                            style={{ color: 'var(--text-secondary)', opacity: 0.7 }}
                                        >
                                            {formatLastChange(
                                                t as (k: string, v?: Record<string, string | number>) => string,
                                                lcTs,
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
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
                        {visibleEntries.map((entry, i) => {
                            // A separator is a row like any other - it just renders as a rule.
                            if (isDivider(entry))
                                return <SectionBreak key={entry.id} entry={entry} variant="grid" first={i === 0} />;
                            const val = states[entry.id]?.val ?? null;
                            const rc = conds.get(entry.id);
                            if (rowHidden(rc)) return null;
                            const cIcon = partOf(rc, 'icon');
                            const cName = partOf(rc, 'name');
                            const cValue = partOf(rc, 'value');
                            const label = getLabel(entry);
                            // Counted, not i % 2: a section break spans both columns and
                            // starts a fresh grid row (see compactCols).
                            const isRight = compactCols[i] === 1;
                            const iconName = cIcon.icon ?? entry.icon;
                            const EntryIcon = iconName && !cIcon.hide ? getWidgetIcon(iconName, null!) : null;
                            const eOn = isActive(val);
                            const entryActiveColor = entry.activeColor || globalActiveColor;
                            const entryInactiveColor = entry.inactiveColor || globalInactiveColor;
                            const stateBg =
                                rc?.row?.bg ??
                                (eOn ? entry.activeBg || globalActiveBg : entry.inactiveBg || globalInactiveBg);
                            const entryIconSize = entry.iconSize ?? 11;
                            const entryFontSize = entry.fontSize;
                            const lcTs = entry.showLastChange ? states[entry.id]?.lc || states[entry.id]?.ts || 0 : 0;
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
                                    className="flex flex-col gap-1 px-2 py-1.5"
                                    style={{
                                        background: stateBg,
                                        animation: condAnimation(rc?.row),
                                        borderBottom: showDividers ? '1px solid var(--widget-border)' : undefined,
                                        borderLeft:
                                            showDividers && isRight ? '1px solid var(--widget-border)' : undefined,
                                        cursor: rowProps ? 'pointer' : undefined,
                                    }}
                                    {...rowProps}
                                >
                                    <div className="flex items-center gap-1.5">
                                        {EntryIcon && (
                                            <EntryIcon
                                                size={entryIconSize}
                                                className="shrink-0"
                                                style={{
                                                    color: cIcon.iconColor ?? cIcon.color ?? 'var(--text-secondary)',
                                                    animation: condAnimation(cIcon),
                                                }}
                                            />
                                        )}
                                        <div className="flex-1 min-w-0" style={labelContainerStyle}>
                                            <span
                                                className={`block ${labelWrapCls}${entryFontSize ? '' : ' text-[11px]'}`}
                                                style={{
                                                    color: cName.color ?? 'var(--text-primary)',
                                                    fontSize: entryFontSize ?? undefined,
                                                    fontWeight: cName.bold ? 700 : undefined,
                                                    fontStyle: cName.italic ? 'italic' : undefined,
                                                    animation: condAnimation(cName),
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
                                                        t as (k: string, v?: Record<string, string | number>) => string,
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
                                            globalThresholds={globalThresholds}
                                            decimals={entry.decimals ?? defaultDecimals}
                                            numFmt={entry.numberFormat ?? globalNumFmt}
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
                        {visibleEntries.map((entry, i) => {
                            // A separator is a row like any other - it just renders as a rule.
                            if (isDivider(entry))
                                return <SectionBreak key={entry.id} entry={entry} variant="wrap" first={i === 0} />;
                            const val = states[entry.id]?.val ?? null;
                            const rc = conds.get(entry.id);
                            if (rowHidden(rc)) return null;
                            const cIcon = partOf(rc, 'icon');
                            const cName = partOf(rc, 'name');
                            const cValue = partOf(rc, 'value');
                            const label = getLabel(entry);
                            const writable = entry.writable !== false;
                            const trueLabel = entry.trueLabel ?? opts.trueText;
                            const falseLabel = entry.falseLabel ?? opts.falseText;
                            const hasLabels = !!(trueLabel || falseLabel);
                            const isBool = typeof val === 'boolean';
                            const isBoolLike = isBool || (typeof val === 'number' && (val === 0 || val === 1));
                            const on = val === true || val === 1;
                            const displayType = entry.displayType ?? 'auto';
                            const forceSwitch = displayType === 'switch';
                            const forceValue =
                                displayType === 'value' ||
                                displayType === 'slider' ||
                                NON_TOGGLE_DISPLAY_TYPES.has(displayType);
                            // Multi-state mapping (window handle etc.): match the value to a
                            // configured state so the badge shows its label + color.
                            const stateMatch =
                                displayType === 'states'
                                    ? (entry.states ?? []).find((s) => String(s.value) === String(val))
                                    : undefined;
                            // Window/door contact mapping (HmIP/Boolean/… → closed/tilted/open).
                            const contactMatch =
                                displayType === 'contact' ? resolveContactDisplay(entry, val) : undefined;
                            // Display-only conversion / time format (per DP or list-wide).
                            const disp = entryValueText(
                                entry,
                                opts,
                                val,
                                entry.decimals ?? defaultDecimals,
                                entry.numberFormat ?? globalNumFmt,
                                t,
                            );
                            // Time datapoint rendered as time/date instead of the raw value.
                            // A datepicker entry has no room for its fields in a badge, so it
                            // prints the picked value in the format it was written in.
                            const timeText =
                                displayType === 'time'
                                    ? formatEntryTime(entry, disp.value, t)
                                    : displayType === 'datepicker'
                                      ? entryDateText(entry, val)
                                      : null;
                            const useRoleDisplay = !forceSwitch && !forceValue && isBoolLike && !hasLabels;
                            const roleDisplay = useRoleDisplay ? getRoleDisplay(entry.role, val) : null;
                            const truthy = on || (typeof val === 'number' && val > 0);
                            const switchActive = forceSwitch ? truthy : isBoolLike && on;
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
                                        : forceSwitch || (isBoolLike && hasLabels)
                                          ? switchActive
                                              ? trueLabel || 'AN'
                                              : falseLabel || 'AUS'
                                          : plainText != null
                                            ? `${plainText}${entry.unit && !disp.isTime ? `\u202f${entry.unit}` : ''}`
                                            : '–');
                            const threshColor =
                                !switchActive && !roleDisplay
                                    ? getThresholdColor(
                                          disp.value,
                                          entry.colorThresholds?.length ? entry.colorThresholds : globalThresholds,
                                      )
                                    : null;
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
                                  : (threshColor ??
                                    (roleDisplay
                                        ? roleDisplay.color
                                        : switchActive
                                          ? entryActiveColor
                                          : hasLabels
                                            ? entryInactiveColor
                                            : null));
                            const EntryIcon = contactMatch
                                ? getWidgetIcon(contactMatch.icon, null!)
                                : (stateMatch?.icon ?? entry.icon)
                                  ? getWidgetIcon(stateMatch?.icon ?? entry.icon, null!)
                                  : null;
                            const clickable = writable && !roleDisplay && !forceValue && (forceSwitch || isBoolLike);

                            const entryIconSize = entry.iconSize ?? 11;
                            const entryFontSize = entry.fontSize;
                            const lcTs = entry.showLastChange ? states[entry.id]?.lc || states[entry.id]?.ts || 0 : 0;
                            const lcText =
                                lcTs > 0
                                    ? formatLastChange(
                                          t as (k: string, v?: Record<string, string | number>) => string,
                                          lcTs,
                                      )
                                    : '';
                            // A badge is the whole row, so toggling and opening a popup would
                            // collide: automatic mode only takes over badges without a toggle
                            // of their own (sensors, read-only, numeric). An explicitly
                            // configured action beats the toggle.
                            const togglable = clickable && !rowPopup.explicit(entry.clickAction);
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
                                        if (!togglable) return rowProps?.onClick(e);
                                        if (forceSwitch) {
                                            if (isBool) setState(entry.id, !truthy);
                                            else if (typeof val === 'number') setState(entry.id, truthy ? 0 : 1);
                                            else setState(entry.id, !truthy);
                                        } else if (isBool) setState(entry.id, !on);
                                        else if (isBoolLike) setState(entry.id, on ? 0 : 1);
                                    }}
                                    title={lcText || undefined}
                                    className={
                                        entryFontSize
                                            ? 'flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium transition-colors hover:opacity-80'
                                            : 'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors hover:opacity-80'
                                    }
                                    style={{
                                        background:
                                            stateBg ??
                                            (pillColor
                                                ? `color-mix(in srgb, ${pillColor} 12%, transparent)`
                                                : 'var(--app-bg)'),
                                        color: pillColor ?? 'var(--text-secondary)',
                                        border: `1px solid ${stateBg ? 'transparent' : pillColor ? `color-mix(in srgb, ${pillColor} 34%, transparent)` : 'var(--widget-border)'}`,
                                        cursor: togglable || rowProps ? 'pointer' : 'default',
                                        fontSize: entryFontSize ?? undefined,
                                    }}
                                >
                                    {EntryIcon && (
                                        <EntryIcon
                                            size={entryIconSize}
                                            className="shrink-0 opacity-70"
                                            style={{
                                                color: cIcon.iconColor ?? cIcon.color,
                                                animation: condAnimation(cIcon),
                                            }}
                                        />
                                    )}
                                    <span
                                        className="opacity-70 truncate"
                                        style={{
                                            maxWidth: 80,
                                            color: cName.color,
                                            fontWeight: cName.bold ? 700 : undefined,
                                            fontStyle: cName.italic ? 'italic' : undefined,
                                            animation: condAnimation(cName),
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
                                                    (forceSwitch || isBoolLike || roleDisplay
                                                        ? 'inherit'
                                                        : 'var(--text-primary)'),
                                                fontWeight: cValue.bold ? 700 : undefined,
                                                fontStyle: cValue.italic ? 'italic' : undefined,
                                                animation: condAnimation(cValue),
                                            }}
                                        >
                                            {cValue.text ?? valueStr}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
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
                <div className={fillClsY}>
                    {visibleEntries.map((entry, i) => {
                        // A separator is a row like any other - it just renders as a rule.
                        if (isDivider(entry))
                            return <SectionBreak key={entry.id} entry={entry} variant="stack" first={i === 0} />;
                        const val = states[entry.id]?.val ?? null;
                        const rc = conds.get(entry.id);
                        if (rowHidden(rc)) return null;
                        const cIcon = partOf(rc, 'icon');
                        const cName = partOf(rc, 'name');
                        const cValue = partOf(rc, 'value');
                        const label = getLabel(entry);
                        const iconName = cIcon.icon ?? entry.icon;
                        const EntryIcon = iconName && !cIcon.hide ? getWidgetIcon(iconName, null!) : null;
                        const eOn = isActive(val);
                        const entryActiveColor = entry.activeColor || globalActiveColor;
                        const entryInactiveColor = entry.inactiveColor || globalInactiveColor;
                        const stateBg =
                            rc?.row?.bg ??
                            (eOn ? entry.activeBg || globalActiveBg : entry.inactiveBg || globalInactiveBg);

                        const entryIconSize = entry.iconSize ?? 13;
                        const entryFontSize = entry.fontSize;
                        const lcTs = entry.showLastChange ? states[entry.id]?.lc || states[entry.id]?.ts || 0 : 0;
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
                                className="flex flex-col gap-1 px-3 py-2"
                                style={{
                                    background: stateBg,
                                    animation: condAnimation(rc?.row),
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
                                                color: cIcon.iconColor ?? cIcon.color ?? 'var(--text-secondary)',
                                                animation: condAnimation(cIcon),
                                            }}
                                        />
                                    )}
                                    <div className="flex-1 min-w-0" style={labelContainerStyle}>
                                        <div
                                            className={`${labelWrapCls}${entryFontSize ? '' : ' text-xs'}`}
                                            style={{
                                                color: cName.color ?? 'var(--text-primary)',
                                                fontSize: entryFontSize ?? undefined,
                                                fontWeight: cName.bold ? 700 : undefined,
                                                fontStyle: cName.italic ? 'italic' : undefined,
                                                animation: condAnimation(cName),
                                            }}
                                        >
                                            {!cName.hide && (cName.text ?? label)}
                                        </div>
                                        {opts.showRoom && (resolvedRooms[entry.id]?.join(', ') || null) && (
                                            <div
                                                className="text-[10px] truncate"
                                                style={{ color: 'var(--text-secondary)' }}
                                            >
                                                {resolvedRooms[entry.id].join(', ')}
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
                                                    t as (k: string, v?: Record<string, string | number>) => string,
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
                                        globalThresholds={globalThresholds}
                                        decimals={entry.decimals ?? defaultDecimals}
                                        numFmt={entry.numberFormat ?? globalNumFmt}
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
                </div>
            )}
            {lcOverlay}
        </div>
    );
}
