import { useEffect, useState } from 'react';
import { getObjectDirect } from './useIoBroker';
import { useConfigStore } from '../store/configStore';
import { dpVarMap } from '../utils/popupPlaceholders';

const EMPTY: Record<string, string> = {};

/** `common.name` as text: a plain string, or the entry for `lang` of a translated one. */
export function objectNameText(name: unknown, lang: string): string {
    if (typeof name === 'string') return name;
    if (!name || typeof name !== 'object') return '';
    const n = name as Record<string, unknown>;
    const pick = n[lang] ?? n.de ?? n.en ?? Object.values(n)[0];
    return typeof pick === 'string' ? pick : '';
}

/**
 * The object ids behind the name tokens (#841): `{{dpname}}` is the datapoint's own
 * `common.name`, `{{parentname}}`, `{{parent2name}}` … the names of the objects the
 * `{{parent}}`, `{{parent2}}` … ids point at (channel, device …).
 */
export function dpNameTokenIds(dpId: string): [string, string][] {
    return Object.entries(dpVarMap(dpId))
        .filter(([key]) => key === 'dp' || key.startsWith('parent'))
        .map(([key, id]) => [`${key}name`, id]);
}

/**
 * Name tokens of one datapoint, loaded from its objects. Empty until the objects are
 * there; a token whose object has no name stays out, so `{{dpname}}` remains visible
 * as such instead of turning into an empty string.
 */
export function useDpNameVars(dpId: string): Record<string, string> {
    const lang = useConfigStore((s) => s.frontend.language ?? 'de');
    const [state, setState] = useState<{ key: string; vars: Record<string, string> }>({ key: '', vars: EMPTY });
    const key = dpId ? `${lang}|${dpId}` : '';

    useEffect(() => {
        if (!dpId) return;
        let alive = true;
        const own = `${lang}|${dpId}`;
        // Each name on its own: one object that never answers must not hold back the rest.
        for (const [token, id] of dpNameTokenIds(dpId)) {
            void getObjectDirect(id).then((obj) => {
                const name = objectNameText(obj?.common?.name, lang);
                if (!alive || !name) return;
                setState((prev) => ({ key: own, vars: { ...(prev.key === own ? prev.vars : EMPTY), [token]: name } }));
            });
        }
        return () => {
            alive = false;
        };
    }, [dpId, lang]);

    return state.key === key ? state.vars : EMPTY;
}
