/**
 * Header items (issue #676): extra values in a widget's header — a free datapoint, a
 * value the widget already has, or a text with bindings — each on one of five slots:
 *
 *   [icon] Title           [r1-center]           [r1-right]
 *   [r2-left]              [r2-center]           [r2-right]     ← only when used
 *
 * The folded card draws them in its own header (WidgetFrame); expanded, the widget
 * places them into its own title row (components/layout/HeaderSlotsContext). The
 * values have to work without the widget body: it is not even mounted while folded. Everything a
 * value needs is therefore derived here from the stored config plus the live states
 * the frame subscribes to — the list aggregates run over `options.entries`, which the
 * dynamic list persists, exactly like the list tokens of markers and conditions.
 *
 * Pure logic, testable without a browser (tools/tests/header-items-logic.mjs).
 */
import type { WidgetHeaderItem, WidgetHeaderSource, WidgetHeaderSlot, WidgetConfig } from '../types';
import type { TranslationKey } from '../i18n';
import { extractTemplateDpRefs } from './htmlTemplate';
import { computeListStats } from './listStats';
import { isActiveVal } from './groupTargets';
import { applyValueTransform } from './valueTransform';
import {
    applySourceValues,
    clauseSourceRefs,
    evaluateConditionWithSource,
    widgetSourceCtx,
    type DpSourceCtx,
} from './conditionSources';
import type { ValueTransformSettings } from './valueTransform';

export const HEADER_SLOTS: readonly WidgetHeaderSlot[] = ['r1-center', 'r1-right', 'r2-left', 'r2-center', 'r2-right'];
export const DEFAULT_HEADER_SLOT: WidgetHeaderSlot = 'r1-right';
const SOURCES: readonly WidgetHeaderSource[] = ['dp', 'widget', 'text', 'action'];

/** The stored items, with anything malformed dropped and an unknown slot moved right. */
export function headerItems(options: Record<string, unknown> | undefined): WidgetHeaderItem[] {
    const raw = options?.headerItems;
    if (!Array.isArray(raw)) return [];
    return raw
        .filter(
            (x): x is WidgetHeaderItem =>
                !!x &&
                typeof x === 'object' &&
                typeof (x as WidgetHeaderItem).id === 'string' &&
                SOURCES.includes((x as WidgetHeaderItem).source),
        )
        .map((x) => (HEADER_SLOTS.includes(x.slot) ? x : { ...x, slot: DEFAULT_HEADER_SLOT }));
}

export function headerItemVisible(item: WidgetHeaderItem, collapsed: boolean): boolean {
    const show = item.show ?? 'always';
    if (show === 'always') return true;
    return (show === 'collapsed') === collapsed;
}

let seq = 0;
export function newHeaderItem(
    slot: WidgetHeaderSlot = DEFAULT_HEADER_SLOT,
    source: WidgetHeaderSource = 'dp',
): WidgetHeaderItem {
    seq += 1;
    return { id: `hi-${Date.now().toString(36)}-${seq}`, source, slot };
}

// ── Widget values ─────────────────────────────────────────────────────────────

export type ListValueKey = 'list:sum' | 'list:avg' | 'list:min' | 'list:max' | 'list:count' | 'list:active';
export const LIST_VALUE_KEYS: readonly ListValueKey[] = [
    'list:sum',
    'list:avg',
    'list:min',
    'list:max',
    'list:count',
    'list:active',
];

/** Template variable behind each list value — `{sum}`, `{count}` … in a text item. */
export const LIST_VAR: Record<ListValueKey, string> = {
    'list:sum': 'sum',
    'list:avg': 'avg',
    'list:min': 'min',
    'list:max': 'max',
    'list:count': 'count',
    'list:active': 'active',
};

export interface WidgetValueOption {
    key: string;
    labelKey: TranslationKey;
    /** Free text shown after the translated label (a custom-layout cell's position and datapoint). */
    detail?: string;
}

/**
 * A value the widget reads from a datapoint of its own beyond the main one: the
 * thermostat's actual temperature, the room climate's target / humidity / pressure
 * and its extra readings, a custom-layout cell. Formatted like the widget does.
 */
export interface ExtraValue extends WidgetValueOption {
    dp: string;
    unit?: string;
    decimals?: number;
    factor?: number;
    offset?: number;
}

const TEMP_TYPES = new Set(['thermostat', 'climate']);

interface CellLike {
    type?: string;
    dpId?: string;
    prefix?: string;
    suffix?: string;
    decimals?: number;
    valueFactor?: number;
    valueOffset?: number;
}

/** The cells of a custom layout, whichever of the two stored shapes it has. */
function customCells(options: Record<string, unknown> | undefined): { cells: CellLike[]; cols: number } {
    const raw = options?.customGrid as unknown;
    if (Array.isArray(raw)) return { cells: raw as CellLike[], cols: 3 };
    if (raw && typeof raw === 'object' && Array.isArray((raw as { cells?: unknown }).cells)) {
        const def = raw as { cells: CellLike[]; cols?: number };
        return { cells: def.cells, cols: Math.max(1, def.cols || 3) };
    }
    return { cells: [], cols: 3 };
}

function lastSegment(id: string): string {
    const parts = id.split('.');
    return parts[parts.length - 1] || id;
}

/** Every extra value this widget offers, keyed like `widgetValue`. */
export function extraWidgetValues(config: WidgetConfig): ExtraValue[] {
    const o = config.options ?? {};
    const out: ExtraValue[] = [];
    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const tempUnit = str(o.unit) || '°C';
    const decimals = typeof o.decimals === 'number' ? o.decimals : undefined;
    if (config.type === 'thermostat') {
        const actual = str(o.actualDatapoint);
        if (actual)
            out.push({ key: 'thermo:actual', labelKey: 'hdr.val.actual', dp: actual, unit: tempUnit, decimals });
    }
    if (config.type === 'climate') {
        const target = str(o.targetDatapoint);
        const humidity = str(o.humidityDatapoint);
        const pressure = str(o.pressureDatapoint);
        if (target)
            out.push({ key: 'climate:target', labelKey: 'hdr.val.target', dp: target, unit: tempUnit, decimals });
        if (humidity)
            out.push({ key: 'climate:humidity', labelKey: 'hdr.val.humidity', dp: humidity, unit: '%', decimals: 0 });
        if (pressure)
            out.push({ key: 'climate:pressure', labelKey: 'hdr.val.pressure', dp: pressure, unit: 'hPa', decimals: 0 });
        const metrics = Array.isArray(o.metrics) ? (o.metrics as Array<Record<string, unknown>>) : [];
        for (const m of metrics) {
            // Only readings with a datapoint of their own; dew point, absolute humidity and
            // comfort are computed by the widget and not repeated here.
            const dp = str(m.datapoint);
            if ((m.source ?? 'datapoint') !== 'datapoint' || !dp || typeof m.id !== 'string') continue;
            out.push({
                key: `metric:${m.id}`,
                labelKey: 'hdr.val.metric',
                detail: str(m.label) || lastSegment(dp),
                dp,
                unit: str(m.unit) || undefined,
                decimals: typeof m.decimals === 'number' ? m.decimals : decimals,
            });
        }
    }
    if (config.layout === 'custom') {
        const { cells, cols } = customCells(o);
        cells.forEach((c, i) => {
            const dp = str(c?.dpId);
            if (!dp) return;
            out.push({
                key: `cell:${i}`,
                labelKey: 'hdr.val.cell',
                detail: `${Math.floor(i / cols) + 1}/${(i % cols) + 1} · ${str(c.prefix) || lastSegment(dp)}`,
                dp,
                unit: str(c.suffix) || undefined,
                decimals: c.decimals,
                factor: c.valueFactor,
                offset: c.valueOffset,
            });
        });
    }
    return out;
}

/** The main value's label: what the main datapoint means for this type. */
function mainLabel(type: string): TranslationKey {
    if (type === 'thermostat') return 'hdr.val.target';
    if (type === 'climate') return 'hdr.val.temperature';
    return 'hdr.val.main';
}

function isListType(type: string): boolean {
    return type === 'list' || type === 'autolist';
}

interface EntryLike extends ValueTransformSettings {
    id: string;
    unit?: string;
}

/** The list entries a header value aggregates over (the dynamic list persists its discovery). */
export function listEntries(config: WidgetConfig): EntryLike[] {
    if (!isListType(config.type)) return [];
    const entries = config.options?.entries;
    if (!Array.isArray(entries)) return [];
    return (entries as EntryLike[]).filter((e) => typeof e?.id === 'string' && e.id.trim() !== '');
}

/** What the 'widget' source can pick for this widget. Empty = the source is unavailable. */
export function widgetValueOptions(config: WidgetConfig): WidgetValueOption[] {
    const out: WidgetValueOption[] = [];
    if (config.datapoint?.trim()) out.push({ key: 'main', labelKey: mainLabel(config.type) });
    if (isListType(config.type)) {
        for (const key of LIST_VALUE_KEYS) {
            out.push({ key, labelKey: `hdr.val.${LIST_VAR[key]}` as TranslationKey });
        }
    }
    for (const x of extraWidgetValues(config)) out.push({ key: x.key, labelKey: x.labelKey, detail: x.detail });
    return out;
}

// ── Subscriptions ─────────────────────────────────────────────────────────────

const LIST_TEXT_VAR_RE = /\{(sum|avg|min|max|count|active)(?:[;}?#])/;
const OWN_TEXT_VAR_RE = /\{dp(?:[;}?#])/;

/** True when an item reads the list entries (a list value, or a list variable in its text). */
export function itemUsesList(item: WidgetHeaderItem): boolean {
    if (item.source === 'widget') return (item.widgetValue ?? '').startsWith('list:');
    if (item.source === 'text') return LIST_TEXT_VAR_RE.test(item.text ?? '');
    return false;
}

/** True when an item reads the widget's own datapoint. */
export function itemUsesOwn(item: WidgetHeaderItem): boolean {
    if (item.source === 'widget') return item.widgetValue === 'main';
    if (item.source === 'text') return OWN_TEXT_VAR_RE.test(item.text ?? '');
    return false;
}

/** The extra value a 'widget' item points at, if it points at one. */
export function extraValueFor(item: WidgetHeaderItem, config: WidgetConfig): ExtraValue | null {
    if (item.source !== 'widget' || !item.widgetValue) return null;
    return extraWidgetValues(config).find((x) => x.key === item.widgetValue) ?? null;
}

/** Text of an extra value: the widget's own factor, decimals and unit; the item's win. */
export function extraValueText(item: WidgetHeaderItem, extra: ExtraValue, val: unknown, fmt: ValueFormat): string {
    const raw = applyValueTransform(val, Number(extra.factor ?? 1), Number(extra.offset ?? 0));
    const text = fmtNumber(raw, fmt, typeof item.decimals === 'number' ? item.decimals : extra.decimals);
    const unit = item.unit ?? extra.unit;
    return unit ? `${text} ${unit}` : text;
}

/** Template text of a 'dp' item: the datapoint, rounded when asked to, then the unit. */
export function dpItemTemplate(item: WidgetHeaderItem): string {
    const ref = item.dp?.trim();
    if (!ref) return '';
    const token = typeof item.decimals === 'number' ? `{${ref};formatValue(${item.decimals})}` : `{${ref}}`;
    return item.unit ? `${token} ${item.unit}` : token;
}

/** Every datapoint ref the visible items need, de-duplicated. */
export function headerItemRefs(items: WidgetHeaderItem[], config: WidgetConfig): string[] {
    const refs = new Set<string>();
    const own = config.datapoint?.trim();
    for (const item of items) {
        if (item.source === 'dp') for (const r of extractTemplateDpRefs(dpItemTemplate(item))) refs.add(r);
        if (item.source === 'text') for (const r of extractTemplateDpRefs(item.text)) refs.add(r);
        if (own && itemUsesOwn(item)) refs.add(own);
        if (itemUsesList(item)) for (const e of listEntries(config)) refs.add(e.id);
        const extra = extraValueFor(item, config);
        if (extra) refs.add(extra.dp);
    }
    return [...refs];
}

// ── Values ────────────────────────────────────────────────────────────────────

export interface ValueFormat {
    /** Locale-aware number rendering with a fixed number of decimals. */
    formatNum: (n: number, decimals: number) => string;
    /** Global default decimals — a maximum, like for markers: '12 min', not '12.00 min'. */
    defaultDecimals: number;
}

/** A number with the given decimals, or the global default as a maximum. */
export function fmtNumber(v: unknown, fmt: ValueFormat, decimals?: number): string {
    if (v === null || v === undefined) return '–';
    if (typeof v === 'boolean') return String(v);
    if (typeof v !== 'number' || !Number.isFinite(v)) return String(v);
    if (typeof decimals === 'number') return fmt.formatNum(v, Math.max(0, decimals));
    const rounded = Number(v.toFixed(Math.max(0, fmt.defaultDecimals)));
    return fmt.formatNum(rounded, (String(rounded).split('.')[1] ?? '').length);
}

export interface OwnValue {
    raw: unknown;
    text: string;
    unit?: string;
}

/** The widget's own value the way the widget would show it: value factor, decimals, unit. */
export function ownValue(config: WidgetConfig, val: unknown, fmt: ValueFormat, decimals?: number): OwnValue {
    const o = config.options ?? {};
    const raw = applyValueTransform(val, Number(o.valueFactor ?? 1), Number(o.valueOffset ?? 0));
    const d = typeof decimals === 'number' ? decimals : typeof o.decimals === 'number' ? o.decimals : undefined;
    // Thermostat and room climate show °C without a stored unit.
    const unit = typeof o.unit === 'string' && o.unit ? o.unit : TEMP_TYPES.has(config.type) ? '°C' : undefined;
    return { raw, text: fmtNumber(raw, fmt, d), unit };
}

export interface ListValues {
    /** Raw numbers (null when nothing numeric), keyed by variable name (sum, avg …). */
    raw: Record<string, number | null>;
    /** Shared unit of the entries, if any. */
    unit?: string;
}

/** Sum, mean, min, max over the numeric entries plus the entry count and how many are active. */
export function listValues(config: WidgetConfig, states: Record<string, { val?: unknown } | undefined>): ListValues {
    const entries = listEntries(config);
    const listDefault = config.options as ValueTransformSettings | undefined;
    const stats = computeListStats(entries, states, listDefault);
    const active = entries.filter((e) => isActiveVal((states[e.id]?.val ?? null) as never)).length;
    return {
        raw: {
            sum: stats?.sum ?? null,
            avg: stats?.avg ?? null,
            min: stats?.min ?? null,
            max: stats?.max ?? null,
            count: entries.length,
            active,
        },
        unit: stats?.unit,
    };
}

/** Text of a 'widget' item. Count and active carry no unit. */
export function widgetItemText(
    item: WidgetHeaderItem,
    own: OwnValue | null,
    list: ListValues | null,
    fmt: ValueFormat,
): string {
    const key = item.widgetValue ?? '';
    if (key === 'main') {
        if (!own) return '';
        const unit = item.unit ?? own.unit;
        return unit ? `${own.text} ${unit}` : own.text;
    }
    if (key.startsWith('list:') && list) {
        const name = LIST_VAR[key as ListValueKey];
        if (!name) return '';
        const counted = name === 'count' || name === 'active';
        const text = fmtNumber(list.raw[name], fmt, counted ? 0 : item.decimals);
        const unit = counted ? item.unit : (item.unit ?? list.unit);
        return unit ? `${text} ${unit}` : text;
    }
    return '';
}

// ── Conditions ────────────────────────────────────────────────────────────────

/** True when the item carries a condition of its own. */
export function hasItemCondition(item: WidgetHeaderItem): boolean {
    return Array.isArray(item.clauses) && item.clauses.length > 0;
}

/** The value sources a clause may name — the same ones markers and conditions offer. */
export function headerSourceCtx(config: WidgetConfig): DpSourceCtx {
    return widgetSourceCtx(config);
}

/** Datapoints the conditions of these items read. */
export function headerConditionRefs(items: WidgetHeaderItem[], ctx: DpSourceCtx): string[] {
    const refs = new Set<string>();
    for (const item of items) {
        if (!hasItemCondition(item)) continue;
        for (const clause of item.clauses ?? []) for (const r of clauseSourceRefs(clause, ctx)) if (r) refs.add(r);
    }
    return [...refs];
}

/**
 * The value map the clause evaluation reads: every subscribed value by its ref,
 * plus the derived tokens (own datapoint, list count / active / sum …).
 */
export function conditionValues(
    states: Record<string, { val?: unknown } | undefined>,
    ctx: DpSourceCtx,
): Map<string, unknown> {
    const values = new Map<string, unknown>();
    for (const [ref, st] of Object.entries(states)) values.set(ref, st?.val ?? null);
    applySourceValues(values, ctx);
    return values;
}

/** Whether the item's condition currently holds; an item without one always passes. */
export function headerItemPasses(item: WidgetHeaderItem, values: Map<string, unknown>, ctx: DpSourceCtx): boolean {
    if (!hasItemCondition(item)) return true;
    return evaluateConditionWithSource({ logic: item.logic ?? 'AND', clauses: item.clauses ?? [] }, values, ctx);
}

// ── Layout ────────────────────────────────────────────────────────────────────

export type SlotMap<T> = Record<WidgetHeaderSlot, T[]>;

/** Items grouped by slot, in list order. */
export function groupBySlot<T extends { slot: WidgetHeaderSlot }>(items: T[]): SlotMap<T> {
    const out = Object.fromEntries(HEADER_SLOTS.map((s) => [s, [] as T[]])) as SlotMap<T>;
    for (const item of items) out[item.slot].push(item);
    return out;
}

/** True when anything sits on the second row — only then does the row exist. */
export function hasSecondRow<T extends { slot: WidgetHeaderSlot }>(items: T[]): boolean {
    return items.some((i) => i.slot.startsWith('r2-'));
}
