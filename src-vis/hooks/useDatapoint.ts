import { useState, useEffect } from 'react';
import { useIoBroker, getStateFromCache } from './useIoBroker';
import type { ioBrokerState } from '../types';

/**
 * Hook für einen einzelnen ioBroker-Datenpunkt.
 * Abonniert Änderungen und liefert den aktuellen Wert sowie eine Setter-Funktion.
 */
export function useDatapoint(id: string) {
  const { subscribe, setState, getState, connected } = useIoBroker();
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
    setState(id, val);
  };

  return {
    state,
    value: state?.val ?? null,
    setValue,
  };
}
