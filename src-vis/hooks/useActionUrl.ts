import { useEffect, useMemo, useState } from 'react';
import { getStateFromCache, subscribeStateDirect, getStateDirect, isStateFresh } from './useIoBroker';
import { resolveActionUrl, urlTemplateRefs } from '../utils/actionUrl';

/**
 * Live counterpart of openActionUrl for URLs that stay on screen (iframe popup):
 * the datapoint placeholders are resolved and re-resolved when a value changes
 * (#1006). Without placeholders the URL is returned as configured.
 * `null` = a placeholder has no value (yet).
 */
export function useActionUrl(url: string | undefined, dpId?: string): string | null {
    const refs = useMemo(() => urlTemplateRefs(url, dpId), [url, dpId]);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        if (refs.length === 0) return;
        const bump = () => setTick((t) => t + 1);
        const offs = refs.map((id) => {
            const fresh = isStateFresh(id);
            const off = subscribeStateDirect(id, bump);
            if (!fresh) void getStateDirect(id).then(bump);
            return off;
        });
        return () => offs.forEach((off) => off());
    }, [refs]);

    return useMemo(() => {
        if (!url) return null;
        return resolveActionUrl(url, dpId, (id) => getStateFromCache(id)?.val);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [url, dpId, tick]);
}
