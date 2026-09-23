/**
 * Live text of a widget's header items (issue #676) — see utils/headerItems for the
 * slots and sources. The frame calls this itself: a folded widget has no body that
 * could deliver its values, so every datapoint an item reads is subscribed here.
 * Nothing is subscribed while no item is visible, which is the case for virtually
 * every widget.
 */
import { useMemo } from 'react';
import { useTemplateStates } from './useTemplateValues';
import { useGlobalSettingsStore } from '../store/globalSettingsStore';
import { formatNum } from '../utils/formatValue';
import { renderTemplate } from '../utils/htmlTemplate';
import {
    LIST_VAR,
    conditionValues,
    dpItemTemplate,
    headerConditionRefs,
    headerItemPasses,
    headerSourceCtx,
    fmtNumber,
    headerItemRefs,
    headerItemVisible,
    headerItems,
    itemUsesList,
    itemUsesOwn,
    listValues,
    ownValue,
    widgetItemText,
    type ListValues,
    type OwnValue,
    type ValueFormat,
} from '../utils/headerItems';
import { useT } from '../i18n';
import type { WidgetHeaderSlot, WidgetConfig } from '../types';
import type { LucideIcon } from 'lucide-react';

export interface ResolvedHeaderItem {
    id: string;
    slot: WidgetHeaderSlot;
    text: string;
    icon?: string;
    color?: string;
    /** Source 'action': the click-action icon, drawn as a button that runs the action. */
    action?: boolean;
    ActionIcon?: LucideIcon;
}

const NONE: ResolvedHeaderItem[] = [];

/**
 * `active` false = the caller draws no header items right now; nothing is
 * subscribed then (the fold state decides which items are visible at all).
 */
export function useHeaderItems(
    config: WidgetConfig,
    collapsed: boolean,
    active = true,
    actionIcon?: LucideIcon,
): ResolvedHeaderItem[] {
    const t = useT();
    const { defaultDecimals, numberFormat } = useGlobalSettingsStore();
    const stored = config.options?.headerItems;
    const items = useMemo(
        () => (active ? headerItems(config.options).filter((i) => headerItemVisible(i, collapsed)) : []),
        // Only the item list and the fold state decide which items render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [stored, collapsed, active],
    );
    const entries = config.options?.entries;
    // Conditions (step 4) read the same sources as markers: own datapoint, list tokens.
    const ctx = useMemo(
        () => headerSourceCtx(config),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [config.datapoint, config.type, entries],
    );
    const refs = useMemo(
        () =>
            items.length ? [...new Set([...headerItemRefs(items, config), ...headerConditionRefs(items, ctx)])] : [],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [items, config.datapoint, config.type, entries, ctx],
    );
    const states = useTemplateStates(refs);

    return useMemo(() => {
        if (!items.length) return NONE;
        const fmt: ValueFormat = {
            formatNum: (n, d) => formatNum(n, d, numberFormat),
            defaultDecimals,
        };
        const ownRef = config.datapoint?.trim();
        const own: OwnValue | null =
            ownRef && items.some(itemUsesOwn) ? ownValue(config, states[ownRef]?.val ?? null, fmt) : null;
        const list: ListValues | null = items.some(itemUsesList) ? listValues(config, states) : null;

        const vars: Record<string, string> = {};
        const rawVars: Record<string, unknown> = {};
        if (own) {
            vars.dp = own.text;
            rawVars.dp = own.raw;
        }
        if (list) {
            for (const name of Object.values(LIST_VAR)) {
                const counted = name === 'count' || name === 'active';
                vars[name] = fmtNumber(list.raw[name], fmt, counted ? 0 : undefined);
                rawVars[name] = list.raw[name];
            }
        }
        const render = (template: string) =>
            renderTemplate(template, {
                vars,
                rawVars,
                resolve: (ref) => fmtNumber(states[ref]?.val ?? null, fmt),
                resolveRaw: (ref, field) => states[ref]?.[field] ?? null,
                ops: { formatNum: fmt.formatNum, decimals: defaultDecimals, t },
            });

        const values = items.some((i) => i.clauses?.length) ? conditionValues(states, ctx) : null;
        const out: ResolvedHeaderItem[] = [];
        for (const item of items) {
            // A condition that does not hold takes the item out entirely — no gap.
            if (values && !headerItemPasses(item, values, ctx)) continue;
            if (item.source === 'action') {
                out.push({
                    id: item.id,
                    slot: item.slot,
                    text: '',
                    color: item.color,
                    action: true,
                    ActionIcon: actionIcon,
                });
                continue;
            }
            let text = '';
            if (item.source === 'dp') text = render(dpItemTemplate(item));
            else if (item.source === 'text') text = item.text ? render(item.text) : '';
            else text = widgetItemText(item, own, list, fmt);
            // An item with nothing to say takes no room — no empty gap in the row.
            if (!text.trim() && !item.icon) continue;
            out.push({ id: item.id, slot: item.slot, text, icon: item.icon, color: item.color });
        }
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items, states, defaultDecimals, numberFormat, t, config.datapoint, config.options, actionIcon, ctx]);
}
