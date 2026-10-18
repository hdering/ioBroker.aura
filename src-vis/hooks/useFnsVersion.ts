import { useSyncExternalStore } from 'react';
import { getFnsVersion, subscribeFns } from '../utils/fnRegistry';

/**
 * Changes whenever Custom JS registers or drops a `callback()` function — a value
 * computed with one has to be recomputed then (issue #794).
 */
export function useFnsVersion(): number {
    return useSyncExternalStore(subscribeFns, getFnsVersion, getFnsVersion);
}
