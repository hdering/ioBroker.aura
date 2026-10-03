import { useCallback, useMemo, useRef } from 'react';
import { useTemplateStates } from './useTemplateValues';
import { useIsDarkTheme } from '../contexts/BrightnessContext';
import {
    collectColorBindingRefs,
    resolveColorBindingsDeep,
    restoreColorBindingsDeep,
    type ColorLookup,
} from '../utils/colorBinding';

/**
 * A config with its datapoint-bound colours (#747) replaced by the live colour,
 * plus the matching `restore` for the body's write path.
 *
 * Feed it the config AFTER resolveDualDeep — a pair's halves are only bindings
 * once the half that applies has been picked. Keeps the input reference while
 * nothing is bound, so it does not defeat the memoisation downstream.
 */
export function useColorBindings<T>(value: T): {
    value: T;
    restore: <U>(next: U, raw: unknown) => U;
} {
    const dark = useIsDarkTheme();
    const refs = useMemo(() => collectColorBindingRefs(value), [value]);
    const states = useTemplateStates(refs);
    // Keyed on the VALUES, not on the states object: that one changes with every
    // timestamp, and a fresh render config per heartbeat would re-render the card.
    const sig = JSON.stringify(refs.map((r) => states[r]?.val ?? null));
    const statesRef = useRef(states);
    statesRef.current = states;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const lookup = useCallback<ColorLookup>((ref) => statesRef.current[ref]?.val, [sig]);
    const resolved = useMemo(
        () => (refs.length ? resolveColorBindingsDeep(value, lookup) : value),
        [value, refs, lookup],
    );
    const restore = useCallback(
        <U>(next: U, raw: unknown): U => (refs.length ? restoreColorBindingsDeep(next, raw, lookup, dark) : next),
        [refs, lookup, dark],
    );
    return { value: resolved, restore };
}
