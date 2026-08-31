/**
 * Live datapoint values inside a widget title.
 *
 * Two placeholder layers exist and they do different jobs:
 *   `{{parent}}`  – static string substitution, applied ONCE when a popup view opens
 *                   (see utils/popupPlaceholders). It rewrites text, never reads a value.
 *   `[[dp]]`      – this file: the token is resolved at render time by subscribing to
 *                   the datapoint, so the title follows the value.
 *
 * They compose, because the static layer runs first: a title of
 * `[[{{parent}}.TempLiving]] °C` becomes `[[0_userdata.0.Räume.TempLiving]] °C`
 * on open and then renders the live temperature.
 *
 * For titles, widgets do NOT wire this up themselves — `useResolvedTitle` runs at the
 * render boundaries (WidgetFrame, popup view cell, widget embed, mirror), which hands
 * every widget an already-resolved `config.title`. The exported component covers the
 * places that render a heading without going through a widget, e.g. the popup dialog.
 *
 * Row labels are the exception: the list widgets call `useDpTokenResolver` themselves,
 * because each row resolves a different datapoint. There the static layer is
 * `substituteItemVars` (utils/nameFilter) — the same `{{parent}}` tokens, but derived
 * from the row's own id, so one name pattern serves every row.
 *
 * A token may carry a JSON path (`[[dp?battery.soc]]`) — the whole token body is
 * handed to splitDpRef/resolveDpValue, which own that syntax.
 *
 * Finding the tokens and turning one value into text is utils/dpTokens — pure, and
 * shared with the frozen reading a condition's message uses (utils/notifyTemplate).
 */
import { useEffect, useMemo, useState } from 'react';
import { useIoBroker, getStateFromCache, isStateFresh } from '../../hooks/useIoBroker';
import { splitDpRef, resolveDpValue } from '../../utils/dpRef';
import { dpTokenRefs, dpValueText, hasDpToken, replaceDpTokens } from '../../utils/dpTokens';
import type { ioBrokerState } from '../../types';

/**
 * Resolves `[[dp]]` tokens for a whole set of texts at once and returns the mapper that
 * applies the current values to any one of them.
 *
 * Lists need this shape: each row can carry its own tokens (`[[{{parent}}.Name]]` points
 * somewhere else per row), and a row count that changes between renders rules out one hook
 * per row. A single union of references means one subscription set for the whole list.
 *
 * `fallback` is what a row falls back to when its tokens resolve to nothing — a datapoint
 * that does not exist would otherwise blank the label instead of showing the plain name.
 *
 * Subscribes to nothing when no text holds a token — the case for virtually every list,
 * so this is safe to call unconditionally.
 */
export function useDpTokenResolver(texts: string[]): (text: string, fallback?: string) => string {
    const { subscribe, getState, connected } = useIoBroker();
    // Depend on the contents, not the array identity: call sites build this list inline
    // per render, and an equal list must not tear down and rebuild the subscriptions.
    const textKey = texts.join('\n');
    const refs = useMemo(() => {
        const set = new Set<string>();
        for (const t of texts) for (const ref of dpTokenRefs(t)) set.add(ref);
        return [...set];
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [textKey]);
    const refKey = refs.join(' ');
    const [values, setValues] = useState<Record<string, unknown>>({});

    useEffect(() => {
        if (refs.length === 0 || !connected) return;
        const unsubs: Array<() => void> = [];
        for (const ref of refs) {
            const { id, path } = splitDpRef(ref);
            if (!id) continue;
            const apply = (s: ioBrokerState | null) =>
                setValues((prev) => ({ ...prev, [ref]: resolveDpValue(s?.val, path) }));
            // Mirrors useDatapoint: adopt the prefetch cache for an instant first paint,
            // fetch only when no live subscription keeps that cache entry fresh.
            const cached = getStateFromCache(id);
            if (cached) apply(cached);
            if (!isStateFresh(id)) {
                getState(id).then((s) => {
                    if (s) apply(s);
                });
            }
            unsubs.push(subscribe(id, apply));
        }
        return () => unsubs.forEach((u) => u());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refKey, connected, subscribe, getState]);

    return useMemo(
        () =>
            (text: string, fallback?: string): string => {
                if (!hasDpToken(text)) return text;
                // Every token answers — an unknown value reads as nothing, which is
                // what keeps a title from showing its own placeholders while the
                // states are still on their way.
                const out = replaceDpTokens(text, (ref) => dpValueText(values[ref]));
                return out || fallback || '';
            },
        [values],
    );
}

/**
 * `text` with every `[[dp]]` token replaced by that datapoint's current value,
 * re-rendering as the values change. The single-string case of useDpTokenResolver.
 *
 * Returns the input unchanged and subscribes to nothing when it holds no token —
 * the case for virtually every title, so this is safe to call for every widget.
 */
export function useResolvedTitle(text: string): string {
    const texts = useMemo(() => [text], [text]);
    return useDpTokenResolver(texts)(text);
}

/** Renders `text` with its `[[dp]]` tokens resolved. For headings outside a widget —
 *  inside widgets the title arrives already resolved (see the file header). */
export function DynamicTitle({ text }: { text: string }) {
    return <>{useResolvedTitle(text)}</>;
}
