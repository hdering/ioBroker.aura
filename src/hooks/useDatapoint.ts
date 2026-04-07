import { useState, useEffect } from 'react';
import { useIoBroker } from './useIoBroker';
import type { ioBrokerState } from '../types';

/**
 * Hook für einen einzelnen ioBroker-Datenpunkt.
 * Abonniert Änderungen und liefert den aktuellen Wert sowie eine Setter-Funktion.
 */
export function useDatapoint(id: string) {
  const { subscribe, setState, getState, connected } = useIoBroker();
  const [state, setDatapointState] = useState<ioBrokerState | null>(null);

  useEffect(() => {
    if (!id || !connected) return;

    // Initialen Wert holen
    getState(id).then((initialState) => {
      if (initialState) setDatapointState(initialState);
    });

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
