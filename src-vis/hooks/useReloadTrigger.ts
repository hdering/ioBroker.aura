import { useEffect, useRef, useState } from 'react';
import { useDatapoint } from './useDatapoint';

/**
 * Counter that increments every time the given datapoint is written — value
 * change or the same value again (the state's `ts` moves either way).
 *
 * Lets a script tell a widget "the content behind your URL changed, load it
 * again" (issue #853): a browser cannot learn that on its own. The first state
 * seen is only the baseline and never counts. Returns 0 without a datapoint.
 */
export function useReloadTrigger(ref: string): number {
    const { state } = useDatapoint(ref);
    const [nonce, setNonce] = useState(0);
    const lastTs = useRef<number | null>(null);

    useEffect(() => {
        lastTs.current = null;
    }, [ref]);

    useEffect(() => {
        if (!state) return;
        const ts = state.ts ?? 0;
        if (lastTs.current !== null && ts !== lastTs.current) setNonce((n) => n + 1);
        lastTs.current = ts;
    }, [state]);

    return ref ? nonce : 0;
}
