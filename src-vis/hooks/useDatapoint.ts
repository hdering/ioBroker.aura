import { useState, useEffect, useMemo, useRef } from 'react';
import { useIoBroker, getStateFromCache, isStateFresh } from './useIoBroker';
import type { ioBrokerState } from '../types';
import { splitDpRef, resolveDpValue } from '../utils/dpRef';

/**
 * Hook für einen einzelnen ioBroker-Datenpunkt.
 * Abonniert Änderungen und liefert den aktuellen Wert sowie eine Setter-Funktion.
 *
 * Der Datenpunkt darf einen JSON-Pfad-Suffix tragen (z. B. `…battery#soc`),
 * dann wird der verschachtelte Wert aus einem Objekt-/JSON-State extrahiert.
 * Das Abonnement läuft immer gegen die bare State-ID.
 */
export function useDatapoint(ref: string) {
    const { subscribe, setState, getState, connected } = useIoBroker();
    // Split once: the base ID drives the socket, the path drives value extraction.
    const { id, path } = useMemo(() => splitDpRef(ref), [ref]);
    // Initialize from prefetch cache so widgets render with real values immediately (no null-flash).
    // The id is carried along: a widget may point the SAME hook at another datapoint
    // (the aircontrol widget swaps setpoint and fan speed when the operation mode
    // changes), and the previous datapoint's value must not be shown under the new
    // id — it would read as live and, where the new id does not exist at all, would
    // never be corrected. Everything below therefore stamps the id it belongs to,
    // and a value stamped with a foreign id counts as "nothing yet".
    const [entry, setEntry] = useState<{ id: string; state: ioBrokerState | null }>(() => ({
        id,
        state: id ? getStateFromCache(id) : null,
    }));
    const state = entry.id === id ? entry.state : null;
    // The id this hook currently stands for, readable from an async callback.
    const liveId = useRef(id);
    liveId.current = id;

    useEffect(() => {
        if (!id) {
            setEntry((prev) => (prev.id === id ? prev : { id, state: null }));
            return;
        }
        if (!connected) return;

        // Adopt whatever the cache holds now: it may have been filled AFTER this
        // component mounted (the load-time prefetch resolves independently), in which
        // case the initializer above saw nothing and the fetch below is skipped as
        // redundant — leaving the widget on its placeholder with a perfectly good
        // value sitting in the cache. Keep an existing local value, it is never older.
        const cached = getStateFromCache(id);
        setEntry((prev) => {
            if (prev.id !== id) return { id, state: cached };
            return cached && !prev.state ? { id, state: cached } : prev;
        });

        // Skip the socket round-trip only when the cached value is backed by a live
        // subscription (another mounted consumer of the same DP). A cached value with
        // no subscription behind it may be arbitrarily old — it stopped being updated
        // the moment the last subscriber went away, which is what left popups showing
        // the value from their previous open. Checked BEFORE subscribing below, since
        // subscribing is what marks the ID as maintained.
        if (!isStateFresh(id)) {
            getState(id).then((initialState) => {
                // A late answer for a datapoint this hook has already moved away from
                // must not overwrite the current one. Keyed on the id rather than on
                // the effect's lifetime: under StrictMode the first effect is torn down
                // immediately, and its answer is still the right one for this id.
                if (initialState && liveId.current === id) setEntry({ id, state: initialState });
            });
        }

        // Live-Updates abonnieren
        return subscribe(id, (newState) => {
            setEntry({ id, state: newState });
        });
    }, [id, connected, subscribe, getState]);

    const setValue = (val: boolean | number | string) => {
        // Writes always target the bare state ID; nested JSON sub-paths are read-only.
        setState(id, val);
    };

    // Keep the public contract a primitive (boolean | number | string | null) so all
    // existing widgets keep rendering `value` directly. A JSON path that resolves to an
    // object/array is shown as compact JSON rather than breaking React.
    const value = useMemo<ioBrokerState['val']>(() => {
        const resolved = resolveDpValue(state?.val, path);
        if (resolved === null || resolved === undefined) return null;
        const t = typeof resolved;
        if (t === 'boolean' || t === 'number' || t === 'string') return resolved as boolean | number | string;
        try {
            return JSON.stringify(resolved);
        } catch {
            return null;
        }
    }, [state, path]);

    return {
        state,
        value,
        setValue,
    };
}
