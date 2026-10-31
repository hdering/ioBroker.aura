import { useEffect, useMemo, useState } from 'react';
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

/** True when a text uses one of the name tokens (`{{dpname}}`, `{{parent2name}}` …). */
export function hasDpNameToken(text: string | undefined): boolean {
    return !!text && /\{\{(?:dp|parent\d*)name\}\}/i.test(text);
}

/**
 * The name tokens of many datapoints at once (#888), for the name pattern of the lists
 * and the status overview: row id → token → name. Loads only while `pattern` uses a name
 * token — a list without one never asks for an object. Objects shared by several rows
 * (the device above many channels) are asked for once; getObjectDirect caches them.
 */
export function useDpNameVarsList(ids: string[], pattern: string | undefined): Record<string, Record<string, string>> {
    const lang = useConfigStore((s) => s.frontend.language ?? 'de');
    const active = hasDpNameToken(pattern);
    const idKey = active ? ids.join('\n') : '';
    const key = idKey ? `${lang}|${idKey}` : '';
    const [state, setState] = useState<{ key: string; names: Record<string, string> }>({ key: '', names: EMPTY });

    useEffect(() => {
        if (!idKey) return;
        let alive = true;
        const own = `${lang}|${idKey}`;
        const objIds = new Set(idKey.split('\n').flatMap((id) => dpNameTokenIds(id).map(([, objId]) => objId)));
        for (const objId of objIds) {
            void getObjectDirect(objId).then((obj) => {
                const name = objectNameText(obj?.common?.name, lang);
                if (!alive || !name) return;
                setState((prev) => ({
                    key: own,
                    names: { ...(prev.key === own ? prev.names : EMPTY), [objId]: name },
                }));
            });
        }
        return () => {
            alive = false;
        };
    }, [idKey, lang]);

    const names = state.key === key ? state.names : EMPTY;
    return useMemo(() => {
        if (!key) return {};
        const out: Record<string, Record<string, string>> = {};
        for (const id of idKey.split('\n')) {
            const vars: Record<string, string> = {};
            for (const [token, objId] of dpNameTokenIds(id)) if (names[objId]) vars[token] = names[objId];
            out[id] = vars;
        }
        return out;
    }, [key, idKey, names]);
}
