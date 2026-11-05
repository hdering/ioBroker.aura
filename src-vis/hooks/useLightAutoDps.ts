/**
 * useLightAutoDps — the light widget's datapoints, detected at runtime from the
 * channel of its main datapoint (option `autoDetectDps`, #925).
 *
 * The editor's "Auto-Erkennen" copies the detection into the options once. That
 * cannot serve a widget whose datapoint is only known when it renders: a shared
 * popup with `{{dp}}` drives a different lamp on every open — one dims, the next
 * has colour temperature, the third an RGB string. This hook runs the same
 * autoDetectLightDps() on the lamp actually shown.
 *
 * Only the main datapoint's own channel is read, plus the grandparent when it is a
 * real `device` object (HmIP spreads one lamp over several channels). A plain
 * folder there — `alias.0.Licht.<lamp>` — holds the OTHER lamps, whose datapoints
 * must never be picked up. Results are cached per datapoint for the session, so a
 * list that opens the same popup for every row asks the socket once per lamp.
 */
import { useEffect, useState } from 'react';
import { getObjectDirect, getObjectViewDirect } from './useIoBroker';
import { baseDpId } from '../utils/dpRef';
import { autoDetectLightDps, type LightDpDetection } from '../utils/dpTemplates';

export interface LightAutoDps {
    dps: LightDpDetection;
    /** `common.type` of the main datapoint — boolean = the switch, number = the brightness. */
    mainType?: string;
}

const cache = new Map<string, Promise<LightAutoDps>>();
/** Finished detections - read during render, so a lamp seen before opens without a loading pass. */
const done = new Map<string, LightAutoDps>();

async function statesBelow(prefix: string): Promise<Array<{ id: string; role?: string; type?: string }>> {
    const res = await getObjectViewDirect('state', `${prefix}.`, `${prefix}.香`);
    // Filtered again: autoDetectLightDps reaches up to the grandparent on its own, so
    // nothing outside the requested branch may get into the list.
    return res.rows
        .filter((r) => r.id.startsWith(`${prefix}.`))
        .map((r) => ({ id: r.id, role: r.value?.common?.role, type: r.value?.common?.type }));
}

/** One detection round, without the cache - exported for the test. */
export async function detectLightAutoDps(id: string): Promise<LightAutoDps> {
    const parts = id.split('.');
    const parent = parts.slice(0, -1).join('.');
    const parentUp = parts.slice(0, -2).join('.');
    const [own, upObj] = await Promise.all([
        statesBelow(parent),
        parentUp.split('.').length >= 3 ? getObjectDirect(parentUp) : Promise.resolve(null),
    ]);
    const entries = upObj?.type === 'device' ? await statesBelow(parentUp) : own;
    return { dps: autoDetectLightDps(id, entries), mainType: own.find((e) => e.id === id)?.type };
}

/** Detected datapoints for `dpRef`; null while loading, when disabled or for an unresolved placeholder. */
export function useLightAutoDps(dpRef: string | undefined | null, enabled: boolean): LightAutoDps | null {
    const raw = baseDpId(dpRef);
    // An unresolved popup placeholder ({{dp}} in the editor) names no channel yet.
    const id = enabled && raw && !raw.includes('{{') ? raw : '';
    const [state, setState] = useState<{ id: string; result: LightAutoDps | null }>({ id: '', result: null });
    const known = id ? done.get(id) : undefined;

    useEffect(() => {
        if (!id || done.has(id)) return;
        let alive = true;
        let p = cache.get(id);
        if (!p) {
            p = detectLightAutoDps(id);
            cache.set(id, p);
            p.then(
                (r) => done.set(id, r),
                // A failed read (socket down) must be retried on the next mount.
                () => cache.delete(id),
            );
        }
        p.then(
            (result) => alive && setState({ id, result }),
            () => alive && setState({ id, result: null }),
        );
        return () => {
            alive = false;
        };
    }, [id]);

    // A detection for the previous lamp must not linger after the id changed.
    if (known) return known;
    return id && state.id === id ? state.result : null;
}
