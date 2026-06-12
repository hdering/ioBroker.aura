import { useState, useEffect, useMemo } from 'react';
import { useIoBroker, getStateFromCache } from './useIoBroker';
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
    const [state, setDatapointState] = useState<ioBrokerState | null>(() => (id ? getStateFromCache(id) : null));

    useEffect(() => {
        if (!id || !connected) return;

        // Skip the socket round-trip when the prefetch already populated the cache.
        // The subscribe callback below delivers any subsequent value changes.
        if (!getStateFromCache(id)) {
            getState(id).then((initialState) => {
                if (initialState) setDatapointState(initialState);
            });
        }

        // Live-Updates abonnieren
        const unsubscribe = subscribe(id, (newState) => {
            setDatapointState(newState);
        });

        return unsubscribe;
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
