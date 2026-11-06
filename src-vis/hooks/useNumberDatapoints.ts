import { useEffect, useState } from 'react';
import { getObjectDirect } from './useIoBroker';

/** Roles that make a 0/1 number a toggle after all (adapters that model a switch as a number). */
const TOGGLE_ROLE = /^(switch|button)(\.|$)/i;

/**
 * The datapoints among `ids` whose object declares `common.type: number` — read from the
 * (cached) objects. A list's display "Auto" draws a 0/1 value as a switch; for these it must
 * stay a number, or a counter reading 0 turns into a toggle. Number datapoints with a
 * switch/button role keep the toggle.
 */
export function useNumberDatapoints(ids: string[]): Set<string> {
    const [numeric, setNumeric] = useState<Set<string>>(() => new Set());
    const key = ids.join('|');
    useEffect(() => {
        let alive = true;
        const wanted = [...new Set(ids.filter((id) => !!id && !id.includes('{{')))];
        Promise.all(wanted.map((id) => getObjectDirect(id).catch(() => null))).then((objs) => {
            if (!alive) return;
            const next = new Set<string>();
            objs.forEach((obj, i) => {
                const common = obj?.common as { type?: string; role?: string } | undefined;
                if (common?.type === 'number' && !TOGGLE_ROLE.test(common.role ?? '')) next.add(wanted[i]);
            });
            setNumeric((prev) => (prev.size === next.size && [...next].every((id) => prev.has(id)) ? prev : next));
        });
        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
    return numeric;
}
