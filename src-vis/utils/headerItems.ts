/**
 * Header items (issue #676): extra values in a widget's header — a free datapoint, a
 * value the widget already has, or a text with bindings — each on one of five slots:
 *
 *   [icon] Title           [r1-center]           [r1-right]
 *   [r2-left]              [r2-center]           [r2-right]     ← only when used
 *
 * The folded card draws them in its own header (WidgetFrame), so they have to work
 * without the widget body: that body is not even mounted while folded. Everything a
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
import type { ValueTransformSettings } from './valueTransform';

export const HEADER_SLOTS: readonly WidgetHeaderSlot[] = ['r1-center', 'r1-right', 'r2-left', 'r2-center', 'r2-right'];
export const DEFAULT_HEADER_SLOT: WidgetHeaderSlot = 'r1-right';
const SOURCES: readonly WidgetHeaderSource[] = ['dp', 'widget', 'text'];

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
    if (config.datapoint?.trim()) out.push({ key: 'main', labelKey: 'hdr.val.main' });
    if (isListType(config.type)) {
        for (const key of LIST_VALUE_KEYS) {
            out.push({ key, labelKey: `hdr.val.${LIST_VAR[key]}` as TranslationKey });
        }
    }
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
    const unit = typeof o.unit === 'string' && o.unit ? o.unit : undefined;
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
